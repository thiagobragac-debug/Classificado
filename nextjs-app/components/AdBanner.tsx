'use client';

import { useEffect, useState } from 'react';
import { useGeoLocation } from '@/lib/useGeoLocation';
import { getBanners } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';

const FALLBACK_NAME = { pt: 'Anuncie Aqui', es: 'Anúnciese Aquí' } as const;

export function AdBanner({ position }: { position: string }) {
  const { lang } = useLang();
  const { geo, loading: geoLoading } = useGeoLocation();
  const [banner, setBanner] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (geoLoading) return; // Espera a geolocalização terminar
    
    let isMounted = true;
    
    getBanners(position, geo).then(banners => {
      if (!isMounted) return;
      if (banners && banners.length > 0) {
        setBanner(banners[0]);
      } else {
        setBanner(null);
      }
      setLoading(false);
    }).catch(e => {
      console.error('Falha ao carregar banners:', e);
      if (isMounted) setLoading(false);
    });

    return () => { isMounted = false; };
  }, [position, geo, geoLoading]);

  const isSidebar = position.includes('sidebar');
  const heightStyle = isSidebar ? '250px' : '120px';

  if (loading || geoLoading) {
    return null; // Não renderiza nada enquanto carrega
  }

  // Se não houver banner ativo vindo do banco, usamos os fallbacks "Anuncie Aqui"
  const activeBanner = banner || {
    image_url: isSidebar ? '/assets/banner_sidebar_1.webp' : '/assets/banner_sponsor_1.webp',
    link_url: '/planos', // BUG CORRIGIDO (varredura cruzada): '/contato' não existe (404 confirmado ao vivo)
    name: FALLBACK_NAME[lang]
  };

  const imageUrl = activeBanner.image_url || activeBanner.image || '';
  const linkUrl = activeBanner.link_url || activeBanner.link || '#';
  const bannerName = activeBanner.name || 'Banner';

  // BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): blocklist
  // `startsWith('javascript')` bypassável com maiúsculas ou espaço/tab
  // inicial (ex: " javascript:..."). link_url vem de um campo de texto
  // livre no admin (banners), renderizado em target="_blank" pra todo
  // visitante — allowlist de protocolo em vez de blocklist, mesmo critério
  // de sanitizeLogoUrl em components/Header.tsx. Rotas internas relativas
  // (ex: '/planos') continuam permitidas sem passar pelo parser de URL
  // absoluta.
  const safeLink = (() => {
    // BUG CORRIGIDO (re-auditoria, 2026-08-30): "//evil.com" também começa
    // com '/' — é uma URL protocol-relative que o browser resolve pro
    // protocolo atual (https:), então "aceitar por começar com /" deixava
    // passar um domínio externo sem cair no parser de URL absoluta abaixo.
    if (linkUrl.startsWith('/') && !linkUrl.startsWith('//')) return linkUrl;
    try {
      const parsed = new URL(linkUrl);
      if (['http:', 'https:'].includes(parsed.protocol)) return linkUrl;
    } catch {
      // URL absoluta inválida — cai no fallback abaixo
    }
    return '#';
  })();

  return (
    <div className="promo-container" style={{
      width: '100%',
      height: heightStyle,
      position: 'relative',
      margin: '1.5rem 0',
      overflow: 'hidden',
      borderRadius: '12px',
      background: 'var(--clr-surface-alt, #f1f5f9)',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
    }}>
      <a href={safeLink} target="_blank" rel="noopener sponsored" style={{ display: 'block', width: '100%', height: '100%', position: 'relative' }}>
        <img 
          src={imageUrl} 
          alt={bannerName} 
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85, transition: 'opacity 0.3s' }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseOut={(e) => (e.currentTarget.style.opacity = '0.85')}
          loading="lazy"
          decoding="async"
        />
      </a>
    </div>
  );
}
