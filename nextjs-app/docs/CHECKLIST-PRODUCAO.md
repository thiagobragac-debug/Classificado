# Checklist de produção — Tauze Class

Levantado na revisão de 2026-08-22. Tudo que era **código** já foi corrigido e
validado contra o banco de produção. O que resta aqui é **configuração** —
nenhum destes itens se resolve com deploy.

Estado verificado em 2026-08-22 22:xx, consultando o projeto de produção
diretamente. Reconfira antes do go-live.

---

## 🔴 Bloqueador

### 1. Webhook secrets dos gateways

**Sem isto, quem paga não recebe o plano.**

Verificado — os quatro estão vazios:

| Chave | Estado |
|---|---|
| `stripe_webhook_secret` | vazio |
| `mp_webhook_secret` | vazio |
| `pagarme_webhook_secret` | vazio |
| `asaas_webhook_token` | vazio |

Os adapters rejeitam corretamente webhook sem secret configurado (não há
bypass), então **toda** notificação de pagamento é recusada hoje. `/sucesso` é
uma tela cosmética: não ativa nada. O único caminho que ativa plano sem webhook
é o cupom de 100% off. A tabela `subscriptions` tem 0 linhas — ninguém jamais
completou uma assinatura.

**Gateways ativos:** nacional `mercadopago`, internacional `stripe`. Pagar.me e
Asaas não estão em uso; o Asaas nem tem API key.

**O que fazer**

1. No dashboard de cada gateway, cadastrar o endpoint:
   `https://SEU-DOMINIO/api/webhooks/payments?gateway=stripe`
   (trocar `stripe` por `mercadopago` conforme o caso)
2. Copiar o signing secret gerado
3. Colar em **Admin → Configurações → Gateways de Pagamento**

O campo aparece em branco mesmo já configurado — os segredos não são mais
enviados ao navegador. "Já configurado" aparece na dica do campo, e o badge 🟢
indica quais estão preenchidos.

**Como validar:** faça uma assinatura de teste no sandbox do gateway e confirme
que a linha em `subscriptions` vira `active`.

---

## 🟠 Segurança — antes de abrir ao público

### 2. Rate limit e CAPTCHA no Supabase Auth

O login **não passa pelo nosso servidor**: `lib/supabase.ts` usa
`createBrowserClient`, então `signInWithPassword()` posta direto do navegador
para `<projeto>.supabase.co/auth/v1/token`. O rate limit do `proxy.ts` cobre o
carregamento da página `/login` e as rotas `/auth/*` que rodam aqui — não é a
barreira contra força bruta de senha.

**Dashboard → Authentication → Rate Limits** — reduzir o limite de tentativas
de login.

**Dashboard → Authentication → Attack Protection** — habilitar CAPTCHA
(hCaptcha ou Turnstile). Exige também passar o token no cliente.

### 3. ✅ Limites nos buckets de storage — APLICADO em 2026-08-22

Estado final:

| Bucket | Público | Limite | Tipos aceitos |
|---|---|---|---|
| `ad-images` | sim | 5 MB | png, jpeg, webp |
| `ad-videos` | sim | 50 MB | mp4, webm |
| `profile-banners` | sim | 5 MB | png, jpeg, webp |
| `kyc-docs` | não | 10 MB | png, jpeg, webp, pdf |
| `site-assets` | sim | 5 MB | png, jpeg, webp |

Antes, os cinco aceitavam qualquer arquivo de qualquer tamanho. A validação que
existia era client-side e se contornava com chamada direta à API usando a anon
key, que é pública.

Verificado após aplicar:

```
PNG válido em ad-images  -> aceito
HTML em ad-images        -> RECUSADO (mime type text/html is not supported)
SVG em ad-images         -> RECUSADO
PNG de 6 MB              -> RECUSADO
PDF em kyc-docs          -> aceito
```

Conteúdo preexistente conferido e intacto; o logo continua servindo 200.

Para revisar ou reaplicar: `node scripts/aplicar-limites-buckets.mjs`
(dry-run) ou `--aplicar`.

---

## 🟡 Recomendado

### 4. DSN do Sentry

O SDK está instalado e instrumentado, mas **inerte** sem DSN — sem ele, erro em
produção só vai para o console: sem alerta, sem agrupamento.

```
SENTRY_DSN=https://...              # servidor
NEXT_PUBLIC_SENTRY_DSN=https://...  # browser (público por natureza)
```

Já configurado no código: `sendDefaultPii: false`, replays desligados (o painel
exibe CPF, endereço e documentos) e amostragem de 10% em produção.

### 5. `NEXT_PUBLIC_SITE_URL`

Ausente do `.env.local`. Há fallback para `https://tauzeclass.com.br`, então
nada quebra — mas defina explicitamente no ambiente de produção. Usada em
`robots.ts`, `sitemap.ts`, no JSON-LD da home e na validação de Origin do
`/api/contact-seller`.

### 6. Upstash (opcional)

As variáveis no `.env.local` estão comentadas **e são placeholders**
(`xxxx.upstash.io`, token de 9 caracteres). O rate limit agora funciona sem
Redis, usando janela no Postgres. Configurar Upstash de verdade só melhora
latência e poupa conexão do banco — não é necessário.

---

## 🔵 Limpeza

### 7. ✅ Bucket `kyc-documents` removido em 2026-08-22

Órfão desde a unificação do fluxo KYC. Antes de remover: 0 objetos na raiz e
nas subpastas, 0 linhas de `verification_requests` apontando para ele, nenhuma
referência funcional no código. O fluxo todo usa `kyc-docs`.

`app/api/admin/kyc-url/route.ts` ainda cita o nome ao interpretar URLs legadas
— é parser defensivo, não uso do bucket, e pode ficar.

### 8. Um usuário acima da cota

1 usuário tem 9 anúncios ativos contra o limite de 3 do plano Grátis. O trigger
de cota não despublica ninguém — apenas impede novas ativações até voltar ao
limite. Decidir: manter como cortesia, contatar, ou conceder um plano.

### 9. Atualizar o backup

`C:\classificado` está em `a1e8ced`, dezenas de commits atrás. Como backup do
estado atual, não protege nada. Trabalho acontece só em
`C:\classificado - claude`.

### 10. Advisories restantes

2 de severidade **low**, em `quill` (transitivo do `react-quill-new`). Não há
versão corrigida; trocar o editor é decisão de produto, não urgência de
segurança. As 6 de severidade alta foram resolvidas com Next 16.3.2.

---

## Migrations

15 arquivos em `supabase/migrations/`. As 6 criadas na revisão foram aplicadas
e validadas em produção:

| Migration | O que faz | Validado |
|---|---|---|
| `20260822120000` | trava colunas privilegiadas de `user_secrets` | 42501 nas 3 tentativas |
| `20260822120100` | hook que injeta `is_blocked` no JWT | claim presente, ES256 |
| `20260822120200` | recria `on_profile_created_secret` | linha criada por trigger |
| `20260822120300` | cota de anúncios do plano | P0001 no 4º ativo |
| `20260822120400` | trava `verified` / `kyc_status` | 42501 nas 2 tentativas |
| `20260822120500` | rate limit com janela no Postgres | 30x 200 + 5x 429 |

Todas idempotentes (`create or replace`, `drop ... if exists`) — podem ser
reexecutadas sem efeito colateral.

---

## Deploy

```bash
git push origin main
```
