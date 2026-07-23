import Link from 'next/link'
import Image from 'next/image'

interface LoginBannerProps {
  logoUrl: string | null
}

export function LoginBanner({ logoUrl }: LoginBannerProps) {
  return (
    <div className="login-banner">
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Image 
          src="/assets/hero_farm.webp" 
          alt="Fundo rural agro" 
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

      <h2>O agronegócio do <br/><span style={{ color: '#F59E0B' }}>Brasil</span><br/> em um só lugar.</h2>
      <p>Anuncie gratuitamente para milhares de compradores no Brasil, Argentina, Paraguai e Uruguai.</p>

      <div className="login-badges">
        <span className="badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> 
          Gratuito para anunciar
        </span>
        <span className="badge"><span style={{fontSize:'14px'}}>🌎</span> Mercosul completo</span>
        <span className="badge"><span style={{fontSize:'14px'}}>🏷️</span> 62.000+ anúncios</span>
      </div>
      </div>
    </div>
  )
}
