-- BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25,
-- verificado adversarialmente 3x sem refutação): guard_ad_moderation() só
-- tratava transições ENTRANDO em 'active' — nenhum ramo impedia sair de
-- old.status='deleted' para qualquer outro estado. Combinado com a policy
-- de UPDATE em ads (só checa auth.uid()=user_id, sem restringir status),
-- o próprio dono podia chamar toggleAdStatus/updateAd via console do
-- navegador (mesma sessão, supabase-js já no bundle) e mover um anúncio
-- de 'deleted' pra 'paused'/'pending', ressuscitando por completo um
-- registro que deleteAd() documenta como soft-delete permanente pra
-- auditoria. Corrigido em app/lib/supabase.ts (toggleAdStatus agora exige
-- .eq('status', currentStatus) real), mas a defesa que realmente importa
-- é aqui — no banco, contra qualquer caminho (RPC, PostgREST direto,
-- futuro código que esqueça o guard client-side).
create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active'::public.ad_status then
      raise exception
        'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'deleted'::public.ad_status and new.status is distinct from 'deleted'::public.ad_status then
    raise exception
      'ads: um anuncio excluido nao pode ser reativado.'
      using errcode = '42501';
  end if;

  if new.status = 'active'::public.ad_status and old.status = 'paused'::public.ad_status then
    if (to_jsonb(new) - array['updated_at','status','views_count','search_vector','fts','featured','expires_at'])
       is distinct from
       (to_jsonb(old) - array['updated_at','status','views_count','search_vector','fts','featured','expires_at'])
    then
      raise exception
        'ads: reativar e editar ao mesmo tempo requer nova moderacao. Salve a edicao separadamente.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'active'::public.ad_status and old.status is distinct from 'active'::public.ad_status then
    raise exception
      'ads: apenas moderacao pode ativar um anuncio. Envie para pending.'
      using errcode = '42501';
  end if;

  if old.status = 'active'::public.ad_status and new.status = 'active'::public.ad_status then
    if (to_jsonb(new) - array['updated_at','views_count','search_vector','fts','featured','expires_at'])
       is distinct from
       (to_jsonb(old) - array['updated_at','views_count','search_vector','fts','featured','expires_at'])
    then
      raise exception
        'ads: editar anuncio ativo requer nova moderacao. Envie o status para pending.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
