-- =========================================================================
-- SCRIPT DE SEGURANÇA: PREVENÇÃO CONTRA SPAM EM MENSAGENS (RATE LIMITING)
-- =========================================================================

-- 1. Criação da Função Bloqueadora
CREATE OR REPLACE FUNCTION check_message_rate_limit()
RETURNS trigger AS $$
DECLARE
  message_count int;
BEGIN
  -- Conta quantas mensagens o remetente atual (NEW.sender_id) enviou nos últimos 60 minutos
  SELECT count(*)
  INTO message_count
  FROM messages
  WHERE sender_id = NEW.sender_id
    AND created_at >= NOW() - INTERVAL '1 hour';

  -- Se o usuário já enviou 20 ou mais mensagens na última hora, bloqueia a inserção
  IF message_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Você atingiu o limite de segurança de 20 mensagens por hora para evitar Spam. Aguarde para enviar novos contatos.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Remove o gatilho caso ele já exista (para atualizar o script com segurança)
DROP TRIGGER IF EXISTS enforce_message_rate_limit ON messages;

-- 3. Cria o Gatilho (Trigger) na tabela 'messages'
-- Antes de toda nova INSERÇÃO, o Supabase vai rodar a verificação de limite.
CREATE TRIGGER enforce_message_rate_limit
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION check_message_rate_limit();
