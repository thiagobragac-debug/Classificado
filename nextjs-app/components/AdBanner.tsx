'use client';

import { useEffect, useState } from 'react';
import { useGeoLocation } from '@/lib/useGeoLocation';
import { getBanners } from '@/lib/supabase';

export function AdBanner({ position }: { position: string }) {
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

  if (loading || geoLoading || !banner) {
    return null; // Não renderiza nada se estiver carregando ou não houver banner ativo
  }

  const isSidebar = position.includes('sidebar');
  const heightStyle = isSidebar ? '250px' : '120px';
  const imageUrl = banner.image_url || banner.image || '';
  const linkUrl = banner.link_url || banner.link || '#';
  const bannerName = banner.name || 'Banner';

  // Sanitizar URL relativa/absoluta
  const safeLink = linkUrl.startsWith('javascript') ? '#' : linkUrl;

  return (
    <div className="ad-banner-wrapper" style={{
      width: '100%',
      height: heightStyle,
      position: 'relative',
      margin: '1.5rem 0',
      overflow: 'hidden',
      borderRadius: '12px',
      background: '#000',
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
