-- ═══════════════════════════════════════════════════════════════
-- Tauze Class — Security Fixes
-- Migration: 05_security_fixes.sql
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── 1. RLS na tabela plans ────────────────────────────────────

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Todos podem ler planos ativos
DROP POLICY IF EXISTS "Public read active plans" ON public.plans;
CREATE POLICY "Public read active plans"
  ON public.plans FOR SELECT
  USING (is_active = true);

-- Apenas service_role pode modificar planos
DROP POLICY IF EXISTS "Service role manage plans" ON public.plans;
CREATE POLICY "Service role manage plans"
  ON public.plans FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 2. Coluna key_hash (SHA-256) em api_keys ─────────────────
-- Permite busca por hash sem expor a chave em texto puro.
-- O campo é GENERATED ALWAYS AS (computed column no Postgres 14+).

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS key_hash TEXT
    GENERATED ALWAYS AS (encode(sha256(api_key::bytea), 'hex')) STORED;

-- Índice para busca rápida por hash (substitui busca por api_key plaintext)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- ── 3. RPC place_bid_atomic — lance atômico com SELECT FOR UPDATE ──
-- Previne race condition TOCTOU em leilões.
-- Chamada: SELECT place_bid_atomic(p_auction_id, p_user_id, p_amount)

DROP FUNCTION IF EXISTS place_bid_atomic(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION place_bid_atomic(
  p_auction_id UUID,
  p_user_id    UUID,
  p_amount     NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auction      RECORD;
  v_bid_id       UUID;
BEGIN
  -- Bloqueia a linha do leilão para leitura atômica (previne TOCTOU)
  SELECT * INTO v_auction
  FROM auctions
  WHERE id = p_auction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  END IF;

  IF v_auction.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão encerrado');
  END IF;

  IF v_auction.ends_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão expirado');
  END IF;

  IF p_amount <= COALESCE(v_auction.current_bid, 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lance deve ser maior que o lance atual');
  END IF;

  IF p_user_id = v_auction.seller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendedor não pode dar lances no próprio leilão');
  END IF;

  -- Inserir o lance
  INSERT INTO auction_bids (auction_id, user_id, amount)
  VALUES (p_auction_id, p_user_id, p_amount)
  RETURNING id INTO v_bid_id;

  -- Atualizar o lance atual de forma atômica (na mesma transação)
  UPDATE auctions
  SET current_bid = p_amount
  WHERE id = p_auction_id;

  RETURN jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount', p_amount);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Apenas usuários autenticados podem chamar
REVOKE EXECUTE ON FUNCTION place_bid_atomic(uuid, uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION place_bid_atomic(uuid, uuid, numeric) TO authenticated;

-- ── 4. RPC increment_ad_view com debounce por (ad_id, ip) ────
-- Previne inflação artificial de views.
-- Debounce: 1 view por IP por anúncio a cada 30 minutos.

-- Tabela de debounce (TTL gerenciado por pg_cron ou cleanup manual)
CREATE TABLE IF NOT EXISTS ad_view_debounce (
  ad_id      UUID    NOT NULL,
  ip_hash    TEXT    NOT NULL,  -- SHA-256 do IP (não armazena IP real)
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ad_id, ip_hash)
);

-- Expirar entradas antigas automaticamente
CREATE INDEX IF NOT EXISTS idx_view_debounce_viewed_at ON ad_view_debounce(viewed_at);

DROP FUNCTION IF EXISTS increment_ad_view_safe(uuid, text);

CREATE OR REPLACE FUNCTION increment_ad_view_safe(
  p_ad_id   UUID,
  p_ip_hash TEXT          -- SHA-256 do IP (gerado no cliente/servidor)
)
RETURNS BOOLEAN           -- TRUE se a view foi contabilizada, FALSE se debounce
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_debounce_window INTERVAL := INTERVAL '30 minutes';
  v_existing        RECORD;
BEGIN
  -- Verificar se já existe view recente deste IP para este anúncio
  SELECT * INTO v_existing
  FROM ad_view_debounce
  WHERE ad_id = p_ad_id AND ip_hash = p_ip_hash;

  IF FOUND THEN
    -- Já visto recentemente — verificar se o debounce expirou
    IF v_existing.viewed_at > NOW() - v_debounce_window THEN
      RETURN FALSE; -- Dentro do debounce, não contar
    END IF;
    -- Debounce expirado — atualizar timestamp
    UPDATE ad_view_debounce
    SET viewed_at = NOW()
    WHERE ad_id = p_ad_id AND ip_hash = p_ip_hash;
  ELSE
    -- Primeira vez — inserir registro de debounce
    INSERT INTO ad_view_debounce (ad_id, ip_hash)
    VALUES (p_ad_id, p_ip_hash)
    ON CONFLICT (ad_id, ip_hash) DO UPDATE SET viewed_at = NOW();
  END IF;

  -- Incrementar o contador de views
  UPDATE ads
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_ad_id;

  RETURN TRUE;

EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

-- Qualquer um pode chamar (inclusive anônimos — o debounce protege)
GRANT EXECUTE ON FUNCTION increment_ad_view_safe(uuid, text) TO anon, authenticated;

-- ── 5. Idempotência em transações (índice único em payment_id) ──
-- Previne duplo processamento de webhooks.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payment_id
  ON transactions(payment_id)
  WHERE payment_id IS NOT NULL AND status = 'approved';

-- ── 6. Remover coluna api_key plaintext de api_keys ─────────
-- A coluna key_hash (SHA-256 computada) substituiu a lookup por plaintext.
-- ATENÇÃO: Executar apenas após confirmar que key_hash está funcionando em produção.
-- Remova também o campo api_key do generateApiKey.js após executar esta migration.
-- Descomente quando pronto:
-- ALTER TABLE api_keys DROP COLUMN api_key;
-- DROP INDEX IF EXISTS idx_api_keys_key;

-- ═══════════════════════════════════════════════════════════════
-- ✅ Migration concluída — executar no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════
