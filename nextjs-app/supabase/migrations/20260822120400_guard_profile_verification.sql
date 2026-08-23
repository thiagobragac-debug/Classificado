-- ============================================================================
--  profiles.verified e profiles.kyc_status só podem ser alterados pelo servidor
-- ============================================================================
--
--  PROBLEMA
--
--  O selo de verificação é o principal sinal de confiança da plataforma: ele
--  aparece no card do anúncio e no perfil do vendedor, e a página de
--  verificação promete "feche negócios até 3x mais rápido". Mas a coluna era
--  gravável pelo próprio usuário com a anon key.
--
--  O caminho mais direto estava em VerificacaoClient.tsx, no botão "Entrar com
--  gov.br": ele não integrava com o Gov.br coisa nenhuma — era um setTimeout
--  seguido de
--
--      update profiles set verified = true where id = <o próprio usuário>
--
--  Qualquer pessoa logada clicava e saía verificada. E mesmo sem o botão, a
--  mesma escrita podia ser feita direto no PostgREST com a anon key, que é
--  pública por definição.
--
--  CORREÇÃO
--
--  Mesma abordagem de 20260822120000 para user_secrets: trigger que rejeita a
--  alteração vinda de qualquer papel que não seja service_role. Os fluxos
--  legítimos de aprovação passam a ir por /api/admin/verify-user, que confere
--  is_admin no servidor antes de escrever.
--
--  As demais colunas de profiles seguem editáveis pelo dono, como antes.
-- ============================================================================

create or replace function public.guard_profile_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.verified   is distinct from old.verified
  or new.kyc_status is distinct from old.kyc_status then
    raise exception
      'profiles: verified e kyc_status so podem ser alterados pelo service_role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_verification on public.profiles;

create trigger guard_profile_verification
  before update on public.profiles
  for each row
  execute function public.guard_profile_verification();
