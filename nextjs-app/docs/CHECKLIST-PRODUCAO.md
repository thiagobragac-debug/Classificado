# Checklist de produção — Tauze Class

Levantado na revisão de 2026-08-22. Tudo que era **código** já foi corrigido e
validado contra o banco de produção. O que resta aqui é **configuração** —
nenhum destes itens se resolve com deploy.

Estado verificado em 2026-08-22 22:xx, consultando o projeto de produção
diretamente. Reconfira antes do go-live.

---

## 🧪 Teste completo do site (13 áreas) + correção — 2026-08-24

Pedido: "realizar novo teste completo do site, com todas as funcionalidade
detalhadamente" seguido de "corrigir um a um e ao finalizar realizar novo
teste detalhado". Rodado um teste ao vivo (não leitura de código) em 15
áreas públicas + admin em paralelo, cada uma com dado descartável próprio,
limpo e confirmado depois. 2 áreas (Perfil do Vendedor, Admin Dashboard/
Anúncios) falharam por erro de conexão da ferramenta, sem gerar achado —
cobertas na rodada de reteste. Achado de ambiente: a porta 3000 local
estava ocupada por outro projeto do usuário; o servidor real do Tauze
Class rodava na 3001 — não é um bug do site.

**4 críticos, 6 altos, 8 médios corrigidos**, todos validados ao vivo contra
produção (usuário/dado descartável, limpeza confirmada por leitura
independente):

| Severidade | Achado | Causa raiz | Correção |
|---|---|---|---|
| Crítico | Home quebrava inteira (client-side) | `next/image` lança e derruba a página quando `avatar_url` do vendedor está fora de `next.config.ts remotePatterns` | `TopSellersSection.tsx`: `<img>` comum, mesmo padrão de `AdSidebar.tsx` |
| Crítico | Checkout por cartão 100% quebrado | CSP faltava `http2.mlstatic.com` em `connect-src` — Bricks do Mercado Pago nunca inicializava | `proxy.ts`, `MP_CONNECT` |
| Crítico | Cancelar assinatura no admin não revogava acesso | só mudava `subscriptions.status`, nunca `profiles`/`user_secrets`, nunca cancelava no gateway | nova rota `/api/admin/subscriptions/cancel`, espelha o webhook real |
| Crítico | `/eventos/[id]` 404 pra 8 dos 10 eventos reais | só consultava `auction_events`, nunca a tabela `eventos` | fallback pra `eventos` + normalização |
| Alto | Home sempre 0 em Bovinos/Máquinas | filtro sem o prefixo `cat-` do `category_id` real | `lib/supabase-server.ts` |
| Alto | Lightbox de imagem sem como fechar | stacking context do header (`z-index`) prendia o `position:fixed` do lightbox | `AdGallery.tsx`: React Portal + Escape/backdrop |
| Alto | Cadastro perdia nome/WhatsApp/CEP em silêncio | update com coluna inexistente derrubava a chamada inteira sem checar erro; causa mais funda: 9 colunas de endereço/KYC nunca existiram em `user_secrets` | `RegisterForm.tsx` usa `updateProfile()`; migration cria as colunas |
| Alto | Mesmo bug no painel ("Meu Perfil") | mesma causa raiz (colunas ausentes) | resolvido pela mesma migration |
| Alto | Badge "Plano Atual" nunca aparecia | lia `profiles.plan_id`, que nenhum fluxo real atualiza | `PricingClientUI.tsx` lê `user_secrets.plan_id` |
| Alto | Admin de Leilões não mostra lance atual/vencedor | `select('*')` não bastava — faltava exibir `current_bid`/`winner_id` | nova coluna "Lance Atual" + join com `profiles` |
| Alto | Dashboard de Uso da API travado em "Carregando..." | `.throwOnError().catch()` — mesmo bug de builder não-Promise já visto em `admin/page.tsx` | remove `.catch()`, usa `try/finally` |
| Médio | Race condition nos filtros de `/listagem` | closure desatualizada — segunda chamada rápida sobrescrevia a primeira | `useAdsFilters.ts`: ref mutável (testado até no caso síncrono) |
| Médio | Selos de verificação do vendedor nunca apareciam no anúncio | `select` de `profiles` incompleto | adicionadas `email_verified`/`phone_verified`/`kyc_status` |
| Médio | Soft-404 em `/anuncio/[id-inexistente]` (200 em vez de 404) | `loading.tsx` cria Suspense que trava o status em 200 antes do `notFound()` — confirmado até em build de produção real | removido `loading.tsx` da rota |
| Médio | Links do rodapé pra páginas institucionais sempre abriam a errada | usavam `#hash`, a página seleciona por `?page=` | 18 ocorrências corrigidas |
| Médio | Badge "Identidade" e confirmação de e-mail sempre desatualizados no painel | `select`/`fullUser` incompletos | adicionados `kyc_status` e `email_confirmed_at` |
| Médio | `user_secrets.email` `NULL` pra 100% dos usuários | trigger nunca buscava de `auth.users` (profiles não tem coluna email) | migration corrige o trigger + backfill |
| Médio | Tradução ES incompleta em `/eventos` | página nunca lia o cookie de idioma nem chamava `t()` | título/subtítulo/cards/busca traduzidos |

**Investigado e descartado como falso alarme** (documentado no código pra não
reinvestigar à toa): "loading.tsx duplicado no DOM" em `/eventos` — é o
marcador de streaming SSR do React (`<!--$?-->` + `<template>`) aparecendo
no HTML cru sem JS; confirmado que o navegador real resolve certo na
hidratação (2 `<main>`, sem skeleton).

**Decisão consciente, não corrigida**: estatística "Cidades" (120+) da home
é constante — mas isso é por design (mesmo padrão de `total_countries: 4`,
já configurável via `platform_settings.tc_cnt_cidades`), não um bug.

**Adiado por escopo** (não são bugs de comportamento, são lacunas de
completude/produto — registrado para decisão futura, não esquecido):
dropdown de Estado duplica sigla/nome por extenso; tradução ES incompleta
em `/listagem` e `/anunciar` (só `/eventos` foi tratado); sem edição de
lote de leilão no admin (só criar/excluir); sem estado "cancelado"
distinto pra evento de leilão; `/admin/cupons` sem função de editar;
excluir chave de API deixa `api_request_logs` órfãos (FK vira NULL, não
CASCADE); geração de ID de categoria produz hífens soltos/duplicados com
nomes com pontuação; CTA mobile de contato abre JSON cru pra visitante
deslogado; Service Worker falha ao registrar em `/listagem` (não
investigado a fundo).

Limpeza: 2 usuários + 2 anúncios de teste órfãos da rodada de teste
(sessão que travou por erro de conexão da ferramenta) encontrados e
apagados numa varredura final, confirmados ausentes por leitura
independente.

Validado: `tsc --noEmit`, `vitest run` (119/119), `next build`. Commit
`68e5ed5`.

---

## 🔴 Achado crítico — RLS de 5 tabelas do admin nunca funcionou (corrigido)

Testando com um admin de verdade (não lendo código): escrever em
**categorias, banners, depoimentos, lotes de leilão e denúncias** pelo
painel sempre retornava sucesso na tela, mas **zero linhas eram
alteradas no banco**. Denúncias tinha a leitura também bloqueada —
`/admin/denuncias` sempre mostrava "0 denúncias", mesmo com reais no
banco.

Causa raiz: as regras de segurança (RLS) dessas 5 tabelas verificavam
`profiles.is_admin` — uma coluna que **nenhum fluxo real do sistema
preenche**. Tornar alguém admin sempre grava em `user_secrets.is_admin`
(coluna diferente, tabela diferente). `auction_events` e
`institutional_pages` nunca tiveram esse problema porque já usavam a
função `is_admin()` (que checa o lugar certo).

Corrigido com migration em produção (commit `4800e66`), substituindo as
políticas quebradas pela função `is_admin()` — a mesma que já funcionava
em outras tabelas. Testado antes e depois com um admin real; e pela UI de
verdade em Denúncias (Ignorar → efeito confirmado no banco → revertido,
por ser dado pré-existente).

## 🔴 Achado crítico — 4 tabelas + colunas de `profiles` publicamente expostas (corrigido)

Varredura completa de `pg_policies` procurando qualquer policy com
`qual = true` para roles diferentes de `service_role` encontrou dados
reais legíveis (e em alguns casos graváveis) por **qualquer requisição
não autenticada** — só com a `anon key`, que é pública por design (vem
no bundle JS do navegador):

- **`subscriptions`** — policy "Admins can view all subscriptions"
  (`SELECT`, `roles: {public}`, `qual: true`) não checava admin nenhum.
  Qualquer um lia toda assinatura de todo usuário (plano, valor, ids do
  gateway). Confirmado exploitável: inserida uma linha de teste e lida
  de volta com a anon key, sem token nenhum. Tabela está vazia hoje (0
  assinaturas reais), mas a exposição era real e afetaria a primeira
  assinatura de verdade.
- **`api_keys`** — duas policies públicas (`SELECT` e `UPDATE`) sem
  checagem real. Qualquer um lia `secret_hash` + email + permissions de
  todo parceiro, e podia **escrever** em qualquer linha (reativar chave
  revogada, elevar permissions pra `full_access`). O próprio código
  (`lib/api-auth.ts`) já documentava que o fluxo real usa `service_role`
  para tudo isso — as policies públicas contradiziam a intenção
  documentada.
- **`api_request_logs`** — policy "Rate limit select own logs only"
  com nome de ownership mas `qual: true` real — mesmo caso, também dead
  in practice (rate limit já lê via `service_role`).
- **`profiles.is_admin` / `profiles.is_blocked`** — colunas zumbi (a
  fonte real dessas flags é `user_secrets` desde
  `20260723072100_split_user_secrets.sql`, mesma causa raiz do achado
  acima) ficaram publicamente legíveis **e graváveis por qualquer
  usuário autenticado no seu próprio registro** — ou seja, um usuário
  comum podia potencialmente tentar setar `is_admin = true` na própria
  linha (a escrita real de permissão nunca olha essa coluna, mas ela não
  devia estar exposta).

Corrigido em duas migrations em produção:
`20260824180000_security_fix_public_data_exposure.sql` (drop das
policies públicas quebradas, consolidação em `is_admin()`) e
`20260824190000_restrict_profiles_privileged_columns.sql` (restrição de
coluna em `profiles`).

**Lição de Postgres**: um `REVOKE` de coluna sozinho **não tem efeito**
se a role também tiver um `GRANT` de tabela inteira — e o Supabase
concede `GRANT ALL ON ALL TABLES` para `anon`/`authenticated` por
padrão. A primeira tentativa (só `revoke select (is_admin, is_blocked)
on profiles from anon, authenticated`) foi testada e **confirmada sem
efeito** (a coluna continuava legível). O fix correto é `revoke select
on profiles from anon, authenticated` (tabela inteira) seguido de
`grant select (lista explícita de colunas seguras) on profiles to
anon, authenticated` — e o mesmo padrão para `update`.

Consequência esperada e mapeada antes de aplicar: qualquer
`select('*')` em `profiles` (incluindo `select('*', {count:'exact',
head:true})`) passa a falhar com 401 para `anon`/`authenticated`. Grep
completo em `app/` e `components/` encontrou 3 call sites usando
`select('*')` que dependiam disso — trocados para listas de colunas
explícitas: `VerificacaoClient.tsx`, `admin/page.tsx` (dashboard,
2 queries) e `lib/supabase-server.ts` (`getServerPlatformStats`, stat de
"Verificados" da home). Validado depois: `is_admin`/`is_blocked` agora
`401` via anon key; colunas públicas legítimas continuam `200`; `tsc`,
`vitest` (113 testes) e `next build` passam limpos.

Na mesma varredura, bônus de limpeza (mesmo padrão
`profiles.is_admin`, sem exposição pública nova — a leitura pública já
era intencional nesses casos, só a escrita de admin estava quebrada):
`paises`, `estados`, `cidades`, `platform_settings`, `auctions`,
`profile_secrets`, `user_verifications`, `transactions`, `plans`, e
(numa migration anterior, commit `4a5dc9e`) `api_keys`/
`api_request_logs` no fluxo de admin.

## 🟢 Funcionalidade nova: lances por lote no Leilão Virtual (não existia)

Ao testar Leilões pela primeira vez de ponta a ponta, descobri que **dar
lance em qualquer lote sempre falhava** com "Leilão não encontrado" —
não por um bug pontual, mas porque essa funcionalidade nunca tinha sido
construída no banco. A tela chamava uma função pronta de um sistema
**completamente diferente e não relacionado** (leilão de anúncio
individual, `auctions`/`auction_bids`), passando o ID errado.

Com autorização do usuário, construí o sistema que faltava (commit
`50cc389`), espelhando o design do sistema irmão: nova tabela
`auction_lot_bids`, colunas `current_bid`/`winner_id` em `auction_lots`,
e a função `place_lot_bid_atomic` (reaproveitando `auction_events.step`
e `accepts_bids`, colunas que já existiam mas nunca eram usadas).

De quebra, corrigido no mesmo commit: `app/(public)/leiloes/[id]/page.tsx`
pedia colunas inexistentes (`images`, `starting_bid`, `status`) na
consulta de lotes — a página pública de leilão **sempre mostrou "Nenhum
lote cadastrado"**, mesmo com lotes reais, porque a consulta inteira
falhava em silêncio (400 do PostgREST, erro nunca checado).

Testado ao vivo pela UI real: lote criado, leilão ao vivo, lance de R$500
sobre lance inicial de R$1.000 → `current_bid`/`winner_id` corretos no
banco + linha real em `auction_lot_bids`. Validação de incremento mínimo
testada também (lance insuficiente rejeitado com a mensagem certa). Tudo
limpo depois.

**Não testado ainda**: encerramento do leilão / apuração de vencedor por
lote (não há tela para isso hoje — só a criação do lote e o lance em si).

## ✅ Cupons de desconto — testado com checkout real (2 bugs corrigidos)

Cupom de 50% criado no admin e aplicado num checkout real via Stripe:
confirmado que a Stripe cobrou exatamente R$39,50 (metade de R$79), o uso
do cupom incrementou para 1/1, e uma segunda tentativa com o mesmo cupom
foi bloqueada. Achados e corrigidos (commit `cd9d2d3`):

1. Quando um cupom deixava de ser válido entre a checagem no navegador e o
   envio do pagamento (ex.: limite de usos esgotado nesse intervalo), o
   checkout ignorava o cupom em silêncio e cobrava o preço cheio, sem
   avisar. Agora retorna erro explícito.
2. `admin/cupons`: um cupom esgotado (`is_active=true` mas `usage_count >=
   max_uses`) mostrava "Inativo" no badge de status mas "Desativar" no
   botão ao lado — contraditório. Unificado.

---

## ✅ Teste E2E completo, do zero, com pagamento real fechando o loop — 2026-08-24

Pedido: refazer o teste inteiro criando usuário, anúncio, conversa e
pagamento reais no banco, com tudo interagindo com o admin. Diferença desta
rodada para a de mais cedo no mesmo dia: desta vez o pagamento foi **até o
fim**, com o webhook realmente validado e a assinatura virando `active` de
verdade — não só até o ponto em que travava antes.

**Metodologia:** 3 contas descartáveis (vendedor, comprador, admin) criadas
pelo **formulário de cadastro real** (não Admin API — testa o cadastro em
si também). Vendedor publicou um anúncio pelo formulário `/anunciar` de
verdade; admin aprovou pelo `/admin/anuncios`; comprador mandou mensagem
real pelo anúncio; comprador assinou o plano Produtor PRO — Stripe Elements
não dá pra automatizar (roda num iframe de outra origem, sem acesso via
essas ferramentas), então o pagamento foi completado pela API real da
Stripe com o mesmo `clientSecret` gerado pela rota real, o que já tinha
sido validado como equivalente antes. Com autorização explícita do usuário,
configurei um `stripe_webhook_secret` de teste temporário, busquei o
invoice **real** da assinatura na Stripe (não inventado) e montei o evento
de webhook com esse dado real, assinado corretamente (`t=...,v1=...` HMAC).
Ao final: assinatura cancelada e apagada na Stripe, `stripe_webhook_secret`
revertido para vazio, todas as linhas de teste apagadas do banco, os 3
usuários apagados — tudo confirmado por leitura independente pós-limpeza.

**Resultado do pagamento:** `/api/checkout` criou a assinatura real
(`sub_1U7xIo...`), o webhook assinado corretamente foi aceito
(`{"eventType":"subscription.activated"}`), e **as três tabelas
atualizaram certo**: `subscriptions.status = active`, `profiles.
subscription_status = active` + `plan_expires_at` certo, `user_secrets.
plan = 'pro'` + `plan_id` certo. O próprio painel do comprador passou a
mostrar "Pro" e "0/15 anúncios" imediatamente — confirmação do lado do
cliente, não só do banco.

**3 bugs novos encontrados e corrigidos** (commit `069a62e`) — todos só
apareceram porque desta vez havia uma assinatura *realmente paga e ativa*
para checar contra o admin, o que nenhum teste anterior tinha feito:

| Onde | Sintoma | Causa raiz |
|---|---|---|
| `admin/usuarios` | "Assinantes" sempre 0, badge de plano nunca aparecia | `user_secrets.plan` é sempre minúsculo (`pro`/`premium`/`free`), mas a página comparava contra `Pro`/`Premium`/`Grátis` capitalizados — **e** a consulta rodava direto do browser, e a RLS de `user_secrets` só libera `auth.uid() = id`, então o admin nunca via o plano de ninguém além de si mesmo |
| `admin/assinaturas` | "Receita (MRR)" e o valor de cada linha sempre R$ 0,00 | `app/api/checkout/route.ts` nunca gravava a coluna `price` em lugar nenhum — toda assinatura ficava com `price NULL` para sempre, mesmo cobrando de verdade |
| Rodapé do site (pt e es) | Link "Planos Premium" abria sempre em "Meus Anúncios" | Apontava para `/painel#assinatura`, uma aba que nunca existiu (as reais são `ads`/`messages`/`favorites`/`profile`/`billing`) |

O primeiro achado é sério: significa que **o admin nunca conseguiu ver
corretamente quem é assinante pagante** — nem antes desta correção, nem em
nenhuma versão anterior do código, porque a RLS sempre bloqueou essa
leitura. `/api/admin/users` (nova rota, mesmo padrão do `/api/admin/
block-user` já existente) resolve isso lendo com o `service_role`.

**Achado que ficou de fora (não é bug de código, é dado)**: no rodapé do
anúncio existe um banner "Anuncie Anúncio" apontando para `/planos.html`,
uma URL que não existe mais no site (há inclusive uma regra em
`globals.css:461` escondendo esse link para usuários logados, sugerindo que
já era um problema conhecido). É conteúdo de banner/admin, não código —
vale checar em **Admin → Banners**.

**Confirmado, sem alteração**: Mercado Pago (bloqueador 0) e os 4 webhook
secrets (bloqueador 1) seguem exatamente como documentado — este teste não
mexeu nesses dois itens além de usar o secret temporário da Stripe, já
revertido.

---

## 🧪 Teste completo do site — 2026-08-24

Pedido: navegar o site inteiro como usuário comum e como admin (não só ler
código). Metodologia: usuário descartável criado via Admin Auth API,
navegador real contra `npm run dev` local apontando pro banco de produção,
tudo removido e a limpeza confirmada por leitura independente ao final.

**Como usuário:** login, criação de anúncio (moderação esconde corretamente
o anúncio pendente da listagem pública), favoritar, mensagem para vendedor
— todos funcionaram. Achado e corrigido: troca de aba no `/painel` pelos
links do Header não funcionava (ver commit `384dba0`).

**Como admin** (precisou de `user_secrets.is_admin = true` — note que existe
também um `profiles.is_admin`, mas é esse OUTRO que realmente controla o
acesso a `/admin`, conferido em `app/(admin)/layout.tsx`; os dois campos
existirem em tabelas diferentes com o mesmo nome é uma armadilha fácil de
cair, vale unificar ou pelo menos documentar num comentário no schema).
Dashboard, Anúncios (aprovação testada de verdade), Usuários (proteção
"admin não pode bloquear a si mesmo" confirmada), Denúncias e Verificações
— todos carregaram com dados reais. Achado e corrigido: dashboard sempre
mostrava zero em tudo (ver commit `384dba0`).

**Não testado nesta rodada:** leilões com lances ao vivo (não há lotes
cadastrados no leilão agendado atual — precisa de dados de teste
específicos para lances), e as seções administrativas de Banners, Planos,
Categorias, Cupons, Páginas Institucionais e Depoimentos (carregamento não
verificado, sem indício de problema, apenas não chegou a ser clicado).

**Nota para reproduzir localmente:** o site registra um Service Worker
(`tc-static-v4`) que cacheia os bundles JS agressivamente — depois de
qualquer alteração de código, é preciso desregistrar o SW e limpar o cache
do navegador (`caches.keys()` + `.delete()`) antes de recarregar, senão o
browser continua rodando a versão antiga mesmo com o servidor já
recompilado. Isso não é um bug do site, é comportamento esperado de PWA,
mas custou bastante tempo de investigação nesta sessão até ficar claro.

---

## 🔴 Bloqueador

### 0. Access token do Mercado Pago está inválido — 2026-08-24

**Mais grave que o item 1 abaixo: hoje NINGUÉM consegue assinar via Mercado
Pago, o gateway padrão para usuário nacional (todo usuário sem `country`
preenchido cai aqui — ou seja, a esmagadora maioria).**

Confirmado com dois testes reais independentes:

1. `GET https://api.mercadopago.com/users/me` com o `mp_access_token` salvo em
   produção → `401 {"code":"unauthorized","message":"invalid access token"}`.
2. Chamada real a `/api/checkout` (rota de verdade, usuário de teste
   descartável, limpo depois) com plano pago → mesmo erro, devolvido direto ao
   usuário: `"Mercado Pago erro na assinatura: {"code":"unauthorized","message":"invalid access token"}"`.

A `mp_public_key` salva também não é reconhecida pela própria API da Mercado
Pago para tokenizar cartão (`404 not found public_key`) — o mesmo erro que o
Brick apresentaria no navegador. Não dá para saber, sem acesso ao dashboard da
Mercado Pago, se o token expirou, foi revogado, ou se public key e access
token vieram de aplicações/contas de teste diferentes — só que, do jeito que
está, nenhuma das duas credenciais funciona.

**O que fazer:** no dashboard da Mercado Pago (Suas integrações → aplicação
usada), gerar um par novo de credenciais de teste (ou produção, se for o
caso) — access token e public key da **mesma aplicação** — e colar os dois em
**Admin → Configurações → Gateways de Pagamento**. Depois, repetir o teste 1
acima (ou pedir para eu repetir) para confirmar antes de liberar.

---

### 1. Webhook secrets dos gateways

**Sem isto, quem paga não recebe o plano — mesmo que a cobrança na Stripe/MP
tenha sido aprovada de verdade.**

Ainda vazios em 2026-08-24 (inalterado desde 2026-08-22):

| Chave | Estado |
|---|---|
| `stripe_webhook_secret` | vazio |
| `mp_webhook_secret` | vazio |
| `pagarme_webhook_secret` | vazio |
| `asaas_webhook_token` | vazio |

Os adapters rejeitam corretamente webhook sem secret configurado (não há
bypass), então **toda** notificação de pagamento é recusada hoje. `/sucesso` é
uma tela cosmética: não ativa nada. O único caminho que ativa plano sem webhook
é o cupom de 100% off.

**Prova ao vivo, ponta a ponta, em 2026-08-24** (usuário de teste descartável,
tudo limpo depois — ver seção de auditoria mais abaixo): uma assinatura Stripe
real foi criada e cobrada pelas rotas de verdade (`/api/checkout/init` →
Stripe Elements/SetupIntent real → `/api/checkout`). Do lado da Stripe:
`status: active`, `unit_amount: 7900` (R$79, cobrado de verdade em modo
teste). Do lado do nosso banco: a linha em `subscriptions` ficou parada em
`status: "pending"` — para sempre, porque simulei exatamente o webhook que a
Stripe mandaria (payload real, referenciando a assinatura real) e a resposta
foi `"Stripe webhook secret not configured. Rejecting webhook."`. Ou seja: o
usuário paga, a cobrança é aprovada, ele é redirecionado para
`/painel?subscribed=1` e vê um banner de sucesso — mas `profiles.plan`/
`user_secrets.plan` nunca mudam, porque o webhook que faria essa atualização
é recusado antes de tocar no banco. Do ponto de vista do usuário: pagou e não
recebeu o plano, sem nenhum aviso de que algo deu errado.

**Gateways ativos:** nacional `mercadopago` (veja item 0 — hoje inoperante),
internacional `stripe`. Pagar.me e Asaas não estão em uso; o Asaas nem tem API
key.

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

## 💳 Auditoria completa dos 4 gateways — 2026-08-23

Revisão de `lib/gateways/{stripe,mercadopago,pagarme,asaas}.ts` linha a linha
contra a documentação oficial de cada gateway (não memória de treinamento —
cada achado foi verificado abrindo a página real da doc). 19 achados, 18
confirmados por duas verificações independentes cada. **Todos os corrigíveis
sem acesso a dashboard de terceiro foram corrigidos e têm teste.**

### ✅ Corrigidos

| Gateway | Achado | Severidade | Efeito antes da correção |
|---|---|---|---|
| Stripe | `price_data.product_data` não existe na Subscriptions API (só em Checkout Sessions); faltava `product`, obrigatório | crítica | **Toda criação de assinatura Stripe falhava** |
| Stripe | `invoice.subscription` descontinuado na versão "basil" (2025-03-31); sem `Stripe-Version` fixo, a conta usa a versão atual | crítica | Webhook nunca encontrava a assinatura, mesmo com pagamento aprovado |
| Mercado Pago | Manifesto do webhook sem `request-id`, com nome de campo errado, sem normalizar para minúsculas | crítica | **HMAC nunca bateria**, mesmo com o secret certo |
| Mercado Pago | Grafia `'cancelled'` (2 L) em vez de `'canceled'` (1 L, valor real da API) | crítica | Cancelamento fora do painel nunca era reconhecido — usuário mantinha acesso premium |
| Pagar.me | `charge.paid`/`charge.payment_failed` liam `event.data.subscription`, campo que o objeto Charge não tem (só o Invoice aninhado tem) | crítica | Ativação/renovação via `charge.*` sempre ignorada |
| Asaas | Campo `remoteIp` (obrigatório no schema oficial) nunca enviado | crítica | Toda criação de assinatura seria rejeitada |
| Stripe | `invoice.payment_action_required` (SCA/3DS em renovação) não tratado | alta | Assinatura presa aguardando autenticação ficava "active" indefinidamente |
| Asaas | `PAYMENT_REJECTED` não existe na API; faltavam os eventos reais de recusa de cartão | alta | Recusa de cobrança recorrente não derrubava o plano do usuário |
| Asaas | Header `User-Agent` obrigatório (contas criadas após 13/06/2024) nunca enviado | alta | Toda chamada podia falhar dependendo da data de criação da conta |
| Asaas | Dedupe de cliente invertido — a doc diz que a Asaas permite CPF duplicado e recomenda buscar antes de criar | alta | Cliente duplicado a cada tentativa de checkout fora da janela de 15s |
| Stripe | `Idempotency-Key` só na Subscription, não no Customer | média | Falha de rede podia impedir retry (PaymentMethod já anexado) |
| Pagar.me | Cancelamento enviava `cancel_pending` como query string; o campo documentado é `cancel_pending_invoices`, no body | média | Parâmetro void — comportamento sempre foi o default, nunca o que o código tentava mandar |
| Pagar.me | `createSubscription` sem `Idempotency-Key` | média | Retry após timeout podia cobrar duas vezes |
| Asaas | URL de sandbox (`sandbox.asaas.com/api/v3`) não é a documentada (`api-sandbox.asaas.com/v3`) | média | Host não-documentado, pode ser desativado sem aviso |
| Mercado Pago | Branch de "modo teste sem secret" — código morto que sugeria um bypass inexistente | baixa | Nenhum (comportamento real já era fail-closed, comentário enganoso) |
| Stripe | Branch de `checkout.session.completed` — nunca disparado (nenhuma Checkout Session é criada) | baixa | Nenhum, código morto documentado |
| Pagar.me | Variável `docType` calculada e nunca usada | baixa | Nenhum |

Validado: 113 testes unitários (67 → 113 nesta rodada), `tsc`/build limpos.
Commits `3ce05e2`, `fae78d4`, `5cd19c2`, `71d60c6`, `aeeb330`.

### ⚠️ Registrado, não corrigido — precisa de verificação com dashboard real

**Esquema de assinatura do webhook do Pagar.me não foi encontrado em nenhuma
página oficial atual.** O código usa `x-hub-signature` + HMAC-SHA256 sobre o
corpo — mas busca extensiva na documentação (visão geral de webhooks, exemplo
de payload, página de autenticação) não confirmou esse mecanismo. Os únicos
métodos de segurança de webhook documentados pela Pagar.me são IP allowlist e
um campo opcional de senha no cadastro do webhook — nenhuma menção a HMAC.

**Antes de preencher `pagarme_webhook_secret` em produção**, confirme o
mecanismo real com um webhook de teste (RequestBin, ou o simulador do próprio
dashboard do Pagar.me) e ajuste `lib/gateways/pagarme.ts:validateWebhook` de
acordo — sem essa confirmação, o secret pode ficar configurado e ainda assim
rejeitar 100% dos webhooks legítimos, um segundo modo de falha silenciosa.

### ✅ Validado ponta a ponta contra API real de sandbox

Além dos 113 testes com fetch mockado, dois gateways já tiveram
`createSubscription`/`cancelSubscription` executados de verdade — código
real e não modificado, importado num arquivo de teste transitório (apagado
logo depois, nunca commitado):

- **Asaas** (2026-08-23) — `createSubscription` com cartão de teste e IP
  real: criou assinatura (`sub_4mx499w78e9tpyww`) e cliente
  (`cus_000008837337`); `cancelSubscription` confirmado via GET
  independente (`status: INACTIVE`, `deleted: true`).
- **Stripe** (2026-08-24) — publishable key fornecida pelo usuário conferida
  como idêntica à já salva em produção e autenticada com sucesso na API real
  (chamada de controle com chave inválida confirmou que o erro recebido era
  de regra de negócio, não de autenticação). Em seguida, `createSubscription`
  completo com PaymentMethod real (token de teste oficial `tok_visa`):
  assinatura criada e confirmada `status: active` via GET independente,
  valor/moeda conferidos (`2990` centavos, `brl`). `cancelSubscription`
  confirmado via GET independente (`cancel_at_period_end: true`). Limpeza
  (cancelamento imediato) verificada via listagem de assinaturas canceladas.

Mercado Pago e Pagar.me seguem apenas no nível 2 (código correto contra a
doc oficial + auto-consistente nos testes mockados) — sem chave de sandbox
fornecida ainda para repetir esse teste.

### ✅ Validado ponta a ponta pelas ROTAS reais (não só o adapter) — 2026-08-24

Pergunta respondida: "desde a seleção do plano pelo usuário no site até a
assinatura ser atualizada no ambiente, está tudo funcionando?" Resposta
testada com HTTP de verdade, não só leitura de código:

**Metodologia:** criado usuário descartável via Admin Auth API
(`e2e-flow-test-...@tauzeclass.com.br`), login real (password grant) gerando
um `access_token` de verdade, servidor Next.js local rodando contra o banco
de produção. Todas as chamadas abaixo foram feitas nas rotas reais
(`/api/checkout/init`, `/api/checkout`, `/api/webhooks/payments`), não em
funções isoladas. Ao final: assinatura cancelada e apagada na Stripe, linha
de teste apagada de `subscriptions`, usuário de teste apagado (cascade em
`profiles`/`user_secrets`) — tudo confirmado por leitura independente
pós-limpeza.

**Caminho Stripe (usuário internacional) — funciona até o webhook:**
`checkout/init` retornou `publicKey`/`clientSecret` reais → SetupIntent
confirmado com PaymentMethod de teste (mesmo fluxo do `StripeCheckoutForm` no
navegador, `return_url` incluído) → `/api/checkout` criou a assinatura de
verdade na Stripe (`sub_1U7vLA09kaQPprD6VyWfuY9y`, `status: active`,
`unit_amount: 7900`) e gravou `gateway_subscription_id`/`gateway_customer_id`
na linha `pending` em `subscriptions`. Webhook simulado com payload real →
rejeitado por falta de secret (ver item 1 do bloqueador). **Resultado:
dinheiro cobrado, plano nunca ativado no banco.**

**Caminho Mercado Pago (usuário nacional, o padrão) — quebra antes mesmo de
chegar ao gateway:** mesma sequência, `checkout/init` respondeu
normalmente (`gateway: mercadopago`, `publicKey` real), mas `/api/checkout`
falhou com `"Mercado Pago erro na assinatura: invalid access token"` — ver
item 0 do bloqueador. Ponto positivo confirmado: o rollback funciona — a
linha `pending` (lock) foi apagada automaticamente no erro, sem deixar lixo
no banco.

**Conclusão honesta:** o código dos dois pontos de checkout (`checkout/init`,
`checkout`) está correto e funcionando — os dois bugs de nome de chave e os
17 achados da auditoria de gateways realmente resolveram o que deveriam
resolver. O que ainda impede QUALQUER assinatura real de se completar hoje
não é mais código, são dois itens de configuração puramente do lado do
usuário: item 0 (credenciais Mercado Pago inválidas) e item 1 (webhook
secrets vazios).

---

## 🔧 Validação do pipeline admin → runtime — 2026-08-24

Pedido: confirmar que toda chave/config salva em **Admin → Configurações**
é lida com o mesmo nome pelo código que a consome. Cruzei cada
`settings['x']`/`localStorage.getItem('x')` do runtime contra cada
`get`/`set` do admin (~26 chaves).

| Local | Admin salva | Runtime lia | Efeito real |
|---|---|---|---|
| `app/api/checkout/init/route.ts` | `stripe_pub_key` | `stripe_public_key` | **Confirmado em produção** (chave real de 107 chars só existe sob o nome certo): todo checkout via Stripe devolvia 503 "Stripe keys not configuradas", mesmo com as duas chaves preenchidas no admin. Corrigido. |
| `components/Header.tsx` (`applyDynamicSettings`) | `primary_color` | `tc_primary_color` | Cor primária customizada no admin nunca chegava a ser aplicada ao site (o `syncPlatformSettings` espelha `platform_settings` no localStorage pelo nome literal da coluna `key`, não com prefixo `tc_`). Hoje sem efeito observável — a linha `primary_color` ainda não existe em produção — mas o bug já existia. Corrigido. |

Conferido e **sem divergência**: `mp_public_key`, `pagarme_pub_key`,
`tc_logo_url`, `retention_strategy` (usado por
`supabase/functions/data-retention-job`).

**Sem consumidor em lugar nenhum do runtime** (controles do admin que hoje
não afetam o site — não é bug de nome, é funcionalidade ainda não
conectada): `dark_mode`, `feature_chat`, `feature_kyc`, `hero_title`,
`hero_subtitle`, `show_hero`, `tc_feat_auctions`, `tc_feat_plans`,
`tc_feat_social_login`. Vale decidir se algum destes deveria ser removido
do admin ou implementado.

Validado: `tsc --noEmit`, `vitest run` (113/113), `next build`. Commit
`4b2cdd9`.

---

## 🔴 Achado crítico — Asaas e Pagar.me nunca conseguiam concluir assinatura por cartão pela rota real (corrigido p/ Asaas, Pagar.me sem chave p/ validar)

Chave de sandbox da Asaas fornecida pelo usuário em 2026-08-24. Validação
"por trás da tela" (sem reativar UI de cartão) pedida explicitamente,
seguindo a mesma metodologia já usada para Stripe: adapter isolado → rotas
reais → limpeza verificada.

**Nível 1 (adapter isolado, sem tocar produção):** `asaasAdapter.
createSubscription` com a chave nova criou assinatura real
(`sub_f8i2xn1wb4ule9tt`) e cliente (`cus_000008840891`) no sandbox;
`cancelSubscription` confirmado via GET independente (`status: INACTIVE`,
`deleted: true`). Cliente também apagado do sandbox depois. Chave salva em
`platform_settings.asaas_api_key`/`asaas_environment` (sem alterar
`gateway_nacional_padrao`, que continua `mercadopago` — nenhum usuário real
seria afetado só por isso).

**Achado crítico ao tentar validar no Nível 2 (rota real `/api/checkout`):**
essa rota rejeita com 400 qualquer requisição com `creditCard` em claro no
corpo (guard de escopo PCI-DSS — cartão só deveria entrar tokenizado via
`gatewayToken`). Só que `lib/gateways/asaas.ts` E `lib/gateways/pagarme.ts`
— as duas gateways nacionais de "checkout transparente" — exigiam
incondicionalmente `paymentData.creditCard` em claro; nenhum dos dois usava
`gatewayToken`. Resultado: **uma assinatura por cartão via Asaas ou
Pagar.me nunca podia ser concluída pela rota real**, com qualquer chave —
o próprio guard bloqueava antes de chegar no gateway. Confirmado ao vivo,
com usuário BR descartável, login real, `gateway_nacional_padrao`
temporariamente trocado para `asaas` e revertido na hora: `/api/checkout`
devolveu 500 `"Asaas: Checkout transparente requer cartão de crédito,
CPF/CNPJ e endereço de cobrança."` mesmo com endereço e CPF enviados —
porque só faltava o cartão, que a própria rota já havia recusado receber em
claro. Rollback automático confirmado (nenhuma linha ficou em
`subscriptions`).

Esse achado não apareceu na auditoria dos 18 achados anteriores porque
aquela revisão olhou cada adapter isoladamente contra a doc do próprio
gateway, não a interação com o guard anti-PCI da rota de checkout.

**Investigação da causa raiz revelou que os dois gateways NÃO são iguais:**

- **Pagar.me**: a tokenização (`POST /core/v5/tokens`) autentica só com a
  `public_key`, no parâmetro de query `appId` — nunca a `secret_key`. Pode
  (e deveria) ser chamada **direto do navegador**, exatamente como Stripe
  Elements/MP Bricks já fazem hoje. Não é um problema de escopo PCI — só
  faltava o adapter aceitar um token no lugar do cartão.
- **Asaas**: a tokenização (`POST /creditCard/tokenizeCreditCard`) exige a
  `access_token` **secreta** no header — não existe chave pública
  equivalente. Não há como tokenizar sem o cartão em claro passar por um
  servidor que conhece o segredo.

**Corrigido nesta sessão:**

1. `lib/gateways/asaas.ts` — `createSubscription` agora aceita
   `paymentData.gatewayToken` como alternativa a `creditCard`: quando
   presente, envia `creditCardToken` (substituindo `creditCard`+
   `creditCardHolderInfo` por completo, confirmado contra a doc oficial).
   Nova função `tokenizeCard` (parte da interface `GatewayAdapter`,
   `lib/gateways/types.ts`) resolve o customer (reaproveitando a lógica de
   busca por `externalReference`/`cpfCnpj` já existente, extraída para
   `findOrCreateCustomer`) e chama `tokenizeCreditCard`, devolvendo só o
   token — nunca persiste o cartão.
2. **Nova rota `app/api/checkout/tokenize-card/route.ts`** — a ÚNICA rota
   em que dado de cartão em claro chega ao nosso servidor, e só porque a
   Asaas não deixa alternativa. Autenticada por Bearer token (mesmo padrão
   de `/api/checkout`), resolve o gateway pela mesma regra nacional/
   internacional, e só funciona para gateways com `tokenizeCard`
   implementado (hoje, só Asaas — Stripe/Mercado Pago/Pagar.me devolvem 400
   de propósito, para não normalizar cartão em claro chegando aqui para
   gateways que não precisam disso). O cartão vive só na memória da
   requisição.
3. `lib/gateways/pagarme.ts` — mesma mudança de aceitar `gatewayToken`
   (campo `card_token`, confirmado contra a doc oficial do objeto
   `credit_card`), mas **sem** rota de proxy — a tokenização deveria ser
   feita direto no cliente com a `public_key` (`pagarme_pub_key`, já
   corretamente salva em `platform_settings` desde a validação do pipeline
   admin → runtime). `billing_address` continua obrigatório mesmo com
   token (a doc confirma que o endereço do cartão nunca é tokenizado).
4. 4 novos testes unitários (113 → 117): tokenizeCard da Asaas,
   createSubscription da Asaas só com token, createSubscription do
   Pagar.me com `card_token`, e a rejeição sem cartão nem token.

**Validado ponta a ponta contra o sandbox real da Asaas, duas vezes:**

- **Nível adapter:** `tokenizeCard` → `creditCardToken` real → 
  `createSubscription` usando **só o token** (sem `creditCard`) → assinatura
  real criada (`sub_9sk3zk6lv3cjaowk`) → cancelada → confirmada via GET
  independente → cliente apagado.
- **Nível rota real** (mesmo protocolo do achado: usuário BR descartável,
  `gateway_nacional_padrao` trocado para `asaas` e revertido na hora):
  `POST /api/checkout/tokenize-card` devolveu um token real (`200`) → 
  `POST /api/checkout` com **só esse token** (nenhum dado de cartão)
  devolveu `200`, `gateway: "asaas"`, e gravou uma linha real em
  `subscriptions` com `gateway_subscription_id`/`gateway_customer_id`
  reais. Tudo limpo depois: linha de teste apagada, assinatura e cliente
  apagados no sandbox da Asaas, usuário de teste apagado,
  `gateway_nacional_padrao` revertido para `mercadopago` (confirmado).

**Pagar.me**: código corrigido do mesmo jeito e testado nos 4 novos testes
mockados, mas **sem chave de sandbox fornecida ainda** para repetir a
validação ao vivo — mesmo status dos outros achados da auditoria de
gateways que dependem de credencial de terceiro. Falta também, como tarefa
de produto (não deste achado): decidir quando/se vale a pena o front-end
chamar a tokenização da Pagar.me direto do navegador (ela é segura por
design e não expande escopo PCI, ao contrário da Asaas).

### Verificação de `lib/gateways/pagarme.ts` contra a doc oficial atual (2026-08-24)

Pedido explícito do usuário: sem chave de sandbox do Pagar.me ainda, "seguir
sem Pagar.me, só garantir que está implementado conforme a documentação
disponível". 7 verificações independentes, cada uma abrindo as páginas reais
de docs.pagar.me (não memória de treinamento):

| # | Tópico | Resultado |
|---|---|---|
| 1 | `card` no nível raiz do body (não aninhado em `credit_card`) | ✅ bate |
| 2 | `customer.type`/`document`/`phones.mobile_phone` | ✅ bate |
| 3 | `card.card_token` (nome e aninhamento) | ✅ bate |
| 4 | `DELETE /subscriptions/{id}` + `cancel_pending_invoices` no body | ✅ bate |
| 5 | Header `Idempotency-Key` | ⚠️ parcial |
| 6 | Assinatura/HMAC de webhook (`x-hub-signature`) | 🔴 **sem base documental** |
| 7 | Nomes de evento de webhook | ⚠️ parcial (2 faltando) |

**Corrigido:**

- **`customer.document_type`** — a doc pareia esse campo com `document` em
  todo exemplo funcional (`document_type: "CPF"` junto de `document:
  "12345678901234"`); opcional no schema, mas o código já calculava o valor
  (`docType`) só para decidir `customer.type` e descartava — agora envia.
- **Comentário do `Idempotency-Key`** suavizado: a doc confirma o header como
  mecanismo *geral* da API (chave expira 24h em produção, requisição
  concorrente com a mesma chave devolve 409), mas as páginas de referência do
  próprio endpoint de criar assinatura não o listam como parâmetro — o
  comentário antigo afirmava uma confirmação que a doc não dá por escrito.
- **2 eventos de webhook faltando**: `charge.refunded` e `invoice.canceled`
  existem na lista oficial de eventos e antes caíam em `unknown` — uma
  assinatura estornada ou com fatura cancelada ficava presa em `active` para
  sempre. Mapeados para `payment.failed` (mesmo tratamento conservador já
  usado para recusa de cobrança — marca `past_due`, só derruba o plano se o
  período pago já tiver terminado).
- 3 novos testes (117 → 119).

**🔴 Achado que não foi corrigido de propósito — precisa de decisão, não de
código:** a verificação de assinatura de webhook do Pagar.me
(`x-hub-signature` + HMAC-SHA256) **não tem NENHUMA base na documentação
oficial atual**. Varredura extensiva (visão geral de webhooks, lista de
eventos, exemplo de payload, criar/listar/obter webhook, segurança, IP
allowlist) não encontrou menção a assinatura criptográfica nem a esse
header em lugar nenhum — os únicos mecanismos documentados (Basic Auth, IP
allowlist) autenticam chamadas **à** API do Pagar.me, não notificações que
o Pagar.me **envia** para nós. Existe um campo de "senha" opcional no
cadastro do webhook no dashboard, mas só mencionado num artigo de suporte de
terceiros, fora da doc oficial — semântica exata desconhecida.

Isso não é uma correção que dá para simplesmente aplicar: trocar por outro
mecanismo às cegas seria substituir uma suposição não confirmada por outra.
**Antes de preencher `pagarme_webhook_secret` em produção**, é preciso
descobrir o mecanismo real — abrir um webhook de teste no dashboard do
Pagar.me e inspecionar os headers que chegam de verdade, ou perguntar ao
suporte deles. Do jeito que o código está hoje, preencher esse secret faria
a tela de admin mostrar "🟢 configurado" enquanto a função **rejeitaria
100% dos webhooks reais** (o Pagar.me quase certamente nunca manda
`x-hub-signature`) — uma falsa sensação de segurança pior do que deixar
vazio. Hoje o campo está vazio, então o fail-closed já rejeita tudo de
qualquer forma; sem efeito prático ainda, mas o comentário no código foi
reforçado para deixar isso inequívoco antes que alguém preencha o secret
achando que ativa a validação.

Validado: `tsc --noEmit`, `vitest run` (119/119), `next build`.

**Pendência explícita de compliance, decidida pelo usuário:** ativar o
proxy de tokenização da Asaas em produção (ou seja, apontar
`gateway_nacional_padrao`/permitir Asaas de fato para usuários reais) segue
precisando de assessoria jurídica/compliance antes — o código passa a
tocar em dado de cartão em claro no nosso servidor por uma fração de
segundo (nunca persistido), o que pode mudar o enquadramento de escopo PCI
(provavelmente SAQ-A-EP em vez de SAQ-A). Nada disso foi ativado por
padrão: `gateway_nacional_padrao` continua `mercadopago`, e não há UI
alguma chamando a nova rota — ela só existe no backend, pronta para quando
essa decisão for tomada.

Validado: `tsc --noEmit`, `vitest run` (117/117), `next build`.

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

**Corrigido e APLICADO em produção em 2026-08-23** —
`20260823140000_fix_bid_and_favorite_functions.sql`: schema realinhado,
identidade derivada de `auth.uid()` internamente, `EXECUTE` revogado de
`anon`. Testado com `BEGIN; ... ROLLBACK;` antes da aplicação real; depois de
aplicar, validado ponta a ponta contra produção com leilão/usuários
descartáveis:

```
anon sem sessao (place_bid_atomic)         -> 42501 permission denied
anon sem sessao (toggle_favorite_atomic)   -> 42501 permission denied
vendedor no proprio leilao                 -> rejeitado
lance abaixo do min_increment (105 < 110)  -> rejeitado
lance legitimo (150)                       -> aceito, current_bid atualizado
lance gravado com o user_id correto        -> sim (nao forjavel)
lance abaixo do novo minimo (155 < 160)    -> rejeitado
favoritar / desfavoritar                   -> atômico, ida e volta, user_id correto
```

Resíduo de teste: 0 usuários, 0 anúncios, 0 leilões.

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

Ambas as migrations (`20260823140000` e `20260823141500`) foram aplicadas em
produção via Management API e validadas — ver detalhe acima.

---

## Migrations

18 arquivos em `supabase/migrations/`. Todas as 9 criadas nesta revisão foram
aplicadas e validadas em produção:

| Migration | O que faz | Validado |
|---|---|---|
| `20260822120000` | trava colunas privilegiadas de `user_secrets` | 42501 nas 3 tentativas |
| `20260822120100` | hook que injeta `is_blocked` no JWT | claim presente, ES256 |
| `20260822120200` | recria `on_profile_created_secret` | linha criada por trigger |
| `20260822120300` | cota de anúncios do plano | P0001 no 4º ativo |
| `20260822120400` | trava `verified` / `kyc_status` | 42501 nas 2 tentativas |
| `20260822120500` | rate limit com janela no Postgres | 30x 200 + 5x 429 |
| `20260823090000` | impede autoavaliação e nota duplicada em `seller_reviews` | 23514 e 23505 nas 2 tentativas |
| `20260823140000` | conserta `place_bid_atomic` e `toggle_favorite_atomic` | 11 asserções, ver item 11 |
| `20260823141500` | versiona as 6 funções RPC restantes (sem mudança de lógica) | aplicada, sem comportamento alterado |

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
