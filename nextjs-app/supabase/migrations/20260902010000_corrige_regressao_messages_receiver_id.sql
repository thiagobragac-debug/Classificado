-- ============================================================================
--  Corrige regressão da própria correção anterior (messages.receiver_id)
-- ============================================================================
--
-- ACHADO AO VIVO (revalidação do zero, 2026-09-02, poucas horas depois da
-- migration anterior): a policy nova de INSERT em `messages`
-- (20260902000000_correcoes_teste_estresse_final.sql) valida
-- `receiver_id` com um EXISTS direto em `public.ads` — mas essa subquery
-- roda como o PRÓPRIO remetente (RLS normal, não SECURITY DEFINER), e a
-- policy de SELECT de `ads` só deixa um usuário ver anúncio de outro dono
-- quando `status = 'active'`. Resultado: **toda primeira mensagem pra um
-- anúncio que não está `active` (ex.: ainda `pending`) era bloqueada**,
-- mesmo sendo o dono certo do anúncio o destinatário — reproduzido ao vivo,
-- confirmado que com `status='active'` funciona e com `status='pending'`
-- falha com "new row violates row-level security policy".
--
-- Impacto real em produção provavelmente baixo (a tela de contato só é
-- alcançável a partir de `/anuncio/[slug]`, que só renderiza anúncio
-- `active` pro público) — mas é uma falha latente real, não só teórica
-- (qualquer outro caminho que chegue a um anúncio não-active com o
-- formulário de contato, ou uma mudança futura de status enquanto uma
-- primeira mensagem está em voo, quebraria em silêncio).
--
-- CORREÇÃO: mesmo padrão já usado em check_report_rate_limit() nesta mesma
-- sessão — uma função SECURITY DEFINER que verifica só o FATO objetivo
-- "user_id é o dono deste ad_id", sem depender da visibilidade RLS de quem
-- chama. A policy troca a subquery direta por essa função.
create or replace function public.is_ad_owner(p_ad_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.ads where id = p_ad_id and user_id = p_user_id
  );
$$;

revoke all on function public.is_ad_owner(uuid, uuid) from public;
grant execute on function public.is_ad_owner(uuid, uuid) to anon, authenticated;

-- Nome real na produção veio truncado em 61 caracteres pelo limite do
-- Postgres (NAMEDATALEN) — confirmado via pg_policies antes de escrever
-- este DROP, não adivinhado (mesma lição desta sessão: nunca confiar só no
-- nome que o arquivo de migration ANTERIOR pretendia criar).
drop policy if exists "Usuários enviam mensagens como si mesmos, pro dono do anúncio" on public.messages;

create policy "msgs_insert_dono_ou_resposta"
on public.messages for insert
with check (
  auth.uid() = sender_id
  and (
    public.is_ad_owner(messages.ad_id, messages.receiver_id)
    or exists (
      select 1 from public.messages m
       where m.ad_id = messages.ad_id
         and m.sender_id = messages.receiver_id
         and m.receiver_id = auth.uid()
    )
  )
);
