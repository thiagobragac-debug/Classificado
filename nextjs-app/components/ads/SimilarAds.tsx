import { createClient } from '@supabase/supabase-js';
import { SimilarAdsCarousel } from './SimilarAdsCarousel';
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/supabase';

// Fallback to anonymous client for server component fetching
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

interface SimilarAdsProps {
  currentAdId: string;
  categoryId: string | null;
  city: string | null;
  state: string | null;
}

export async function SimilarAds({ currentAdId, categoryId, city, state }: SimilarAdsProps) {
  if (!categoryId) return null;

  const MAX_ADS = 10;
  const similarAds: any[] = [];
  const seenIds = new Set<string>([currentAdId]);

  const addAds = (ads: any[] | null) => {
    if (!ads) return false;
    for (const ad of ads) {
      if (!seenIds.has(ad.id)) {
        similarAds.push(ad);
        seenIds.add(ad.id);
      }
      if (similarAds.length >= MAX_ADS) return true; // Full
    }
    return false; // Not full yet
  };

  // BUG CORRIGIDO (validação do zero, rodada 6): faltava title_es/
  // price_unit_es — mesma classe de bug já corrigida em getAdsListagem
  // (lib/services/ads.service.ts) — SimilarAdsCarousel.tsx sempre caía no
  // fallback _pt mesmo com tradução real preenchida, porque a coluna nem
  // chegava até o componente.
  const fields = 'id, slug, title_pt, title_es, price, currency, price_unit_pt, price_unit_es, images, city, state, featured, category_id, created_at, profiles!inner(id, name)';

  try {
    // Níveis 1 (cidade) e 2 (estado): BUG CORRIGIDO (achado ao vivo,
    // auditoria de lentidão 2026-09-24) — eram 2 round-trips SEQUENCIAIS
    // mesmo sendo consultas independentes uma da outra (nenhuma depende do
    // resultado da outra pra montar a query). Promise.all roda as duas em
    // paralelo; addAds() continua chamado na mesma ordem de prioridade
    // (cidade primeiro, depois estado) então o merge final fica idêntico a
    // antes — só a latência de rede que deixa de somar.
    const [cityData, stateData] = await Promise.all([
      city
        ? supabase.from('ads').select(fields).eq('status', 'active').neq('id', currentAdId).eq('category_id', categoryId).eq('city', city).limit(MAX_ADS).then(r => r.data)
        : Promise.resolve(null),
      state
        ? supabase.from('ads').select(fields).eq('status', 'active').neq('id', currentAdId).eq('category_id', categoryId).eq('state', state).limit(MAX_ADS).then(r => r.data)
        : Promise.resolve(null),
    ]);

    if (addAds(cityData)) throw new Error('FULL'); // Short-circuit
    if (addAds(stateData)) throw new Error('FULL');

    // Nível 3: Mesma Categoria global (País/Qualquer lugar)
    const { data: dataCountry } = await supabase.from('ads')
      .select(fields)
      .eq('status', 'active')
      .neq('id', currentAdId)
      .eq('category_id', categoryId)
      .limit(MAX_ADS);
    
    if (addAds(dataCountry)) throw new Error('FULL');

    // Nível 4: Recentes global (Apenas se a categoria estiver muito vazia, < 4 anúncios)
    if (similarAds.length < 4) {
      const { data: dataFallback } = await supabase.from('ads')
        .select(fields)
        .eq('status', 'active')
        .neq('id', currentAdId)
        .order('created_at', { ascending: false })
        .limit(MAX_ADS);
      
      addAds(dataFallback);
    }
  } catch (error: any) {
    if (error.message !== 'FULL') {
      console.error('Error fetching similar ads:', error);
    }
  }

  if (similarAds.length === 0) return null;

  return <SimilarAdsCarousel ads={similarAds} />;
}
