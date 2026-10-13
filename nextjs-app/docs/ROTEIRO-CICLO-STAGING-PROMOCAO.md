# Roteiro: validar o ciclo completo da promoção "50% OFF no 1º ciclo" antes de ligá-la em produção

Objetivo: provar, em ordem crescente de risco, que compra → ativação → reajuste → aviso → renovação →
cancelamento funcionam, e ter critérios objetivos de "pode ligar" e de "desliga".
Relatório da auditoria: `docs/RELATORIO-VALIDACAO-DESCONTO-2026-10-13.md`.

## Fase 0 — Pré-requisitos (uma vez)
- [ ] Migrations `20260927150000` e `20260927160000` aplicadas em **produção**; conferir as 5 colunas:
      `promo_first_cycle_pending, promo_full_price, promo_reajuste_attempts, promo_reajuste_last_error, promo_reajuste_last_attempted_at`
      em `subscriptions` (Supabase > Table editor ou `information_schema.columns`).
- [ ] `CRON_SECRET` **idêntico** no GitHub (Settings > Secrets) e no Render (Environment).
- [ ] Provedor de e-mail de produção testado (Admin > Configurações > E-mail > "Enviar teste").
- [ ] Render de staging respondendo (hoje devolve 502 mesmo com deploy "succeeded": abrir os logs do serviço
      `tauze-class-staging` no painel e reiniciar; é plano Free e hiberna).

## Fase 1 — Staging automatizada (sandbox, sem dinheiro real)
Pré: app rodando em `http://localhost:3000` apontando para o Supabase de **staging** (porta 3000 é exigida pelo
CSRF); `.env.staging.local` com as chaves de teste. Todos os scripts abortam se a URL não for a do staging e
terminam com contagem de resíduo.

```bash
cd nextjs-app
ENV_FILE=.env.staging.local OUT=r1.json node scripts/validacao/desconto-pagarme.mjs      # esperado: 0 FAIL
ENV_FILE=.env.staging.local OUT=r2.json node scripts/validacao/desconto-stripe.mjs       # esperado: 0 FAIL
ENV_FILE=.env.staging.local OUT=r3.json node scripts/validacao/expiracao-e-reaper.mjs    # esperado: 0 FAIL
ENV_FILE=.env.staging.local OUT=r4.json node scripts/validacao/aviso-renovacao.mjs       # esperado: 0 FAIL
ENV_FILE=.env.staging.local node scripts/validacao/pagarme-billing-day.mjs               # 28 ok; 29-31 = 422 (esperado); prepaid ok
```
Critério: **0 FAIL** e `RESÍDUO` com tudo zerado (usuários, assinaturas, cupons, assinaturas Pagar.me canceladas).
Observação: o staging não tem provedor de e-mail; no `aviso-renovacao` o envio falha de propósito e o script
confere que a chave de idempotência é liberada para nova tentativa.

## Fase 2 — Produção com a flag DESLIGADA (smoke)
- [ ] Deploy da `staging` na `main` (após Fases 0–1). Flag `promo_primeiro_ciclo_ativo` = `0` (ou ausente).
- [ ] `/planos` sem banner de promoção; checkout de teste interno cobra o preço cheio (mesmo comportamento de hoje).
- [ ] Rodar o workflow **Daily maintenance cron** manualmente (`workflow_dispatch`) e confirmar job VERDE; abrir cada grupo
      do log: `expire-stale-subscriptions`, `enforce-ad-quota-deadlines`, `reconcile-promo-pricing` (`processed: 0`),
      `enforce-plan-expiration` (rodar antes uma vez com `?dry=1` para listar quem seria rebaixado) e
      `notify-upcoming-renewals` (`candidatos: 0`).
- [ ] Nenhum erro novo nos logs do Render por ~24 h.

## Fase 3 — Produção, flag LIGADA, compra real de valor baixo (você, com seu cartão)
1. Admin > Configurações: ligar `promo_primeiro_ciclo_ativo`.
2. Em `/planos` logado com uma conta **nova**: conferir card ("Desconto só no 1º mês — depois R$ 79,00/mês"), modal (aviso com
   data e valor) e comprar o PRO mensal. Esperado: cobrança de **R$ 39,50**.
3. Conferir: Pagar.me (fatura R$ 39,50 paga), banco (`price=39.5, promo_first_cycle_pending=true, promo_full_price=79`),
   e-mail de confirmação recebido, painel com a nota do 1º ciclo.
4. Esperar o cron do dia (ou disparar o workflow): `reconcile-promo-pricing` → `reajustado`; no Pagar.me o item passa a 7900.
5. Tentar a promoção de novo com a mesma conta depois de cancelar: deve cobrar **R$ 79,00** (uma vez por usuário).
6. Cancelar a assinatura de teste e estornar a cobrança no painel do Pagar.me.
7. Ciclo anual: repetir com o Premium anual **só se** quiser validar (R$ 715,20); estornar em seguida.

Go: itens 2–5 corretos e nenhum erro nos logs. **Só então** divulgar a promoção.

## Fase 4 — Acompanhamento (primeira semana)
- Diário: job **Daily maintenance cron** verde; logs do Render sem `[promo-reajuste]`/`promo_reajuste_failed` repetidos.
- Consulta de saúde da promoção (SQL, Supabase):
  ```sql
  select count(*) filter (where promo_first_cycle_pending) as pendentes,
         count(*) filter (where promo_reajuste_last_error is not null and promo_first_cycle_pending) as com_erro
  from subscriptions where status in ('active','past_due');
  ```
  `pendentes` deve cair a ~0 em até 24 h da compra; `com_erro > 0` por mais de um dia = investigar
  (`promo_reajuste_last_error` guarda só o código: `gateway_call_failed`, `gateway_value_mismatch`, ...; o detalhe está em `webhook_failures`).
- Primeira renovação real (30 dias): conferir que a cobrança saiu a R$ 79,00 e que o aviso por e-mail foi enviado 7 dias antes.

## Rollback
1. Desligar `promo_primeiro_ciclo_ativo` (efeito imediato para novas compras; quem já comprou continua sendo reajustado).
2. Se o reajuste falhar para alguém: corrigir o preço do item no gateway à mão e `update subscriptions set promo_first_cycle_pending=false, price=promo_full_price where id=...`.
3. Reverter código: `git revert` do commit da promoção; as colunas `promo_*` são aditivas e podem ficar.

## Datas e alertas conhecidos
- **29/out/2026**: primeira data afetada pelo bug do `billing_day` (corrigido no hotfix `e1d8faa`). Conferir nos logs do Render a
  ausência de `Pagar.me erro na assinatura` com `billing_day`/422 entre 29 e 31/out.
- Render Free (512 MB): quedas por falta de memória ~1,5x/dia e hibernação; migrar para plano pago antes de divulgar a promoção.
