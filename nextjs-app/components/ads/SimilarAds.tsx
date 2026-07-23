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
  let similarAds: any[] = [];
  
  if (!categoryId) return null;

  try {
    const baseQuery = supabase
      .from('ads')
      .select('id, title_pt, price, currency, price_unit_pt, images, city, state, featured, category_id, created_at, profiles(id, name)')
      .eq('status', 'active')
      .neq('id', currentAdId)
      .limit(10);

    // L1: Same category + city
    if (city) {
      const { data } = await supabase.from('ads')
        .select('id, title_pt, price, currency, price_unit_pt, images, city, state, featured, category_id, created_at')
        .eq('status', 'active').neq('id', currentAdId).eq('category_id', categoryId).eq('city', city).limit(10);
      
      if (data && data.length >= 4) {
        similarAds = data;
      }
    }

    // L2: Same category + state
    if (similarAds.length < 4 && state) {
      const { data } = await supabase.from('ads')
        .select('id, title_pt, price, currency, price_unit_pt, images, city, state, featured, category_id, created_at')
        .eq('status', 'active').neq('id', currentAdId).eq('category_id', categoryId).eq('state', state).limit(10);
      
      if (data && data.length >= 4) {
        similarAds = data;
      }
    }

    // L3: Same category global
    if (similarAds.length < 4) {
      const { data } = await supabase.from('ads')
        .select('id, title_pt, price, currency, price_unit_pt, images, city, state, featured, category_id, created_at')
        .eq('status', 'active').neq('id', currentAdId).eq('category_id', categoryId).limit(10);
      
      if (data && data.length > 0) {
        similarAds = data;
      }
    }

    // L4: Any recent ads
    if (similarAds.length === 0) {
      const { data } = await supabase.from('ads')
        .select('id, title_pt, price, currency, price_unit_pt, images, city, state, featured, category_id, created_at')
        .eq('status', 'active').neq('id', currentAdId).order('created_at', { ascending: false }).limit(8);
      
      if (data) {
        similarAds = data;
      }
    }
  } catch (error) {
    console.error('Error fetching similar ads:', error);
  }

  if (similarAds.length === 0) return null;

  return <SimilarAdsCarousel ads={similarAds} />;
}
