-- BUG CRÍTICO CORRIGIDO (varredura de segurança, vazamento de dados,
-- 2026-08-29): profiles.phone_whatsapp era legível por QUALQUER requisição
-- anônima, direto no PostgREST, usando só a anon key pública (embutida no
-- bundle JS de qualquer visitante). A policy de SELECT em profiles é
-- `using (true)` (sem restrição de linha) e o GRANT de coluna incluía
-- phone_whatsapp para o papel "anon".
--
-- Confirmado AO VIVO antes desta migration:
--   GET {url}/rest/v1/profiles?select=id,name,phone_whatsapp
--   Authorization: (nenhum) — só o header apikey com a anon key pública
-- devolvia o WhatsApp de usuários reais, sem login, sem sessão, sem rate
-- limit, sem consentimento — justamente o dado que
-- app/(public)/anuncio/[id]/page.tsx e app/api/contact-seller/route.ts já
-- tratam como sensível (só liberam autenticado e limitado). O mesmo
-- vazamento também alcançava qualquer visitante anônimo das páginas de
-- listagem/home, que embutem `profiles(..., phone_whatsapp)` nas queries de
-- anúncio (lib/supabase-server.ts, lib/supabase.ts) — removido do lado da
-- aplicação em paralelo a esta migration, já que nenhuma tela realmente
-- exibe esse campo vindo dali.
--
-- Revoga do papel "anon": nenhum uso legítimo do app lê o telefone de
-- ninguém sem sessão (nenhuma chamada client-side roda como "anon" e
-- precisa desse campo — confirmado por grep, getSellerProfile() é a única
-- função que o selecionava para outro usuário e é código morto, sem
-- nenhuma chamada em todo o app).
--
-- NÃO revogado de "authenticated" nesta migration: o próprio usuário lê o
-- PRÓPRIO telefone para editar (getProfile(), ProfileTab) e o admin lê o
-- telefone de um solicitante durante revisão de KYC
-- (admin/verificacoes/page.tsx), ambos como o papel Postgres
-- "authenticated" (is_admin é conceito de aplicação/RLS, não um papel
-- Postgres separado) — revogar também de "authenticated" quebraria os
-- dois sem uma substituição (view com CASE WHEN auth.uid()=id, ou mover a
-- coluna para user_secfrets, que já hospeda os demais dados sensíveis de
-- perfil). Continua existindo uma lacuna menor: qualquer usuário AUTENTICADO
-- (contas são de criação livre) ainda consegue ler o telefone de OUTRO
-- usuário chamando o REST direto, fora da UI do app — documentado como
-- follow-up necessário, não resolvido aqui por exigir testar a
-- compatibilidade do embed do PostgREST (profiles(...) dentro de
-- ads(...)) contra uma view, o que não foi possível validar ao vivo nesta
-- rodada.
revoke select (phone_whatsapp) on public.profiles from anon;

-- public_profiles: view exposta a "anon"/"authenticated" via PostgREST mas
-- sem NENHUM chamador no código do app (confirmado por grep — morta/legada).
-- Incluía is_admin na lista de colunas — vazamento menor (permite descobrir
-- quem é admin sem autenticação), sem motivo de existir numa view pública, e
-- também tinha GRANT de INSERT/UPDATE/DELETE/TRUNCATE para anon/authenticated
-- numa view sem regra de segurança própria (não executável de fato hoje,
-- mas desnecessário). CREATE OR REPLACE VIEW não permite remover coluna,
-- por isso o DROP explícito.
drop view if exists public.public_profiles;
create view public.public_profiles as
select id, name, avatar_url, country, state, city, bio, verified, ads_count, created_at
from public.profiles;
grant select on public.public_profiles to anon, authenticated;
