import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAnonClient } from '@/lib/supabase-server'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { imageUrl } from '@/lib/storage'
import { t as _t } from '@/lib/constants'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Lang = 'pt' | 'es';

// Strings específicas desta página de detalhe — não existem no dicionário
// global I18N (lib/constants.ts), então seguem o mesmo padrão local já usado
// em components/ads/AdsSidebar.tsx em vez de poluir o dicionário compartilhado.
const TRANSLATIONS = {
  pt: {
    notFound: 'Evento não encontrado',
    eventOn: 'Evento em',
    breadcrumbDetails: 'Detalhes',
    eventInfo: 'Informações do Evento',
    date: 'Data:',
    location: 'Local:',
    online: 'Online',
    organization: 'Organização:',
    officialSite: 'Site oficial do evento →',
    description: 'Descrição',
    noDescription: 'Nenhuma descrição disponível para este evento.',
  },
  es: {
    notFound: 'Evento no encontrado',
    eventOn: 'Evento el',
    breadcrumbDetails: 'Detalles',
    eventInfo: 'Información del Evento',
    date: 'Fecha:',
    location: 'Lugar:',
    online: 'Online',
    organization: 'Organización:',
    officialSite: 'Sitio oficial del evento →',
    description: 'Descripción',
    noDescription: 'No hay descripción disponible para este evento.',
  },
} as const;

async function getLang(): Promise<Lang> {
  const cookieStore = await cookies();
  return cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt';
}

export const revalidate = 3600; // ISR — eventos raramente mudam

// BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): esta página só
// consultava auction_events — as 8 "feiras" reais vindas da tabela `eventos`
// (Expointer, Agrishow, ExpoZebu etc., listadas em /eventos junto com os
// leilões) sempre devolviam 404 ao clicar. Agora tenta auction_events
// primeiro e cai para `eventos` se não achar, igual à normalização já feita
// em app/(public)/eventos/page.tsx.
async function findEvent(id: string, lang: Lang) {
  const sb = createAnonClient();

  const { data: auction } = await sb
    .from('auction_events')
    .select('id, title, title_es, date, cover, status')
    .eq('id', id)
    .neq('status', 'draft')
    .maybeSingle();

  if (auction) {
    const title = lang === 'es' && auction.title_es ? auction.title_es : auction.title;
    return { title, date: auction.date, cover: auction.cover, location: undefined, organizer: undefined, link: undefined };
  }

  const { data: evento } = await sb
    .from('eventos')
    .select('id, title, title_es, date, image, location_str, location_str_es, organizer, organizer_es, link')
    .eq('id', id)
    .maybeSingle();

  if (evento) {
    const title = lang === 'es' && evento.title_es ? evento.title_es : evento.title;
    const location = lang === 'es' && evento.location_str_es ? evento.location_str_es : evento.location_str;
    const organizer = lang === 'es' && evento.organizer_es ? evento.organizer_es : evento.organizer;
    return { title, date: evento.date, cover: evento.image, location, organizer, link: evento.link };
  }

  return null;
}

// eventos.date é texto livre ("30 ago - 7 set 2026"), não ISO — só formatar
// como data quando for de fato parseável (auction_events.date, ISO).
function formatEventDate(date: string, lang: Lang): string {
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lang = await getLang();
  const tt = TRANSLATIONS[lang];
  if (!UUID_REGEX.test(id)) return { title: tt.notFound };

  const data = await findEvent(id, lang);
  if (!data) return { title: tt.notFound };

  const coverUrl = data.cover
    ? data.cover.startsWith('http')
      ? data.cover
      : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${data.cover}`
    : undefined;

  const description = `${tt.eventOn} ${formatEventDate(data.date, lang)}`;

  return {
    title: data.title,
    description,
    alternates: { canonical: `https://tauzeclass.com.br/eventos/${id}` },
    openGraph: {
      title: data.title,
      description,
      url: `https://tauzeclass.com.br/eventos/${id}`,
      type: 'website',
      locale: lang === 'es' ? 'es_AR' : 'pt_BR',
      images: coverUrl
        ? [{ url: coverUrl, width: 1200, height: 630, alt: data.title }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description,
      images: coverUrl ? [coverUrl] : [],
    },
  };
}

// Pré-renderizar os próximos eventos no build (auction_events + eventos —
// mesma correção do achado: metade dos eventos reais vem da tabela eventos).
export async function generateStaticParams() {
  try {
    const sb = createAnonClient();
    const [{ data: auctions }, { data: eventos }] = await Promise.all([
      sb.from('auction_events').select('id').neq('status', 'draft').gte('date', new Date().toISOString()).order('date', { ascending: true }).limit(50),
      sb.from('eventos').select('id').limit(50),
    ]);

    return [...(auctions || []), ...(eventos || [])].map(ev => ({ id: ev.id }));
  } catch {
    return [];
  }
}

export default async function EventDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await getLang()
  const tt = TRANSLATIONS[lang]

  // Validar formato UUID antes de qualquer query
  if (!UUID_REGEX.test(id)) {
    notFound()
  }

  const event = await findEvent(id, lang)

  if (!event) {
    notFound()
  }

  return (
    <div style={{ marginTop: 'var(--header-h)', flex: 1, paddingBottom: '4rem' }}>
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <Link href="/">{_t('nav_home', lang)}</Link>
                <span aria-hidden="true">›</span>
                <Link href="/eventos">{_t('events_title', lang)}</Link>
                <span aria-hidden="true">›</span>
                <span aria-current="page">{tt.breadcrumbDetails}</span>
              </nav>
              <h1 className="list-hero-title">{event.title}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 'var(--sp-6)' }}>
        {event.cover && (
          <div style={{ position: 'relative', width: '100%', height: '400px', backgroundColor: '#f1f5f9', borderRadius: '1rem', overflow: 'hidden', marginBottom: '2rem' }}>
            <Image
              src={imageUrl(event.cover)}
              alt={event.title}
              fill
              style={{ objectFit: 'cover' }}
              priority
            />
          </div>
        )}

        <div style={{ background: 'var(--clr-surface)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--clr-border)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>{tt.eventInfo}</h2>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <strong>{tt.date}</strong> {formatEventDate(event.date, lang)}
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: event.organizer || event.link ? '0.5rem' : '1.5rem' }}>
            <strong>{tt.location}</strong> {event.location || tt.online}
          </p>
          {event.organizer && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <strong>{tt.organization}</strong> {event.organizer}
            </p>
          )}
          {event.link && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <a href={event.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--clr-primary)' }}>
                {tt.officialSite}
              </a>
            </p>
          )}

          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>{tt.description}</h3>
          <p style={{ color: 'var(--clr-text-muted)', lineHeight: 1.6 }}>
            {tt.noDescription}
          </p>
        </div>
      </div>
    </div>
  )
}
