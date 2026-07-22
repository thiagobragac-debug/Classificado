import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_URL, SUPABASE_ANON } from './supabase';

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
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Server version of getAds
export async function getServerAds({
  category, country, state, city, search, preco_min, preco_max,
  featured, page, cursor, limit = 20, status = 'active', user_id
}: any = {}) {
  const supabase = await createClient();
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
export async function getServerPlatformStats() {
  const supabase = await createClient();
  const { count: adsCount } = await supabase.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('verified', true);
  return {
    active_ads: adsCount || 0,
    cities_covered: 120, // Mocked as per original
    countries_covered: 4,
    verified_sellers: usersCount || 0,
  };
}

export async function getServerTopSellers() {
  const supabase = await createClient();
  const { data } = await supabase.from('top_sellers_view').select('*');
  return data || [];
}

export async function getServerTestimonials() {
  const supabase = await createClient();
  const { data } = await supabase.from('testimonials').select('*').order('created_at', { ascending: false });
  return data || [];
}
