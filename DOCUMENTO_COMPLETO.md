# 📋 Tauze Class — Documento Completo do Sistema
> Referência técnica para configuração e colocação em produção

---

## 1. Visão Geral do Projeto

**Tauze Class** é um portal de classificados do agronegócio multi-país (Mercosul), com suporte a anúncios, leilões ao vivo, mensagens em tempo real e assinaturas pagas.

### Repositório
- **GitHub:** https://github.com/thiagobragac-debug/Classificado.git
- **Branch principal:** `main`
- **Deploy local:** abrir os arquivos `.html` em um servidor (ex: `npx serve` ou Live Server)

### Banco de Dados
- **Plataforma:** Supabase (PostgreSQL)
- **Projeto:** `classificado-tauze-class`
- **ID do projeto:** `[REDACTED]`
- **Região:** `sa-east-1` (São Paulo)
- **URL:** `[REDACTED]`
- **Dashboard:** [REDACTED]

---

## 2. Mapa de Páginas

### Páginas Públicas
| Arquivo | Descrição | Integração |
|---|---|---|
| `index.html` | Home / Landing page | Banners do banco |
| `listagem.html` | Lista de anúncios | Lê anúncios reais do banco |
| `anuncio.html` | Detalhe do anúncio | Dados reais via `?id=UUID`, mensagens reais |
| `pesquisa.html` | Busca com filtros | Filtros sobre banco |
| `leiloes.html` | Lista de leilões ao vivo | Leilões reais do banco |
| `leilao.html` | Detalhe do leilão | Timer real, lances ao vivo (WebSocket) |
| `planos.html` | Planos e preços | Checkout real Stripe / Mercado Pago |
| `login.html` | Login / Cadastro | Supabase Auth (email + Google OAuth) |
| `anunciar.html` | Criar anúncio | Salva no banco + upload de foto |
| `painel.html` | Painel do usuário | Meus anúncios, mensagens, favoritos, perfil |
| `sucesso.html` | Retorno de pagamento aprovado | Confetti + badge do plano |
| `cancelado.html` | Retorno de pagamento cancelado | Instruções de retry |

### Painel Admin (`/admin/`)
| Arquivo | Descrição |
|---|---|
| `admin/index.html` | Dashboard com KPIs reais do banco |
| `admin/anuncios.html` | Aprovar / rejeitar anúncios |
| `admin/usuarios.html` | Gerenciar usuários |
| `admin/leiloes.html` | Gerenciar leilões |
| `admin/denuncias.html` | Moderar denúncias |
| `admin/categorias.html` | Categorias ativas |
| `admin/banners.html` | Banners de publicidade |
| `admin/assinaturas.html` | Gestão de assinaturas e MRR |
| `admin/configuracoes.html` | Configurações gerais + credenciais dos gateways |
| **Login admin:** | email `[REDACTED]` / senha `[REDACTED]` |

---

## 3. Banco de Dados — Tabelas

| Tabela | Descrição |
|---|---|
| `profiles` | Dados do usuário (nome, plano, WhatsApp, país, etc.) |
| `categories` | 12 categorias pré-populadas (Bovinos, Máquinas, etc.) |
| `ads` | Anúncios (título PT/ES, preço, moeda, imagens, status) |
| `favorites` | Favoritos de cada usuário |
| `messages` | Mensagens entre usuários por anúncio |
| `auctions` | Cabeçalho de leilões |
| `auction_bids` | Lances individuais de cada leilão |
| `subscriptions` | Histórico de assinaturas e status do gateway |
| `banners` | Banners de publicidade por posição |
| `reports` | Denúncias de anúncios |

### Segurança
- **Row Level Security (RLS):** ativo em todas as tabelas
- **Trigger automático:** ao criar usuário no Auth → cria `profile` automaticamente
- **Storage:** bucket `ad-images` (público) para fotos dos anúncios

### Limites por Plano
| Plano | Anúncios | Destaques | Preço |
|---|---|---|---|
| Grátis | 3 | 0 | R$ 0 |
| Pro | 15 | 2 | R$ 79/mês |
| Premium | Ilimitado | 10 | R$ 149/mês |

---

## 4. Edge Functions (Supabase)

### `create-checkout`
- **Método:** `POST` (requer JWT no header `Authorization: Bearer <token>`)
- **URL:** `[REDACTED]`
- **Body:** `{ "plan": "pro", "gateway": "stripe" }`
- **Retorna:** `{ "url": "https://checkout.stripe.com/..." }`
- **O que faz:** Cria sessão de checkout no Stripe ou preferência no Mercado Pago e redireciona o usuário para o pagamento

### `webhook-payment`
- **Método:** `POST` (público — sem JWT, para que os gateways possam chamar)
- **URL Stripe:** `[REDACTED]`
- **URL MP:** `[REDACTED]`
- **O que faz:** Recebe eventos dos gateways e atualiza `subscriptions` + `profiles.plan` no banco

---

## 5. Fluxo Completo de Assinatura

```
1. Usuário acessa /planos.html
2. Seleciona o plano (Pro / Premium) e o gateway (Stripe / Mercado Pago)
3. Clica em "Assinar"
4. Frontend chama a Edge Function create-checkout com o JWT do usuário
5. Edge Function cria sessão no gateway e retorna a URL de checkout
6. Usuário é redirecionado para a página segura do gateway
7. Usuário preenche os dados do cartão e paga
8. Gateway envia POST automático para a Edge Function webhook-payment
9. Edge Function atualiza o banco:
   subscriptions → status = 'active'
   profiles      → plan = 'pro' ou 'premium'
10. Usuário é redirecionado para /sucesso.html
11. No painel (/painel.html), o usuário vê seu novo plano ativo
```

---

## 6. ⚙️ Configuração dos Gateways de Pagamento

> **Execute quando estiver pronto para testar ou colocar em produção.**
> Comece com as chaves de TESTE (sem cobrança real).

---

### PARTE A — Stripe

#### A1. Obter as chaves de API

1. Acesse → [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. Copie:
   - **Secret key** → `sk_live_...` (produção) ou `sk_test_...` (testes)
   - A Publishable key não é necessária nas Edge Functions

#### A2. Criar os Produtos e Preços

1. Acesse → [dashboard.stripe.com/products](https://dashboard.stripe.com/products)
2. Clique em **+ Add product**
3. **Produto 1 — Plano Pro:**
   - Name: `Tauze Class Pro`
   - Pricing model: `Recurring`
   - Price: `79,00` BRL / month
   - Salve e copie o **Price ID** → `price_XXXXXXXX`
4. **Produto 2 — Plano Premium:**
   - Name: `Tauze Class Premium`
   - Price: `149,00` BRL / month
   - Salve e copie o **Price ID** → `price_XXXXXXXX`

#### A3. Registrar o Webhook

1. Acesse → [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Clique em **+ Add destination → Webhook endpoint**
3. **Endpoint URL:**
   ```
   [REDACTED]
   ```
4. **Eventos a selecionar** (marque os 4):
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
5. Clique em **Add endpoint**
6. Na tela do endpoint criado, clique em **Reveal** ao lado de **Signing secret**
7. Copie o valor → `whsec_XXXXXXXX`

---

### PARTE B — Mercado Pago

#### B1. Obter o Access Token

1. Acesse → [mercadopago.com.br/developers/panel](https://www.mercadopago.com.br/developers/panel)
2. Crie um aplicativo (se não tiver)
3. Vá em **Credenciais de produção** (ou "teste" para testes)
4. Copie o **Access Token** → `APP_USR-XXXXXXXX`

#### B2. Registrar o Webhook

1. No painel, vá em **Webhooks → Configurar notificações**
2. **URL de produção:**
   ```
   [REDACTED]
   ```
3. Eventos: marque ✅ **Pagamentos**
4. Clique em **Guardar**

---

### PARTE C — Adicionar Secrets no Supabase

> Acesse: [REDACTED]

#### Função `create-checkout` → aba Secrets

| Nome | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` ou `sk_test_...` |
| `STRIPE_PRICE_PRO` | `price_...` (Price ID do Plano Pro) |
| `STRIPE_PRICE_PREMIUM` | `price_...` (Price ID do Plano Premium) |
| `MP_ACCESS_TOKEN` | `APP_USR-...` |

#### Função `webhook-payment` → aba Secrets

| Nome | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (mesma chave) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (copiado em A3) |
| `MP_ACCESS_TOKEN` | `APP_USR-...` (mesmo valor) |

---

## 7. Como Testar sem Cobranças Reais

### Stripe (modo teste)
1. Use `sk_test_...` e `pk_test_...`
2. Nos Secrets, coloque a chave de teste
3. Acesse `/planos.html` → clique em **Assinar Pro**
4. Na página do Stripe, use o **cartão de teste:**
   ```
   Número:  4242 4242 4242 4242
   Validade: qualquer data futura (ex: 12/30)
   CVC:      qualquer 3 dígitos (ex: 123)
   Nome:     qualquer nome
   ```
5. Conclua o pagamento
6. Verifique no Supabase:
   - Table Editor → `subscriptions` → deve aparecer `status = active`
   - Table Editor → `profiles` → deve aparecer `plan = pro`

### Mercado Pago (modo sandbox)
1. Use o Access Token de **teste** (sandbox)
2. Consulte os cartões de teste: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards

---

## 8. Estrutura de Arquivos do Projeto

```
classificado/
├── index.html              ← Home
├── listagem.html           ← Lista de anúncios
├── anuncio.html            ← Detalhe do anúncio
├── anunciar.html           ← Criar anúncio (requer login)
├── painel.html             ← Painel do usuário (requer login)
├── login.html              ← Login / Cadastro / Reset senha
├── planos.html             ← Planos e checkout
├── sucesso.html            ← Retorno pagamento aprovado
├── cancelado.html          ← Retorno pagamento cancelado
├── leiloes.html            ← Lista de leilões
├── leilao.html             ← Detalhe do leilão ao vivo
├── pesquisa.html           ← Busca
├── js/
│   ├── supabase.js         ← Toda a integração com o banco (AUTH, CRUD, Realtime)
│   ├── main.js             ← UI, menu, idioma, banners
│   ├── data.js             ← Mock data (fallback)
│   └── filters.js          ← Filtros de busca
├── css/
│   └── style.css           ← Estilos globais
├── admin/
│   ├── index.html          ← Dashboard admin (KPIs reais)
│   ├── anuncios.html
│   ├── usuarios.html
│   ├── leiloes.html
│   ├── denuncias.html
│   ├── categorias.html
│   ├── banners.html
│   ├── assinaturas.html
│   ├── configuracoes.html
│   ├── js/admin.js         ← Lógica do admin + layer Supabase
│   └── css/admin.css
├── assets/                 ← Imagens e recursos estáticos
└── enviar_github.bat       ← Script de deploy manual para o GitHub
```

---

## 9. Deploy Manual para o GitHub

Execute o arquivo `enviar_github.bat` sempre que quiser salvar as alterações:

```
Duplo clique em: enviar_github.bat
```

Ou via terminal:
```bash
git add .
git commit -m "descrição das alterações"
git push origin main
```

---

## 10. ✅ Checklist de Go-Live

### Banco e autenticação
- [x] Projeto Supabase criado (`[REDACTED]`)
- [x] 10 tabelas criadas com RLS
- [x] Trigger de auto-criação de perfil
- [x] Storage bucket `ad-images`
- [x] Edge Functions `create-checkout` e `webhook-payment` deployadas

### Configuração dos gateways (a fazer)
- [ ] Stripe: copiar `sk_live_...` (ou `sk_test_...` para testes)
- [ ] Stripe: criar Produto Pro (`price_...`) e Premium (`price_...`)
- [ ] Stripe: registrar webhook + copiar `whsec_...`
- [ ] Supabase `create-checkout`: adicionar 3 secrets Stripe + MP_ACCESS_TOKEN
- [ ] Supabase `webhook-payment`: adicionar 2 secrets Stripe + MP_ACCESS_TOKEN
- [ ] Mercado Pago: copiar `APP_USR-...`
- [ ] Mercado Pago: registrar webhook com `?source=mercadopago`

### Testes
- [ ] Fazer cadastro como usuário
- [ ] Criar um anúncio (com foto)
- [ ] Testar checkout com cartão de teste
- [ ] Verificar tabelas `subscriptions` e `profiles` no Supabase após pagamento
- [ ] Testar envio de mensagem entre dois usuários
- [ ] Verificar admin dashboard com dados reais

### Antes de abrir ao público
- [ ] Trocar chaves de TESTE por chaves de PRODUÇÃO nos Secrets
- [ ] Configurar domínio próprio (ex: tauzeclass.com.br)
- [ ] Configurar HTTPS (obrigatório para pagamentos)
- [ ] Atualizar `redirect_url` do Google OAuth para o domínio de produção
- [ ] Atualizar URLs de retorno nos painéis Stripe e Mercado Pago
- [ ] Revisar e-mail templates do Supabase Auth (confirmação de cadastro, reset de senha)
