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

### 2. CAPTCHA no Supabase Auth (correção do que este item dizia antes)

O login **não passa pelo nosso servidor**: `lib/supabase.ts` usa
`createBrowserClient`, então `signInWithPassword()` posta direto do navegador
para `<projeto>.supabase.co/auth/v1/token`. O rate limit do `proxy.ts` cobre o
carregamento da página `/login` e as rotas `/auth/*` que rodam aqui — não é a
barreira contra força bruta de senha.

**Lido o config real de Auth via Management API (2026-08-23)** — a config atual
tem `rate_limit_email_sent`, `rate_limit_sms_sent`, `rate_limit_otp`,
`rate_limit_verify`, `rate_limit_token_refresh`, `rate_limit_anonymous_users`,
`rate_limit_web3`. **Não existe nenhum rate limit dedicado a tentativa de
login com senha** — essa lista inteira é sobre e-mail/SMS/OTP/token, não sobre
`POST /auth/v1/token?grant_type=password`. Ou seja: a recomendação anterior de
"reduzir o limite de tentativas de login" não tinha onde ser aplicada — não
existe esse botão nesta API. Correção do meu próprio item.

**A defesa real contra força bruta de senha no Supabase é CAPTCHA**, não rate
limit numérico. Estado atual, confirmado:

```
security_captcha_enabled  = false
security_captcha_provider = hcaptcha
security_captcha_secret   = null
```

Para ligar:

1. Criar conta em [hCaptcha](https://hcaptcha.com) ou usar **Cloudflare
   Turnstile** (gratuito, sem "resolver quebra-cabeça" na maioria dos casos) —
   conta de terceiro, não é algo que eu resolvo por você.
2. Copiar site key + secret key.
3. Me avisar — com o PAT eu ligo `security_captcha_enabled=true` e configuro o
   `security_captcha_secret` via Management API.
4. **Isto também exige mudança de código** que ainda não fiz: o widget de
   CAPTCHA precisa aparecer em `LoginForm.tsx`/`RegisterForm.tsx` e o token
   gerado por ele precisa ser passado em `signInWithPassword({ options: {
   captchaToken } })` / `signUp({ options: { captchaToken } })` — sem isso,
   ligar o CAPTCHA no servidor sem o cliente enviar o token trava o login para
   todo mundo. Avise quando tiver as chaves que eu faço os dois lados juntos.

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

### 4. DSN do Sentry + regras de alerta

O SDK está instalado e instrumentado, mas **inerte** sem DSN — sem ele, erro em
produção só vai para o console: sem alerta, sem agrupamento. Isto exige criar
conta e projeto no Sentry, então não é algo que eu consiga fazer por você.

```
SENTRY_DSN=https://...              # servidor
NEXT_PUBLIC_SENTRY_DSN=https://...  # browser (público por natureza)
```

Já configurado no código: `sendDefaultPii: false`, replays desligados (o painel
exibe CPF, endereço e documentos) e amostragem de 10% em produção.

**Depois de criar o DSN, configure ao menos duas regras de alerta** (Sentry →
Alerts → Create Alert Rule) — sem regra, os erros só ficam acumulados no
dashboard e ninguém é avisado:

1. **Issue novo** → notificar imediatamente (e-mail ou Slack) quando qualquer
   erro nunca visto antes aparecer.
2. **Regressão** → notificar quando um erro marcado como resolvido voltar a
   ocorrer.

Opcional, mas recomendado dado que este app processa pagamento: uma terceira
regra específica para erros em `/api/webhooks/payments` e `/api/checkout`,
com notificação mais agressiva (ex: a cada ocorrência, não agrupado) — é
exatamente a rota cujo silêncio custou o bloqueador do item 1 desta lista.

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

### 11. ✅ Funções de banco versionadas e revisadas — 2026-08-23

Resolvido assim que o PAT ficou disponível. Capturei o código-fonte real de
produção via Management API (`pg_get_functiondef`) e revisei cada uma.

**Achado grave — `place_bid_atomic` estava 100% quebrada em produção.** A
função ainda comparava `status != 'active'`, mas o enum `auction_status` só
aceita `scheduled|live|ended|canceled` — nunca existiu `'active'`. **Todo
lance em todo leilão falhava**, sempre, sem exceção. `placeBid()` não tem
fallback — o usuário só via "Erro ao processar lance." A feature "Leilões Ao
Vivo" estava fora do ar e, pelo visto, ninguém tinha notado ou reportado.

A mesma função (e `toggle_favorite_atomic`) também confiava num `p_user_id`
vindo do cliente em vez de derivar de `auth.uid()`, sendo `SECURITY DEFINER`
com `EXECUTE` liberado para `anon` — confirmado via
`information_schema.routine_privileges`. Isso contorna a própria RLS das
tabelas (`auction_bids`/`favorites` já exigem `auth.uid() = user_id` num
INSERT direto). Não era explorável hoje só porque o bug de schema acima fazia
a função falhar antes de chegar no INSERT — confirmado gravando 0 lances num
leilão de teste isolado.

**Corrigido em `20260823140000_fix_bid_and_favorite_functions.sql`** — schema
realinhado, identidade derivada de `auth.uid()` internamente, `EXECUTE`
revogado de `anon`. Testado com `BEGIN; ... ROLLBACK;` contra produção via
Management API antes de qualquer aplicação real (HTTP 201, sem erro; rollback
confirmado — as funções em produção seguem com a assinatura antiga).

**`toggle_favorite_atomic` também estava quebrada**, mas mascarada: tinha
`p_ad_id text` comparado contra uma coluna `uuid` sem cast — erro
`operator does not exist: uuid = text` em toda chamada. Só não virou incidente
visível porque `rpcToggleFav()` tem um `catch` com fallback que refaz a
operação via INSERT/DELETE direto. Favoritar segue funcionando hoje, só sem a
atomicidade que a função deveria garantir.

**`get_api_daily_stats` não existe** — a função real chama-se `get_api_stats`,
com formato bem diferente (totais agregados, não série diária). A página
`/admin/api-keys/usage` já tem fallback que calcula tudo no cliente quando a
RPC falha (confirmado lendo o código) — painel admin, sem tráfego de API real
hoje. Não corrigido: implementar de verdade seria escrever uma função nova, não
um bug fix.

As 6 restantes (`get_localized_recent_ads` — 2 overloads —,
`get_localized_featured_ads`, `get_localized_top_sellers`, `get_seller_stats`,
`enforce_plan_expiration`) foram lidas e **nenhum defeito funcional
encontrado**; versionadas como estão em
`20260823141500_versionar_funcoes_rpc_restantes.sql` (puro backfill, sem
mudança de comportamento). `get_seller_stats` e `enforce_plan_expiration` têm
o mesmo padrão de parâmetro de identidade não verificado contra `auth.uid()`,
mas sem exploração real: a primeira é leitura pública, a segunda só antecipa
um downgrade que já aconteceria de qualquer forma quando o plano vence.

**Ainda pendente — decisão sua**: as migrations `20260823140000` e
`20260823141500` estão escritas, versionadas no commit, e testadas via
dry-run contra produção, mas **não aplicadas de verdade ainda**. Aplicar do
jeito de sempre (SQL Editor / `psql`) ou autorizar que eu aplique agora via a
mesma Management API que já usei para o dry-run — sua escolha.

---

## Migrations

18 arquivos em `supabase/migrations/`. As 7 primeiras criadas nesta revisão
foram aplicadas e validadas em produção; as 2 últimas estão escritas, testadas
via dry-run, mas aguardando aplicação (item 11):

| Migration | O que faz | Validado |
|---|---|---|
| `20260822120000` | trava colunas privilegiadas de `user_secrets` | 42501 nas 3 tentativas |
| `20260822120100` | hook que injeta `is_blocked` no JWT | claim presente, ES256 |
| `20260822120200` | recria `on_profile_created_secret` | linha criada por trigger |
| `20260822120300` | cota de anúncios do plano | P0001 no 4º ativo |
| `20260822120400` | trava `verified` / `kyc_status` | 42501 nas 2 tentativas |
| `20260822120500` | rate limit com janela no Postgres | 30x 200 + 5x 429 |
| `20260823090000` | impede autoavaliação e nota duplicada em `seller_reviews` | 23514 e 23505 nas 2 tentativas |
| `20260823140000` | conserta `place_bid_atomic` e `toggle_favorite_atomic` | ⏳ dry-run OK, aguardando aplicação |
| `20260823141500` | versiona as 6 funções RPC restantes (sem mudança de lógica) | ⏳ dry-run OK, aguardando aplicação |

Todas idempotentes (`create or replace`, `drop ... if exists`, ou `DO $$ IF NOT
EXISTS` para `ALTER TABLE`) — podem ser reexecutadas sem efeito colateral.

---

## Qualidade e CI

Adicionado nesta revisão, junto das correções:

- **`npm test`** — 67 testes unitários (Vitest) cobrindo a lógica que já
  causou bug real nesta base: resolução de IP (o próprio spoofing corrigido em
  `6b3c275`), comparação de assinatura de webhook, sanitização de HTML,
  seleção de gateway, permissões de API key.
- **`.github/workflows/ci.yml`** — typecheck, testes e build em cada push/PR
  para `main`. Lint roda mas não bloqueia (228 erros preexistentes, ver item
  10 — bloquear hoje travaria todo PR por dívida técnica alheia a ele).

O que isso **não** cobre: rotas de API contra Supabase real, RLS, migrations.
Esses continuam sendo os scripts manuais rodados nesta sessão (arquivos de
`scratchpad`, não versionados) — exigem credencial de serviço que não faz
sentido existir em CI público.

---

## Deploy

```bash
git push origin main
```
