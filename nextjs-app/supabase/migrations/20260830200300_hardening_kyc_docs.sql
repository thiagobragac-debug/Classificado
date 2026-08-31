-- ============================================================================
--  Hardening do bucket kyc-docs — policy de INSERT versionada, limites de
--  mime/tamanho alinhados e trava de integridade pós-aprovação
-- ============================================================================
--
--  PROBLEMA (auditoria de segurança independente, 2026-08-30)
--
--  1. VerificacaoClient.tsx grava documento de identidade/selfie em
--     `kyc-docs` usando o client do navegador com a sessão do usuário comum
--     — precisa de uma policy de INSERT em storage.objects. Nenhuma
--     migration rastreada cria essa policy (só a de SELECT admin-only,
--     20260825160000, e os limites de mime/tamanho). Confirmado
--     empiricamente que o bucket tem documentos reais gravados, ou seja, ela
--     existe em produção — só foi criada fora do histórico de versionamento
--     (mesma classe de risco já documentada para public.is_admin() em
--     supabase/ADVISORY_is_admin_baseline.sql). Sem a definição real, não dá
--     pra confirmar por código se ela restringe a própria pasta do usuário
--     ou é mais permissiva — grave, tratando-se de documento de identidade.
--     Corrigido substituindo (não adivinhando) qualquer policy de INSERT
--     hoje associada a este bucket pela definição correta, no mesmo padrão
--     de path-por-uid já usado em ad-images.
--
--  2. Os limites reais de allowed_mime_types/file_size_limit do bucket (via
--     leitura direta da Storage Admin API) não batem com o que
--     20260830180100_defensive_enable_rls_batch2.sql declara — o bucket real
--     aceita `application/pdf` (não usado pelo fluxo, que só envia imagem) e
--     NÃO aceita image/heic nem image/heif (rejeitando fotos tiradas direto
--     de iPhone). A migration nunca chegou a ter efeito líquido observável
--     em produção para esta tabela.
--
--  3. As policies genéricas de dono ("Usuário atualiza/deleta próprias
--     imagens", 20260825160000) não filtram bucket — valem também para
--     kyc-docs. O próprio usuário pode apagar ou sobrescrever o documento
--     DEPOIS de o admin já ter aprovado a verificação com base nele,
--     comprometendo a integridade da evidência. Trava adicionada só para
--     depois de aprovado — resubmissão continua livre enquanto pendente ou
--     rejeitado, sem mudar o fluxo de reenvio existente.
-- ============================================================================

-- (1) Substitui qualquer policy de INSERT hoje associada a kyc-docs — filtra
-- pelo texto do WITH CHECK em vez do nome (desconhecido) da policy, então
-- não toca nas policies de INSERT de outros buckets (ad-images, ad-videos,
-- profile-banners), que não mencionam 'kyc-docs'.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'INSERT'
      and with_check ilike '%kyc-docs%'
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "Usuario sobe o proprio documento kyc"
on storage.objects for insert
with check (
  bucket_id = 'kyc-docs'
  and auth.role() = 'authenticated'
  and (auth.uid())::text = (storage.foldername(name))[1]
);

-- (2) Alinha o estado real do bucket ao que o fluxo de verificação
-- efetivamente envia (imagem de documento + selfie, incluindo HEIC/HEIF do
-- iPhone; PDF nunca é gerado pelo cliente, que já filtra por image/*).
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
       file_size_limit = 10 * 1024 * 1024
 where id = 'kyc-docs';

-- (3) Trava UPDATE/DELETE do próprio documento depois que a verificação
-- correspondente já foi aprovada. RESTRICTIVE: entra em AND com as policies
-- PERMISSIVE existentes (dono, admin) — não abre acesso novo nenhum, só
-- pode fechar. Admin continua isento (moderação/remoção administrativa).
drop policy if exists "Trava kyc-docs apos aprovacao (update)" on storage.objects;
create policy "Trava kyc-docs apos aprovacao (update)"
on storage.objects as restrictive for update
using (
  bucket_id <> 'kyc-docs'
  or public.is_admin()
  or not exists (
    select 1 from public.verification_requests vr
     where vr.user_id = auth.uid() and vr.status = 'approved'
  )
);

drop policy if exists "Trava kyc-docs apos aprovacao (delete)" on storage.objects;
create policy "Trava kyc-docs apos aprovacao (delete)"
on storage.objects as restrictive for delete
using (
  bucket_id <> 'kyc-docs'
  or public.is_admin()
  or not exists (
    select 1 from public.verification_requests vr
     where vr.user_id = auth.uid() and vr.status = 'approved'
  )
);
