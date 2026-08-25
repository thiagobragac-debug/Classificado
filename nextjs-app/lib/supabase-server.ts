import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { SUPABASE_URL, SUPABASE_ANON } from './supabase';

export function createAnonClient() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, { 
    cookies: {
      getAll() { return []; },
      setAll() {}
    },
    global: {
      fetch: (url, options) => fetch(url, { ...options, next: { revalidate: 3600 } })
    }
  });
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have a proxy refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Server version of getAds — usa createAnonClient para dados públicos (cache eficiente)
export async function getServerAds({
  category, country, state, city, search, preco_min, preco_max,
  featured, page, cursor, limit = 20, status = 'active', user_id
}: any = {}) {
  const supabase = createAnonClient();
  const currentPage = cursor ? cursor : (page ? page : 1);
  const from = (currentPage - 1) * limit;

  let q = supabase
    .from('ads')
    .select('id, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at, profiles(name, avatar_url, verified, phone_whatsapp)')
    .eq('status', status)
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + limit);

  if (user_id)   q = q.eq('user_id', user_id);
  if (category)  q = q.eq('category_id', category);
  if (country)   q = q.eq('country', country);
  if (state)     q = q.eq('state', state);
  if (city)      q = q.eq('city', city);
  if (search)    q = q.textSearch('fts', search, { config: 'portuguese', type: 'plain' });
  if (preco_min) q = q.gte('price', preco_min);
  if (preco_max) q = q.lte('price', preco_max);
  if (featured)  q = q.eq('featured', true);

  const { data, error } = await q;
  if (error) throw error;

  const hasMore = data && data.length > limit;
  if (hasMore) data.pop();
  const nextCursor = hasMore ? currentPage + 1 : null;
  return { ads: data || [], total: null, nextCursor, hasMore };
}

// Server version of fetchPlatformStats
export const getServerPlatformStats = cache(async () => {
  const supabase = createAnonClient();

  // All 5 count queries run in parallel
  const today = new Date().toISOString();
  const [adsResult, usersResult, bovinosResult, maquinasResult, auctionsResult] = await Promise.all([
    supabase.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    // select('id', ...): profiles.is_admin/is_blocked deixaram de ter grant
    // público (achado de segurança 2026-08-24) — select('*') quebra até num
    // count com head:true.
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('verified', true),
    // BUG CORRIGIDO (teste completo do site, 2026-08-24): category_id real
    // dos anúncios usa o prefixo 'cat-' (ex: 'cat-bovinos', 'cat-maquinas' —
    // ver tabela categories.id). Sem o prefixo, estas duas contagens sempre
    // davam 0, mesmo com anúncios reais ativos nessas categorias.
    supabase.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('category_id', 'cat-bovinos'),
    supabase.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('category_id', 'cat-maquinas'),
    supabase.from('auction_events').select('*', { count: 'exact', head: true }).neq('status', 'draft').gte('date', today),
  ]);

  return {
    total_ads:      adsResult.count      || 0,
    total_sellers:  usersResult.count    || 0,
    total_bovinos:  bovinosResult.count  || 0,
    total_machines: maquinasResult.count || 0,
    total_auctions: auctionsResult.count || 0,
    total_cities:   120,
    total_countries: 4,
  };
});

export const getServerFeaturedAds = cache(async (city?: string, state?: string, country?: string, limit: number = 4) => {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .rpc('get_localized_featured_ads', { 
      p_city: city || null, 
      p_state: state || null, 
      p_country: country || null, 
      p_limit: limit 
    })
    .select('id, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at, profiles(name, avatar_url, verified, phone_whatsapp)');
    
  if (error) {
    console.error("Error fetching localized featured ads", error);
    return [] as any[];
  }
  return (data as any[]) || [];
});

export const getServerRecentAds = cache(async (city?: string, state?: string, country?: string, limit: number = 10) => {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .rpc('get_localized_recent_ads', { 
      p_city: city || null, 
      p_state: state || null, 
      p_country: country || null, 
      p_limit: limit,
      p_offset: 0
    })
    .select('id, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at, profiles(name, avatar_url, verified, phone_whatsapp)')
    .limit(limit);
    
  if (error) {
    console.error("Error fetching localized recent ads", error);
    return { ads: [], hasMore: false };
  }

  const rows = ((data as any[]) || []).slice(0, limit);
  const hasMore = rows.length === limit;
  return { ads: rows, hasMore };
});

export const getServerTopSellers = cache(async (city?: string, state?: string, country?: string, limit: number = 4) => {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .rpc('get_localized_top_sellers', {
      p_city: city || null,
      p_state: state || null,
      p_country: country || null,
      p_limit: limit
    });
    
  if (error) {
    console.error("Error fetching localized top sellers", error);
    return [];
  }
  return data || [];
});

export const getServerTestimonials = cache(async () => {
  const supabase = createAnonClient();
  const { data } = await supabase.from('testimonials').select('*').order('created_at', { ascending: false });
  return data || [];
});

export async function getServerUpcomingEvents(city?: string, state?: string, country?: string, limit: number = 4) {
  const supabase = createAnonClient();
  const today = new Date().toISOString();
  
  // Buscar leilões
  const { data: auctionsData } = await supabase
    .from('auction_events')
    .select('id, title, date, cover, status, youtube, catalog')
    .in('status', ['live', 'scheduled'])
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(limit);

  // Buscar feiras/eventos
  const { data: eventosData } = await supabase
    .from('eventos')
    .select('id, title, date, image, location_str, link')
    .limit(limit);

  // Normalizar e mesclar
  const normalizedAuctions = (auctionsData || []).map(a => ({
    id: a.id,
    title: a.title,
    date: a.date,
    cover: a.cover,
    location: undefined,
    status: a.status,
    youtube: a.youtube,
    catalog: a.catalog,
    type: 'auction'
  }));

  const normalizedEventos = (eventosData || []).map(e => ({
    id: e.id,
    title: e.title,
    date: e.date, // pode ser string "30 ago - 7 set 2026"
    cover: e.image,
    location: e.location_str,
    link: e.link,
    type: 'evento'
  }));

  const merged = [...normalizedAuctions, ...normalizedEventos];

  // Ordenar (os eventos podem ter strings de data, vamos tentar ordenar)
  merged.sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    const validA = !isNaN(timeA) ? timeA : Date.now() + 86400000; // joga pro final se inválido
    const validB = !isNaN(timeB) ? timeB : Date.now() + 86400000;
    return validA - validB;
  });

  return merged.slice(0, limit);
}

export async function getServerCategories() {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  return data || [];
}
