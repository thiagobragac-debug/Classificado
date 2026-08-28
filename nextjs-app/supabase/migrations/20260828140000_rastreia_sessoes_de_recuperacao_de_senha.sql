-- Achado crítico da validação adversarial final (pré-produção): uma sessão
-- criada a partir de um link de "esqueci minha senha" é uma sessão real e
-- válida como qualquer outra no nível do cookie/JWT — o Supabase não a
-- distingue de um login normal. Sem nenhuma marcação, qualquer pessoa que
-- obtivesse o link de recuperação de outra conta (e-mail encaminhado,
-- computador compartilhado, histórico do navegador) ganhava acesso total à
-- conta (painel, mensagens, admin) só digitando /painel na barra de
-- endereço, sem NUNCA precisar trocar a senha.
--
-- Tentativa inicial: checar o claim `amr` do JWT por method='recovery'.
-- Descartada após teste empírico direto (supabase.auth.verifyOtp com
-- type='recovery') mostrar que o Supabase grava amr como
-- [{"method":"otp",...}] — não distingue recuperação de outros fluxos de
-- OTP (magic link, confirmação de cadastro, troca de e-mail) nesse claim.
-- Não existe sinal confiável embutido no JWT/cookie pra essa distinção.
--
-- Solução: uma tabela dedicada, minúscula, marcando explicitamente
-- (session_id -> user_id) que uma sessão específica se originou de um link
-- de recuperação. AuthContainer.tsx insere aqui assim que detecta o evento
-- PASSWORD_RECOVERY do SDK (sinal client-side confiável — só dispara
-- quando o Supabase processa de verdade um link de recuperação válido);
-- proxy.ts consulta pelo session_id do próprio JWT da requisição antes de
-- liberar acesso a /painel ou /admin. ResetPasswordForm.tsx apaga a linha
-- (e desloga em seguida) assim que a senha é trocada com sucesso.
create table if not exists public.pending_password_recovery (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.pending_password_recovery enable row level security;

-- Um usuário só pode inserir/apagar/ler a marcação da PRÓPRIA sessão atual
-- (auth.uid() = user_id) — nunca a de outra conta. is_admin()/service_role
-- não precisam de policy própria aqui: nenhum fluxo administrativo lê essa
-- tabela, só o próprio dono da sessão (client-side) e o proxy (com a
-- sessão do próprio usuário, via cliente anon-key + cookies).
create policy "Usuário gerencia a própria marcação de recuperação"
  on public.pending_password_recovery
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists pending_password_recovery_created_at_idx
  on public.pending_password_recovery (created_at);
