/* ================================================================
   TAUZE CLASS — Supabase Client
   Configuração central da conexão com o banco de dados real.
   ================================================================ */

const SUPABASE_URL  = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

// Carrega o SDK do Supabase via CDN (adicionado ao HTML via <script>)
// e expõe o cliente global
let _sb = null;
function getSupabase() {
  if (_sb) return _sb;
  if (typeof window !== 'undefined' && window.supabase) {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return _sb;
}

// ─── AUTH ──────────────────────────────────────────────────────

/** Retorna a sessão atual (null se não logado) */
async function getSession() {
  const { data: { session } } = await getSupabase().auth.getSession();
  return session;
}

/** Retorna o usuário logado + perfil do banco */
async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  return { ...session.user, profile };
}

/** Login com e-mail e senha */
async function loginWithEmail(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Cadastro com e-mail e senha */
async function signupWithEmail(email, password, name) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) throw error;
  return data;
}

/** Login com Google OAuth */
async function loginWithGoogle() {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/painel.html' }
  });
  if (error) throw error;
}

/** Logout */
async function logout() {
  await getSupabase().auth.signOut();
  window.location.href = '/login.html';
}

/** Recuperar senha */
async function resetPassword(email) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html?tab=reset'
  });
  if (error) throw error;
}

/** Escuta mudanças de sessão (login/logout) */
function onAuthChange(callback) {
  return getSupabase().auth.onAuthStateChange(callback);
}

// ─── PERFIL ────────────────────────────────────────────────────

async function getProfile(userId) {
  const { data, error } = await getSupabase()
    .from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function updateProfile(userId, updates) {
  const { data, error } = await getSupabase()
    .from('profiles').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId).select().single();
  if (error) throw error;
  return data;
}

// ─── GEOGRAFIA ──────────────────────────────────────────────────

const geoCache = {
  countries: null,
  states: {},
  cities: {}
};

async function getCountries() {
  if (geoCache.countries) return geoCache.countries;
  const { data, error } = await getSupabase()
    .from('paises')
    .select('*')
    .order('nome', { ascending: true });
  if (error) throw error;
  geoCache.countries = data;
  return data;
}

async function getStates(paisId) {
  if (geoCache.states[paisId]) return geoCache.states[paisId];
  const { data, error } = await getSupabase()
    .from('estados')
    .select('*')
    .eq('pais_id', paisId)
    .order('nome', { ascending: true });
  if (error) throw error;
  geoCache.states[paisId] = data;
  return data;
}

async function getCities(estadoId) {
  if (geoCache.cities[estadoId]) return geoCache.cities[estadoId];
  const { data, error } = await getSupabase()
    .from('cidades')
    .select('*')
    .eq('estado_id', estadoId)
    .order('nome', { ascending: true });
  if (error) throw error;
  geoCache.cities[estadoId] = data;
  return data;
}

// ─── ANÚNCIOS ─────────────────────────────────────────────────

async function getAds({ category, country, search, page = 1, limit = 20, status = 'active' } = {}) {
  let q = getSupabase()
    .from('ads')
    .select('*, profiles(name, avatar_url, verified, phone_whatsapp)', { count: 'exact' })
    .eq('status', status)
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (category) q = q.eq('category_id', category);
  if (country)  q = q.eq('country', country);
  if (search)   q = q.ilike('title_pt', `%${search}%`);

  const { data, error, count } = await q;
  if (error) throw error;
  return { ads: data, total: count };
}

async function getAdById(id) {
  const { data, error } = await getSupabase()
    .from('ads')
    .select('*, profiles(id, name, avatar_url, verified, phone_whatsapp, country, created_at), categories(name_pt, name_es, icon)')
    .eq('id', id)
    .single();
  if (error) throw error;

  // Incrementa visualizações (fire-and-forget) com session storage rate-limit
  const viewedKey = 'viewed_ad_' + id;
  if (!sessionStorage.getItem(viewedKey)) {
    sessionStorage.setItem(viewedKey, 'true');
    getSupabase().from('ads').update({ views_count: (data.views_count || 0) + 1 }).eq('id', id);
  }

  return data;
}

async function createAd(adData) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  const { data, error } = await getSupabase()
    .from('ads')
    .insert({ ...adData, user_id: session.user.id })
    .select().single();
  if (error) throw error;
  return data;
}

async function updateAd(adId, updates) {
  const { data, error } = await getSupabase()
    .from('ads').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', adId).select().single();
  if (error) throw error;
  return data;
}

async function deleteAd(adId) {
  const { error } = await getSupabase().from('ads').delete().eq('id', adId);
  if (error) throw error;
}

async function getMyAds() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('ads').select('*').eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ─── UPLOAD DE IMAGEM ─────────────────────────────────────────

async function uploadAdImage(file, adId) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  const ext  = file.name.split('.').pop();
  const path = `${session.user.id}/${adId || 'draft'}/${Date.now()}.${ext}`;

  const { error } = await getSupabase().storage
    .from('ad-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;

  const { data: { publicUrl } } = getSupabase().storage
    .from('ad-images').getPublicUrl(path);
  return publicUrl;
}

// ─── FAVORITOS ────────────────────────────────────────────────

async function toggleFavorite(adId) {
  const session = await getSession();
  if (!session) { window.location.href = '/login.html'; return; }

  const { data: existing } = await getSupabase()
    .from('favorites').select('id').eq('user_id', session.user.id).eq('ad_id', adId).single();

  if (existing) {
    await getSupabase().from('favorites').delete().eq('id', existing.id);
    return false; // removido
  } else {
    await getSupabase().from('favorites').insert({ user_id: session.user.id, ad_id: adId });
    return true; // adicionado
  }
}

async function getMyFavorites() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('favorites').select('*, ads(*, profiles(name))').eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(f => f.ads);
}

// ─── MENSAGENS ────────────────────────────────────────────────

async function sendMessage(adId, receiverId, content) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { data, error } = await getSupabase().from('messages').insert({
    ad_id: adId, sender_id: session.user.id, receiver_id: receiverId, content
  }).select().single();
  if (error) throw error;
  return data;
}

async function getMyMessages() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('messages')
    .select('*, ads(title_pt, images), sender:profiles!messages_sender_id_fkey(name, avatar_url), receiver:profiles!messages_receiver_id_fkey(name, avatar_url)')
    .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Subscribe para mensagens em tempo real */
function subscribeToMessages(userId, callback) {
  return getSupabase()
    .channel('messages')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `receiver_id=eq.${userId}`
    }, callback)
    .subscribe();
}

// ─── LEILÕES ──────────────────────────────────────────────────

async function getAuctions({ status = 'live', limit = 20 } = {}) {
  const { data, error } = await getSupabase()
    .from('auctions')
    .select('*, ads(title_pt, images, price, category_id), profiles(name)')
    .eq('status', status)
    .order('end_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function placeBid(auctionId, amount) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  // Validate amount
  const { data: auction } = await getSupabase().from('auctions').select('current_bid').eq('id', auctionId).single();
  if (auction && amount <= auction.current_bid) {
    throw new Error('O lance deve ser maior que o lance atual.');
  }

  const { data, error } = await getSupabase().from('auction_bids').insert({
    auction_id: auctionId, user_id: session.user.id, amount
  }).select().single();
  if (error) throw error;

  // Atualiza current_bid na tabela auctions
  await getSupabase().from('auctions').update({ current_bid: amount }).eq('id', auctionId);

  return data;
}

/** Subscribe para lances em tempo real */
function subscribeToAuction(auctionId, callback) {
  return getSupabase()
    .channel(`auction:${auctionId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'auction_bids',
      filter: `auction_id=eq.${auctionId}`
    }, callback)
    .subscribe();
}

// ─── DENÚNCIAS ────────────────────────────────────────────────

async function reportAd(adId, reason, severity = 'low') {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { error } = await getSupabase().from('reports').insert({
    ad_id: adId, reporter_id: session.user.id, reason, severity
  });
  if (error) throw error;
}

// ─── BANNERS PÚBLICOS ─────────────────────────────────────────

async function getBanners(position) {
  const { data } = await getSupabase()
    .from('banners').select('*').eq('position', position).eq('status', 'active');
  return data || [];
}

// ─── CATEGORIAS ───────────────────────────────────────────────

async function getCategories() {
  const { data } = await getSupabase()
    .from('categories').select('*').eq('active', true).order('sort_order');
  return data || [];
}

// ─── ASSINATURAS ─────────────────────────────────────────────

async function getMySubscription() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await getSupabase()
    .from('subscriptions').select('*').eq('user_id', session.user.id)
    .order('created_at', { ascending: false }).limit(1).single();
  return data;
}

// ─── LIMITES POR PLANO ────────────────────────────────────────
const PLAN_LIMITS = {
  free:    { ads: 3,   featured: 0, highlight: false },
  pro:     { ads: 15,  featured: 2, highlight: true  },
  premium: { ads: 999, featured: 10, highlight: true },
};

async function canPostAd() {
  const user = await getCurrentUser();
  if (!user) return false;
  const plan  = user.profile?.plan || 'free';
  const limit = PLAN_LIMITS[plan].ads;
  const myAds = await getMyAds();
  const activeAds = myAds.filter(a => a.status === 'active' || a.status === 'pending');
  return activeAds.length < limit;
}
