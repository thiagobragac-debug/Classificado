-- 06_secure_platform_settings.sql

-- 1. Remove políticas antigas e inseguras que expunham chaves secretas
DROP POLICY IF EXISTS "Leitura de configurações" ON platform_settings;
DROP POLICY IF EXISTS "Public settings are viewable by everyone" ON platform_settings;

-- 2. Cria uma nova política para usuários anônimos e logados, ocultando as chaves secretas
CREATE POLICY "Public settings are viewable by everyone" 
ON platform_settings FOR SELECT 
TO public
USING (
  key NOT IN (
    'mp_access_token', 'mp_webhook', 'mp_webhook_secret', 
    'stripe_secret_key', 'stripe_webhook_secret', 
    'pagarme_secret_key', 'pagarme_webhook_secret', 
    'asaas_api_key', 'asaas_webhook_token'
  )
);

-- 3. Cria uma função segura (RPC) para o backend (Node) ler todas as configurações,
-- validando um token interno, sem usar o acesso anônimo público.
CREATE OR REPLACE FUNCTION get_backend_secrets(token text)
RETURNS TABLE(key text, value text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF token != 'TauzeBackendSecret2026' THEN
     RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY SELECT platform_settings.key, platform_settings.value FROM platform_settings;
END;
$$;
