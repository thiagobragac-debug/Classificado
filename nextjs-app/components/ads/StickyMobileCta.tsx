'use client';

import { useEffect, useState } from 'react';
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency';
import { MobileMessageCtaButton } from './MobileMessageCtaButton';

// BUG CORRIGIDO (usuário reportou duplicação ao vivo, print mobile mostrando
// preço + botão de contato repetidos na mesma tela): esta barra fixa mostra
// exatamente a mesma informação (preço, ação de contato) que já existe no
// topo do AdSidebar (components/ads/AdSidebar.tsx) — só que lá embaixo no
// DOM, depois de galeria+descrição+anúncios similares. Antes ela ficava
// visível o tempo todo, inclusive sobrepondo o próprio painel que duplica.
// Agora escuta o evento "ad:sidebarvisible" (disparado pelo AdSidebar via
// IntersectionObserver, mesmo padrão de comunicação entre árvores já usado
// em "ad:openmessageform") e se esconde assim que o painel real entra na
// tela — continua útil enquanto o usuário rola pela galeria/descrição, mas
// para de duplicar quando a informação real já está visível.
interface StickyMobileCtaProps {
  price: number | null;
  currency: string | null;
  lang: 'pt' | 'es';
  hasWhatsapp: boolean;
  adId: string;
  priceLabel: string;
  priceOnRequest: string;
  talkToSeller: string;
  sendMessageCta: string;
}

export function StickyMobileCta({
  price,
  currency,
  lang,
  hasWhatsapp,
  adId,
  priceLabel,
  priceOnRequest,
  talkToSeller,
  sendMessageCta,
}: StickyMobileCtaProps) {
  const [sidebarVisible, setSidebarVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ visible: boolean }>).detail;
      setSidebarVisible(!!detail?.visible);
    };
    window.addEventListener('ad:sidebarvisible', handler);
    return () => window.removeEventListener('ad:sidebarvisible', handler);
  }, []);

  if (sidebarVisible) return null;

  return (
    <div className="sticky-cta-mobile">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="ad-mobile-cta-price-label">{priceLabel}</span>
          <strong className="ad-mobile-cta-price-value">
            {price
              ? `${getCurrencySymbol(currency)} ${formatCurrencyAmount(price, lang === 'es' ? 'es' : 'pt')}`
              : priceOnRequest}
          </strong>
        </div>
        {hasWhatsapp ? (
          <a
            href={`/api/contact-seller?adId=${adId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--accent ad-mobile-cta-button"
          >
            {talkToSeller}
          </a>
        ) : (
          <MobileMessageCtaButton label={sendMessageCta} />
        )}
      </div>
    </div>
  );
}
