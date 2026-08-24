-- Continuação do achado de segurança do commit anterior (migration
-- 20260824180000): profiles.is_admin e profiles.is_blocked são colunas
-- zumbi (a fonte real dessas duas flags é user_secrets desde
-- 20260723072100_split_user_secrets.sql) que ficaram publicamente
-- legíveis E graváveis por qualquer usuário logado, porque anon/
-- authenticated têm GRANT ALL de nível de TABELA em profiles (padrão do
-- Supabase) — um REVOKE de coluna sozinho não tem efeito por baixo de um
-- GRANT de tabela inteira, por isso a tentativa anterior (dentro da
-- mesma migration 20260824180000) não bastou. É preciso revogar a tabela
-- inteira e reconceder explicitamente coluna por coluna.
--
-- Mapeado antes de aplicar: toda leitura/escrita real de profiles no
-- código (grep completo em app/ e components/) para garantir que a lista
-- de colunas abaixo cobre tudo que já funciona hoje. Confirmado
-- separadamente que a cota de anúncios pagos (o gate financeiro real) lê
-- user_secrets.plan_id via trigger, nunca profiles.plan — não é afetada.
--
-- SELECT: mantém tudo público EXCETO is_admin e is_blocked (nenhum
-- consumidor legítimo encontrado; o único uso real de ambos é
-- user_secrets, já corretamente protegida).
revoke select on public.profiles from anon, authenticated;
grant select (
  id, name, phone_whatsapp, avatar_url, country, state, city, bio,
  plan, plan_expires_at, verified, ads_count, created_at, updated_at,
  plan_id, subscription_status, banner_url, email_verified,
  phone_verified, kyc_status, display_name, whatsapp_verified
) on public.profiles to anon, authenticated;

-- UPDATE: só os campos que o próprio usuário legitimamente edita no seu
-- perfil (nome, contato, localização, bio, avatar/banner). Tudo que é
-- concedido por admin/pagamento/verificação (is_admin, is_blocked, plan,
-- plan_expires_at, plan_id, subscription_status, verified, kyc_status,
-- email_verified, phone_verified, whatsapp_verified, ads_count) fica de
-- fora — só service_role escreve nessas, via rota de servidor
-- (/api/admin/verify-user, webhook de pagamento, etc.), nunca o próprio
-- usuário direto do browser.
revoke update on public.profiles from anon, authenticated;
grant update (
  name, phone_whatsapp, avatar_url, country, state, city, bio,
  display_name, banner_url, updated_at
) on public.profiles to authenticated;
