-- ============================================================================
--  messages sem RLS versionada — conversas privadas entre usuários
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança, 2026-08-30, achado crítico — pendente
--  de confirmação ao vivo no momento em que esta migration foi escrita)
--
--  Nenhuma migration deste repositório cria ou protege `public.messages` —
--  só aparece sendo adicionada à replicação Realtime (20260826110100). Como
--  is_admin() e a policy de institutional_pages, foi provavelmente criada
--  fora do histórico de versionamento, direto no dashboard.
--
--  lib/supabase.ts (getMyMessages/sendMessage) filtra por sender_id/
--  receiver_id NA QUERY, o que não é garantia nenhuma sem RLS real por trás
--  — se a tabela estiver sem RLS, ou com uma policy aberta, qualquer usuário
--  autenticado lê `GET /rest/v1/messages?select=*` direto e obtém todas as
--  conversas de compradores e vendedores da plataforma. Este projeto já teve
--  esse exato padrão em outras tabelas (verification_requests ficou sem RLS
--  alguma até 20260825150500).
--
--  SOLUÇÃO
--
--  Habilita RLS explicitamente (idempotente — não é erro se já estiver
--  habilitada) e remove qualquer policy de SELECT irrestrita que porventura
--  exista sob um nome desconhecido, antes de recriar as policies corretas:
--  dono (remetente ou destinatário) lê/insere/apaga a própria mensagem;
--  admin lê tudo (moderação/denúncias). Sem policy de UPDATE — nenhum fluxo
--  da aplicação edita mensagem existente hoje; se um recurso de "marcar como
--  lida" for adicionado, precisa de policy própria, explícita.
-- ============================================================================

alter table public.messages enable row level security;

-- Rede de segurança: remove qualquer policy de SELECT sem nenhuma restrição
-- de linha (USING null/true), independente do nome, que possa ter sido
-- criada fora do controle de versão.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'messages'
      and cmd = 'SELECT'
      and (qual is null or qual = 'true')
  loop
    execute format('drop policy %I on public.messages', pol.policyname);
  end loop;
end $$;

drop policy if exists "Usuários leem as próprias mensagens" on public.messages;
create policy "Usuários leem as próprias mensagens" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id or is_admin());

drop policy if exists "Usuários enviam mensagens como si mesmos" on public.messages;
create policy "Usuários enviam mensagens como si mesmos" on public.messages
  for insert with check (auth.uid() = sender_id);

drop policy if exists "Usuários apagam as próprias conversas" on public.messages;
create policy "Usuários apagam as próprias conversas" on public.messages
  for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);
