import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase-server';
import { dentroDoLimiteFallback } from '@/lib/rate-limit-fallback';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB, mesmo limite de StepPhotos.tsx e do bucket ad-images
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 78;

// Comprime toda foto que entra em ad-images no servidor (sharp), em vez de
// confiar só na compressão client-side (StepPhotos.tsx usa canvas.toBlob,
// que devolve JPEG/PNG — nunca WebP, porque canvas.toBlob('image/webp') não
// é confiável entre navegadores, ex.: Safari < 16.4 volta PNG em silêncio).
// Validado ao vivo em fotos reais do catálogo: reencodar pra WebP (mesmo
// sobre fotos já reduzidas pelo canvas) ainda corta ~55% do tamanho, sem
// perda visível de qualidade. Resolve o estouro do limite de Storage do
// Supabase Free (1GB) sem trocar de provedor nem pagar nada.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25):
  // única rota de mutação autenticada do app sem NENHUM rate limit, mesmo
  // processando imagem no servidor (sharp: resize+reencode, CPU real) e
  // gravando no Storage — diferente de toda outra rota de mutação
  // autenticada (checkout, contact-seller, tokenize-card etc., todas com
  // dentroDoLimiteFallback). Limite generoso o bastante pra cobrir o wizard
  // de anúncio inteiro (até 30 fotos do plano Premium) num único fôlego,
  // mas barra um loop automatizado.
  const permitido = await dentroDoLimiteFallback({
    bucket: `upload_ad_image_${user.id}`,
    limit: 40,
    windowSeconds: 600,
    logPrefix: 'upload-ad-image',
  });
  if (!permitido) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const folderRaw = form.get('folder');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }
  // 'folder' vira segmento de path (uid/<folder>/arquivo.webp) — nunca deve
  // conter '/' ou '..', senão o cliente escreveria fora da própria pasta que
  // a RLS do bucket (auth.uid() = path[1]) pretende isolar.
  const folder = (typeof folderRaw === 'string' ? folderRaw : '').replace(/[^a-zA-Z0-9_-]/g, '') || 'draft';

  let compressed: Buffer;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    compressed = await sharp(bytes)
      .rotate() // aplica orientação EXIF (fotos de celular via upload direto, sem passar por canvas) antes de descartar os metadados
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'Invalid image' }, { status: 400 });
  }

  const fileName = `${user.id}/${folder}/${Date.now()}_${Math.random().toString(36).substring(2)}.webp`;

  const { error } = await supabase.storage.from('ad-images').upload(fileName, compressed, {
    cacheControl: '31536000',
    upsert: false,
    contentType: 'image/webp',
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from('ad-images').getPublicUrl(fileName);
  return NextResponse.json({ url: publicUrl });
}
