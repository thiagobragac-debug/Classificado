'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useGeoLocation } from '@/lib/useGeoLocation';
import { getBanners } from '@/lib/supabase';
import { useLang } from '@/lib/lang-context';

const FALLBACK_NAME = { pt: 'Anuncie Aqui', es: 'Anúnciese Aquí' } as const;

// GAP FECHADO (pedido do usuário, achado ao vivo revisando /anuncio/[slug]):
// a posição "Anuncie Aqui" tinha só 2 estados — banner real cadastrado
// (segmentado por geolocalização, ver getBanners() em lib/supabase.ts) ou um
// placeholder estático (placehold.co) apontando pra /planos. Nenhum dos dois
// gera receita quando não existe anunciante direto pra aquela posição/
// região. AdSense entra como um TERCEIRO nível, só quando os dois primeiros
// não têm nada pra mostrar — nunca substitui banner direto vendido (que
// paga mais, é relevante pro nicho) nem precisa de nenhuma configuração pra
// continuar funcionando exatamente como hoje.
function useAdsenseConfig(position: string) {
  const [config, setConfig] = useState<{ clientId: string; slotId: string } | null>(null);
  useEffect(() => {
    // Mesmo mecanismo de tc_logo_url/social_instagram — Header.tsx já
    // sincroniza toda chave não-secreta de platform_settings pro
    // localStorage. adsense_client_id e os slots por posição NÃO são
    // segredo: um client id/slot do AdSense é público por definição (sai
    // no HTML da página pra qualquer visitante ver), diferente das chaves
    // de gateway/e-mail.
    const clientId = localStorage.getItem('adsense_client_id');
    const slotId = localStorage.getItem(`adsense_slot_${position}`);
    if (clientId && slotId) setConfig({ clientId, slotId });
  }, [position]);
  return config;
}

function AdSenseUnit({ clientId, slotId, heightStyle }: { clientId: string; slotId: string; heightStyle: string }) {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current || !insRef.current) return;
    try {
      // @ts-expect-error -- adsbygoogle é injetado pelo script do Google, sem tipos.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // Script do Google ainda não carregou nesta renderização — o próprio
      // <Script onLoad> mais abaixo cobre o carregamento inicial; nada mais
      // a fazer aqui além de não travar a página se isso falhar.
    }
  }, []);

  return (
    <>
      <Script
        id="adsense-loader"
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
        crossOrigin="anonymous"
      />
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: heightStyle }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </>
  );
}

export function AdBanner({ position }: { position: string }) {
  const { lang } = useLang();
  const { geo, loading: geoLoading } = useGeoLocation();
  const [banner, setBanner] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const adsenseConfig = useAdsenseConfig(position);

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

  // Sem banner direto (nem segmentado por geo, nem global) cadastrado pra
  // esta posição, mas AdSense configurado pro admin: preenche o espaço com
  // AdSense em vez do placeholder estático — banner direto sempre tem
  // prioridade quando existe.
  if (!banner && adsenseConfig) {
    return (
      <div className="promo-container" style={{ width: '100%', height: heightStyle, margin: '1.5rem 0' }}>
        <AdSenseUnit clientId={adsenseConfig.clientId} slotId={adsenseConfig.slotId} heightStyle={heightStyle} />
      </div>
    );
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
      {/* <img> comum, não next/image: image_url é um campo de texto livre no
          admin (banners), qualquer host — next/image derruba a página
          inteira via error boundary quando o host não está em
          next.config.ts remotePatterns. Mesmo padrão documentado em
          components/home/TopSellersSection.tsx pro mesmo tipo de risco. */}
      <a href={safeLink} target="_blank" rel="noopener sponsored" style={{ display: 'block', width: '100%', height: '100%', position: 'relative' }}>
        <img
          src={imageUrl}
          alt={bannerName}
          // BUG CORRIGIDO (achado ao vivo pelo usuário: banner "Anuncie Aqui"
          // gigante/cortado na página de anúncio): objectFit:'cover' presume
          // que a imagem tem aspect-ratio parecido com o slot. Isso é
          // verdade pra listagem_sidebar (coluna estreita, ~300px), mas
          // anuncio_sidebar renderiza numa faixa full-width no fim da
          // página (.ad-banner-col, grid-column:1/-1) — uma imagem quase
          // quadrada (o placeholder ativo hoje é 300x250) cobria a faixa
          // inteira ampliando e cortando o texto até ficar irreconhecível.
          // 'contain' garante a imagem inteira sempre visível, sem distorcer/
          // cortar, não importa o aspect-ratio do slot ou da arte cadastrada.
          style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.85, transition: 'opacity 0.3s' }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseOut={(e) => (e.currentTarget.style.opacity = '0.85')}
          loading="lazy"
          decoding="async"
        />
      </a>
    </div>
  );
}
