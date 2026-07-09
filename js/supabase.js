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

// ─── CATEGORIES ──────────────────────────────────────────────────

/** Busca categorias do banco e popula o CATEGORIES global (para o site publico) */
async function fetchCategoriesFromDB() {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from('categories')
      .select('id, name_pt, name_es, icon, color, active, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (data && typeof CATEGORIES !== 'undefined') {
      CATEGORIES.length = 0;
      data.forEach(cat => {
        CATEGORIES.push({
          id:      cat.id,
          name_pt: cat.name_pt,
          name_es: cat.name_es,
          icon:    cat.icon,
          color:   cat.color,
          active:  cat.active,
          count:   0 // atualizado por get_category_counts
        });
      });
    }
    return data;
  } catch (error) {
    console.error('Erro ao buscar categorias do banco:', error);
    return [];
  }
}

/**
 * Alias público para fetchCategoriesFromDB.
 * Consulta direta ao Supabase — sem dependência de localhost:3000.
 */
async function getCategories() {
  return fetchCategoriesFromDB();
}

// ─── AUTH ──────────────────────────────────────────────────────

// Cache em memória: a sessão só é buscada 1x por carregamento de página.
// Supabase já gerencia refresco de token internamente.
let _sessionCache = undefined; // undefined = não inicializado; null = sem sessão

/** Retorna a sessão atual (null se não logado). Com cache em memória. */
async function getSession() {
  if (_sessionCache !== undefined) return _sessionCache;
  const { data: { session } } = await getSupabase().auth.getSession();
  _sessionCache = session;
  // Invalida cache ao mudar estado de auth
  getSupabase().auth.onAuthStateChange((_event, s) => { _sessionCache = s; });
  return _sessionCache;
}

/**
 * Retorna o usuário logado + perfil do banco.
 * Aceita sessão como parâmetro opcional para evitar round-trip duplo.
 * Cache em memória: só consulta o banco 1x por carregamento de página.
 */
let _currentUserCache = undefined;
async function getCurrentUser(session) {
  if (_currentUserCache !== undefined) return _currentUserCache;
  const sess = session ?? await getSession();
  if (!sess) { _currentUserCache = null; return null; }
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('id, name, avatar_url, verified, phone_whatsapp, country, state, city, bio, plan, created_at')
    .eq('id', sess.user.id)
    .maybeSingle();
  _currentUserCache = { ...sess.user, profile: profile || {} };
  return _currentUserCache;
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
    .from('profiles')
    .select('id, name, avatar_url, verified, phone_whatsapp, country, state, city, bio, plan, created_at, email_verified, phone_verified, kyc_status, kyc_doc_url, kyc_selfie_url')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function updateProfile(userId, updates) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, name, avatar_url, verified, phone_whatsapp, country, state, city, bio, plan, created_at, email_verified, phone_verified, kyc_status, kyc_doc_url, kyc_selfie_url')
    .single();
  if (error) throw error;
  return data;
}

// ─── GEOGRAFIA — queries diretas ao banco com cache em memória ────
const _geoCache = new Map();

async function getCountries() {
  if (_geoCache.has('countries')) return _geoCache.get('countries');
  const { data, error } = await getSupabase()
    .from('paises')
    .select('id, nome, sigla')
    .order('nome');
  if (error) throw new Error('Erro ao buscar países: ' + error.message);
  _geoCache.set('countries', data);
  return data;
}

async function getStates(paisId) {
  const key = `states_${paisId}`;
  if (_geoCache.has(key)) return _geoCache.get(key);
  const { data, error } = await getSupabase()
    .from('estados')
    .select('id, nome, sigla, pais_id')
    .eq('pais_id', paisId)
    .order('nome');
  if (error) throw new Error('Erro ao buscar estados: ' + error.message);
  _geoCache.set(key, data);
  return data;
}

async function getCities(estadoId) {
  const key = `cities_${estadoId}`;
  if (_geoCache.has(key)) return _geoCache.get(key);
  const { data, error } = await getSupabase()
    .from('cidades')
    .select('id, nome, estado_id')
    .eq('estado_id', estadoId)
    .order('nome');
  if (error) throw new Error('Erro ao buscar cidades: ' + error.message);
  _geoCache.set(key, data);
  return data;
}

/**
 * Busca cidades por texto (autocomplete) usando índice trigram.
 */
async function searchCities(query, limit = 10) {
  if (!query || query.length < 2) return [];
  const { data, error } = await getSupabase()
    .from('cidades')
    .select('id, nome, estado_id, estados(sigla, pais_id)')
    .ilike('nome', `%${query}%`)
    .limit(limit);
  if (error) return [];
  return data;
}

// ─── ANÚNCIOS ────────────────────────────────────────────────────────────────

/**
 * Busca anúncios via RPC search_ads (FTS PostgreSQL + keyset pagination).
 * Retorna: { ads, nextCursor, hasMore }
 */
async function getAds({
  search = null, category = null, country = null, state = null, city = null,
  preco_min = null, preco_max = null, featured = null,
  cursor = null, limit = 20,
  page, status  // legacy compat — ignorados (usar cursor)
} = {}) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não inicializado');

  let cursorCreatedAt = null, cursorId = null;
  if (cursor) {
    try { const c = JSON.parse(atob(cursor)); cursorCreatedAt = c.ca; cursorId = c.id; } catch(_) {}
  }

  try {
    const { data, error } = await sb.rpc('search_ads', {
      p_query:             search    || null,
      p_category:          category  || null,
      p_country:           country   || null,
      p_state:             state     || null,
      p_city:              city      || null,
      p_price_min:         preco_min || null,
      p_price_max:         preco_max || null,
      p_featured:          featured  || null,
      p_cursor_created_at: cursorCreatedAt,
      p_cursor_id:         cursorId,
      p_limit:             limit + 1,
    });

    if (error) throw error;

    const hasMore = data.length > limit;
    const ads     = hasMore ? data.slice(0, limit) : data;

    let nextCursor = null;
    if (hasMore && ads.length > 0) {
      const last = ads[ads.length - 1];
      nextCursor = btoa(JSON.stringify({ ca: last.created_at, id: last.id }));
    }

    return { ads, nextCursor, hasMore, total: null };

  } catch (rpcErr) {
    // Fallback direto sem geo se RPC não disponível
    console.warn('[getAds] RPC falhou, usando fallback direto:', rpcErr.message);
    let q = sb.from('ads')
      .select('id, title_pt, title_es, price, currency, price_unit_pt, price_unit_es, status, featured, views_count, images, category_id, location_text, city, state, country, created_at, expires_at, negotiable, categories(name_pt, name_es), profiles(id, name, verified)')
      .eq('status', 'active')
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search)    q = q.ilike('title_pt', `%${search}%`);
    if (category)  q = q.eq('category_id', category);
    if (country)   q = q.ilike('country', country);
    if (featured)  q = q.eq('featured', true);
    if (preco_min) q = q.gte('price', preco_min);
    if (preco_max) q = q.lte('price', preco_max);

    const { data, error } = await q;
    if (error) throw error;
    return { ads: data || [], nextCursor: null, hasMore: false, total: null };
  }
}

async function getAdById(id) {
  const { data, error } = await getSupabase()
    .from('ads')
    .select('*, profiles(id, name, avatar_url, verified, phone_whatsapp, country, created_at, email_verified, phone_verified, kyc_status), categories(name_pt, name_es, icon)')
    .eq('id', id)
    .single();
  if (error) throw error;

  // Incrementa visualizações atomicamente via RPC (fire-and-forget)
  const viewedKey = 'viewed_ad_' + id;
  if (!sessionStorage.getItem(viewedKey)) {
    sessionStorage.setItem(viewedKey, '1');
    getSupabase().rpc('increment_ad_views', { p_id: id });
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
    .from('ads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', adId)
    .select('id, title_pt, title_es, price, currency, status, featured, views_count, images, category_id, created_at, expires_at')
    .single();
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
    .from('ads')
    .select('id, title_pt, title_es, price, currency, status, featured, views_count, images, category_id, created_at, expires_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ─── IMAGENS: OTIMIZAÇÃO VIA SUPABASE TRANSFORM ──────────────────────────────

/**
 * Retorna URL otimizada via Supabase Image Transformation API.
 * Converte para WebP e redimensiona — reduz 60-80% do tamanho da imagem.
 */
function getAdImageUrl(url, { width = 800, quality = 80, format = 'webp' } = {}) {
  if (!url || !url.includes('/storage/v1/object/public/')) return url;
  const transformed = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );
  return `${transformed}?width=${width}&quality=${quality}&format=${format}`;
}

/** Thumbnail otimizado para cards de listagem (400px, WebP, alta compressão). */
function getAdThumbnailUrl(url) {
  return getAdImageUrl(url, { width: 400, quality: 75, format: 'webp' });
}

// ─── UPLOAD DE IMAGEM ────────────────────────────────────────────────────────

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

// ─── UPLOAD DE VÍDEO ────────────────────────────────────────────────────────

async function uploadAdVideo(file, adId) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  const ext  = file.name.split('.').pop();
  const path = `${session.user.id}/${adId || 'draft'}/${Date.now()}.${ext}`;

  const { error } = await getSupabase().storage
    .from('ad-videos')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;

  const { data: { publicUrl } } = getSupabase().storage
    .from('ad-videos').getPublicUrl(path);
  return publicUrl;
}

// ─── UPLOAD DE BANNER DE PERFIL ────────────────────────────────────────────────────────

async function uploadProfileBanner(file) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  const ext  = file.name.split('.').pop();
  const path = `${session.user.id}/banner_${Date.now()}.${ext}`;

  const { error } = await getSupabase().storage
    .from('profile-banners')
    .upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw error;

  const { data: { publicUrl } } = getSupabase().storage
    .from('profile-banners').getPublicUrl(path);
  return publicUrl;
}

// ─── FAVORITOS ────────────────────────────────────────────────
// Usa RPC toggle_favorite — elimina read-before-write (2 round-trips → 1 transação)
let _favsCached = undefined; // cache de favoritos em memória

/**
 * Toggle favorito via RPC atômica.
 * Nomeada _rpcToggleFav para não conflitar com toggleFavorite() de main.js,
 * que gerencia o estado local (localStorage + visual) e chama esta função.
 */
async function _rpcToggleFav(adId) {
  const session = await getSession();
  if (!session) { window.location.href = '/login.html'; return null; }
  const { data, error } = await getSupabase()
    .rpc('toggle_favorite', { p_user_id: session.user.id, p_ad_id: adId });
  if (error) throw error;
  _favsCached = undefined; // invalida cache para próxima consulta
  return data; // true = adicionado, false = removido
}


async function getMyFavorites() {
  if (_favsCached !== undefined) return _favsCached;
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('favorites')
    .select('ad_id, ads(id, title_pt, title_es, price, currency, images, status, category_id, location_text)')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Sincroniza o localStorage com o banco real
  if (data && typeof window !== 'undefined') {
    const favIds = data.map(f => f.ad_id);
    window.tcFavorites = new Set(favIds);
    localStorage.setItem('tc_favorites', JSON.stringify(favIds));
  }

  _favsCached = data.map(f => f.ads).filter(Boolean);
  return _favsCached;
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

/**
 * Busca mensagens do usuário com paginação.
 * Limite de 100 mensagens para evitar payload excessivo.
 */
async function getMyMessages() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('messages')
    .select('id, ad_id, sender_id, receiver_id, content, status, created_at, ads(id, title_pt, images), sender:profiles!messages_sender_id_fkey(id, name, avatar_url), receiver:profiles!messages_receiver_id_fkey(id, name, avatar_url)')
    .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);
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

/**
 * Busca leilões diretamente do Supabase.
 * Substituiu dependência de localhost:3000/api/auctions.
 */
async function getAuctions(status = 'active') {
  const { data, error } = await getSupabase()
    .from('auctions')
    .select('id, title, status, current_bid, start_price, min_increment, end_at, images, category_id, description, ads(id, title_pt, images)')
    .eq('status', status)
    .order('end_at', { ascending: true })
    .limit(50); // máximo de leilões ativos exibidos
  if (error) throw new Error('Erro ao buscar leilões: ' + error.message);
  return data || [];
}

/**
 * Registra um lance via RPC place_bid — validação e transação no banco.
 * Elimina race condition e validação no frontend.
 */
async function placeBid(auctionId, amount) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  const { data, error } = await getSupabase()
    .rpc('place_bid', {
      p_auction_id: auctionId,
      p_user_id:    session.user.id,
      p_amount:     amount
    });

  if (error) throw new Error(error.message);
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
// Consulta direta ao Supabase — sem dependência de localhost:3000.

/**
 * Busca banners ativos por posição diretamente do banco.
 * @param {string} [position] - posição do banner (ex: 'home_top', 'sidebar')
 */
async function getBanners(position) {
  const CACHE_KEY = 'tc_banners_' + (position || 'all');
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch (_) {}

  let q = getSupabase()
    .from('banners')
    .select('id, name, image_url, link_url, position, status')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10);

  if (position) q = q.eq('position', position);

  const { data, error } = await q;
  if (error) throw new Error('Erro ao buscar banners: ' + error.message);

  const result = data || [];
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result })); } catch (_) {}
  return result;
}

// ─── ASSINATURAS ─────────────────────────────────────────────

async function getMySubscription() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await getSupabase()
    .from('subscriptions')
    .select('id, user_id, plan, status, started_at, expires_at, gateway, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ─── LIMITES POR PLANO ────────────────────────────────────────
const PLAN_LIMITS = {
  free:    { ads: 3,   featured: 0, highlight: false },
  pro:     { ads: 15,  featured: 2, highlight: true  },
  premium: { ads: 999, featured: 10, highlight: true },
};

/**
 * Verifica se o usuário pode postar um anúncio com base no plano.
 * Usa RPC can_post_ad no banco — 1 round-trip em vez de 4 queries sequenciais.
 */
async function canPostAd() {
  const session = await getSession();
  if (!session) return false;
  try {
    const { data, error } = await getSupabase().rpc('can_post_ad', { p_user_id: session.user.id });
    if (error) throw error;
    return !!data;
  } catch (e) {
    console.error('[canPostAd] erro:', e.message);
    return false;
  }
}

// ─── PLATFORM STATS (HOME) ────────────────────────────────────────
// Lê offsets do admin (Configurações → Contadores & Saldo).
const STATS_OFFSETS = (() => {
  const get = (key) => {
    const v = localStorage.getItem('tc_' + key);
    return (v !== null && !isNaN(parseInt(v))) ? parseInt(v) : 0;
  };
  return {
    ads:      get('cnt_ads'),
    sellers:  get('cnt_users'),
    auctions: get('cnt_auctions'),
    bovinos:  get('cnt_bovinos'),
    machines: get('cnt_maquinas'),
    cities:   get('cnt_cidades'),
    countries:get('cnt_paises'),
  };
})();

async function fetchPlatformStats() {
  const CACHE_KEY = 'tc_platform_stats_v4';
  const CACHE_TTL = 2 * 60 * 1000; // 2 minutos

  // Limpa versões antigas de cache
  ['tc_platform_stats', 'tc_platform_stats_v2', 'tc_platform_stats_v3'].forEach(k => {
    try { sessionStorage.removeItem(k); } catch(_) {}
  });

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch (_) {}

  try {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase não inicializado');

    // 1 RPC substitui 6 queries individuais
    const { data: raw, error } = await sb.rpc('get_platform_stats');
    if (error) throw error;

    const db = raw || {};

    const result = {
      total_ads:       STATS_OFFSETS.ads      + (db.total_ads      || 0),
      total_sellers:   STATS_OFFSETS.sellers  + (db.total_sellers  || 0),
      total_auctions:  STATS_OFFSETS.auctions + (db.total_auctions || 0),
      total_cities:    STATS_OFFSETS.cities   + (db.total_cities   || 0),
      total_countries: db.total_countries     || STATS_OFFSETS.countries,
      total_bovinos:   STATS_OFFSETS.bovinos  + (db.total_bovinos  || 0),
      total_machines:  STATS_OFFSETS.machines + (db.total_machines || 0),
    };

    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result })); } catch (_) {}
    return result;

  } catch (error) {
    console.error('[Stats] Erro no RPC, usando offsets como fallback:', error);
    return {
      total_ads:       STATS_OFFSETS.ads,
      total_sellers:   STATS_OFFSETS.sellers,
      total_auctions:  STATS_OFFSETS.auctions,
      total_cities:    STATS_OFFSETS.cities,
      total_countries: STATS_OFFSETS.countries,
      total_bovinos:   STATS_OFFSETS.bovinos,
      total_machines:  STATS_OFFSETS.machines,
    };
  }
}

// ─── EVENTOS ──────────────────────────────────────────────────

/** Busca eventos futuros do banco (limit 200, sem eventos passados) */
async function fetchEventsFromDB() {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { data, error } = await sb
      .from('eventos')
      .select('id, title, date, location_str, lat, lng, organizer, image, link, featured')
      .gte('date', today)      // Apenas eventos futuros ou de hoje
      .order('date', { ascending: true })
      .limit(200);             // Proteção contra payload ilimitado
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar eventos do banco:', error);
    return [];
  }
}

/**
 * Busca eventos próximos ao ponto (lat, lng) dentro do raio em km.
 * Usa RPC get_events_near com Haversine no banco — sem filtro no cliente.
 */
async function getEventsNear(lat, lng, radiusKm = 100) {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb.rpc('get_events_near', {
      p_lat:       lat,
      p_lng:       lng,
      p_radius_km: radiusKm,
    });
    if (error) throw error;
    return (data || []).map(e => ({ ...e, locationStr: e.location_str || '' }));
  } catch (e) {
    console.warn('[getEventsNear] RPC falhou, usando fallback local:', e.message);
    return null; // null indica que o chamador deve usar fallback Haversine local
  }
}

/**
 * Resolve nomes de localização para IDs via RPC.
 * Substitui waterfall de 3 queries sequenciais por 1 round-trip.
 */
async function resolveLocation(country, state, city) {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc('resolve_location', {
      p_country: country || null,
      p_state:   state   || null,
      p_city:    city    || null,
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('[resolveLocation] RPC falhou:', e.message);
    return null;
  }
}


// ─── ADMIN KYC ────────────────────────────────────────────────────────
async function checkIsAdmin() {
  const session = await getSession();
  if (!session) return false;
  const { data, error } = await getSupabase().from('profiles').select('is_admin').eq('id', session.user.id).single();
  if (error || !data) return false;
  return data.is_admin === true;
}

async function getPendingVerifications() {
  const { data, error } = await getSupabase()
    .from('user_verifications')
    .select('*, profiles(full_name, email)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function updateVerificationStatus(id, newStatus, notes = '') {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  // Optional: You can re-check admin here in backend policy or frontend
  const { error } = await getSupabase()
    .from('user_verifications')
    .update({ status: newStatus, admin_notes: notes, reviewed_at: new Date().toISOString(), reviewed_by: session.user.id })
    .eq('id', id);
  if (error) throw error;
  
  // If approved, update profile verif_status
  if (newStatus === 'approved') {
    const { data: verif } = await getSupabase().from('user_verifications').select('user_id').eq('id', id).single();
    if (verif) {
      await getSupabase().from('profiles').update({ verif_status: 'approved' }).eq('id', verif.user_id);
    }
  }
}

async function grantAdmin(targetEmail) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { data, error } = await getSupabase().rpc('grant_admin', { target_email: targetEmail });
  if (error) throw error;
  return data;
}

// ─── KYC (VERIFICAÇÃO DE VENDEDOR) ──────────────────────────────────────────

async function uploadKycImage(file, docType) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  const ext  = file.name.split('.').pop();
  const path = `${session.user.id}/${Date.now()}_${docType}.${ext}`;

  // Envia para o bucket kyc-docs
  const { error } = await getSupabase().storage
    .from('kyc-docs')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;

  const { data: { publicUrl } } = getSupabase().storage
    .from('kyc-docs').getPublicUrl(path);
  return publicUrl;
}

async function submitVerification(docType, frontUrl, backUrl, selfieUrl) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');

  const { error } = await getSupabase()
    .from('user_verifications')
    .insert({
      user_id: session.user.id,
      doc_type: docType,
      doc_front_url: frontUrl,
      doc_back_url: backUrl,
      selfie_url: selfieUrl,
      status: 'pending'
    });
  if (error) throw error;
}

async function getUserVerificationStatus() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await getSupabase()
    .from('user_verifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();
    
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 is 'not found'
  return data || null;
}

// ─── SEARCH METRICS ─────────────────────────────────────────────────────────

// Profanity Filter
const BAD_WORDS = ['puta', 'porra', 'caralho', 'buceta', 'merda', 'cacete', 'foder', 'cuzao', 'bosta', 'pinto', 'rola'];

function containsProfanity(text) {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return BAD_WORDS.some(word => normalized.includes(word));
}

async function logSearchTerm(term, lang) {
  if (!term || term.trim().length < 3) return; // Ignore very short terms
  if (containsProfanity(term)) return; // Don't log profanity

  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('search_metrics').insert([{ term: term.trim().toLowerCase(), lang }]);
  } catch (e) {
    console.warn('Failed to log search:', e);
  }
}

async function fetchPopularTags(lang) {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc('get_popular_tags', { p_lang: lang, p_limit: 6 });
    if (error || !data) return null;
    return data.map(r => r.term);
  } catch (e) {
    console.warn('Failed to fetch popular tags:', e);
    return null;
  }
}
