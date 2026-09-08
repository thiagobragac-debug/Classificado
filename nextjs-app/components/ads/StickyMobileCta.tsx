'use client';

import { useEffect, useState } from 'react';
import { getCurrencySymbol, formatCurrencyAmount } from '@/lib/currency';
import { MobileMessageCtaButton } from './MobileMessageCtaButton';

// BUG CORRIGIDO (usuário reportou duplicação ao vivo, 2 prints diferentes):
// esta barra fixa mostra a mesma informação (preço, ação de contato) que já
// existe no topo do AdSidebar (components/ads/AdSidebar.tsx) — só que lá
// embaixo no DOM, depois de galeria+descrição+anúncios similares. Antes
// ficava visível o tempo todo, sobrepondo tanto o painel que duplica quanto
// (num 2º print) o rodapé do site quando o usuário rolava até o fim da
// página. Observa os dois elementos direto (ambos únicos e sempre
// presentes nesta página) e some quando qualquer um dos dois está visível.
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
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // O rodapé (components/Footer.tsx) tem 2 variantes — "simplificado" (sem
    // className, usado em /anuncio) e completa (.site-footer) — mas só uma
    // delas existe no DOM por vez, então a tag sozinha já é um seletor único.
    const targets = [
      document.querySelector('.product-info-panel'),
      document.querySelector('footer'),
    ].filter((el): el is Element => el !== null);

    if (targets.length === 0) return;

    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        setHidden(visible.size > 0);
      },
      { threshold: 0 }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  if (hidden) return null;

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
