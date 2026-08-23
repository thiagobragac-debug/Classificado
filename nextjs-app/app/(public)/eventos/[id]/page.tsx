import { notFound } from 'next/navigation'
import { createAnonClient } from '@/lib/supabase-server'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const revalidate = 3600; // ISR — eventos raramente mudam

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return { title: 'Evento não encontrado' };

  const sb = createAnonClient();
  const { data } = await sb
    .from('auction_events')
    .select('title, cover, date')
    .eq('id', id)
    .neq('status', 'draft')
    .single();

  if (!data) return { title: 'Evento não encontrado' };

  const coverUrl = data.cover
    ? data.cover.startsWith('http')
      ? data.cover
      : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${data.cover}`
    : undefined;

  const description = `Evento em ${new Date(data.date).toLocaleDateString('pt-BR')}`;

  return {
    title: data.title,
    description,
    alternates: { canonical: `https://tauzeclass.com.br/eventos/${id}` },
    openGraph: {
      title: data.title,
      description,
      url: `https://tauzeclass.com.br/eventos/${id}`,
      type: 'website',
      locale: 'pt_BR',
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

// Pré-renderizar os próximos 50 eventos mais próximos no build
export async function generateStaticParams() {
  try {
    const sb = createAnonClient();
    const { data } = await sb
      .from('auction_events')
      .select('id')
      .neq('status', 'draft')
      .gte('date', new Date().toISOString())
      .order('date', { ascending: true })
      .limit(50);

    return (data || []).map(ev => ({ id: ev.id }));
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

  // Validar formato UUID antes de qualquer query
  if (!UUID_REGEX.test(id)) {
    notFound()
  }

  // createAnonClient: dado público, sem necessidade de sessão
  const sb = createAnonClient()

  const { data: event } = await sb
    .from('auction_events')
    .select('id, title, date, cover, status')
    .eq('id', id)
    .neq('status', 'draft') // não exibir eventos em rascunho
    .single()

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
                <Link href="/">Início</Link>
                <span aria-hidden="true">›</span>
                <Link href="/eventos">Agenda de Eventos</Link>
                <span aria-hidden="true">›</span>
                <span aria-current="page">Detalhes</span>
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
              src={event.cover.startsWith('http') ? event.cover : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${event.cover}`}
              alt={event.title}
              fill
              style={{ objectFit: 'cover' }}
              priority
            />
          </div>
        )}

        <div style={{ background: 'var(--clr-surface)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--clr-border)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Informações do Evento</h2>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <strong>Data:</strong> {new Date(event.date).toLocaleDateString('pt-BR')}
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <strong>Local:</strong> {(event as any).location || 'Online'}
          </p>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Descrição</h3>
          <p style={{ color: 'var(--clr-text-muted)', lineHeight: 1.6 }}>
            {(event as any).description || 'Nenhuma descrição disponível para este evento.'}
          </p>
        </div>
      </div>
    </div>
  )
}
