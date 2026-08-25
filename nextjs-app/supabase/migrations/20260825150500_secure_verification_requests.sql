-- ============================================================================
--  Habilita RLS em verification_requests — hoje sem NENHUMA proteção
-- ============================================================================
--
--  PROBLEMA
--
--  A tabela foi criada direto em produção (não existe migration rastreada
--  pra ela) com relrowsecurity=false. Confirmado ao vivo, na revisão de
--  regras de negócio de 2026-08-25: um GET no PostgREST só com a anon key
--  pública, sem token de sessão nenhum, devolve a linha completa — CPF/CNPJ
--  e os paths dos documentos de identidade de qualquer solicitação de
--  qualquer usuário. Um PATCH também é aceito (200, não 401/403) — qualquer
--  autenticado pode alterar/apagar a solicitação de outra pessoa.
--
--  CORREÇÃO
--
--  O dono só pode inserir e ver a própria solicitação. Atualizar/apagar fica
--  só pra admin (is_admin()) e service_role — o fluxo real de
--  aprovar/rejeitar já passa por /api/admin/verify-user, que usa
--  service_role.
-- ============================================================================

alter table public.verification_requests enable row level security;

create policy "Usuario ve suas proprias solicitacoes"
on public.verification_requests for select
using (auth.uid() = user_id);

create policy "Usuario cria sua propria solicitacao"
on public.verification_requests for insert
with check (auth.uid() = user_id);

create policy "Admins gerenciam solicitacoes de verificacao"
on public.verification_requests for all
using (public.is_admin())
with check (public.is_admin());
