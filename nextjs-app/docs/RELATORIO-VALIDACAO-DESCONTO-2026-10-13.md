# Validação completa e auditoria do processo de desconto — 12/13 de outubro de 2026

Escopo: promoção "50% OFF no 1º ciclo" (e o que a cerca: cupons, `promotional_price`, reajuste ao preço cheio,
crons, 4 gateways, painel, e-mails), mais uma passada geral em produção. **Nada deste relatório foi commitado
nem enviado a produção** — as correções estão na árvore de trabalho (branch `staging`).

## 1. Como foi testado

| Frente | Método | Resultado |
|---|---|---|
| Produção (só leitura) | Varredura HTTP (50 páginas PT/ES, 104 links, sitemap 1.285 URLs, APIs sem login, casos extremos) + passada de UI desktop/celular + painéis Render e Supabase | Sem links quebrados, 404 correto, endpoints internos e de admin negam acesso. **Achados de infraestrutura na seção 4.** |
| Staging, Pagar.me sandbox | ~100 verificações ponta a ponta (preço, cupom×promo×`promotional_price`, cron, webhook, troca, cancelamento, concorrência, expiração) | **98 PASS + 2 esperados** (ver 3.1) |
| Staging, Stripe modo teste | ~36 verificações (USD, anual, cupom USD, troca nativa, recusa, fatura futura via `create_preview`) | **36 PASS, 0 FAIL** |
| Interface (staging) | Login, modal de checkout, cupom, compra, painel, Esc | OK (ver 3.3) |
| Auditoria de código | 15 lentes + 4 verificações na doc oficial dos gateways + céticos independentes | 196 achados → 111 consolidados → 60 verificados (43 confirmados, 15 incertos, 2 refutados); 51 baixos/informativos **não verificados** |
| Testes unitários | `tsc` + `vitest` | **304 testes, 0 falhas** (eram 238) |

Limpeza: todas as execuções terminaram com resíduo **zero** (usuários, assinaturas, cupons, clientes Stripe,
assinaturas Pagar.me canceladas; flag e preços restaurados).

## 2. Correções aplicadas

| ID | Problema | Correção | Arquivos |
|---|---|---|---|
| F01 | Cancelar e reassinar repetia os 50% (R$474/ano por usuário no PRO) — **confirmado ao vivo** | Promoção vale **uma vez por usuário**: quem já teve assinatura paga (qualquer status) paga cheio. Sem coluna nova; falha fechada | `lib/pricing/promo-elegibilidade.ts`, `api/checkout/route.ts`, `api/checkout/init/route.ts` |
| F02/F03 | Eventos distintos do mesmo pagamento somavam +1 ciclo (1 pagamento = 31→61→92 dias) — **confirmado ao vivo** | Período avança no máximo 1x por **pagamento** (`paymentId`: fatura Pagar.me, cobrança Asaas, payment MP, fatura Stripe). MP `authorized` não renova assinatura ativa | `types.ts`, `pagarme.ts`, `asaas.ts`, `mercadopago.ts`, `stripe.ts`, `webhook-handler.ts` |
| F04 | Asaas: fatura do 2º ciclo já gerada saía a 50% | `updatePendingPayments: true` no PUT | `asaas.ts` |
| F06 | Servidor cobrava mais que o exibido (ex.: admin desliga a promo com o modal aberto) | `409 price_changed` **antes** de lock/cupom/gateway quando cobraria **mais**; modal recarrega o preço. Cobrar menos nunca bloqueia (Android) | `api/checkout/route.ts`, `CheckoutModal.tsx` |
| F07/F35 | Crons só no GitHub com `continue-on-error`: falhas silenciosas; cron de reajuste devolvia 200 mesmo falhando tudo | Workflow aquece o Render, retenta, valida status e corpo e **falha o job** se algo falhar; horário fora da hora cheia; cron de reajuste devolve `falhas` e 500 se todos falharem | `.github/workflows/daily-cron.yml`, `reconcile-promo-pricing/route.ts` |
| F08 | Código novo dependia das colunas da migration; erro virava 429 enganoso | Colunas `promo_*` só entram quando a promo vale; só `23505` é 429, o resto é 500 com log | `api/checkout/route.ts` |
| F10 | Modal não dizia que o desconto é só do 1º ciclo | Aviso com valor e data da renovação (PT/ES) | `CheckoutModal.tsx` |
| F11 | Nenhum e-mail transacional | Confirmação de compra (valor pago + próxima cobrança) e **aviso antes da 1ª cobrança cheia** (7 dias mensal, 30 anual; 1 por assinatura) | `lib/subscription-emails.ts`, `api/internal/notify-upcoming-renewals/route.ts`, `webhook-handler.ts` |
| F12 | Erro ambíguo apagava a linha-âncora (cliente cobrado sem plano) | Só recusa definitiva apaga; ambíguo mantém `pending` p/ webhook/reaper | `api/checkout/route.ts` |
| F13 | Reajuste confirmado sem checar o gateway | Lê o valor vigente no gateway e só confirma se bater (`gateway_value_mismatch` mantém pendente) | `types.ts`, 4 adapters, `promo-reajuste.ts` |
| **F14** | **Pagar.me recusa `billing_day` > 28 (422) — confirmado ao vivo no sandbox** | Dia de Brasília; dias 29–31 usam `prepaid` (testado: cobra na hora) | `pagarme.ts`, `lib/gateways/data-brasil.ts` |
| F15 | MP: grafia do status de cancelamento ambígua | Aceita as duas; cancela tentando uma e a outra | `mercadopago.ts` |
| F17 | Asaas: `nextDueDate` em UTC (21h–24h BRT = dia seguinte) | Data de Brasília | `asaas.ts` |
| F28/F32 | Vitrine anunciava 50% a quem não pode receber; card sem "1º mês" | `/api/promo/elegibilidade`; nota "Desconto só no 1º mês — depois R$ X" no card | `api/promo/elegibilidade/route.ts`, `PricingClientUI.tsx` |
| F31 | Painel mostrava R$79 retroativo sem explicar | Nota "neste primeiro ciclo você pagou R$39,50; próximas R$79,00/mês" durante o 1º ciclo (texto ajustado em 13/out após o E2E pela UI: "agora" confundia depois do reajuste) | `BillingTab.tsx` |
| F46 | Todo 4xx tratado como "cartão recusado" | 401/403/404/408/409/429 viram erro ambíguo | `types.ts` |
| F54 | Teste com 3 GETs reais de rede | Stub de `fetch` | `webhooks.test.ts` |
| F59 | Modal sem semântica de diálogo | `role=dialog`, `aria-modal`, rótulo, foco inicial, Esc | `CheckoutModal.tsx` |
| F18–F21 | Testes não protegiam valores/estado | +66 testes: centavos enviados a cada gateway, `billing_day`, datas BRT, `paymentId`, handler (pagamento duplicado), conferência do reajuste, elegibilidade, e-mails | `*.test.ts` |

## 3. Detalhes da revalidação

### 3.1 Dois "FAIL" esperados no Pagar.me
`D.1/D.2` enviavam `finalPrice=1` para provar que o cliente não manda no preço. Antes: cobrava 39,50 ignorando o valor.
Agora: **recusa com 409** (cobraria mais que o exibido). Mudança de comportamento intencional, não regressão.

### 3.2 Revalidação do abuso
Pagar.me: cancelar → reassinar agora cobra **R$79 cheio, sem promo** (D3.6). Stripe: cobra **US$15 cheio** (H.3).
Checkout abandonado/recusado **não** consome a promo (D3.8). Cupom 100% não conta como compra paga.

### 3.3 Interface
Card: "Desconto só no 1º mês — depois R$ 79,00/mês". Modal: aviso com data (13/11/2026) e valor; `role=dialog`;
Esc fecha. Painel: nota do 1º ciclo mesmo após o cron mudar o preço da linha.

## 4. NÃO corrigido / depende de você

**Urgente — produção hoje (independente da promoção):**
1. **Pagar.me em produção quebra nos dias 29, 30 e 31 de todo mês** (checkout mensal falha com "pagamento recusado"
   falso) e o **anual via Pagar.me falha sempre** (`exact_day` só aceita mensal). `main` ainda tem o código antigo;
   a correção (F14 + prepaid anual) existe só na árvore de trabalho. Próxima ocorrência: **29/out**. Recomenda-se um
   hotfix só de `pagarme.ts` + `data-brasil.ts`.
2. **Render Free (512 MB) cai por falta de memória ~1,5x/dia** e a produção está na Virginia com o Supabase em
   São Paulo. Plano pago é a correção de maior impacto sobre a lentidão. Conferir também as 750 h compartilhadas
   do Free (F09).

**Antes de subir a promoção:**
3. Aplicar em produção, nesta ordem, `20260927150000_promo_primeiro_ciclo_subscriptions.sql` e
   `20260927160000_enforce_plan_expiration_limpa_promo_state.sql`; conferir as colunas `promo_*`. Produção hoje **não
   tem** essas colunas nem a chave `promo_primeiro_ciclo_ativo`.
4. Garantir o segredo `CRON_SECRET` igual no GitHub e no Render; rodar o workflow manualmente (`workflow_dispatch`)
   e ver o job verde.
5. Configurar e testar o provedor de e-mail em produção (Resend já está configurado em `platform_settings`).
6. Redeploy do Render de **staging** (está no commit `2c99339`, anterior à correção dos 14 bugs).
7. Preços USD (`price_usd`) estão nulos em produção (existem 15/29 no staging) — decidir antes de oferecer Stripe/USD.
8. **Commitar** tudo (as correções críticas do adapter Pagar.me e do ciclo de vida só existem não-commitadas).

**Não aplicado de propósito (precisa de decisão/validação):**
- F05 (anual→mensal na Stripe), F16 (MP ativa antes da 1ª cobrança), F25, F26, F42, F43, F44, F45, F49, F50, F53:
  incertos ou dependem de sandbox/documentação que não existe (Mercado Pago e Asaas **nunca foram testados ao vivo**).
- F34 (toggle sobrescrito por aba antiga), F36 (idempotência gravada antes dos efeitos), F37, F38, F39, F40, F47, F57,
  F58: confirmados, mas de impacto baixo/médio e mudança invasiva; ficam como backlog.
- F60 (direito de arrependimento/Termos no modal): é texto jurídico — validar com advogado antes de publicar.
- F23 (várias contas/cartões): exige regra de negócio (CPF único já existe como índice; validação de dígitos não).
- 51 achados baixos/informativos não foram verificados (ver `canon.json` no scratchpad da sessão).

## 5. Observações
- Cron de expiração usa `profiles.plan_expires_at` (não o período da assinatura); rebaixar localmente **não cancela** no
  gateway se houver divergência (observado no teste M.9).
- `/api/health` é público e expõe memória/uptime e `upstashConfigured:false` (rate limit em produção usa só o
  fallback via Postgres).
- `/_next/image` com larguras grandes derrubou a produção por falta de memória durante a varredura — também é um vetor
  de negação de serviço anônimo; limitar tamanhos/origens no `next.config.ts` é recomendável.
