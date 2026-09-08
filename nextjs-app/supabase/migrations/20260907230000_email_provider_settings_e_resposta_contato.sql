-- ============================================================================
--  Configuração de e-mail (Resend ou SMTP genérico) + resposta a mensagens
--  de contato direto do admin
-- ============================================================================
--
--  CONTEXTO: o formulário "Fale Conosco" (app/api/contact/route.ts) só
--  persistia a mensagem em contact_messages, sem nenhuma forma de enviar
--  e-mail — nem pro visitante (aviso de recebimento), nem uma resposta real
--  do admin. platform_settings.is_secret_setting_key() (migration
--  20260830160000) protege por RLS os segredos de gateway de pagamento;
--  as duas chaves novas de e-mail (resend_api_key, smtp_password) entram na
--  MESMA lista — mesmo motivo, mesmo nível de sensibilidade (credencial que
--  autentica envio em nome do domínio).
-- ============================================================================

create or replace function public.is_secret_setting_key(k text)
returns boolean
language sql
immutable
as $$
  -- Mesma lista de lib/secret-settings.ts (SECRET_SETTING_KEYS) — se uma
  -- chave secreta nova for criada, precisa entrar nos dois lugares.
  select k = any (array[
    'stripe_secret_key', 'stripe_webhook_secret',
    'mp_access_token', 'mp_webhook_secret',
    'pagarme_api_key', 'pagarme_webhook_secret',
    'asaas_api_key', 'asaas_webhook_token',
    'resend_api_key', 'smtp_password'
  ]);
$$;

-- Registro da resposta do admin — mesmo padrão de auditoria já usado em
-- verifications/reports (quem, quando). O texto da resposta fica salvo
-- (não só "status=resolved") pra não precisar confiar na caixa de e-mail do
-- admin como único histórico do que foi dito ao cliente.
alter table public.contact_messages
  add column if not exists admin_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id) on delete set null;
