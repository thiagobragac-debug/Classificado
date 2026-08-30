'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { detectLocation } from '@/lib/useGeoLocation'
import { showToast } from '@/lib/toast'
import { t as _t, Lang } from '@/lib/constants'

export default function EventSearch({ lang = 'pt' }: { lang?: Lang }) {
  const t = (key: string) => _t(key, lang)
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [isLocating, setIsLocating] = useState(false)

  // Atualiza o input se a URL mudar externamente
  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '')
  }, [searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/eventos?q=${encodeURIComponent(searchQuery.trim())}`)
    } else {
      router.push('/eventos')
    }
  }

  const handleGetLocation = async () => {
    setIsLocating(true)
    // BUG CORRIGIDO (varredura cruzada de cenários): detectLocation() sem
    // `lang` sempre usava o default 'pt' internamente (afeta a chave de
    // cache e qualquer texto localizado retornado), ignorando o idioma
    // ativo do visitante.
    const loc = await detectLocation(lang)
    setIsLocating(false)
    
    if (loc && (loc.city || loc.state)) {
      const locationTerm = `${loc.city || ''}${loc.city && loc.state ? ', ' : ''}${loc.state || ''}`
      setSearchQuery(locationTerm)
      showToast(t('events_location_success'), 'success')
      router.push(`/eventos?q=${encodeURIComponent(locationTerm)}`)
    } else {
      showToast(t('events_location_error'), 'error')
    }
  }

  return (
    <div className="hero-search-box" style={{ margin: 0, transform: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '420px', position: 'relative' }}>
      <form onSubmit={handleSearch} className="hero-search-inner" style={{ display: 'flex', width: '100%' }}>
        <button
          type="button"
          className="hero-search-btn hero-search-btn-icon"
          style={{ background: 'transparent', color: 'var(--clr-primary)', boxShadow: 'none', padding: '0 16px', opacity: isLocating ? 0.5 : 1 }}
          title={t('events_use_gps')}
          onClick={handleGetLocation}
          disabled={isLocating}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </button>
        <input
          type="text"
          placeholder={isLocating ? t('events_locating') : t('events_search_placeholder')}
          style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: '16px', width: '100%', borderTop: 'none', borderRight: 'none', borderBottom: 'none', outline: 'none' }}
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isLocating}
        />
        {/* BUG CORRIGIDO (achado de usabilidade): o único jeito de limpar a
            busca era o link "Limpar busca e ver todos", que só aparecia
            quando a busca dava ZERO resultados (ver page.tsx) — com
            resultados, não havia atalho nenhum pra limpar. Este botão "x"
            aparece sempre que houver texto no campo, independente de haver
            resultados. */}
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              router.push('/eventos')
            }}
            aria-label={t('events_clear_search')}
            title={t('events_clear_search')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: '1rem', lineHeight: 1 }}
          >
            ✕
          </button>
        )}
        <button type="submit" className="hero-search-btn">{t('events_search_btn')}</button>
      </form>
    </div>
  )
}
