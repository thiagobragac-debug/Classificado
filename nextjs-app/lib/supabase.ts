// ============================================
//   TAUZE CLASS — Supabase Client (Next.js)
//   Mesma lógica do supabase.js original,
//   agora tipada e compatível com SSR.
// ============================================

import { createBrowserClient } from '@supabase/ssr';

export const SUPABASE_URL  = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

// Singleton do cliente (browser)
let _sb: ReturnType<typeof createBrowserClient> | null = null;
export function getSupabase() {
  if (!_sb) {
    _sb = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return _sb;
}

// ─── AUTH ─────────────────────────────────────────────────────

export async function getSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) return null;
  return data?.session ?? null;
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('id, name, display_name, avatar_url, verified, plan, country, pais')
    .eq('id', session.user.id)
    .maybeSingle();
  return { ...session.user, profile };
}

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signupWithEmail(email: string, password: string, name: string) {
  const { data, error } = await getSupabase().auth.signUp({
    email, password, options: { data: { name } }
  });
  if (error) throw error;
  return data;
}

export async function loginWithGoogle() {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: (typeof window !== 'undefined' ? window.location.origin : '') + '/painel' }
  });
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { data, error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/login?mode=reset`
  });
  if (error) throw error;
  return data;
}

export async function logout() {
  await getSupabase().auth.signOut();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('tc_favorites');
    localStorage.removeItem('tc_user_initials');
    localStorage.removeItem('tc_user_id');
  }
  if (typeof window !== 'undefined') window.location.href = '/?logout=success';
}

// ─── ANÚNCIOS ─────────────────────────────────────────────────

export interface AdFilters {
  category?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  search?: string | null;
  preco_min?: number | null;
  preco_max?: number | null;
  featured?: boolean | null;
  page?: number;
  cursor?: number | null;
  limit?: number;
  status?: string;
  user_id?: string | null;
  signal?: AbortSignal;
}

export async function getAds({
  category, country, state, city, search, preco_min, preco_max,
  featured, page, cursor, limit = 20, status = 'active', user_id, signal
}: AdFilters = {}) {
  const currentPage = cursor ? cursor : (page ? page : 1);
  const from = (currentPage - 1) * limit;

  let q = getSupabase()
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
  if (signal)    q = q.abortSignal(signal);

  const { data, error } = await q;
  if (error) throw error;

  const hasMore = data && data.length > limit;
  if (hasMore) data.pop();
  const nextCursor = hasMore ? currentPage + 1 : null;
  return { ads: data || [], total: null, nextCursor, hasMore };
}

export async function getAdById(id: string) {
  const { data, error } = await getSupabase()
    .from('ads')
    .select('*, profiles(id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at), categories(name_pt, name_es, icon)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function createAd(payload: any) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  payload.user_id = session.user.id;
  const { data, error } = await getSupabase().from('ads').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function updateAd(id: string, payload: any) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  const { data, error } = await getSupabase().from('ads').update(payload).eq('id', id).eq('user_id', session.user.id).select().single();
  if (error) throw error;
  return data;
}

export async function uploadAdImage(file: File, folder = 'draft'): Promise<string | null> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${session.user.id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;
  
  const { data, error } = await getSupabase().storage.from('ads-images').upload(fileName, file, {
    cacheControl: '31536000',
    upsert: false
  });
  
  if (error) throw error;
  
  const { data: { publicUrl } } = getSupabase().storage.from('ads-images').getPublicUrl(fileName);
  return publicUrl;
}

// ─── FAVORITOS ─────────────────────────────────────────────────

export async function rpcToggleFav(adId: string) {
  const session = await getSession();
  if (!session) return false;
  const { data, error } = await getSupabase().rpc('toggle_favorite_atomic', {
    p_user_id: session.user.id, p_ad_id: adId
  });
  if (error) throw error;
  return data;
}

export async function getMyFavorites() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('favorites')
    .select('*, ads(*, profiles(name))')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((f: any) => f.ads);
}

// ─── MENSAGENS ─────────────────────────────────────────────────

export async function getMyMessages() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('messages')
    .select('*, ads(title_pt, images), sender:profiles!messages_sender_id_fkey(name, avatar_url), receiver:profiles!messages_receiver_id_fkey(name, avatar_url)')
    .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function sendMessage(adId: string, receiverId: string, content: string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { data, error } = await getSupabase().from('messages').insert({
    ad_id: adId, sender_id: session.user.id, receiver_id: receiverId, content
  }).select().maybeSingle();
  if (error) throw error;
  return data;
}

export function subscribeToMessages(userId: string, callback: (payload: any) => void) {
  const channel = getSupabase()
    .channel('messages')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `receiver_id=eq.${userId}`
    }, callback);
  channel.subscribe();
  return channel;
}

// ─── STATS ─────────────────────────────────────────────────────

export async function fetchPlatformStats() {
  try {
    const sb = getSupabase();
    const [
      { count: adsCount },
      { count: auctionsCount },
      { count: bovinosCount },
      { count: maquinasCount },
      { data: settings }
    ] = await Promise.all([
      sb.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('auctions').select('*', { count: 'exact', head: true }).eq('status', 'live'),
      sb.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('category_id', 'cat-bovinos'),
      sb.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('category_id', 'cat-maquinas'),
      sb.from('platform_settings').select('key, value'),
    ]);
    const sMap: Record<string, string> = {};
    if (settings) settings.forEach((s: any) => sMap[s.key] = s.value);
    const getVal = (key: string, realCount: number | null) => {
      const adminVal = parseInt(sMap[key] || '0');
      return (realCount || 0) + adminVal;
    };
    return {
      total_bovinos: getVal('tc_cnt_bovinos', bovinosCount),
      total_sellers: getVal('tc_cnt_users', 0),
      total_auctions: getVal('tc_cnt_auctions', auctionsCount),
      total_machines: getVal('tc_cnt_maquinas', maquinasCount),
      total_ads: getVal('tc_cnt_ads', adsCount),
      total_countries: getVal('tc_cnt_paises', 4),
      total_cities: getVal('tc_cnt_cidades', 120),
      format: sMap['tc_cnt_format'] || 'k',
      plus: sMap['tc_cnt_plus'] !== 'false'
    };
  } catch (e) {
    console.error('Erro em fetchPlatformStats:', e);
    return null;
  }
}

// ─── LEILÕES ───────────────────────────────────────────────────

export async function getAuctions({ status = 'live', limit = 20 } = {}) {
  const { data, error } = await getSupabase()
    .from('auctions')
    .select('*, ads(title_pt, images, price, category_id), profiles(name)')
    .eq('status', status)
    .order('end_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function placeBid(auctionId: string, amount: number | string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  // Sanitização de entrada: aceita "1.500,00" (formato BR) ou "1500.00"
  const sanitized = typeof amount === 'string'
    ? amount.replace(/\./g, '').replace(',', '.')
    : amount;
  const numAmount = Number(sanitized);
  if (!isFinite(numAmount) || numAmount <= 0) throw new Error('Valor do lance inválido.');
  const { data, error } = await getSupabase().rpc('place_bid_atomic', {
    p_auction_id: auctionId, p_user_id: session.user.id, p_amount: numAmount
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Erro ao processar lance.');
  return data;
}

// ─── BANNERS ────────────────────────────────────────────────────

export async function getBanners(position: string, userLoc: any = null) {
  const { data } = await getSupabase()
    .from('banners')
    .select('id, image_url, link_url, name, target_type, target_location')
    .eq('position', position)
    .eq('status', 'active')
    .limit(20);
  const allBanners = data || [];
  if (!userLoc) return allBanners;
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const locCity = norm(userLoc.city);
  const locState = norm(userLoc.state);
  const locCountry = norm(userLoc.country);
  const cityB: any[] = [], stateB: any[] = [], countryB: any[] = [], globalB: any[] = [];
  for (const b of allBanners) {
    const type = b.target_type || 'global';
    const loc = norm(b.target_location);
    if (type === 'city' && loc === locCity) cityB.push(b);
    else if (type === 'state' && loc === locState) stateB.push(b);
    else if (type === 'country' && loc === locCountry) countryB.push(b);
    else if (type === 'global') globalB.push(b);
  }
  return cityB.length ? cityB : stateB.length ? stateB : countryB.length ? countryB : globalB;
}

// ─── GEO ────────────────────────────────────────────────────────

export async function getCountries() {
  const { data, error } = await getSupabase().from('paises').select('*').order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getStates(paisId: string) {
  const { data, error } = await getSupabase().from('estados').select('*').eq('pais_id', paisId).order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getCities(estadoId: string) {
  const { data, error } = await getSupabase().from('cidades').select('*').eq('estado_id', estadoId).order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

// ─── PERFIL ─────────────────────────────────────────────────────

export async function getSellerProfile(userId: string) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at')
    .eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSellerAds(userId: string) {
  const { data, error } = await getSupabase()
    .from('ads')
    .select('id, title_pt, title_es, price, currency, category_id, location, status, images, is_featured, created_at, categories(name_pt, name_es, icon)')
    .eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

// ─── PAINEL ─────────────────────────────────────────────────────

const SECRET_KEYS = ['document_type', 'document_number', 'zip_code', 'street',
  'number', 'complement', 'neighborhood', 'kyc_doc_url', 'kyc_selfie_url', 'account_type'];

export async function updateProfile(userId: string, updates: Record<string, any>) {
  const profileUpdates: Record<string, any> = {};
  const secretUpdates: Record<string, any> = { id: userId, updated_at: new Date().toISOString() };
  let hasSecrets = false;
  for (const [k, v] of Object.entries(updates)) {
    if (SECRET_KEYS.includes(k)) { secretUpdates[k] = v; hasSecrets = true; }
    else profileUpdates[k] = v;
  }
  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await getSupabase()
      .from('profiles').update({ ...profileUpdates, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  }
  if (hasSecrets) {
    const { error } = await getSupabase().from('profile_secrets').upsert(secretUpdates);
    if (error) throw error;
  }
}

export async function getProfile(userId: string) {
  const [profileResult, secretsResult] = await Promise.all([
    getSupabase().from('profiles').select('*').eq('id', userId).maybeSingle(),
    getSupabase().from('profile_secrets').select('*').eq('id', userId).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  const data: any = profileResult.data || {};
  if (secretsResult.data) Object.assign(data, secretsResult.data);
  return data;
}

export async function getMyAds({ status = 'all', page = 1, limit = 12 } = {}): Promise<{ data: any[], total: number }> {
  const session = await getSession();
  if (!session) return { data: [], total: 0 };
  const from = (page - 1) * limit;
  let q = getSupabase()
    .from('ads')
    .select('id, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at', { count: 'exact' })
    .eq('user_id', session.user.id);
    
  if (status !== 'all') q = q.eq('status', status);
  
  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);
    
  if (error) throw error;
  return { data: data || [], total: count || 0 };
}

export async function deleteAd(adId: string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { error } = await getSupabase()
    .from('ads')
    .delete()
    .eq('id', adId)
    .eq('user_id', session.user.id);
  if (error) throw error;
}

export async function toggleAdStatus(adId: string, currentStatus: string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const newStatus = currentStatus === 'paused' ? 'active' : 'paused';
  const { error } = await getSupabase()
    .from('ads').update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', adId).eq('user_id', session.user.id);
  if (error) throw error;
  return newStatus;
}

export async function getMyBilling(): Promise<any[]> {
  const session = await getSession();
  if (!session) return [];
  const { data } = await getSupabase()
    .from('transactions').select('*').eq('user_id', session.user.id)
    .order('created_at', { ascending: false }).limit(50);
  return data || [];
}

export async function getUserAdStats(userId: string) {
  const { data } = await getSupabase().rpc('get_user_ads_stats', { p_user_id: userId });
  return data;
}

export const PLAN_META: Record<string, { label: string; ads: number; featured: number; desc: string }> = {
  free:    { label: 'Grátis',  ads: 3,   featured: 0,  desc: 'Até 3 anúncios ativos' },
  pro:     { label: 'Pro',     ads: 15,  featured: 2,  desc: 'Até 15 anúncios, 2 destaques' },
  premium: { label: 'Premium', ads: 999, featured: 10, desc: 'Anúncios ilimitados, 10 destaques' },
};
