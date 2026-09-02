import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { AnunciarWizard } from './AnunciarWizard';
import { normalizeCountry } from '@/lib/geo-utils';
import { getLocale } from '@/lib/locale-server';
import { localizedPath, buildHreflangAlternates, SITE_URL } from '@/lib/locale';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// BUG CORRIGIDO (auditoria de SEO): esta página não declarava `generateMetadata`
// nem `metadata` — herdava TUDO do layout raiz (app/(public)/layout.tsx),
// inclusive `alternates.canonical` apontando pra HOME. Resultado confirmado ao
// vivo: o Google via /anunciar (o funil principal de captação de vendedores)
// como uma cópia não-canônica da home, e nunca indexava a página própria.
// Mesmo padrão de generateMetadata condicional já usado em app/(public)/planos.
// Modo edição (?id=) exige login e mostra dados pessoais do formulário — não é
// conteúdo, então recebe só noindex, sem OG/canonical elaborados.
const METADATA_TRANSLATIONS = {
  pt: {
    editTitle: 'Editar Anúncio',
    title: 'Anuncie Grátis',
    description: 'Anuncie grátis animais, máquinas agrícolas e imóveis rurais no maior classificado do agronegócio do Mercosul. Publique seu anúncio em minutos e venda mais rápido.',
    ogTitle: 'Anuncie Grátis | Tauze Class',
    ogAlt: 'Anuncie Grátis no Tauze Class',
  },
  es: {
    editTitle: 'Editar Anuncio',
    title: 'Publica Gratis',
    description: 'Publica gratis animales, maquinaria agrícola e inmuebles rurales en el mayor clasificado del agronegocio del Mercosur. Publica tu anuncio en minutos y vende más rápido.',
    ogTitle: 'Publica Gratis | Tauze Class',
    ogAlt: 'Publica Gratis en Tauze Class',
  },
} as const;


export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const lang = await getLocale();
  const m = METADATA_TRANSLATIONS[lang];
  const params = await searchParams;
  const id = params?.id as string | undefined;

  if (id) {
    return {
      title: m.editTitle,
      robots: { index: false, follow: false },
    };
  }

  const canonicalUrl = `${SITE_URL}${localizedPath('/anunciar', lang)}`;

  return {
    title: m.title,
    description: m.description,
    alternates: {
      canonical: canonicalUrl,
      languages: buildHreflangAlternates(SITE_URL, '/anunciar'),
    },
    openGraph: {
      title: m.ogTitle,
      description: m.description,
      url: canonicalUrl,
      type: 'website',
      locale: lang === 'es' ? 'es_AR' : 'pt_BR',
      images: [{ url: `${SITE_URL}/assets/hero_farm.webp`, width: 1200, height: 630, alt: m.ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: m.ogTitle,
      description: m.description,
      images: [`${SITE_URL}/assets/hero_farm.webp`],
    },
  };
}

export default async function AnunciarPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();

  // Usar getUser() em vez de getSession() para validação real da sessão
  const { data: { user } } = await supabase.auth.getUser();

  // Handle both Next 14 and Next 15 searchParams paradigms safely
  const params = await Promise.resolve(searchParams);
  const id = params?.id as string | undefined;

  let initialData = null;
  let isEditMode = false;

  if (id) {
    // ─── Validar formato UUID antes de qualquer query ──────────
    if (!UUID_REGEX.test(id)) {
      redirect('/anunciar');
    }

    // ─── Exigir login para edição ──────────────────────────────
    if (!user) {
      redirect(`/login?redirectTo=/anunciar?id=${id}`);
    }

    // ─── Buscar anúncio garantindo que pertence ao usuário ──────
    // .eq('user_id', user.id) previne Information Disclosure entre usuários
    const { data } = await supabase
      .from('ads')
      .select('id, title_pt, category_id, subcategory_id, purpose, price, description, images, video_url, country, state, city, condition, negotiable, currency, price_unit_pt, status')
      .eq('id', id)
      .eq('user_id', user.id) // ← CRÍTICO: garante que só o dono acessa
      .maybeSingle();

    if (data) {
      initialData = data;
      isEditMode = true;
    } else {
      // ID inválido ou não pertence ao usuário — redirecionar silenciosamente
      redirect('/painel');
    }
  } else if (user) {
    // Resume draft do usuário logado
    const { data: draftData } = await supabase
      .from('ads')
      .select('id, title_pt, category_id, subcategory_id, purpose, price, description, images, video_url, country, state, city, condition, negotiable, currency, price_unit_pt, status')
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftData) {
      initialData = draftData;
    }
  }
  // Progressive Profiling: usuários não logados sem ?id podem preencher o formulário

  let userProfile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('country, state, city')
      .eq('id', user.id)
      .maybeSingle();
    userProfile = data;
  }

  if (userProfile?.country) {
    userProfile.country = normalizeCountry(userProfile.country);
  }

  return (
    <AnunciarWizard
      initialData={initialData}
      userProfile={userProfile}
      isEditMode={isEditMode}
    />
  );
}
