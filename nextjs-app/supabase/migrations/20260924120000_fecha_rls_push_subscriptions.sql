-- ============================================================================
--  CRÍTICO: push_subscriptions sem RLS rastreada em nenhuma migration
-- ============================================================================
--
--  PROBLEMA (achado ao vivo, varredura de segurança/performance/RLS pedida
--  pelo usuário, 2026-09-24)
--
--  A tabela public.push_subscriptions (credenciais de push web/VAPID por
--  usuário: endpoint, p256dh, auth — ver app/(public)/painel/_components/
--  usePush.ts) nunca teve um CREATE TABLE, ENABLE ROW LEVEL SECURITY,
--  CREATE POLICY ou REVOKE em nenhuma migration deste repositório. Foi
--  criada fora do controle de versão, então sua postura de segurança real é
--  desconhecida a partir do código. usePush.ts:61 insere direto do
--  navegador com a chave anon (getSupabase(), não service_role) — sem
--  camada de servidor no meio, o comportamento depende inteiramente de
--  RLS/GRANTs que não estão versionados.
--
--  Esta mesma lacuna (tabela nova, RLS desligada, GRANT default herdado)
--  já causou um incidente real e documentado neste código-base: ver item 3
--  de 20260830190000_auditoria_seguranca_correcoes.sql (ads_archive — RLS
--  desabilitada + GRANT total pra anon/authenticated, permitindo leitura/
--  escrita/TRUNCATE público). Os 3 lotes de "defensive_enable_rls"
--  (20260830170000, 20260830180100, 20260830200100) trataram exatamente
--  essa classe de problema pra outras 21 tabelas, mas push_subscriptions
--  ficou de fora de todos os três (não existia nesses nomes na época, ou
--  foi criada depois, fora de qualquer varredura).
--
--  Sem RLS/GRANT corretos, qualquer usuário autenticado (ou pior, anon,
--  dependendo do GRANT default herdado) poderia ler as credenciais de push
--  de TODOS os usuários e inserir/alterar/apagar assinaturas de qualquer
--  user_id — dado sensível o bastante pra permitir enviar notificações
--  push arbitrárias pro dispositivo de outra pessoa, uma vez que o
--  mecanismo de envio (push-dispatch, ver 20260909180000) existir de
--  verdade.
--
--  SOLUÇÃO
--
--  Mesmo padrão já usado pra device_push_tokens (tabela irmã, criada com
--  RLS correta desde o início em 20260909180000): ENABLE RLS idempotente,
--  REVOKE ALL pra resetar qualquer GRANT default herdado, e uma única
--  policy "dono gerencia as próprias" (auth.uid() = user_id). Não recria a
--  tabela (já existe em produção com schema desconhecido por aqui) — só
--  fecha a postura de RLS/GRANT, que não depende de conhecer o schema
--  exato.
-- ============================================================================

do $$
begin
  if to_regclass('public.push_subscriptions') is not null then
    execute 'alter table public.push_subscriptions enable row level security';
    execute 'revoke all on public.push_subscriptions from anon, authenticated';
    execute 'grant select, insert, delete on public.push_subscriptions to authenticated';

    execute 'drop policy if exists "Usuário gerencia as próprias inscrições de push" on public.push_subscriptions';
    execute $policy$
      create policy "Usuário gerencia as próprias inscrições de push"
        on public.push_subscriptions
        for all
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id)
    $policy$;
  end if;
end
$$;
