import AuctionsBrowser from '@/components/auctions/AuctionsBrowser';

export const metadata = {
  title: 'Leilões - Tauze Class',
  description: 'Acompanhe os próximos leilões virtuais, dê seus lances e faça ótimos negócios.',
};

export default function LeiloesPage() {
  return (
    <>
      <AuctionsBrowser />
    </>
  );
}
