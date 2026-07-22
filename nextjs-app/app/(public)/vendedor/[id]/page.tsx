import { Suspense } from 'react';
import AdsBrowser from '@/components/ads/AdsBrowser';
import SellerProfileHeader from '@/components/seller/SellerProfileHeader';

export default function VendedorPage({ params }: { params: { id: string } }) {
  return (
    <main style={{ marginTop: 'var(--header-h)', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="seller-cover" style={{ height: '250px', background: "url('https://placehold.co/1920x400/16a34a/ffffff?text=Capa+Fazenda') center/cover", position: 'relative' }}></div>
      <div style={{ marginTop: '-80px', position: 'relative', zIndex: 10 }}>
        <SellerProfileHeader sellerId={params.id} />
      </div>
      <Suspense fallback={<p style={{ textAlign: 'center', padding: '2rem' }}>Carregando anúncios do vendedor...</p>}>
        <AdsBrowser sellerId={params.id} hideHero />
      </Suspense>
    </main>
  );
}
