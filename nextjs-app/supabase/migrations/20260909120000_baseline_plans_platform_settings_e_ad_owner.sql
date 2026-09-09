-- BUG CORRIGIDO (auditoria de segurança e vazamento de dados, 2026-09-09):
-- introspecção via `pg_policies`/`pg_get_functiondef` (leitura, produção)
-- confirmou 3 achados independentes:
--
-- 1) `plans` tem 3 policies ativas (2 administrativas + 1 de leitura
--    pública filtrando is_active) que NUNCA tiveram um CREATE POLICY em
--    nenhuma das migrations anteriores — só existiam em produção, fora do
--    controle de versão. Reconstruir o ambiente do zero a partir do
--    repositório deixaria `plans` inacessível (quebra checkout/preços na
--    home). Esta migration versiona exatamente o que já está em vigor.
--
-- 2) Mesmo padrão em `platform_settings`, MAS aqui a introspecção revelou
--    uma INCONSISTÊNCIA REAL, não só falta de versionamento: a policy
--    "Public settings are viewable by everyone" exclui um array de 9
--    chaves HARDCODED (incluindo uma chave legada "mp_webhook" que não
--    existe mais em lugar nenhum do código), enquanto a função
--    is_secret_setting_key() — usada em TODAS as outras policies desta
--    mesma tabela (insert/update/delete/select-admin) — protege uma lista
--    de 10 chaves, incluindo duas que a policy pública NUNCA excluía:
--    'resend_api_key' e 'smtp_password'. Ou seja: se um admin algum dia
--    salvar a senha do SMTP ou a chave da Resend em platform_settings (via
--    app/(admin)/admin/configuracoes), essa policy desatualizada
--    liberaria leitura ANÔNIMA desses dois segredos — confirmado que HOJE
--    não há vazamento ativo só porque nenhuma linha com essas duas chaves
--    existe ainda na tabela (checado ao vivo com a chave anon pública:
--    `?key=in.(resend_api_key,smtp_password,mp_webhook)` → `[]`), mas a
--    brecha ficaria pronta pra disparar sozinha na próxima configuração de
--    e-mail. Corrigido aqui reaproveitando is_secret_setting_key() em vez
--    de duplicar a lista — daqui pra frente, uma chave nova só precisa
--    entrar numa função, nunca duas listas que podem divergir de novo.
--
-- 3) is_ad_owner() (usada pela policy de INSERT de `messages`) permite
--    abrir uma conversa nova com o dono de um anúncio mesmo depois dele
--    ter sido pausado/rejeitado/expirado/removido — inconsistente com o
--    resto do app (busca, get_seller_phone, search_ads_ids_within_radius),
--    que sempre exige status = 'active'. Não é um vazamento de dado de
--    terceiro (quem manda a mensagem continua sendo obrigatoriamente
--    auth.uid()), mas é a mesma regra de negócio aplicada em todo lugar.

-- ─── 1) plans — versiona as 3 policies já em vigor ──────────────────────
drop policy if exists "Admins podem gerenciar planos" on public.plans;
create policy "Admins podem gerenciar planos"
  on public.plans for all
  using (is_admin());

drop policy if exists "Service role manage plans" on public.plans;
create policy "Service role manage plans"
  on public.plans for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Public read active plans" on public.plans;
create policy "Public read active plans"
  on public.plans for select
  using (is_active = true);

-- ─── 2) platform_settings — versiona + fecha a brecha de resend/smtp ────
drop policy if exists "Admins leem configurações não sensíveis" on public.platform_settings;
create policy "Admins leem configurações não sensíveis"
  on public.platform_settings for select
  using (is_admin() and not is_secret_setting_key(key));

drop policy if exists "Admins criam configurações não sensíveis" on public.platform_settings;
create policy "Admins criam configurações não sensíveis"
  on public.platform_settings for insert
  with check (is_admin() and not is_secret_setting_key(key));

drop policy if exists "Admins atualizam configurações não sensíveis" on public.platform_settings;
create policy "Admins atualizam configurações não sensíveis"
  on public.platform_settings for update
  using (is_admin() and not is_secret_setting_key(key))
  with check (is_admin() and not is_secret_setting_key(key));

drop policy if exists "Admins removem configurações não sensíveis" on public.platform_settings;
create policy "Admins removem configurações não sensíveis"
  on public.platform_settings for delete
  using (is_admin() and not is_secret_setting_key(key));

-- BUG CORRIGIDO: substitui o array hardcoded de 9 chaves (desatualizado,
-- sem resend_api_key/smtp_password) por is_secret_setting_key() — mesma
-- função que já protege todas as outras 4 policies acima, garantindo que
-- as duas listas nunca mais possam divergir.
drop policy if exists "Public settings are viewable by everyone" on public.platform_settings;
create policy "Configurações públicas são visíveis a qualquer um"
  on public.platform_settings for select
  using (not is_secret_setting_key(key));

-- ─── 3) is_ad_owner — só conta anúncio ATIVO como "dono pode ser contatado" ──
create or replace function public.is_ad_owner(p_ad_id uuid, p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.ads
    where id = p_ad_id and user_id = p_user_id and status = 'active'
  );
$$;
