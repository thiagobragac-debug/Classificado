import Link from 'next/link'
import Image from 'next/image'
import { getLocale } from '@/lib/locale-server'

interface LoginBannerProps {
  logoUrl: string | null
}

// Strings exclusivas deste banner (não usadas em nenhuma outra parte do
// site) — seguindo o padrão de TRANSLATIONS local já usado em
// components/ads/AdsSidebar.tsx, sem poluir o dicionário global I18N.
const TRANSLATIONS = {
  pt: {
    alt: 'Fundo rural agro',
    titleLine1: 'O agronegócio do',
    titleHighlight: 'Brasil',
    titleLine2: 'em um só lugar.',
    subtitle: 'Anuncie gratuitamente para milhares de compradores no Brasil, Argentina, Paraguai e Uruguai.',
    badgeFree: 'Gratuito para anunciar',
    badgeMercosul: 'Mercosul completo',
    badgeAds: '62.000+ anúncios',
  },
  es: {
    alt: 'Fondo rural agro',
    titleLine1: 'El agronegocio de',
    titleHighlight: 'Brasil',
    titleLine2: 'en un solo lugar.',
    subtitle: 'Publica gratis para miles de compradores en Brasil, Argentina, Paraguay y Uruguay.',
    badgeFree: 'Gratis para publicar',
    badgeMercosul: 'Mercosur completo',
    badgeAds: '62.000+ anuncios',
  },
} as const

export async function LoginBanner({ logoUrl }: LoginBannerProps) {
  const lang = await getLocale()
  const tr = TRANSLATIONS[lang]

  return (
    <div className="login-banner">
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Image
          src="/assets/hero_farm.webp"
          alt={tr.alt}
          fill
          priority
          style={{ objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.8), rgba(6, 78, 59, 0.8))' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Link href="/" className="logo" style={{ marginBottom: '3rem', filter: 'brightness(0) invert(1)', textDecoration: 'none' }}>
        {logoUrl ? (
          <div className="logo-mark" style={{
            backgroundImage: `url('${logoUrl}')`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'left center',
            backgroundColor: 'transparent',
            borderColor: 'transparent'
          }}></div>
        ) : (
          <div className="logo-mark" style={{ background: 'var(--clr-primary)', color: 'white', borderColor: 'white' }}>TC</div>
        )}
        <div className="logo-text">
          <span className="logo-name" style={{ fontSize: '1.4rem' }}>Tauze Class</span>
          <span className="logo-tagline" style={{ color: 'rgba(255,255,255,0.7)' }}>CLASSIFICADOS AGRO</span>
        </div>
      </Link>

      <h2>{tr.titleLine1} <br/><span style={{ color: '#F59E0B' }}>{tr.titleHighlight}</span><br/> {tr.titleLine2}</h2>
      <p>{tr.subtitle}</p>

      <div className="login-badges">
        <span className="badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          {tr.badgeFree}
        </span>
        <span className="badge"><span style={{fontSize:'14px'}}>🌎</span> {tr.badgeMercosul}</span>
        <span className="badge"><span style={{fontSize:'14px'}}>🏷️</span> {tr.badgeAds}</span>
      </div>
      </div>
    </div>
  )
}
