-- ACHADOS CRÍTICOS DO TESTE COMPLETO DO SITE (2026-08-24):
--
-- 1) RegisterForm.tsx faz um único UPDATE em profiles incluindo o campo
--    'zip_code' (coluna que nunca existiu em profiles — foi deliberadamente
--    excluída da lista pública em 20260824190000). O UPDATE inteiro falhava
--    (PGRST204), sem checar erro, então nome de exibição e WhatsApp também
--    eram perdidos silenciosamente no cadastro, mesmo mostrando "Conta
--    criada com sucesso!".
--
-- 2) Investigando mais fundo: mesmo corrigindo RegisterForm.tsx para rotear
--    o CEP certo (via updateProfile()/SECRET_KEYS, o helper "correto" de
--    lib/supabase.ts), a gravação AINDA falharia — de toda a lista SECRET_KEYS
--    (document_type, document_number, zip_code, street, number, complement,
--    neighborhood, kyc_doc_url, kyc_selfie_url, account_type), só
--    document_number existia de fato em user_secrets (criada junto com a
--    tabela em 20260723072100); as outras 9 nunca foram criadas em migration
--    alguma, embora updateProfile()/getProfile() (painel "Meu Perfil") já
--    leiam e escrevam nelas há tempo. Reproduzido ao vivo: salvar CPF/CNPJ/
--    CEP/Endereço no painel sempre falha com erro genérico "Erro ao salvar
--    perfil.", enquanto os outros campos do mesmo formulário (nome,
--    WhatsApp, cidade, estado, bio) salvam normalmente em profiles.
--
-- Corrigido criando as colunas que faltam em user_secrets. RLS existente já
-- cobre: "Usuário lê seus secrets" (SELECT, auth.uid()=id) e "Users can
-- update their own non-critical secrets" (UPDATE, auth.uid()=id) — o
-- trigger guard_user_secrets_privileged_columns só bloqueia is_admin/
-- is_blocked/plan/plan_id/stripe_customer_id, então estas colunas novas já
-- ficam editáveis pelo próprio usuário sem nenhuma mudança de policy.
alter table public.user_secrets
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists zip_code text,
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists kyc_doc_url text,
  add column if not exists kyc_selfie_url text,
  add column if not exists account_type text;
