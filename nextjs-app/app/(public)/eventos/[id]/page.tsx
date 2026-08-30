import { notFound, permanentRedirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAnonClient } from '@/lib/supabase-server'
import Image from 'next/image'
import Link from 'next/link'
import { isSafeExternalUrl } from '@/lib/sanitize'
import type { Metadata } from 'next'
import { imageUrl } from '@/lib/storage'
import { t as _t } from '@/lib/constants'
import { parseEventDate } from '@/lib/event-date'
import { escapeJsonLd } from '@/lib/json-ld'

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
  },
} as const;

async function getLang(): Promise<Lang> {
  const cookieStore = await cookies();
  return cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt';
}

export const revalidate = 3600; // ISR — eventos raramente mudam

type FoundEvento = {
  kind: 'evento';
  title: string;
  date: string;
  cover: string | null;
  location?: string;
  organizer?: string;
  link?: string;
};
type FoundAuction = { kind: 'auction' };
type FoundRecord = FoundAuction | FoundEvento;

// BUG CRÍTICO CORRIGIDO (teste completo do site, 2026-08-24): esta página só
// consultava auction_events — as 8 "feiras" reais vindas da tabela `eventos`
// (Expointer, Agrishow, ExpoZebu etc., listadas em /eventos junto com os
// leilões) sempre devolviam 404 ao clicar. Agora tenta auction_events
// primeiro e cai para `eventos` se não achar, igual à normalização já feita
// em app/(public)/eventos/page.tsx.
//
// DUPLICAÇÃO DE CONTEÚDO CORRIGIDA (achado de validação, 2026-08-29):
// /leiloes/[id] já é a página completa de um leilão (lances, catálogo,
// vídeo ao vivo) — renderizar aqui um resumo do MESMO auction_event, numa
// URL diferente, é near-duplicate content pro Google (confirmado ao vivo:
// o mesmo id de auction_events respondia HTTP 200 nas duas rotas, com o
// mesmo título, cada uma com seu próprio <link rel="canonical">). Como o
// card de leilão na listagem /eventos ainda linka pra cá (EventCard.tsx
// aponta sempre pra /eventos/{id}, nunca sabe se o registro é um leilão),
// esta função agora só confirma a EXISTÊNCIA do auction_event (kind:
// 'auction') — quem decide o que fazer com isso é generateMetadata/a página
// (redirect de vez pra /leiloes/{id}, sem renderizar resumo nenhum). Só um
// registro de `eventos` de verdade retorna os dados completos (kind:
// 'evento') pra render abaixo.
async function findEvent(id: string, lang: Lang): Promise<FoundRecord | null> {
  const sb = createAnonClient();

  const { data: auction } = await sb
    .from('auction_events')
    .select('id')
    .eq('id', id)
    .neq('status', 'draft')
    .maybeSingle();

  if (auction) {
    return { kind: 'auction' };
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
    return { kind: 'evento', title, date: evento.date, cover: evento.image, location, organizer, link: evento.link };
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
  // BUG CRÍTICO CORRIGIDO (achado de validação, 2026-08-29): pra um id
  // formalmente válido mas inexistente, esta função só devolvia um Metadata
  // com título "não encontrado" — nunca chamava notFound(). generateMetadata
  // roda ANTES do corpo da página começar a streamar (esta rota herda o
  // Suspense de app/(public)/eventos/loading.tsx), então a página inteira
  // respondia HTTP 200 pra um evento que não existe (soft-404, confirmado ao
  // vivo com curl). Mesmo padrão já corrigido em anuncio/[id]/page.tsx.
  if (!data) notFound();

  // DUPLICAÇÃO DE CONTEÚDO CORRIGIDA — ver comentário de findEvent() acima.
  // redirect() aqui (e não só no corpo da página) é necessário pelo mesmo
  // motivo do notFound() acima: por causa do loading.tsx herdado, um
  // redirect() chamado só no corpo chegaria tarde demais pra virar um
  // redirect HTTP de verdade (a resposta já teria começado a streamar como
  // 200) — viraria só uma <meta> de redirect client-side. Permanent (308)
  // porque a duplicidade é estrutural: este id SEMPRE vai pertencer a
  // /leiloes, nunca a uma página de evento própria.
  if (data.kind === 'auction') permanentRedirect(`/leiloes/${id}`);

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

  const found = await findEvent(id, lang)

  if (!found) {
    notFound()
  }

  // DUPLICAÇÃO DE CONTEÚDO CORRIGIDA — ver comentário de findEvent() e
  // generateMetadata() acima. Mantido aqui também (defesa em profundidade):
  // generateMetadata já redireciona antes do streaming começar em condições
  // normais, mas se algum dia rodar sem esse Suspense herdado, o corpo
  // continua correto por si só.
  if (found.kind === 'auction') {
    permanentRedirect(`/leiloes/${id}`)
  }

  const event = found

  // JSON-LD Event — mesmo padrão @graph já usado em /eventos (listagem),
  // adaptado pra um item só. isOnline usa a MESMA regra da listagem
  // (app/(public)/eventos/page.tsx): sem location_str cadastrado, ou
  // contendo "online", trata como evento online — nunca inventa um Place
  // que não existe no banco.
  const isOnline = !event.location || event.location.toLowerCase().includes('online');
  const parsedTime = parseEventDate(event.date);
  const startDateStr = !isNaN(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString();
  const endDateStr = !isNaN(parsedTime)
    ? new Date(parsedTime + 4 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 86400000).toISOString();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: startDateStr,
    endDate: endDateStr,
    url: `https://tauzeclass.com.br/eventos/${id}`,
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: isOnline
      ? { '@type': 'VirtualLocation', url: `https://tauzeclass.com.br/eventos/${id}` }
      : {
          '@type': 'Place',
          name: event.location || (lang === 'es' ? 'Ubicación del Evento' : 'Local do Evento'),
          address: {
            '@type': 'PostalAddress',
            addressLocality: event.location || 'Brasil',
            addressCountry: 'BR',
          },
        },
    description: event.title,
    image: event.cover
      ? event.cover.startsWith('http')
        ? event.cover
        : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${event.cover}`
      : 'https://tauzeclass.com.br/assets/hero_farm.webp',
    organizer: { '@type': 'Organization', name: 'Tauze Class', url: 'https://tauzeclass.com.br' },
  };

  return (
    <div style={{ marginTop: 'var(--header-h)', flex: 1, paddingBottom: '4rem' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLd) }}
      />
      <div className="list-hero">
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label={lang === 'es' ? 'Navegación' : 'Navegação'} className="breadcrumb">
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
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): href
                  sem validação de protocolo — sem UI de admin pra este campo
                  hoje, mas fecha a lacuna por defesa em profundidade, mesmo
                  padrão de components/Header.tsx::sanitizeLogoUrl. */}
              <a href={isSafeExternalUrl(event.link) ? event.link : '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--clr-primary)' }}>
                {tt.officialSite}
              </a>
            </p>
          )}
          {/* BUG CORRIGIDO (achado de usabilidade): existia aqui uma seção
              "Descrição" que sempre mostrava o mesmo texto fixo de
              "nenhuma descrição disponível" — nenhuma query desta página
              mapeia (nem existe) uma coluna description em `eventos`
              (confirmado direto no banco), então a seção nunca teve
              conteúdo real pra nenhum evento. Removida em vez de manter um
              preenchimento fixo que nunca varia; se uma coluna real for
              adicionada no futuro, a seção volta a fazer sentido. */}
        </div>
      </div>
    </div>
  )
}
