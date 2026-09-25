-- ============================================================================
--  SEGURANÇA: último caso do REVOKE incompleto (handle_new_user)
-- ============================================================================
--
--  Mesma causa raiz de 20260925100000/20260925120000: handle_new_user()
--  (trigger de criação de perfil em auth.users) também tinha EXECUTE
--  concedido direto a anon/authenticated, não só via PUBLIC — confirmado
--  continuar "Public Can Execute" no Security Advisor depois de
--  20260925100100 (que só revogou de PUBLIC) e depois de 20260925120000
--  (que não incluiu esta função). Trigger, retorno `trigger` — não
--  chamável via RPC de qualquer forma; revoke aqui é só fechamento de
--  superfície.
-- ============================================================================

revoke all on function public.handle_new_user() from anon, authenticated;
