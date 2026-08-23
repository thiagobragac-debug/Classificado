# Documentacao Completa: API REST Classificado

> Versao: 2.0
> Ultima atualizacao: 2026-07-23
> Status: IMPLEMENTADO E FUNCIONAL

---

## INDICE

1. Visao Geral
2. Arquitetura do Sistema
3. Banco de Dados: Tabelas e Colunas
4. Seguranca: RLS e Politicas
5. Fluxo de Criacao de Chave
6. Fluxo de Autenticacao (Cada Request)
7. Rate Limiting (Redis + Fallback DB)
8. Logging Automatico
9. Endpoints REST: Referencia Completa
10. Codigos de Resposta HTTP
11. Tabela de Permissoes
12. Webhook de Expiracao
13. Dashboard de Uso da API
14. Configuracao de Ambiente (.env.local)
15. Arquivos do Modulo
16. Checklist de Validacao

---

## 1. Visao Geral

O modulo de Chaves de API REST permite ao administrador do portal gerar tokens de
acesso para parceiros e integracoes externas sem expor as credenciais principais.

Cada chave:
- Possui permissoes granulares por operacao
- Tem rate limiting por janela deslizante de 60 segundos
- Tem expiracao configuravel (campo expires_at)
- Tem log automatico de todas as requisicoes com IP, tempo e status HTTP
- Usa hash SHA-256 — o token original NUNCA e armazenado no banco

---

## 2. Arquitetura do Sistema

`
Parceiro Externo
  --> Request com X-API-Key: tk_abc123...
        |
        +-> lib/api-auth.ts
              authenticateApiKey()   SHA-256 lookup no banco
              hasPermission()        verifica permissions[]
              checkRateLimit()       Redis OU DB sliding window
              logRequest()           fire-and-forget: log + last_used_at
        |
        +-> Supabase: tabela ads / profiles / categories
        |
        <-- JSON Response com headers de rate limit

Painel Admin (/admin/api-keys)
  --> Gerar Chave: token (1x, nao salvo) + hash SHA-256 (salvo)
  --> Dashboard de Uso: /admin/api-keys/usage

Supabase Edge Function (Cron diario 08:00)
  --> notify-expiring-keys
      Detecta chaves expirando em 24h
      POST para WEBHOOK_NOTIFY_URL (opcional)
`

---

## 3. Banco de Dados: Tabelas e Colunas

### Tabela: public.api_keys

`sql
CREATE TABLE public.api_keys (
  id           UUID      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_name TEXT      NOT NULL,
  email        TEXT      NOT NULL,
  secret_hash  TEXT      NOT NULL,   -- SHA-256 do token. NUNCA o token puro.
  permissions  TEXT[]    DEFAULT ARRAY['read'],
  rate_limit   INTEGER   DEFAULT 100,
  is_active    BOOLEAN   DEFAULT true,
  environment  TEXT      DEFAULT 'production',
  metadata     JSONB     DEFAULT '{}',
  last_used_at TIMESTAMP,             -- Atualizado automaticamente a cada request
  created_at   TIMESTAMP DEFAULT now(),
  updated_at   TIMESTAMP DEFAULT now(),
  expires_at   TIMESTAMP              -- null = sem expiracao
);

-- Indices de performance (migration: 20260723_api_indexes.sql)
CREATE INDEX idx_api_keys_secret_hash ON api_keys (secret_hash);
CREATE INDEX idx_api_keys_active      ON api_keys (is_active) WHERE is_active = true;
`

### Tabela: public.api_request_logs

`sql
CREATE TABLE public.api_request_logs (
  id          BIGSERIAL PRIMARY KEY,
  api_key_id  UUID      REFERENCES api_keys(id),
  method      TEXT,           -- GET, POST, CRON, etc.
  endpoint    TEXT,           -- /api/v1/ads
  status_code INTEGER,        -- 200, 401, 429...
  ip_address  INET,
  user_agent  TEXT,
  duration_ms INTEGER,
  created_at  TIMESTAMP DEFAULT now()
);

-- Indice composto para rate limiting
CREATE INDEX idx_api_request_logs_key_time ON api_request_logs (api_key_id, created_at DESC);
`

---

## 4. Seguranca: RLS e Politicas

### api_keys
| Politica                          | Operacao | Regra                                 |
|-----------------------------------|----------|---------------------------------------|
| Admin full access on api_keys     | ALL      | profiles.is_admin = true              |
| Service role read on api_keys     | SELECT   | true (permite lookup de token via API)|

### api_request_logs
| Politica                      | Operacao | Regra                  |
|-------------------------------|----------|------------------------|
| Allow insert for api logging  | INSERT   | true (logging API)     |
| Allow select for rate limit   | SELECT   | true (sliding window)  |

---

## 5. Fluxo de Criacao de Chave

1. Admin acessa http://localhost:3000/admin/api-keys
2. Clica "+ Gerar Nova Chave" e preenche:
   - Nome do parceiro
   - E-mail do responsavel
   - Ambiente: Producao ou Sandbox
   - Rate Limit (default 100 req/min)
   - Permissoes (multipla selecao)

3. Sistema gera token seguro:
   crypto.getRandomValues() -> "tk_" + 64 hex chars (256 bits de entropia)

4. Token e hasheado:
   SHA-256(token) via crypto.subtle.digest() -> hash de 64 chars

5. SOMENTE o hash e salvo no banco (campo secret_hash).
   O token original NUNCA e persistido.

6. Modal exclusivo exibe o token UMA UNICA VEZ:
   - Caixa destacada com o token completo
   - Botao "Copiar" (navigator.clipboard.writeText)
   - Aviso em amarelo explicando que nao sera exibido novamente
   - Ao fechar, o token e apagado da memoria

IMPORTANTE: Se o token for perdido, deve-se revogar a chave e gerar uma nova.

---

## 6. Fluxo de Autenticacao (Cada Request)

`
lib/api-auth.ts :: authenticateApiKey(request)

1. Extrai token:
   - Header X-API-Key: tk_...
   - OU Authorization: Bearer tk_...

2. Valida formato: deve comecar com "tk_"

3. Calcula SHA-256(token)

4. Busca no banco:
   SELECT * FROM api_keys WHERE secret_hash = 

5. Verifica:
   a. Registro encontrado?   Se nao -> 401 Invalid API key
   b. is_active = true?      Se nao -> 401 API key is revoked
   c. expires_at > now()?    Se nao -> 401 API key has expired

6. Retorna { ok: true, apiKey }
`

---

## 7. Rate Limiting

O sistema usa dois niveis com fallback automatico:

### Nivel 1: Upstash Redis (quando configurado)
`
UPSTASH_REDIS_REST_URL  = definido em .env.local
UPSTASH_REDIS_REST_TOKEN = definido em .env.local

Usa: @upstash/ratelimit com Ratelimit.slidingWindow(N, "60 s")
Chave Redis: "api_rl:key_<uuid>"
`

### Nivel 2: DB Fallback (automatico se Redis nao estiver configurado ou falhar)
`	ypescript
const windowStart = new Date(Date.now() - 60_000)
const { count } = await supabase
  .from("api_request_logs")
  .select("*", { count: "exact", head: true })
  .eq("api_key_id", apiKey.id)
  .gte("created_at", windowStart)

// Se count >= rate_limit -> 429 Too Many Requests
`

### Headers retornados em TODAS as respostas:
`
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 87
X-RateLimit-Reset:     2026-07-23T22:00:00.000Z
X-Response-Time:       43ms
`

---

## 8. Logging Automatico

Apos CADA requisicao (independente do status), fire-and-forget:

`	ypescript
Promise.all([
  // 1. Registra o log da chamada
  supabase.from("api_request_logs").insert({
    api_key_id: apiKey.id,
    method:     "GET",
    endpoint:   "/api/v1/ads",
    status_code: 200,
    ip_address:  "200.100.50.25",
    user_agent:  "MyApp/1.0",
    duration_ms: 43,
  }),
  // 2. Atualiza timestamp de ultimo uso
  supabase.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id),
])
`

Nota: "fire-and-forget" significa que o log NAO bloqueia a resposta ao cliente.
Falhas de log sao silenciosas e nunca quebram a API.

---

## 9. Endpoints REST: Referencia Completa

### Autenticacao (obrigatoria em todos)
`http
X-API-Key: tk_a3f9c2d1e8b...
# ou
Authorization: Bearer tk_a3f9c2d1e8b...
`

---

### GET /api/v1/ads
Lista anuncios ativos com filtros e paginacao.
Permissao: read_ads

Query Parameters:
  category  string   ID da categoria (ex: bovinos)
  country   string   Pais (ex: BR)
  state     string   Estado (ex: SP)
  city      string   Cidade
  search    string   Busca full-text (indexed)
  featured  boolean  "true" para destacados apenas
  page      number   Pagina (default: 1)
  limit     number   Por pagina (max: 50, default: 20)

Exemplo:
  GET /api/v1/ads?category=bovinos&country=BR&page=1&limit=10
  X-API-Key: tk_...

Resposta 200:
{
  "data": [
    {
      "id": "uuid",
      "title_pt": "Nelore Premium - 50 cabecas",
      "title_es": "Nelore Premium - 50 cabezas",
      "description": "...",
      "price": 15000.00,
      "currency": "BRL",
      "price_unit_pt": "por cabeca",
      "negotiable": true,
      "condition": "Excelente",
      "featured": true,
      "images": ["https://..."],
      "category_id": "bovinos",
      "city": "Cuiaba",
      "state": "MT",
      "country": "BR",
      "views_count": 142,
      "created_at": "2026-07-20T18:00:00Z",
      "profiles": { "name": "Joao Silva", "avatar_url": "...", "verified": true }
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 23, "total_pages": 3, "has_more": true }
}

---

### POST /api/v1/ads
Cria um novo anuncio via API.
Permissao: write_ads

Body (application/json):
  Obrigatorios: title_pt, category_id, price, currency, country, user_id
  Opcionais: title_es, description, price_unit_pt, negotiable, condition,
             state, city, location_text, images (max 10), tags_pt (max 20), video_url

Exemplo:
  POST /api/v1/ads
  X-API-Key: tk_...
  Content-Type: application/json

  {
    "title_pt": "Nelore Premium - 50 cabecas",
    "category_id": "bovinos",
    "price": 15000.00,
    "currency": "BRL",
    "country": "BR",
    "state": "MT",
    "city": "Cuiaba",
    "user_id": "uuid-do-usuario",
    "negotiable": true,
    "images": ["https://..."]
  }

Resposta 201:
{
  "data": { "id": "uuid", "title_pt": "Nelore Premium - 50 cabecas", "status": "active", "created_at": "..." },
  "message": "Ad created successfully"
}

Erros:
  400 - Campo obrigatorio ausente ou price invalido
  403 - Chave sem permissao write_ads

---

### GET /api/v1/ads/:id
Detalhes completos de um anuncio ativo.
Permissao: read_ads

Exemplo:
  GET /api/v1/ads/123e4567-e89b-12d3-a456-426614174000
  X-API-Key: tk_...

Resposta 200:
{
  "data": {
    "id": "uuid",
    "title_pt": "Nelore Premium",
    "title_es": "Nelore Premium",
    "description": "...",
    "price": 15000.00,
    "currency": "BRL",
    "negotiable": true,
    "condition": "Novo",
    "images": ["url1", "url2"],
    "video_url": null,
    "tags_pt": ["nelore", "gado", "premium"],
    "views_count": 142,
    "expires_at": "2026-10-23T00:00:00Z",
    "profiles": {
      "id": "uuid",
      "name": "Joao Silva",
      "verified": true,
      "phone_whatsapp": "+5565999999999"
    }
  }
}

Erros:
  400 - ID nao e um UUID valido
  404 - Anuncio nao encontrado ou inativo

---

### GET /api/v1/categories
Lista todas as categorias ativas.
Permissao: read_ads
Cache: 5 minutos (Cache-Control: public, max-age=300)

Resposta 200:
{
  "data": [
    { "id": "bovinos", "name_pt": "Bovinos", "name_es": "Bovinos", "icon": "?", "color": "#16A34A", "sort_order": 1 },
    { "id": "equinos", "name_pt": "Equinos", "name_es": "Equinos", "icon": "?", "color": "#B45309", "sort_order": 2 }
  ],
  "meta": { "total": 14 }
}

---

### GET /api/v1/users
Lista perfis publicos de usuarios.
Permissao: read_users

Query Parameters:
  country   string   Filtra por pais
  verified  boolean  "true" para apenas verificados
  plan      string   Filtra por plano (free, pro, premium...)
  page      number   Pagina (default: 1)
  limit     number   Por pagina (max: 50, default: 20)

Campos retornados por nivel de permissao:
  read_users: id, name, avatar_url, bio, country, state, city, plan, verified, ads_count, created_at, banner_url
  full_access: acima + phone_whatsapp

IMPORTANTE: E-mail e dados de autenticacao NUNCA sao retornados, independente da permissao.

Resposta 200:
{
  "data": [
    {
      "id": "uuid",
      "name": "Joao Silva",
      "verified": true,
      "plan": "pro",
      "country": "BR",
      "ads_count": 12,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "page": 1, "limit": 20, "total": 145, "total_pages": 8,
    "has_more": true, "fields_scope": "public_only"
  }
}

---

## 10. Codigos de Resposta HTTP

| Codigo | Significado                                       |
|--------|---------------------------------------------------|
| 200    | OK - Sucesso                                      |
| 201    | Created - Recurso criado (POST)                   |
| 400    | Bad Request - Parametro invalido ou JSON malformado|
| 401    | Unauthorized - Chave invalida, revogada ou expirada|
| 403    | Forbidden - Chave sem permissao para o endpoint   |
| 404    | Not Found - Recurso nao encontrado                |
| 429    | Too Many Requests - Rate limit excedido           |
| 500    | Internal Server Error - Erro no servidor          |

---

## 11. Tabela de Permissoes

| Permissao   | Endpoints Liberados                                                     |
|-------------|-------------------------------------------------------------------------|
| read_ads    | GET /api/v1/ads, GET /api/v1/ads/:id, GET /api/v1/categories           |
| write_ads   | POST /api/v1/ads                                                        |
| read_users  | GET /api/v1/users (campos publicos)                                     |
| full_access | Todos os endpoints + campos extras em /api/v1/users (phone_whatsapp)   |

---

## 12. Webhook de Expiracao

### Edge Function: supabase/functions/notify-expiring-keys/index.ts

Executa diariamente e detecta chaves expirando nas proximas 24h.

Configuracao no Supabase Dashboard:
  Edge Functions > notify-expiring-keys > Schedule
  Cron: "0 8 * * *" (todo dia as 08:00)

Comportamento:
  1. Busca chaves onde expires_at BETWEEN now()+24h AND now()+48h
  2. Para cada chave encontrada:
     a. Se WEBHOOK_NOTIFY_URL configurada: POST com payload JSON
     b. Registra execucao em api_request_logs (method: CRON)

Payload enviado ao webhook:
{
  "event": "api_key.expiring_soon",
  "key_id": "uuid",
  "partner_name": "Parceiro ABC",
  "email": "contato@parceiro.com",
  "expires_at": "2026-07-24T08:00:00Z",
  "environment": "production",
  "message": "Chave de API expirar em 2026-07-24. Acesse o painel para renovar."
}

Para ativar, adicionar ao .env.local:
  WEBHOOK_NOTIFY_URL=https://hooks.zapier.com/hooks/catch/xxxxx/yyyyy/

---

## 13. Dashboard de Uso da API

URL: http://localhost:3000/admin/api-keys/usage
Arquivo: app/(admin)/admin/api-keys/usage/page.tsx
Acesso: Botao "Dashboard de Uso" na pagina /admin/api-keys

Funcionalidades:
  - 4 KPIs: Total de chamadas, Respostas 2xx, Erros 4xx/5xx, Tempo medio (ms)
  - Grafico de barras: chamadas por dia (SVG puro, sem dependencias)
  - Grafico de barras: erros por dia
  - Grafico de distribuicao: chamadas por hora do dia (0h-23h)
  - Tabela top 10 parceiros com barra de percentual de uso
  - Tempo medio por dia com codigo de cor:
      Verde:   < 500ms (performance otima)
      Amarelo: 500ms - 1000ms (atencao)
      Vermelho: > 1000ms (investigar)
  - Filtro de periodo: 7, 14 ou 30 dias
  - Estado vazio amigavel quando nenhuma chamada foi registrada

---

## 14. Configuracao de Ambiente (.env.local)

`env
# ─── Supabase (obrigatorio) ───────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://rfzuzuobwuanmbrcthqe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# ─── Rate Limiting via Upstash Redis (opcional) ───────────────────────────────
# Quando configuradas: usa Redis (escala horizontal, ideal para producao)
# Sem configuracao: fallback automatico para DB (funcional para volumes moderados)
# Obtenha em: https://console.upstash.com -> criar Redis database -> REST API
# UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
# UPSTASH_REDIS_REST_TOKEN=AXxxxx...

# ─── Webhook de Expiracao (opcional) ──────────────────────────────────────────
# URL que recebe POST quando uma chave de API esta para expirar
# Compativel com Zapier, n8n, Make.com, ou qualquer servico HTTP
# WEBHOOK_NOTIFY_URL=https://hooks.zapier.com/hooks/catch/xxxxx/yyyyy/

# ─── Supabase Service Role (opcional, recomendado para producao) ──────────────
# Sem ela, o sistema usa a chave anon com cobertura via RLS (funcional)
# Com ela, o acesso ao banco bypassa RLS para operacoes de autenticacao de API
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
`

---

## 15. Arquivos do Modulo

| Arquivo                                               | Descricao                                         |
|-------------------------------------------------------|---------------------------------------------------|
| lib/api-auth.ts                                       | Biblioteca central: auth SHA-256, rate limit, log |
| app/(admin)/admin/api-keys/page.tsx                   | Painel: CRUD de chaves + 4 KPIs + paginacao       |
| app/(admin)/admin/api-keys/usage/page.tsx             | Dashboard de uso com graficos SVG                 |
| app/api/v1/ads/route.ts                               | GET (lista) + POST (cria) anuncios                |
| app/api/v1/ads/[id]/route.ts                          | GET detalhes de um anuncio                        |
| app/api/v1/categories/route.ts                        | GET categorias ativas (cache 5min)                |
| app/api/v1/users/route.ts                             | GET perfis publicos de usuarios                   |
| supabase/functions/notify-expiring-keys/index.ts      | Edge Function: webhook de expiracao               |
| supabase/migrations/20260723_api_indexes.sql          | Indices de performance no banco                   |
| proxy.ts                                              | Security headers em todas as rotas /api/*         |

---

## 16. Checklist de Validacao

### Banco de Dados
- [x] Tabela api_keys com 13 colunas (last_used_at, expires_at incluidos)
- [x] Tabela api_request_logs com 9 colunas
- [x] RLS habilitado em ambas as tabelas com politicas corretas
- [x] 3 indices de performance criados e aplicados no banco

### Seguranca
- [x] Token gerado com crypto.getRandomValues() (256 bits, criptograficamente seguro)
- [x] Hash SHA-256 via crypto.subtle.digest() (nativo, sem dependencias)
- [x] Apenas o hash salvo no banco (token original nunca persiste)
- [x] Token exibido uma unica vez em modal com botao "Copiar"
- [x] Verificacao de is_active a cada request
- [x] Verificacao de expires_at a cada request
- [x] Rate limiting com Redis (quando configurado) + fallback DB automatico

### Endpoints (5 endpoints + CORS preflight em todos)
- [x] GET /api/v1/ads com filtros e paginacao
- [x] POST /api/v1/ads com validacao e sanitizacao de campos
- [x] GET /api/v1/ads/:id com validacao de UUID
- [x] GET /api/v1/categories com Cache-Control de 5 minutos
- [x] GET /api/v1/users com niveis de campo por permissao
- [x] CORS configurado em todos (Access-Control-Allow-Origin: *)
- [x] Headers X-RateLimit-* e X-Response-Time em todas as respostas

### Logging e Monitoramento
- [x] Cada request logado em api_request_logs (fire-and-forget)
- [x] last_used_at atualizado automaticamente a cada chamada
- [x] IP, user-agent, metodo, endpoint, status e duracao registrados
- [x] Dashboard de uso com graficos e filtro de periodo

### Webhook e Automacao
- [x] Edge Function notify-expiring-keys implementada
- [x] Payload JSON estruturado para integracao com Zapier/n8n/Make
- [x] Configuracao via variavel de ambiente (opt-in)
