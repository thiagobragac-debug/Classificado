import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Image from 'next/image'
import Link from 'next/link'

export default async function EventDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = await createClient()

  const { data: event } = await sb
    .from('auction_events')
    .select('*')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  return (
    <main style={{ marginTop: 'var(--header-h)', flex: 1, paddingBottom: '4rem' }}>
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
        <div style={{ position: 'relative', width: '100%', height: '400px', backgroundColor: '#f1f5f9', borderRadius: '1rem', overflow: 'hidden', marginBottom: '2rem' }}>
          <Image 
            src={event.cover || 'https://via.placeholder.com/1200x600'} 
            alt={event.title}
            fill
            style={{ objectFit: 'cover' }}
          />
        </div>
        
        <div style={{ background: 'var(--clr-surface)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--clr-border)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Informações do Evento</h2>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <strong>Data:</strong> {new Date(event.date).toLocaleDateString('pt-BR')}
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <strong>Local:</strong> {event.location || 'Online'}
          </p>
          
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Descrição</h3>
          <p style={{ color: 'var(--clr-text-muted)', lineHeight: 1.6 }}>
            {event.description || 'Nenhuma descrição disponível para este evento.'}
          </p>
        </div>
      </div>
    </main>
  )
}
