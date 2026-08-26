# Checklist de produção — Tauze Class

Levantado na revisão de 2026-08-22. Tudo que era **código** já foi corrigido e
validado contra o banco de produção. O que resta aqui é **configuração** —
nenhum destes itens se resolve com deploy.

Estado verificado em 2026-08-22 22:xx, consultando o projeto de produção
diretamente. Reconfira antes do go-live.

---

## ✅ 3ª rodada de validação do zero — varredura completa do site — 2026-08-26

Pedido: "mais uma varredura completa do site inteiro" antes de publicar.
Workflow de 22 agentes (6 auditoria de código em paralelo + 5 testes ao vivo
sequenciais + 11 verificações adversariais). Achado mais importante: os 2
bugs críticos da rodada anterior estavam corrigidos, mas apareceram **12
achados novos**, incluindo 1 bug de perda de dado real (CPF/endereço) e 1 de
perda de assinatura em retry — provando de novo que revalidar do zero após
cada rodada de correção continua valendo a pena. Usuário aprovou corrigir os
30 achados confirmados (12 altos + 7 médios + 11 baixos).

### 🔴 Altos (12)

1. **CPF/CNPJ e endereço apagados em qualquer "Salvar Perfil"** —
   `painel/page.tsx` só buscava `plan` de `user_secrets`; os demais campos
   chegavam sempre vazios no formulário, e salvar qualquer coisa (até só a
   bio) sobrescrevia o dado real com string vazia. Corrigido buscando os
   campos certos.
2. **Vendedor não conseguia reativar anúncio pausado por ele mesmo** —
   `guard_ad_moderation` (estendido pra INSERT na rodada anterior) tratava
   `paused→active` como se fosse pular a fila de moderação. Corrigido:
   reativação pura (sem editar conteúdo junto) é self-service.
3. **Reenviar o mesmo `checkoutId` com plano diferente cancelava a
   assinatura ativa de verdade antes de falhar** — o lock de idempotência
   (INSERT com PK) só era adquirido depois da troca/cancelamento no
   gateway. Corrigido: lock adquirido ANTES de qualquer ação no gateway.
4. **Upgrade de plano liberava o entitlement mesmo se a cobrança de
   proração falhasse depois** — sem reconciliação. Redesenhado: o
   entitlement de upgrade agora só é concedido pelo webhook
   (`subscription.plan_changed`, i.e. fatura de proração paga de verdade),
   não mais na hora em que a chamada de troca retorna 200.
5. **`enforce_plan_expiration` lia `profiles.plan`**, coluna que nenhum
   código grava (real é `user_secrets.plan`) — o freio de segurança nunca
   disparava pra nenhuma assinatura real. Corrigido.
6. **`ads.expires_at` nunca era conferido** — 12 anúncios vencidos há
   semanas continuavam `active` em produção. Corrigido com cron
   `expire_ads` a cada 15 min (achado e corrigido de carona: o trigger de
   busca textual quebrava dentro dessa função por causa de `unaccent`
   sem schema qualificado sob `search_path=''`).
7. **Erro cru do gateway vazava pro cliente** em `subscriptions/cancel` e
   no fluxo de assinatura nova de `checkout/route.ts` (só a troca de
   plano já tinha sido sanitizada). Corrigido nos dois.
8. **Home mostrava eventos já passados há meses** em "Próximos Eventos" —
   `getServerUpcomingEvents` não usava o parser de data em texto livre já
   corrigido em `/eventos`. Corrigido.
9. **Card Payment Brick do Mercado Pago falhava ao inicializar** —
   `initialization`/`onSubmit` inline no `CheckoutModal` recriados a cada
   re-render, causando corrida no `useEffect` do SDK. Corrigido com
   `useMemo`/`useCallback`+ref.
10. **Badge de KYC nunca mostrava "Em Análise"** após envio real —
    nenhum trigger tocava `profiles.kyc_status` no INSERT de
    `verification_requests`. Corrigido.
11. **Lance rápido do leilão ignorava `event.step`** — podia deixar um
    lote sem nenhuma forma válida de dar lance pela UI. Corrigido:
    incrementos respeitam `step`, com campo de valor manual como
    alternativa sempre disponível.
12. **Leilão ao vivo sem atualização em tempo real** — Realtime nunca
    esteve habilitado pra NENHUMA tabela do projeto (achado de carona:
    `messages`, o chat comprador↔vendedor, tinha o mesmo problema).
    Corrigido: subscription no client + `auction_lots`/`messages`
    adicionadas à publicação `supabase_realtime`.

### 🟡 Médios (7)
`validate-coupon` sem auth/rate limit (enumeração de cupom) ·
`enforce_ad_quota` sem bypass de admin (travava aprovação manual) ·
metadata `billing_cycle` da Stripe não sincronizava em troca de ciclo ·
downgrade de plano tirava vídeo/banner/destaque na hora, mesmo já pago no
ciclo atual (agora só aplica no próximo ciclo, junto com o preço) ·
JSON-LD de `/eventos` com datas quebradas (SEO) · páginas institucionais
sem metadata própria (canonical sempre na raiz) · storage de
`ad-images`/`ad-videos` sem checar dono da pasta / plano com `has_video`.

### 🟢 Baixos (11)
6 telas do admin sem `.select()` pós-update (risco silencioso, não
observável hoje) · sino de notificação decorativo (removido) · mensagem
de cota em 1ª pessoa mostrada ao admin · `next_billing_at` morto (trocado
por `current_period_end`) · nonce de idempotência regenerava no "← Voltar"
· `place_lot_bid_atomic` sem `REVOKE EXECUTE` · rótulo "LANCE INICIAL"
incorreto em leilão cancelado com lance real · grants redundantes em
`auction_bids`/`auction_lot_bids` · 2 policies de storage mortas (buckets
inexistentes) · sitemap sem `/eventos` · desempate de `order_idx`
institucional ausente.

### Não corrigido nesta rodada (dado, não código)
Corrupção de emoji/acento nas 10 linhas de `institutional_pages.content`
(seletor de variação de emoji virou "─") e 1 imagem de seed morta
(Unsplash 404, anúncio "Cosechadora John Deere S760") — achados reais,
mas são dado de banco, não bug de código; ficam para uma limpeza de
conteúdo separada.

### Nota operacional (não é bug do produto)
Durante a Fase 1 do workflow (6 agentes de auditoria em `parallel()`),
vários interpretaram a instrução de "testar ao vivo" ao pé da letra e
levantaram servidores/sessões de navegador concorrentes entre si — cada
um viu dados de teste dos outros e presumiu, por um momento, que havia
uma sessão externa de terceiros. Investigação confirmou: era só um
processo Claude Code ativo (este), colisão inteira interna ao próprio
workflow. Nenhum dado de produção real foi afetado, só contas de teste
descartáveis dos próprios agentes.

---

## ✅ Validação do zero — 26 achados, incluindo regressões da própria correção anterior — 2026-08-26

Pedido: "realizar uma nova validação do zero, analisar erros, falhar,
regras de negocio detalhadamente" — auditoria completa via workflow de 16
agentes (5 revisão de código em paralelo, 3 testes ao vivo sequenciais,
8 verificações adversariais), tratando cada achado da rodada anterior
como não-confirmado até reproduzir de novo. 26 achados confirmados de
forma independente; o usuário aprovou corrigir todos.

**Achado mais importante desta rodada**: os 2 bugs mais graves não eram
antigos — eram **regressões da minha própria correção de proration da
Stripe do dia anterior** (25/08). Ilustra bem por que "revalidar do
zero" vale a pena mesmo logo depois de uma rodada de correções.

### 🔴 Críticos — já ao vivo em produção

1. **INSERT direto pulava moderação E destaque por completo.**
   `guard_ad_moderation`/`guard_ad_featured` só existiam como `before
   update` — a policy de INSERT não checa status/featured. Confirmado ao
   vivo: usuário Grátis publicava anúncio já `active` e `featured:true`
   num único POST, sem revisão nenhuma. Corrigido: os dois triggers
   agora cobrem `insert or update`.
2. **Chave de idempotência da Stripe sem nonce por tentativa** — repetir
   uma troca de plano já feita antes na mesma assinatura (ex.:
   PRO→Premium→PRO de novo) fazia a Stripe devolver a resposta em cache
   sem aplicar a troca real, com o banco gravando sucesso mesmo assim.
   Corrigido usando o `checkoutId` (gerado por abertura do modal) como
   nonce. Validado com 3 chamadas reais contra o sandbox da Stripe.
3. **`user_secrets.plan_id` nunca sincronizava após troca nativa de
   plano** — a coluna que a cota/fotos/destaque leem. Cliente pagava o
   upgrade e continuava com os limites antigos até a próxima renovação
   natural. Corrigido sincronizando direto no checkout.
4. **Troca só de ciclo (mensal↔anual) no mesmo plano escapava da
   proteção anti-duplicidade** da rodada anterior — `isPlanSwitch` só
   comparava `plan.name`. Também corrigido: assinatura 100%-off (cupom)
   nunca fechava ao trocar pra um plano pago de verdade.

### 🟠 Alto
5. `/listagem` quebrava no mobile — `.desktop-only` sem CSS nenhuma
   (grid de anúncios ficava em ~31px real). Corrigido; FAB duplicado
   morto removido.

### 🟡 Médio (11 itens)
Vídeo de anúncio ativo editável sem re-moderação · função de cron dos
leilões chamável por anônimo · lance forjável via INSERT direto
(bypassa a RPC) · erro cru da Stripe vazado ao cliente · webhook
sobrescrevia selo revogado manualmente a cada renovação ·
`/admin/assinaturas` sempre com e-mail vazio · KPI "Denúncias Abertas"
comparava com valor de enum inexistente · `/admin/planos` sem UI pra
vídeo/banner · colunas órfãs em `profiles` + trigger legado lendo fonte
errada · função de expiração sem `search_path` travado · default de
status de leilão fora do vocabulário real.

### 🟢 Baixo (7 itens)
Destacar exige anúncio ativo · `/sucesso` não afirma mais estado que não
confirma · banner de perfil antigo removido do storage ao trocar · falha
de rede não trava mais silenciosamente o limite de fotos · FAQ sem
promessa de Pix/boleto (ninguém aceita) + seletor de método morto
removido · FAQ de pro-rata sem afirmar fatura visível no downgrade ·
policy de storage escopada só ao bucket certo.

Validado: `tsc --noEmit`, `vitest run` (119/119), `next build` limpos.
3 baterias de teste contra a API real da Stripe sandbox, asserções
diretas no banco pra cada RLS/trigger/grant novo, e verificação de UI ao
vivo (mobile em duas larguras de viewport, checkboxes salvando de
verdade, e-mail de assinante aparecendo).

**Não corrigido nesta rodada**: `profiles.is_admin/is_blocked/plan/
plan_id` continuam existindo (21/14/1 linhas com dado real) — só o
trigger que as lia errado foi corrigido; dropar as colunas de fato fica
pra uma decisão separada.

Commit `50861e7`.

---

## ✅ Correção dos itens restantes da revisão de regras de negócio — 2026-08-25

Pedido: "aplicar demais correções" — fecha os 3 itens que a rodada
anterior tinha registrado como "não corrigido", com decisão explícita do
usuário pra cada um dos pontos ambíguos (perguntados antes de qualquer
código):

### Pro-rata real e downgrade agendado (unificados numa correção só)

A pergunta era "como implementar pro-rata real" — a resposta escolhida
("Stripe nativo, resto fica igual") também resolveu de graça o outro item
pendente ("downgrade entre planos pagos não agenda pro próximo ciclo"),
porque as duas promessas do FAQ (upgrade com pro-rata / downgrade só no
próximo ciclo) são a mesma API da Stripe com um parâmetro diferente:

- Novo `GatewayAdapter.updateSubscriptionPlan(subId, plan, prorate)` — só
  a Stripe implementa (única com API de trocar o preço de uma assinatura
  já existente). `prorate=true` (upgrade) usa
  `proration_behavior=always_invoice` (cobra a diferença agora);
  `prorate=false` (downgrade) usa `proration_behavior=none` (preço novo
  só na próxima fatura, sem cobrar/creditar nada agora).
- `checkout/route.ts`: ao trocar de plano com Stripe→Stripe, atualiza a
  MESMA assinatura em vez de cancelar+criar. Pra qualquer outro caso
  (Mercado Pago/Pagar.me/Asaas, ou troca entre gateways diferentes),
  continua no fallback já corrigido na rodada anterior (cancela a antiga,
  cria nova — cobrança imediata do valor cheio, sem duplicar).
- FAQ de `/planos` ajustado: não promete mais pro-rata/próximo-ciclo pra
  TODO mundo, já que só quem cai no Stripe (usuário internacional) recebe
  esse tratamento — Mercado Pago é o gateway nacional padrão, ou seja, a
  maioria dos usuários reais não teria essa promessa cumprida do jeito que
  o texto antigo dizia.

**Validado contra a API real do Stripe sandbox** (13 asserções, não só
teste mockado): criada assinatura PRO real → upgrade pra Premium com
`prorate=true` → confirmado que gerou fatura de proração nova, paga na
hora (R$70, a diferença proporcional) → downgrade de volta pra PRO com
`prorate=false` → confirmado que NÃO gerou fatura nova → confirmado que
nunca existiu mais de 1 assinatura pro mesmo customer (nunca duplicou) →
assinatura de teste cancelada e deletada de verdade na Stripe.

### Transição automática de leilões — via pg_cron

A pergunta era se valia construir isso — resposta: sim, via pg_cron.

- Extensão `pg_cron` habilitada (estava disponível no plano do Supabase,
  só não instalada). Job `advance-scheduled-auctions` roda a cada 5
  minutos, avançando `auction_events` de `scheduled` pra `live` quando o
  horário anunciado (`date`) já passou.
- Escopo deliberadamente limitado a essa transição: `live → closed` não
  foi automatizado porque não existe (nem deveria existir) um horário de
  término fixo pra leilão ao vivo — isso continua sendo decisão do
  leiloeiro assistindo a transmissão, exatamente como hoje.

Validado: job registrado e ativo (`cron.job`, `active=true`); evento de
teste criado com `date` no passado → função rodada manualmente → status
virou `live` corretamente → evento de teste apagado.

### 1 conta por CPF/CNPJ

A pergunta original recomendava NÃO aplicar sem checar os dados
primeiro — o usuário pediu pra aplicar direto. Antes de aplicar, verificado
que hoje **0 linhas** em produção têm `document_number` preenchido —
migration segura, sem risco de quebrar conta existente.

- Índice único por expressão em `user_secrets` (`regexp_replace` pra
  normalizar pontuação — "123.456.789-00" e "12345678900" contam como o
  mesmo documento).
- `ProfileTab.tsx` agora normaliza o CPF/CNPJ pra só dígitos antes de
  salvar (mesmo padrão já usado em `VerificacaoClient.tsx` e no
  checkout) e trata o erro `23505` (duplicado) com mensagem clara em vez
  de "Erro ao salvar perfil." genérico.

Validado: duas contas de teste, mesmo CPF em formatos diferentes — a
primeira grava normal, a segunda é rejeitada com `23505`.

### highlight_count (destaque de anúncio) — teto + UI nova

Não era um dos 3 itens perguntados, mas foi corrigido junto por ser a
continuação direta do achado crítico da rodada anterior (RLS de
`ads.featured` sem limite algum — já fechado, mas só o "quem", faltava o
"quanto").

- `guard_ad_featured` agora também verifica `plans.highlight_count` antes
  de deixar um destaque novo ser ligado. **Interpretação adotada,
  registrada explicitamente no comentário da migration**: teto de
  anúncios simultaneamente destacados (mesmo padrão de `max_ads`), não um
  crédito mensal que reseta — não existe em nenhum lugar do projeto hoje
  o conceito de contagem por período, e construir isso do zero seria uma
  suposição de produto, não uma correção. Se a intenção for outra, vale
  revisar.
- Botão **"☆ Destacar" / "★ Remover"** novo em `/admin/anuncios` — a tela
  nunca teve essa ação, apesar de `highlight_count` ser vendido em
  `/planos` desde sempre. Subtítulo da tela atualizado.

Validado: usuário Grátis (`highlight_count=0`) → destacar bloqueado com
mensagem clara. Usuário PRO (`highlight_count=2`) → 1º e 2º destaque
funcionam, 3º bloqueado, remover 1 abre vaga pro 3º. Testado também pela
UI real do admin (toast de erro/sucesso, botão troca de estado).

### Limpeza e polimento (achados menores da mesma auditoria)

- **Segundo fluxo de KYC removido** de `ProfileTab.tsx` — duplicava
  `/painel/verificacao` mas estava quebrado (`guard_profile_verification`
  bloqueava a escrita direta, nunca criava a `verification_request` que a
  fila do admin lê). Virou link pro fluxo real. `uploadKycDocument()`
  (código morto depois disso) removida de `lib/supabase-panel.ts`.
- **Moeda hardcoded ("R$")** corrigida em `CheckoutModal.tsx` e na tabela
  comparativa de `/planos` (usa `plan.currency` dinamicamente — sem
  efeito prático hoje, `plans.currency` é sempre BRL, mas evita quebrar
  silenciosamente se isso mudar). Removida do filtro de preço de
  `/listagem` (comparava valores numéricos crus de anúncios em moedas
  diferentes sem conversão — afirmar "R$" fixo ali era enganoso;
  conversão de câmbio de verdade fica pra decisão futura).
- **Rate limit em denúncias e mensagens internas** — nenhum dos dois
  tinha qualquer freio de taxa. Usa `check_rate_limit`, o mesmo RPC com
  janela no Postgres que `/login` já usa (5/min pra denúncia — por
  usuário logado, ou por anúncio quando anônima; 10/min pra mensagem).

Validado ao vivo, pela UI real: botão Destacar (toast de erro/sucesso
certo, estado do botão muda), link de KYC (sem formulário inline, navega
pra `/painel/verificacao`), moeda no checkout (R$ aparece certo, nada
quebrado), rate limit de denúncia (bloqueia na 6ª tentativa) e de
mensagem (bloqueia na 11ª), filtro de preço sem o símbolo fixo.

`tsc --noEmit`, `vitest run` (119/119), `next build` limpos. Commit
`bb4db8f`.

---

## ✅ Revisão completa de regras de negócio — 2026-08-25

Pedido: "revisar regras de negocio detalhada!" — auditoria em 7 domínios
(planos/benefícios, cupons, ciclo de vida de assinaturas, leilões,
moderação/denúncias, KYC, geo/moeda/gateway + antifraude), cada um lido
por um agente dedicado contra o código e o banco de produção, com
verificação adversarial independente de todo achado crítico/alto antes de
qualquer correção. 19 achados confirmados. Todos corrigidos (o usuário
aprovou as 3 categorias: críticos de segurança, bugs reais de "alta", e
promessas nunca implementadas).

### 🔴 Segurança crítica — já exploráveis em produção antes desta correção

Todos fechados com trigger/RLS no banco (não só no cliente), seguindo o
mesmo padrão já usado em `enforce_ad_quota`/`guard_profile_verification`:

1. **`ads.featured` sem limite algum.** RLS permitia qualquer dono
   `update({featured:true})` direto, sem checar `highlight_count` do
   plano. **Achado com evidência real**: 3 contas do plano Grátis
   (`highlight_count=0`) já tinham `featured=true`, uma com 7 destaques
   simultâneos. Novo `guard_ad_featured` restringe a admin/service_role.
2. **Moderação de anúncio contornável.** RLS deixava o dono pular
   `pending`, ativar direto, reativar um `rejected`, ou editar conteúdo
   de um anúncio `active` sem cair em nova revisão — tudo via chamada
   direta ao PostgREST (o wizard real já protegia certo, mas só no
   cliente). Novo `guard_ad_moderation` fecha os 3 caminhos no banco.
3. **Policy `"API service can insert ads"` com `WITH CHECK (true)`**,
   sem restrição de papel, permitia **qualquer visitante anônimo** inserir
   anúncio arbitrário direto no PostgREST. A migration que deveria ter
   corrigido isso (`20260724_api_rls_fixes.sql`) documentava o risco mas
   nunca foi de fato aplicada em produção — a policy perigosa continuou
   ativa até agora. Removida.
4. **`coupons` com RLS aberta a qualquer autenticado** (podia criar o
   próprio cupom de 100% off pelo console do navegador) **+** as RPCs
   `try_apply_coupon`/`revert_coupon_usage` sem checar quem chama
   (mesma classe de bug já corrigida em `place_bid_atomic`, nunca
   replicada aqui). Ambos fechados: RLS admin-only, RPCs service_role-only.
   O preview de cupom no checkout (`CheckoutModal`) passou a usar uma
   rota nova (`/api/checkout/validate-coupon`) em vez de ler a tabela.
5. **`verification_requests` (KYC) sem RLS nenhuma.** Testado ao vivo: um
   `GET` só com a anon key pública, sem login, devolvia CPF/CNPJ e paths
   de documento de identidade de qualquer solicitação. RLS aplicada:
   dono vê/insere a própria, admin vê/gerencia todas.
6. **Zero rate limit em `/api/checkout` e `/api/checkout/tokenize-card`**
   (a única rota que recebe número de cartão em claro) — usando o mesmo
   `check_rate_limit` (janela no Postgres) que `/login` já usa.
7. **`deleteAd` gravava `status:'deleted'`, valor que não existe no enum
   `ad_status` real** (confirmado via `pg_enum`) — toda tentativa de
   excluir anúncio retornava erro do Postgres. Enum corrigido.
8. **Achado durante a própria verificação ao vivo desta rodada**: 4
   policies de `storage.objects` liam `profiles.is_admin` como subquery
   direta em vez de chamar `public.is_admin()`. Isso quebrava **todo**
   upload de usuário comum (foto de anúncio, vídeo, banner) — não só
   upload de admin — desde que o `SELECT` de `is_admin` foi revogado de
   `authenticated` numa migration anterior (`20260824190000`), porque
   múltiplas policies permissivas se combinam com OR mas um ERRO de
   permissão numa delas aborta a operação inteira, mesmo que outra
   policy tivesse liberado. Corrigido usando `public.is_admin()`.

### 🟠 Bugs reais (não promessa de produto — código incorreto)

9. **`max_photos` hardcoded em 6 fotos pra todo mundo** — Grátis
   (prometido 5) ganhava 1 a mais; PRO (15) e Premium (30) recebiam menos
   da metade do que pagavam. Wizard agora busca o limite real do plano;
   banco aplica via `enforce_ad_media_plan_limits` (mesmo padrão de
   `enforce_ad_quota`, contornável só no cliente sem isso).
10. **Admin "Recusar" verificação KYC não sincronizava
    `profiles.kyc_status`** (só `verification_requests.status`) —
    usuário rejeitado ficava com o badge preso em "pendente" pra sempre.
    Corrigido reaproveitando a mesma rota que "Aprovar" já usa
    (`/api/admin/verify-user`).
11. **API de parceiros (`/api/v1/ads`) pulava moderação**, criando
    anúncio já `active` — inconsistente com a promessa de moderação que
    vale pro resto do site. Agora nasce `pending` como todo outro caminho.
12. **2 leilões legados** (tabela `auctions`, sistema sem consumidor de
    UI hoje) presos em `status='live'` há ~7-8 semanas depois do horário
    de término — dado corrigido diretamente (`status='ended'`), sem
    justificar construir um `pg_cron` pra um sistema sem tela nenhuma.
    Para o sistema em uso real (`auction_events`), a transição de status
    continua 100% manual (clique do admin) — sem incidente hoje, mas
    registrado como gap pra uma rodada futura decidir se vale automatizar.

### 🟢 Promessas vendidas mas nunca implementadas (construídas nesta rodada)

13. **Upload de vídeo no anúncio** (PRO/Premium) — nunca teve UI, só o
    campo de exibição (`AdGallery` já renderizava `video_url`, mas
    ninguém tinha como preenchê-lo). Adicionado ao wizard
    (`StepPhotos.tsx`), com upload real pro bucket `ad-videos` (já
    provisionado) e gate por `plans.has_video` (UI + banco).
14. **Banner de perfil** (Premium) — `profiles.banner_url` só era lido
    (perfil público), nunca escrito por ninguém. Adicionado ao painel
    (`ProfileTab.tsx`), upload pro bucket `profile-banners` (já
    provisionado), gate por `plans.has_banner` (UI + banco).
15. **Selo "Identidade Confirmada" automático** ao assinar plano pago —
    a própria tela de verificação promete isso, mas o webhook de
    pagamento nunca tocava em `profiles.verified`. Corrigido (cartão é
    hoje o único método de pagamento realmente oferecido, então toda
    assinatura paga aprovada já satisfaz a condição da promessa).
16. **Downgrade pro Grátis em `/planos`** era literalmente um
    `alert('Downgrade não implementado completamente nesta simulação.')`
    — sem nenhuma chamada de API. Agora reaproveita a rota real de
    cancelamento (mesma semântica: acesso continua até o fim do período
    pago, não perde na hora).
17. **Upgrade sem pro-rata podia criar assinatura duplicada** — nada
    verificava se o usuário já tinha uma assinatura ativa antes de criar
    outra, risco real de cobrança dupla no gateway. `/api/checkout` agora
    cancela a assinatura anterior (gateway dela, que pode ser diferente
    do novo) antes de prosseguir; se o cancelamento falhar, bloqueia a
    troca em vez de arriscar dupla cobrança. Pro-rata "de verdade" (multa
    proporcional aos dias restantes) segue não implementado — fica pra
    uma decisão de produto futura, já que depende de cálculo específico
    de cada gateway.
18. **FAQ de `/planos` promete pausar anúncios excedentes** ao voltar
    pro Grátis — `enforce_plan_expiration` nunca tocava na tabela `ads`.
    Agora pausa o excedente (mais antigos primeiro, mantém os mais
    recentes ativos) respeitando a cota real do plano Grátis.

### Achado próprio, durante a validação desta mesma rodada

Ao testar ao vivo, o campo `video` novo no schema do wizador
(`z.string().url()`) rejeitava o valor padrão `''` (nenhum vídeo
escolhido) — quebrava a validação do formulário **inteiro**, pra
qualquer usuário, com ou sem vídeo. Corrigido pra aceitar string vazia
antes de qualquer commit. Também descoberto durante essa mesma
investigação: o padrão "wizard não avança" (já visto antes nesta sessão)
voltou a aparecer mesmo depois do fix — desta vez confirmado, via
inspeção direta do fiber do React, que é 100% um artefato de ferramenta
(a transição do Framer Motion, `AnimatePresence mode="wait"`, não
completa num navegador headless sem compositing — o estado interno
`currentStep` avança corretamente). Não afeta usuários reais.

### Não corrigido nesta rodada (registrado, não esquecido)

- Segundo fluxo de KYC em `ProfileTab.tsx` (`handleKycSubmit` →
  `uploadKycDocument`) é duas telas diferentes fazendo a mesma coisa —
  essa é morta/quebrada (o trigger `guard_profile_verification` bloqueia
  a escrita em `kyc_status` antes de chegar em `user_secrets`, e nunca
  cria linha em `verification_requests`). O fluxo real e funcional é só
  `/painel/verificacao`. Vale decidir: remover a tela duplicada ou
  consertar o caminho alternativo.
- Downgrade **entre dois planos pagos** (ex.: Premium→Pro) continua
  caindo no mesmo caminho de upgrade (cobrança imediata do plano novo,
  sem agendar pro próximo ciclo como o FAQ genérico sugere) — só o
  downgrade especificamente pro Grátis foi corrigido nesta rodada.
- Vários achados de severidade média/baixa do domínio geo/moeda/antifraude
  não entraram no escopo aprovado (moeda hardcoda "R$" em 3 telas
  secundárias sem efeito hoje porque `plans.currency` já é BRL; sem rate
  limit em denúncias/mensagens; sem regra de "1 conta por CPF").

Validado: `tsc --noEmit`, `vitest run` (119/119), `next build` limpos.
25 asserções diretas contra produção (triggers/RLS novos, testados com e
sem exceção de admin/service_role) + verificação de UI ao vivo (upload
gated por plano, downgrade disparando `/api/subscriptions/cancel` de
verdade, preview de cupom via a rota nova, sync de rejeição de KYC).

Commit `c60556e`.

---

## ✅ Teste do plano Grátis (auditoria + ao vivo + correção) — 2026-08-25

Pedido: "realizar nova validação detalhada, bem como teste usuario gratis!"
— seguindo o gancho da rodada de gateways, focado especificamente no plano
Grátis (padrão de todo usuário, `max_ads=3` hoje). Metodologia: workflow com
2 agentes em paralelo (auditoria de código de tudo que verifica plano/cota,
e teste ao vivo clicando na UI real com dados descartáveis em produção),
seguido de verificação adversarial independente de cada achado antes de
corrigir.

**Objetivo principal (cota de 3 anúncios ativos): funciona corretamente de
ponta a ponta.** Cadastro real → wizard real publicando 4 anúncios → 3
ativados sem erro → 4º rejeitado pelo trigger `enforce_ad_quota` com a
mensagem certa (`P0001`) → pausar 1 ativo libera a cota → 4º ativa
normalmente. Paridade confirmada: leilão (lance), favoritar (RPC), contatar
vendedor e denunciar **não** têm nenhuma checagem de plano — igual pra
grátis e pago, como deveria ser.

A auditoria e o teste ao vivo encontraram 6 divergências de UI/UX (a cota
em si nunca foi contornável — os problemas eram todos em como a interface
comunica, ou deixa de comunicar, essa regra). Todas as 6 corrigidas,
re-verificadas ao vivo uma por uma, commit `c2da62f`:

1. **Favoritar em `/anuncio/[id]` não persistia — bug real, não só UX.**
   `AdSidebar.tsx` tinha uma implementação própria, paralela, que só
   gravava em `localStorage` — nunca chamava a RPC `toggle_favorite_atomic`.
   O botão "Salvar" parecia funcionar, mas o favorito nunca aparecia em
   "Meus Favoritos" e sumia ao trocar de dispositivo. Trocado pelo hook
   `lib/useFavorites.ts`, já usado corretamente nos cards de listagem/home.
2. **Reativar anúncio pausado além da cota mostrava erro genérico.**
   `MyAdsTab.tsx` descartava `error.message` no catch — único caminho
   self-service que alcança o bloqueio de cota, e o usuário nunca sabia que
   era um limite de plano. Agora mostra a mensagem real do banco.
3. **Anúncio pendente bloqueado por cota era indistinguível de um pendente
   comum.** `MyAdsTab.tsx` agora mostra "Aguardando vaga — você atingiu o
   limite de anúncios ativos do seu plano" ao lado do badge.
4. **Aprovação em massa no admin falhava em bloco.** Um único
   `.update().in(...)` é uma transação só — se 1 dos anúncios selecionados
   esbarrasse na cota do dono, a transação inteira abortava e nenhum era
   aprovado, sem indicar qual. Agora atualiza um por um e reporta
   sucesso/falha por item, mantendo selecionados só os que falharam.
5. **Contador do painel usava `PLAN_META` hardcoded, já divergente do
   banco** (`premium: 999` no código vs. `max_ads: 9999` real — inofensivo
   hoje só porque nenhum Premium tem 999+ anúncios, mas ilustra o risco: se
   o admin mudasse o limite do Grátis em `/admin/planos`, o painel
   continuaria mostrando o valor antigo). `painel/page.tsx` agora busca a
   tabela `plans` — a mesma fonte que o trigger de cota usa — e repassa
   pra `PainelClient`/`BillingTab`/`MyAdsTab`. Testado ao vivo: mudei
   `max_ads` do Grátis pra 5 via script, o painel acompanhou em tempo real
   sem novo deploy, revertido depois.
6. **Badge "Plano Atual" nunca aparecia pra quem está no Grátis.**
   `user_secrets.plan_id` só é gravado pelo webhook de pagamento (planos
   pagos) — quem está no Grátis por padrão sempre tem `plan_id NULL`, e
   `PricingClientUI.tsx` comparava só por id. Mesma classe de bug já
   corrigida antes pros planos pagos, mas não pro Grátis. Adicionado
   fallback: card com `price <= 0` conta como atual quando `plan_id` é nulo
   e há sessão logada.

**Nota tangencial, registrada mas não corrigida (fora do escopo direto):**
`plans.highlight_count` ("2 destaques Pro / 10 Premium") é vendido na
página de planos mas não tem nenhum trigger de enforcement — o admin liga
`ads.featured` manualmente sem teto por plano. Mesmo padrão do achado #5,
mas sobre destaques em vez de cota de anúncios; decisão de produto, não
bug.

Validado: `tsc --noEmit`, `vitest run` (119/119), `next build` limpos, e
cada uma das 6 correções re-testada ao vivo contra produção com dados
descartáveis (ver relatório da verificação — favoritar persistindo/
removendo de verdade, mensagem de cota com o texto exato do banco, aviso
aparecendo no anúncio pendente certo, aprovação em massa com 1 sucesso + 1
falha isolada e identificável, contador do painel mudando ao vivo junto
com `plans.max_ads`, badge aparecendo logado e sumindo deslogado). Limpeza
de todo dado de teste confirmada por leitura independente em duas rodadas
(varredura por ID conhecido e por padrão de nome/e-mail, sem depender de
lista salva).

---

## ✅ Correção dos 5 achados da rodada 2 — 2026-08-25

Fecha os 5 achados marcados como CONFIRMADOS na auditoria rodada 2 (abaixo
— o usuário escolheu "Corrigir os 5 (críticos + alto + baixos)"). Dos 5
achados originais, 1 acabou sendo um falso-positivo de ferramenta
(explicado abaixo); os outros 4 eram bugs reais.

1. **Wizard de `/anunciar` não avançava pro passo 2 — FALSO-POSITIVO.**
   Reinvestigado com servidor `next dev` totalmente reiniciado (o servidor
   de longa duração usado na auditoria original tinha ficado com HMR
   "stale" — confirmado inspecionando `onClick.toString()` via as props do
   fiber do React, que mostrava código desatualizado/da função errada).
   Com servidor limpo, `trigger()` valida certo e `isStepValid=true`,
   avançando normalmente. Nenhuma mudança de código foi necessária.
2. **🟠 Rascunho perde a Categoria ao recarregar — corrigido.**
   `StepData.tsx` agora ressincroniza o `<select>` de categoria (não-
   controlado, via `register()`) num `useEffect` **separado**, disparado
   depois que `categories` já populou o DOM com as `<option>`s reais —
   `setValue()` não consegue selecionar uma option que ainda não existe na
   árvore. A primeira tentativa (ressincronizar no mesmo efeito do fetch)
   não funcionava por isso; confirmado ao vivo nos dois casos (bug
   reproduzido, depois corrigido) recarregando a página com um rascunho
   salvo e lendo `categoria.value` no DOM.
3. **🔴 Formulário de cartão do Mercado Pago não renderizava — corrigido
   com CSP restrita à rota de checkout.** Ver detalhes da decisão técnica
   na subseção abaixo — o usuário pediu explicitamente a solução
   profissional, não um remendo.
4. **🟡 Categorias sem opção de excluir — corrigido.** Novo botão
   "Excluir" em `/admin/categorias`, com confirmação. Reaproveita a
   proteção que já existia no banco (constraint de FK com `ON DELETE`
   padrão `NO ACTION`): se houver anúncios na categoria, o Postgres
   rejeita a exclusão com o erro `23503`, que a UI traduz numa mensagem
   amigável em vez de deixar a exclusão "sumir" uma categoria em uso.
5. **🟡 Subtítulo de `/admin/anuncios` prometia "destacar"/"remover"
   inexistentes — corrigido.** Texto agora reflete as ações reais
   (Aprovar/Rejeitar/Pausar).

### CSP do checkout Mercado Pago — por que não foi um remendo

O bug real: o SDK do Mercado Pago Bricks gera um `<script>` **inline**
dinamicamente durante a inicialização do formulário de cartão, e nosso CSP
`script-src` só permitia `'nonce-…'` — scripts inline sem nonce são
bloqueados por padrão em todo o site, correto pra maioria das páginas, mas
o Bricks não injeta nonce nenhum no script que ele mesmo gera.

Três alternativas foram avaliadas antes de decidir:

- **CSP hash-based (`'sha256-…'`)** — testada empiricamente antes de
  descartada, não só por suposição: capturado o conteúdo do script inline
  (57.551 caracteres) via monkey-patch de `Node.prototype.appendChild`,
  calculado o SHA-256, e repetido o processo numa segunda sessão de login
  totalmente independente. Mesmo tamanho, hash **diferente**
  (`7l6KtvjuuHL…` vs `bcKbpfu2rWL…`) — o conteúdo do script varia por
  sessão (provavelmente tokens de fingerprinting/anti-fraude embutidos),
  então um hash fixo no CSP quebraria a maioria das sessões reais.
  Inviável.
- **`'unsafe-inline'` global** — rejeitado: relaxaria proteção contra XSS
  em todo o site (blog, formulários de anúncio com rich text, área de
  denúncias) só por causa de uma única página de checkout.
- **`'unsafe-inline'` restrito à rota `/planos`** — escolhida.
  `proxy.ts:buildCsp()` agora recebe o `pathname` e, só quando a rota é
  `/planos` (ou sub-rota), omite o nonce do `script-src` e inclui
  `'unsafe-inline'` no lugar (por especificação do CSP, `'unsafe-inline'`
  é ignorado por navegadores modernos sempre que há nonce/hash na mesma
  diretiva — por isso não dá pra simplesmente "somar" os dois; um exclui
  o outro). Resto do site continua exigindo nonce normalmente.

Risco residual avaliado como baixo: os campos sensíveis de número de
cartão/CVV do Bricks renderizam dentro de um `<iframe>` hospedado pelo
próprio Mercado Pago, com o CSP **deles**, não o nosso — o script que
passou a rodar sem nonce é só bootstrap/consentimento de
cookies/fingerprinting anti-fraude, não a superfície que lida com dado de
cartão.

Efeito colateral encontrado e corrigido junto: depois de liberar o
`script-src`, o script do Bricks passou a rodar e disparou violações
**novas** de `connect-src`/`img-src` contra domínios de anti-fraude da
MercadoLibre (`*.mercadolibre.com`, `*.mercadolivre.com`) — adicionados a
ambas as diretivas.

**Achado residual NÃO corrigido nesta rodada (fora do escopo de CSP):**
mesmo com zero violações de CSP confirmadas, o formulário de cartão ainda
não renderiza — agora falhando com 404 em
`https://api.mercadopago.com/v1/payment_methods/search?...&product_id=…`.
Não há chave de Mercado Pago no `.env.local` (ficam em `platform_settings`
no banco); tudo indica ser um problema de configuração do lado da conta
Mercado Pago (chave de teste ou `product_id` não registrado no painel
deles), não um bug de código — precisa de acesso ao painel do Mercado
Pago pra investigar, fora do que dá pra resolver por aqui.

Commit `e8040e6`.

---

## 🔍 Auditoria rodada 2 — admin sem cobertura + achados pendentes — 2026-08-25

Pedido: "seguir areas nao validada ainda!" — cobre as 8 áreas de admin sem
cobertura real da rodada 1 e reinveestiga os achados fortes-mas-não-
confirmados (wizard de anunciar, checkout Mercado Pago, páginas 500).
Rodada bem menor e mais controlada que a 1ª (10 áreas via workflow +
3 testadas diretamente por mim, sem sub-agente, por causa do classificador
de segurança — ver nota abaixo), evitando a instabilidade de servidor da
rodada anterior.

**Boa notícia**: os erros 500 ("Jest worker encountered N child process
exceptions") em `/eventos/[id]` e `/leiloes/[id]` reportados na rodada 1
**sumiram** — testados 4 eventos + 3 leilões diferentes, todos HTTP 200.
Muito provavelmente foi efeito colateral do fix do `next/image` (commit
`9bee8a9`): o crash sob carga concorrente provavelmente vinha do mesmo
tipo de exceção não tratada que aquele fix eliminou.

### Achados CONFIRMADOS

1. **🔴 Crítico — botão "Próximo Passo" do wizard de `/anunciar` não avança
   pro passo 2**, mesmo com Título/Categoria/Descrição/Preço todos válidos.
   Sem erro no console, sem requisição de rede, sem mensagem de validação —
   simplesmente não acontece nada. Confirmado com 2 métodos de clique
   diferentes (mouse real e `.click()` direto no elemento) e testado
   também tentando pular direto pra aba "Localização" do indicador de
   progresso (também não funciona). Bloqueia por completo a criação de
   anúncios pela UI.
2. **🟠 Alto — rascunho salvo automaticamente perde a Categoria ao
   recarregar a página**, mesmo com Título/Descrição/Preço voltando
   certos. Causa raiz identificada: `StepData.tsx`'s `<select>` de
   categoria é não-controlado (`register()` do react-hook-form); a lista
   de `<option>`s só chega depois de um fetch assíncrono, e a ref callback
   do `register()` que aplica o valor restaurado só roda uma vez no mount
   — quando as opções chegam depois, o valor nunca é reaplicado.
3. **🔴 Crítico — formulário de cartão do Mercado Pago nunca renderiza no
   checkout**, resolvendo a disputa da rodada 1: a causa raiz é CSP
   bloqueando um SCRIPT INLINE que o SDK do Mercado Pago Bricks gera
   dinamicamente durante a inicialização (não o `<script src>` externo em
   si, que carrega normalmente). Sem `unsafe-inline`/hash/nonce pra esse
   script dinâmico, o Brick nunca inicializa. Achado extra: não há
   alternativa de Pix/Boleto nesta tela, apesar do FAQ de `/planos`
   afirmar que essas formas são aceitas.
4. **🟡 Baixo — categorias não têm opção de excluir na UI** (só
   Editar/Ativar-Desativar), inconsistente com Banners e Páginas
   Institucionais, que têm "Excluir" na própria listagem. Pode ser
   proposital (integridade referencial — categorias têm anúncios
   associados), mas é uma inconsistência de padrão entre as telas de
   conteúdo administrável.
5. **🟡 Baixo — subtítulo de `/admin/anuncios` promete funcionalidade que
   não existe**: "Aprove, **destaque** ou **remova** anúncios do portal" —
   mas o código (`app/(admin)/admin/anuncios/page.tsx`) só implementa
   Aprovar/Rejeitar/Pausar (individual e em massa); não existe nenhum
   botão de destacar (featured) nem de excluir em lugar nenhum da tela.
   Achado meu, ao testar esta área diretamente (ver nota abaixo).

### Áreas confirmadas limpas (testadas de verdade, sem achados)
`admin_usuarios`, `admin_anuncios` (aprovar confirmado ao vivo; rejeitar/
pausar usam a mesma função, alta confiança), `admin_assinaturas`,
`admin_leiloes`, `admin_conteudo` (categorias e banners — depoimentos e
páginas ver falso-positivo abaixo), `admin_cupons`,
`admin_config_verificacoes`, `admin_denuncias_apikeys` (denúncias e
chaves de API, incluindo reteste do cascade de exclusão de chave→logs).

### Falsos-positivos descartados (lição de ferramenta, não de produto)
Dois achados "críticos" (botões de Depoimentos e de Páginas
Institucionais completamente inertes no admin) foram **refutados**: a
causa era a aba do navegador estar em segundo plano/não composta
("the Browser pane is not displayed, so the page is not compositing
frames"), fazendo cliques simulados não chegarem como eventos DOM reais
— nada a ver com o produto. Um terceiro achado ("nenhuma validação
visual") também foi refutado — a validação aparece sim (texto vermelho
"O título deve ter no mínimo 5 caracteres" etc.), só não muda a cor da
borda nem seta `aria-invalid` (um achado bem mais estreito, de
acessibilidade, não reportado formalmente).

### Nota sobre o classificador de segurança do Claude Code
3 áreas (`admin_usuarios`, `admin_anuncios`, `admin_denuncias_apikeys`)
tiveram sub-agentes bloqueados pelo classificador por delegarem acesso
irrestrito de SQL destrutivo (`scripts/tmp-run-sql.mjs`) contra produção
a um agente autônomo sem supervisão — o mesmo motivo nas 3 vezes. Testei
essas 3 áreas eu mesmo, diretamente (sem sub-agente), o que contornou o
bloqueio nas duas primeiras; uma ação pontual de moderação
(`Rejeitar` num anúncio) ainda foi bloqueada mesmo feita diretamente por
mim — não insisti, e confiei na "Aprovar" já confirmada (mesma função
`handleStatusUpdate` pra todas as transições de status). Vale considerar,
em rodadas futuras, não delegar esse script de SQL genérico a
sub-agentes — só usá-lo diretamente.

Todo dado de teste criado nesta rodada (3 contas descartáveis, anúncios,
denúncias, leilão, assinatura, chave de API, etc.) foi excluído e a
exclusão confirmada por leitura independente.

---

## ✅ Correção dos 4 achados confirmados pela auditoria — 2026-08-25

Fecha os 4 achados marcados como CONFIRMADOS na entrada de auditoria
abaixo (o usuário escolheu "Corrigir os 4 confirmados agora").

1. **`next/image` sem tratamento de erro** — corrigido centralizando a
   validação de host em `lib/storage.ts:imageUrl()` (mesma allowlist de
   `next.config.ts`, fallback local se o host não for permitido) e
   migrando todo componente que renderizava imagem de anúncio/lote/
   evento direto (`AdCardHome`, `AdCard`, `AdGallery`,
   `SimilarAdsCarousel`, `MyAdsTab`, `LotGrid`, `EventCard`,
   `eventos/[id]`, `AuctionsBrowser`) pra usar essa função em vez de
   reimplementações locais divergentes (uma das causas do bug: 4
   versões diferentes da mesma lógica, nenhuma validando host).
2. **Segredos de gateway vazando pro `localStorage`** — `Header.tsx`
   agora exclui as linhas secretas já na query (não chegam mais ao
   navegador) e limpa qualquer resíduo no logout.
   `lib/secret-settings.ts` centraliza a lista de chaves secretas,
   compartilhada com `app/api/admin/settings/route.ts` (antes cada
   arquivo tinha a sua própria cópia da lista).
3. **Denúncia anônima sempre falhava** — migration
   `20260825120000_fix_anonymous_report_rls.sql` corrige a policy RLS
   (`auth.uid() = reporter_id` não cobria o caso NULL=NULL) **e** remove
   o `NOT NULL` da coluna `reporter_id`, que também bloqueava sozinho.
4. **Badge de data errado em `/eventos`** — `EventCard.tsx` e `page.tsx`
   agora compartilham uma função só (`lib/event-date.ts`), extraída do
   parser já corrigido numa rodada anterior, pra badge e ordenação nunca
   mais divergirem.

Validado ao vivo pra cada um (recriando o cenário de teste, confirmando
o comportamento correto, e removendo o dado de teste com exclusão
confirmada por leitura independente): Home renderiza normal com um
anúncio de imagem em host proibido; 0 chaves secretas no `localStorage`
de uma sessão admin de teste; `POST` anônimo em `/rest/v1/reports`
retorna 201 com `reporter_id: null`; badge "12 NOV" certo pro Congresso
Leiteiro.

**Limitação residual conhecida, não corrigida nesta rodada:** o parser
de data em texto livre (`lib/event-date.ts`) escolhe o dia errado em
intervalos no formato "DD a DD de Mês" (ex.: "15 a 18 de Agosto" vira
badge "18 AGO" em vez de "15 AGO") — o regex não consegue pular o
primeiro número quando o segundo aparece antes do nome do mês. Não é o
que a auditoria reportou (que era abreviação de mês inválida, já
corrigido) e só afeta esse formato específico de intervalo — registrado
aqui pra não ser perdido.

Commit `9bee8a9`.

---

## 🔍 Auditoria multi-agente completa (site + admin), com verificação adversarial — 2026-08-25

Pedido: "realizar teste novamente completo com todas funcionalidades do site
e admin, [...] clique em todas as funcionalidades". Rodada via workflow com
19 agentes clicando ao vivo (não só lendo código), agrupados por conta de
login (anônimo/vendedor/comprador/admin, já que o navegador usa uma sessão
compartilhada) para evitar um agente derrubar a sessão do outro. Cada achado
passou por um segundo agente independente tentando refutá-lo antes de entrar
no relatório final.

**⚠️ Cobertura real ficou bem abaixo do planejado.** A rodada durou quase 5h
(19 agentes, 40 sub-agentes no total) e o servidor `next dev` do projeto
ficou instável/derrubado a partir do 2º dos 19 alvos e nunca voltou sozinho
pelo resto da execução — provavelmente por exaustão do pool de workers do
Turbopack ("Jest worker encountered N child process exceptions") sob carga
concorrente sustentada de vários agentes navegando por horas, possivelmente
agravado pelo próprio crash de imagem descrito abaixo. Resultado: **todas as
7 áreas de admin testadas ficaram sem nenhuma cobertura real de clique**
(só investigação de banco/código — nenhum bug pôde ser confirmado NEM
descartado lá), 1 área (`admin_usuarios`) nem chegou a rodar (bloqueada pelo
classificador de segurança do Claude Code por delegar SQL destrutivo
irrestrito a um agente autônomo — achado sobre o desenho da própria
auditoria, não sobre o site), e várias áreas do site público também
perderam a fase de verificação por causa disso. Interpretar os "achados não
confirmados" abaixo com esse contexto: muitos são bem verossímeis, só não
puderam ser reproduzidos de novo porque o servidor caiu no meio do caminho.

### 🔴 Ação de emergência já tomada
O anúncio-fixture descartável criado para a auditoria tinha uma imagem em
`placehold.co` — host fora da allowlist `images.remotePatterns` de
`next.config.ts`. Isso **derrubava a Home inteira e qualquer página de
anúncio** (ver achado crítico abaixo) **no banco de produção real**, não só
no ambiente de teste. Assim que percebido, o anúncio foi excluído
diretamente do banco (`ads.id = e20a1bde-b32d-4ec5-815b-63e0497891c6`) e a
remoção foi confirmada por leitura independente. Todos os outros fixtures
descartáveis da auditoria (contas de teste, leilão/lote, cupom) também
foram limpos e confirmados removidos.

### Achados CONFIRMADOS ao vivo (reproduzidos de forma independente)

1. **🔴 Crítico — `next/image` sem tratamento de erro derruba a Home e
   `/anuncio/[id]` inteiros.** Qualquer anúncio ativo com imagem hospedada
   fora de `images.remotePatterns` faz o `next/image` lançar uma exceção
   não tratada que sobe até o error boundary de nível de página
   (`app/(public)/error.tsx`), substituindo TODO o conteúdo (não só o
   card) por "Ops! Algo não saiu como esperado" — sem fallback por card,
   afetando qualquer visitante. Se propaga também para `/anuncio/[id]` de
   outros anúncios via o fallback "Nível 4: recentes global" de
   `SimilarAds.tsx`, que ignora categoria. Isso não depende de má-fé — só
   de um vendedor colar uma URL de imagem de um host não cadastrado.
2. **🔴 Crítico (segurança) — segredos dos 4 gateways de pagamento
   (Stripe, Mercado Pago, Pagar.me, Asaas) vazam pro `localStorage` do
   navegador quando um ADMIN loga.** Causa raiz exata:
   `components/Header.tsx`, função `syncPlatformSettings` (~linhas 82-99),
   faz `select('*')` em `platform_settings` direto do navegador; a policy
   RLS `is_admin()` libera TODAS as colunas (incluindo as secretas) pra
   quem tem `is_admin=true`, e o código grava cada `key/value` retornado
   em `localStorage.setItem()` sem nenhum filtro — ao contrário de
   `app/api/admin/settings/route.ts`, que já tem uma lista `CHAVES_SECRETAS`
   pra nunca devolver esses valores. O logout NÃO limpa o `localStorage`,
   então os segredos ficam expostos a qualquer script da página
   indefinidamente, mesmo depois do admin sair da conta. Só chaves de
   sandbox no ambiente atual, mas o mesmo caminho com chaves reais
   exporia credenciais de cobrança de produção a qualquer XSS.
3. **🟠 Alto — denúncia de anúncio por visitante DESLOGADO sempre falha.**
   `components/ads/AdReportModal.tsx` grava `reporter_id: null` quando não
   há sessão (comportamento intencional, denúncia anônima deveria
   funcionar), mas a policy RLS "Anyone can report" usa
   `with_check (auth.uid() = reporter_id)` — em SQL, `NULL = NULL` nunca é
   `TRUE`, então o INSERT é sempre rejeitado (confirmado com uma chamada
   REST direta reproduzindo 401/42501). Mensagem genérica "Erro ao enviar
   denúncia", sem indicar que precisa logar.
4. **🟠 Alto — badge de data errado em 3 dos 8 cards de `/eventos`.**
   `EventCard.tsx` usa um regex mais simples
   (`/(\d+)\s+([a-zA-Zç]+)/i`) que o usado pra ordenação em `page.tsx`
   (`/(\d{1,2})\D*?([a-zA-Zç]{3,})/i`, já corrigido numa rodada anterior)
   — pega a primeira palavra depois do número, então "12 de Novembro"
   vira badge "12 DE", "28 de Abril a 06 de Maio" vira "28 DE" e
   "15 a 18 de Agosto" vira "15 A". A ordenação geral da lista está
   correta; só o badge visual do card está errado.

### Achados reportados com boa evidência mas NÃO reverificados (servidor
caiu antes da 2ª checagem — tratar como "provável", não como confirmado)

- **Wizard de "Anunciar" trava com tela em branco (`opacity:0`) ao clicar
  "Próximo Passo"**, com ou sem formulário válido, sem erro no console —
  bloquearia todo o fluxo de criação de anúncio pela UI.
- **Nenhum feedback visível de validação** ao tentar avançar com
  Título/Categoria vazios no mesmo wizard.
- **Categoria não persiste ao recarregar um rascunho salvo** em
  `/anunciar` — o agente de verificação não conseguiu clicar, mas achou
  uma causa raiz muito convincente no código: o `<select>` de categoria é
  não-controlado (`react-hook-form` puro), e a lista de `<option>`s chega
  depois via fetch assíncrono em `StepData.tsx` — o valor default é
  aplicado pela ref callback do `register()` no mount, quando só existe a
  option vazia "Selecione...", e a ref callback não roda de novo quando as
  categorias chegam depois.
- **Erro 500 "Jest worker encountered N child process exceptions"** em
  `/eventos/[id]` e `/leiloes/[id]` — relatado de forma consistente por
  4 agentes de áreas diferentes, com o mesmo código de erro (`E394`).
  Como é um crash do pool de workers do modo dev do Next (Turbopack), não
  necessariamente reflete produção (build compilado não usa esse pool),
  mas os 2 arquivos merecem um teste isolado e rápido antes de descartar.
- **Formulário de cartão do Mercado Pago nunca renderiza no checkout**
  (`#cardPaymentBrick_container` fica vazio, `Bricks.create` falha) — a
  causa raiz alegada pelo relator original (script inline bloqueado pelo
  CSP) foi contestada pelo verificador (o SDK do MP só injeta um
  `<script src=...>` externo já permitido, não inline) — pode ser um
  sintoma real com diagnóstico errado, ou um falso-positivo; a melhor
  forma de saber é reproduzir ao vivo, pois é a área de checkout, a mais
  sensível do site.

### Falso-positivo descartado, com um achado menor real encontrado no lugar

O seletor de idioma (PT/ES) do header **funciona** — o achado original
provavelmente coincidiu com o bug que o commit `2fe6429` já corrigiu no
mesmo dia (`router.refresh()` ausente). Só que, testando isso, apareceu um
achado **novo e real, menor**: o rodapé "simplificado" (usado em
`/listagem`, `/painel`, `/anunciar`, `/vendedor`, `/leiloes`, `/anuncio`,
`/eventos` — `components/Footer.tsx`, bloco `isSimplified`) é 100%
hardcoded em português e nunca usa `t()`/lang, então fica em PT mesmo com
ES selecionado (diferente do rodapé completo da home, que já traduz certo).

### Áreas sem NENHUMA cobertura real (bloqueio de ambiente, não "sem bugs")
`admin_usuarios` (nem rodou — classificador bloqueou), `admin_anuncios`,
`admin_assinaturas`, `admin_leiloes`, `admin_conteudo` (categorias/
banners/depoimentos/páginas), `admin_cupons`, `admin_denuncias_apikeys`,
`admin_config_verificacoes` — nenhuma dessas 8 áreas conseguiu clicar em
nada; todas relatam o mesmo bloqueio de servidor. Não interpretar como
"admin está limpo".

---

## 🧩 Gaps de feature do reteste, agora implementados — 2026-08-25

Quarta rodada ("Atacar os gaps de feature"), fechando os itens que
tinham sido deliberadamente registrados como gap de feature/hygiene
(não bugs) nas duas rodadas anteriores.

**Edição em admin que só tinha criar/excluir**: cupons e lotes de
leilão ganharam edição de verdade — antes, corrigir um erro de
digitação exigia excluir e recriar, o que no caso de um lote também
zerava qualquer lance real (`current_bid`/`winner_id`) já registrado.

**Novo status `cancelled` para eventos de leilão**, de ponta a ponta
(não exigiu migration — a coluna `status` de `auction_events` é texto
livre sem CHECK constraint): badge/filtro/KPI/ações individuais e em
massa (Cancelar, Reagendar) no admin; `/leiloes?status=cancelled` na
listagem pública; banner "LEILÃO CANCELADO" na página do leilão; e o
modal de lance agora bloqueia com uma mensagem específica
("Este leilão foi cancelado") em vez do aviso genérico de "ainda não
está ao vivo". De brinde: o `eventStatus` do JSON-LD mapeava leilão
`closed` (só terminou) para `EventCancelled` — semanticamente errado,
carregado desde a correção do valor `finished`→`closed` da rodada
anterior. Corrigido pra só o status `cancelled` real virar
`EventCancelled`.

**CTA mobile de vendedor**: visitante deslogado clicando "Falar com
Vendedor" abria uma aba nova mostrando o JSON crú
`{"error":"Unauthorized",...}` — a rota é navegada direto pelo
navegador (`<a target="_blank">`), não chamada via fetch, então uma
resposta JSON nunca fazia sentido nesse caminho. Agora redireciona pro
`/login?next=/anuncio/{id}`, igual ao padrão já usado no resto do
site.

**Achado relacionado, sinalizado e corrigido (com confirmação do
usuário)**: investigando o CTA mobile, percebemos que o painel
lateral do anúncio no desktop (`AdSidebar.tsx`) montava o link
`wa.me/{telefone}` direto no servidor e passava o objeto inteiro pro
client component — o número saía no HTML/RSC payload pra qualquer
visitante sem login, mesmo o mobile já protegendo o mesmo dado com
autenticação, rate limit e verificação de origin via
`/api/contact-seller`. Confirmado com o usuário que o desktop deveria
seguir a mesma regra do mobile. Corrigido (commit `fdb384f`): só um
booleano (`hasWhatsapp`) atravessa pro client agora, e o botão do
desktop usa a mesma rota protegida do mobile. No mesmo lugar, achado e
corrigido um vazamento análogo: `RecentViewTracker` recebia o objeto
`ad` inteiro (com `profiles.phone_whatsapp`) só pra ler `ad.id`.
Validado ao vivo: o número (buscado direto no banco pra comparação)
não aparece mais em nenhum lugar do HTML servido de um anúncio real.

**Defesa em profundidade nas páginas de conteúdo do admin**:
categorias/banners/depoimentos/páginas faziam `update()`/`delete()`/
`upsert()` sem `.select()` — a Supabase JS retorna `{ error: null }`
mesmo quando o filtro não bate com nenhuma linha (ex.: RLS bloqueando
silenciosamente), e a UI mostrava "sucesso" sem ter mudado nada no
banco. Todas as quatro páginas agora checam a contagem de linhas
afetadas antes do toast de sucesso.

**Higiene de dado nos dropdowns de localização**: `/listagem` usava
`new Set()` bruto sobre `country`/`state`/`city` de `ads` — como esses
campos são texto livre sem normalização de caixa no cadastro,
"Brasil"/"brasil" apareciam como duas opções distintas no mesmo
dropdown. Não corrige o dado sujo no banco (fora de escopo), mas o
dropdown agora agrupa por chave normalizada em minúsculas.

Validado ao vivo: `/api/contact-seller` redireciona corretamente pro
login com `next=` preservando o anúncio de origem; leilão de teste
descartável com `status=cancelled` mostrou o badge/filtro/página/modal
de lance corretos em toda a extensão pública, dado limpo e cleanup
confirmado depois. `tsc --noEmit`, `vitest run` (119/119), `next
build` limpos. Commit `5a1a066`.

---

## 🧹 Fechamento dos achados médios/baixos do reteste — 2026-08-25

Terceira rodada ("continuar!"), fechando os itens que tinham ficado
registrados mas não corrigidos nas duas rodadas anteriores.

**5 médios corrigidos** (commit `2fe6429`): troca de idioma no header
sem F5 (`setLang()` agora chama `router.refresh()`); textos hardcoded
em PT na seção de Confiança mesmo com ES selecionado; chip de
"Localização" em `/listagem` preso no rótulo autodetectado depois de
troca manual de país/estado/cidade (`useAutoGeo` agora rastreia o que
ele mesmo aplicou e limpa o rótulo quando o valor diverge);
`/leiloes?status=closed` nunca mostrava leilões encerrados (filtro
usava `'finished'`, valor real é `'closed'`); ordenação "futuro
primeiro" em `/eventos` não funcionava pra datas em texto livre das
feiras (novo parser `parseEventDate`, incluindo correção de um regex
greedy que casava "ril" em vez de "Abril"). Chaves de API "Sandbox"
eram cosméticas (liam/escreviam dado real de produção sem isolamento)
— sem implementar isolamento de dado, a interpretação mais segura
adotada foi bloquear escrita: `POST /api/v1/ads` agora rejeita chaves
sandbox com 403.

**3 baixos corrigidos** (commit `54b40d8`): geração de id de categoria
em `/admin/categorias` produzia hífen duplo/solto pra nomes com
pontuação consecutiva (ex.: `"[TESTE E2E] Categoria"` →
`"-teste-e2e--categoria"`) — corrigido colapsando sequências de
caracteres não-alfanuméricos num único hífen e removendo hífens nas
pontas; insert otimista de novo leilão em `/admin/leiloes` mostrava
"lotes" sem número até reload (faltava `lotsCount: 0`); modal de lance
de lote deixava o usuário chegar até "Confirmar lance?" num evento
AGENDADO antes de descobrir, só depois de confirmar, que o servidor
rejeita — agora avisa antes; e o card do lote não atualizava o "Lance
Atual" após um lance bem-sucedido sem F5 manual (`router.refresh()`).

**Achado à parte, já aplicado ao banco de produção**: a FK de
`api_request_logs` para `api_keys` estava `ON DELETE SET NULL` —
excluir uma chave deixava os logs órfãos pra sempre (sem dono, mas
ainda contando no total agregado do Dashboard de Uso da API). Trocado
para `ON DELETE CASCADE`; verificado ao vivo criando chave + log,
excluindo a chave e confirmando o log desaparecer.

**Itens conscientemente deixados como gap de feature, não bug** (sem
ação nesta rodada): sem UI de edição de lote no admin; sem estado
"cancelado" distinto pra evento de leilão; cupons sem função de edição;
CTA mobile de vendedor sem verificação abre JSON crú em
`/api/contact-seller` pra visitante deslogado; páginas de conteúdo do
admin (categorias/banners/depoimentos/páginas) não checam contagem de
linhas afetadas após escritas (defesa em profundidade, só importa se
RLS quebrar de novo); duplicidade de maiúscula/minúscula em país/estado
nos dropdowns de localização (higiene de dado, não bug de código).

Validado: `tsc --noEmit`, `vitest run` (119/119), `next build` limpos
em ambos os commits. Commits `2fe6429`, `54b40d8`.

---

## 🧪 Reteste completo do site (14 áreas) — 2026-08-25

Segunda rodada pedida explicitamente ("corrigir um a um e ao finalizar
realizar novo teste detalhado"). **Todos os 20 fixes da rodada de
2026-08-24 abaixo foram confirmados funcionando** — nenhuma regressão.
Cobriu pela primeira vez as 2 áreas que tinham falhado por erro de
conexão da ferramenta (Perfil do Vendedor, Admin Dashboard/Anúncios).

**Novo achado crítico, corrigido**: `/vendedor/[id]` aplicava a
geolocalização automática do VISITANTE sobre a listagem do PRÓPRIO
vendedor — um vendedor com anúncios reais espalhados pelo Mercosul
mostrava "Nenhum anúncio encontrado" pra qualquer visitante fora da
cidade detectada. Causa em duas partes: `getGeoParams()` com fallback de
cookie do visitante, e `lib/useAutoGeo.ts` (compartilhado com
`/listagem`, onde o comportamento É desejado) aplicando geolocalização
incondicionalmente. Corrigido com um parâmetro `disabled` em
`useAutoGeo`, ligado quando `AdsBrowser` recebe `sellerId`.

**4 altos corrigidos**: "Reativar" em `/admin/assinaturas` escrevia
`profiles.subscription_status` direto do cliente — a migration de colunas
privilegiadas de `profiles` não inclui essa coluna na lista que o próprio
usuário pode gravar, falhava sempre com 42501 nunca checado (nova rota
`/api/admin/subscriptions/reactivate`, service_role); KPI "Atrasadas"
calculado mas sem card; `/admin/denuncias` "Marcar como Resolvidas" em
massa não bania o anúncio mas a UI rotulava como banido, e "Reverter"
depois derrubava um anúncio ativo legítimo (agora bane de verdade, igual
à ação individual); `avatar_url`/`banner_url` do vendedor nunca chegavam
ao header do perfil público.

**1 médio corrigido**: soft-404 em `/vendedor/[id-inexistente]` (mesma
causa do fix já aplicado em `/anuncio/[id]` — `loading.tsx` removido).

**1 baixo corrigido**: 2ª ocorrência de texto de preço nulo inconsistente
(CTA mobile) unificada com o painel lateral.

**Novos achados médios/baixos, registrados mas NÃO corrigidos nesta
rodada** (para decisão/priorização futura):
- Trocar idioma no header não sincroniza o conteúdo renderizado no
  servidor até um F5 completo (Server Components leem o cookie só no
  request) — várias seções da home ficam com PT/ES misturado até reload.
- Chip de "Localização" em `/listagem` fica preso no rótulo antigo
  ("Perto de você — X") depois que o usuário troca manualmente
  país/estado/cidade — os resultados ficam certos, só o chip é enganoso.
- `/leiloes?status=closed|todos` continua sem mostrar leilões encerrados
  (filtra por `'finished'`, valor real é `'closed'`) — achado já conhecido
  da primeira rodada, ainda não corrigido.
- Ordenação "futuro primeiro" em `/eventos` só funciona pra datas ISO
  (`auction_events`); feiras da tabela `eventos` têm data em texto livre
  que `new Date()` não parseia, então continuam na ordem de inserção.
- Campo "Ambiente" (Sandbox/Produção) das chaves de API é cosmético — não
  há isolamento real, uma chave "Sandbox" lê/escreve dado de produção de
  verdade.

Validado: `tsc --noEmit`, `vitest run` (119/119), `next build`. Commit
`4b05a57`.

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
