import Image, { type ImageProps, type ImageLoaderProps } from 'next/image';

// Wrapper fino sobre next/image, criado pra responder a uma pergunta real do
// usuário: "dá pra deixar o Supabase Image Transformations pronto pro futuro
// sem precisar mexer em código de novo?" — o motivo de existir esse
// componente em vez de trocar `import Image from 'next/image'` direto pelo
// loader do Supabase em cada arquivo (13 usos hoje) é que o recurso de
// transformação de imagem do Supabase exige o plano Pro (confirmado ao vivo
// na documentação oficial — não existe no Free), e o projeto está no Free
// por restrição de orçamento no momento desta decisão. Ativar cedo demais
// quebraria toda foto do site (o endpoint /render/image/ simplesmente não
// funciona no Free). Por isso a escolha de loader mora aqui, atrás de UMA
// env var — todo componente que já usa <AppImage> (em vez de importar
// next/image direto) muda de otimizador OS DOIS ao mesmo tempo só con upgrade
// de plano + uma variável no painel da Vercel + redeploy, nunca editando
// nenhum arquivo .tsx de novo.
//
// Continua usando o otimizador embutido do Vercel (Image Optimization,
// comportamento de hoje) enquanto NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM não
// estiver definida como "true". Só se aplica a imagens cuja URL já é do
// Storage do Supabase (ver isSupabaseStorageUrl abaixo) — imagens locais
// (/assets/*) ou de outros hosts (avatar do Google, Unsplash, placehold.co)
// continuam pelo otimizador do Vercel sempre, com ou sem a env var, porque
// o endpoint de transformação do Supabase só existe pra arquivos que
// realmente moram no Storage dele.
const SUPABASE_TRANSFORM_ENABLED = process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM === 'true';

// Formato real documentado pelo Supabase (supabase.com/docs/guides/storage/
// serving/image-transformations): troca só o segmento /object/ por
// /render/image/ na MESMA URL pública já usada hoje — bucket e path
// continuam idênticos, então nenhuma outra parte do código (imageUrl() em
// lib/storage.ts, upload, etc.) precisa mudar.
function isSupabaseStorageUrl(src: string): boolean {
  return src.includes('/storage/v1/object/public/');
}

function supabaseTransformLoader({ src, width, quality }: ImageLoaderProps): string {
  const renderUrl = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const params = new URLSearchParams({
    width: String(width),
    quality: String(quality || 75),
    // 'contain' preserva a proporção original (sem cortar no servidor) —
    // o enquadramento final continua por conta do object-fit do CSS de cada
    // componente, exatamente como o otimizador do Vercel já se comporta hoje.
    resize: 'contain',
  });
  return `${renderUrl}?${params.toString()}`;
}

export function AppImage(props: ImageProps) {
  const src = typeof props.src === 'string' ? props.src : '';
  const useSupabaseLoader = SUPABASE_TRANSFORM_ENABLED && isSupabaseStorageUrl(src);

  if (useSupabaseLoader) {
    return <Image {...props} loader={supabaseTransformLoader} />;
  }
  return <Image {...props} />;
}
