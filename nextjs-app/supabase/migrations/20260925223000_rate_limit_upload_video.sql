-- BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25,
-- verificado adversarialmente sem refutação): uploadAdVideo() (lib/supabase.ts)
-- sobe o arquivo direto do client pro Supabase Storage (bucket ad-videos)
-- usando a sessão do usuário, sem passar por nenhuma rota de API do
-- Next.js e sem NENHUM rate limit — só a checagem de mime/tamanho por
-- arquivo no nível do bucket. Um usuário autenticado em loop, cada
-- chamada com um vídeo de até 50MB, consome storage/egress do projeto sem
-- teto algum.
--
-- Mesmo padrão já usado pra mensagens/denúncias (20260924130000): uma
-- função SECURITY DEFINER que constrói o bucket internamente a partir de
-- auth.uid() (não forjável pelo chamador), em vez de aceitar bucket livre.
-- Limite mais apertado que upload de foto (vídeo é bem mais pesado):
-- 10 uploads a cada 10 minutos cobre folgadamente o uso real (1 vídeo por
-- anúncio) e ainda barra abuso em loop.
create or replace function public.rpc_check_video_upload_rate_limit()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;
  return public.check_rate_limit('video_upload_' || v_user_id::text, 10, 600);
end;
$function$;

revoke all on function public.rpc_check_video_upload_rate_limit() from public;
revoke execute on function public.rpc_check_video_upload_rate_limit() from anon;
grant execute on function public.rpc_check_video_upload_rate_limit() to authenticated;
