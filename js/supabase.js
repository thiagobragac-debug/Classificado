/* ================================================================
   TAUZE CLASS � Supabase Client
   Configura��o central da conex�o com o banco de dados real.
   ================================================================ */

const SUPABASE_URL  = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

// Carrega o SDK do Supabase via CDN (adicionado ao HTML via <script>)
// e exp�e o cliente global
let _sb = null;
function getSupabase() {
  if (_sb) return _sb;
  if (typeof window !== 'undefined' && window.supabase) {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return _sb;
}

// ??? AUTH ??????????????????????????????????????????????????????

/** Retorna a sess�o atual (null se n�o logado) */
async function getSession() {
  const { data: { session } } = await getSupabase().auth.getSession();
  return session;
}

/** Retorna o usu�rio logado + perfil do banco */
async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();
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
  localStorage.removeItem('tc_favorites');
  localStorage.removeItem('tc_user_initials');
  localStorage.removeItem('tc_user_id');
  window.location.href = '/login.html';
}

/** Recuperar senha */
async function resetPassword(email) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html?tab=reset'
  });
  if (error) throw error;
}

/** Escuta mudan�as de sess�o (login/logout) */
function onAuthChange(callback) {
  return getSupabase().auth.onAuthStateChange(callback);
}

// ??? PERFIL ????????????????????????????????????????????????????

async function getProfile(userId) {
  const { data, error } = await getSupabase()
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  try {
    const { data: secrets } = await getSupabase().from('profile_secrets').select('*').eq('id', userId).maybeSingle();
    if (secrets) Object.assign(data, secrets);
  } catch(e) {}
  return data;
}

async function updateProfile(userId, updates) {
  const secretKeys = ['document_type', 'document_number', 'zip_code', 'street', 'number', 'complement', 'neighborhood', 'kyc_doc_url', 'kyc_selfie_url', 'account_type'];
  const profileUpdates = {};
  const secretUpdates = { id: userId, updated_at: new Date().toISOString() };
  let hasSecrets = false;
  
  for (const [k, v] of Object.entries(updates)) {
    if (secretKeys.includes(k)) { secretUpdates[k] = v; hasSecrets = true; }
    else { profileUpdates[k] = v; }
  }
  
  let data = null;
  if (Object.keys(profileUpdates).length > 0) {
    const { data: pData, error } = await getSupabase()
      .from('profiles').update({ ...profileUpdates, updated_at: new Date().toISOString() })
      .eq('id', userId).select().maybeSingle();
    if (error) throw error;
    data = pData;
  }
  
  if (hasSecrets) {
    const { error: sErr } = await getSupabase().from('profile_secrets').upsert(secretUpdates);
    if (sErr) throw sErr;
  }
  return data;
}

// ??? GEOGRAFIA ??????????????????????????????????????????????????

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

// ??? AN�NCIOS ?????????????????????????????????????????????????

async function getAds({ category, country, state, city, search, preco_min, preco_max, featured, page, cursor, limit = 20, status = 'active' } = {}) {
  // If cursor is provided, we treat it as the current page number
  const currentPage = cursor ? parseInt(cursor) : (page ? parseInt(page) : 1);
  
  let q = getSupabase()
    .from('ads')
    .select('*, profiles(name, avatar_url, verified, phone_whatsapp)', { count: 'exact' })
    .eq('status', status)
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
    .range((currentPage - 1) * limit, currentPage * limit - 1);

  const BR_STATES = {
    "Acre": "AC", "AC": "Acre",
    "Alagoas": "AL", "AL": "Alagoas",
    "Amap�": "AP", "AP": "Amap�",
    "Amazonas": "AM", "AM": "Amazonas",
    "Bahia": "BA", "BA": "Bahia",
    "Cear�": "CE", "CE": "Cear�",
    "Distrito Federal": "DF", "DF": "Distrito Federal",
    "Esp�rito Santo": "ES", "ES": "Esp�rito Santo",
    "Goi�s": "GO", "GO": "Goi�s",
    "Maranh�o": "MA", "MA": "Maranh�o",
    "Mato Grosso": "MT", "MT": "Mato Grosso",
    "Mato Grosso do Sul": "MS", "MS": "Mato Grosso do Sul",
    "Minas Gerais": "MG", "MG": "Minas Gerais",
    "Par�": "PA", "PA": "Par�",
    "Para�ba": "PB", "PB": "Para�ba",
    "Paran�": "PR", "PR": "Paran�",
    "Pernambuco": "PE", "PE": "Pernambuco",
    "Piau�": "PI", "PI": "Piau�",
    "Rio de Janeiro": "RJ", "RJ": "Rio de Janeiro",
    "Rio Grande do Norte": "RN", "RN": "Rio Grande do Norte",
    "Rio Grande do Sul": "RS", "RS": "Rio Grande do Sul",
    "Rond�nia": "RO", "RO": "Rond�nia",
    "Roraima": "RR", "RR": "Roraima",
    "Santa Catarina": "SC", "SC": "Santa Catarina",
    "S�o Paulo": "SP", "SP": "S�o Paulo",
    "Sergipe": "SE", "SE": "Sergipe",
    "Tocantins": "TO", "TO": "Tocantins"
  };

  if (category)  q = q.eq('category_id', category);
  if (country)   q = q.eq('country', country);
  if (state) {
    const altState = BR_STATES[state];
    if (altState) {
      q = q.in('state', [state, altState]);
    } else {
      q = q.eq('state', state);
    }
  }
  if (city)      q = q.eq('city', city);
  if (search)    q = q.ilike('title_pt', `%${search}%`);
  if (preco_min) q = q.gte('price', preco_min);
  if (preco_max) q = q.lte('price', preco_max);
  if (featured)  q = q.eq('featured', true);

  const { data, error, count } = await q;
  if (error) throw error;
  
  const hasMore = (currentPage * limit) < count;
  const nextCursor = hasMore ? currentPage + 1 : null;
  
  return { ads: data, total: count, nextCursor, hasMore };
}

async function getAdById(id) {
  const { data, error } = await getSupabase()
    .from('ads')
    .select('*, profiles(id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at), categories(name_pt, name_es, icon)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;

  // Incrementa visualiza��es via RPC server-side com debounce por IP (30min)
  // O IP � hasheado no cliente para evitar enviar o IP real
  const viewedKey = 'viewed_ad_' + id;
  if (!sessionStorage.getItem(viewedKey)) {
    sessionStorage.setItem(viewedKey, 'true');
    try {
      // SHA-256 do IP real � gerado no servidor; aqui usamos um token de sess�o an�nimo
      const sessionToken = sessionStorage.getItem('tc_view_token') || (() => {
        const t = crypto.randomUUID();
        sessionStorage.setItem('tc_view_token', t);
        return t;
      })();
      const msgBuf = new TextEncoder().encode(sessionToken + id);
      const hashBuf = await crypto.subtle.digest('SHA-256', msgBuf);
      const ipHash  = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
      getSupabase().rpc('increment_ad_view_safe', { p_ad_id: id, p_ip_hash: ipHash }).catch(() => {});
    } catch {
      // fallback silencioso se SubtleCrypto n�o estiver dispon�vel
    }
  }

  return data;
}

async function createAd(adData) {
  const session = await getSession();
  if (!session) throw new Error('N�o autenticado');

  const { data, error } = await getSupabase()
    .from('ads')
    .insert({ ...adData, user_id: session.user.id })
    .select().maybeSingle();
  if (error) throw error;
  return data;
}

async function updateAd(adId, updates) {
  const { data, error } = await getSupabase()
    .from('ads').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', adId).select().maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteAd(adId) {
  const { error } = await getSupabase()
    .from('ads').update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', adId);
  if (error) throw error;
}

async function getMyAds() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('ads').select('*').eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.filter(ad => ad.status !== 'deleted');
}

// ??? COMPRESS�O DE IMAGEM ?????????????????????????????????????
function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.match(/image.*/)) return resolve(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Marca d'água
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold ' + Math.max(16, width * 0.04) + 'px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText('Tauze Class', width - (width * 0.02), height - (height * 0.02));

        canvas.toBlob((blob) => {
          if (!blob) return resolve(file);
          const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: 'image/jpeg' });
          resolve(newFile);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// ??? UPLOAD DE IMAGEM ?????????????????????????????????????????

async function uploadAdImage(rawFile, adId) {
  const session = await getSession();
  if (!session) throw new Error('N�o autenticado');

  const file = await compressImage(rawFile, 1200, 0.8);

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

// ??? FAVORITOS ????????????????????????????????????????????????

async function _rpcToggleFav(adId) {
  const session = await getSession();
  if (!session) { return false; } // Não redireciona, permite salvar localmente

  const { data: existingRecords, error } = await getSupabase()
    .from('favorites').select('id').eq('user_id', session.user.id).eq('ad_id', adId);

  if (error) {
    console.error('Erro ao buscar favorito:', error);
    throw error;
  }

  if (existingRecords && existingRecords.length > 0) {
    const idsToDelete = existingRecords.map(r => r.id);
    await getSupabase().from('favorites').delete().in('id', idsToDelete);
    return false; // removido
  } else {
    await getSupabase().from('favorites').insert({ user_id: session.user.id, ad_id: adId });
    return true; // adicionado
  }
}


async function syncFavoritesLocal() {
  const session = await getSession();
  if (!session) return;
  
  try {
    // Pegar favoritos locais
    const localStr = localStorage.getItem('tc_favorites');
    const localFavs = localStr ? JSON.parse(localStr) : [];
    
    // Pegar favoritos do banco
    const { data: dbRecords, error } = await getSupabase()
      .from('favorites').select('ad_id').eq('user_id', session.user.id);
      
    if (error) throw error;
    
    const dbFavs = dbRecords.map(r => r.ad_id);
    
    // Favoritos que estao no local mas não no banco
    const toInsert = localFavs.filter(id => !dbFavs.includes(id));
    if (toInsert.length > 0) {
      const inserts = toInsert.map(adId => ({ user_id: session.user.id, ad_id: adId }));
      await getSupabase().from('favorites').insert(inserts);
    }
    
    // Mesclar e atualizar o local storage
    const allFavs = new Set([...localFavs, ...dbFavs]);
    window.tcFavorites = allFavs;
    localStorage.setItem('tc_favorites', JSON.stringify(Array.from(allFavs)));
    
    // Atualizar visuais na pagina
    if (typeof updateFavoriteIcons === 'function') {
      window.tcFavorites.forEach(id => updateFavoriteIcons(id, true));
    }
    
  } catch (err) {
    console.error('Erro ao sincronizar favoritos locais:', err);
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

// ??? MENSAGENS ????????????????????????????????????????????????

async function sendMessage(adId, receiverId, content) {
  const session = await getSession();
  if (!session) throw new Error('N�o autenticado');
  const { data, error } = await getSupabase().from('messages').insert({
    ad_id: adId, sender_id: session.user.id, receiver_id: receiverId, content
  }).select().maybeSingle();
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

// ??? LEIL�ES ??????????????????????????????????????????????????

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
  if (!session) throw new Error('N�o autenticado');

  // Valida��o b�sica no cliente (a valida��o definitiva � feita atomicamente no servidor)
  const numAmount = Number(amount);
  if (!isFinite(numAmount) || numAmount <= 0) {
    throw new Error('Valor do lance inv�lido.');
  }

  // RPC at�mica com SELECT FOR UPDATE � previne race condition TOCTOU
  const { data, error } = await getSupabase().rpc('place_bid_atomic', {
    p_auction_id: auctionId,
    p_user_id:    session.user.id,
    p_amount:     numAmount
  });

  if (error) throw error;

  if (!data?.success) {
    throw new Error(data?.error || 'Erro ao processar lance.');
  }

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

// ??? DEN�NCIAS ????????????????????????????????????????????????

async function reportAd(adId, reason, severity = 'low') {
  const session = await getSession();
  if (!session) throw new Error('N�o autenticado');
  const { error } = await getSupabase().from('reports').insert({
    ad_id: adId, reporter_id: session.user.id, reason, severity
  });
  if (error) throw error;
}

// ??? BANNERS P�BLICOS ?????????????????????????????????????????

function normalizeString(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

async function getBanners(position, userLoc = null) {
  const { data } = await getSupabase()
    .from('banners').select('*').eq('position', position).eq('status', 'active');
  const allBanners = data || [];

  if (!userLoc) return allBanners;

  const locCity = normalizeString(userLoc.city);
  const locState = normalizeString(userLoc.state);
  const locCountry = normalizeString(userLoc.country);

  const mercosulCountries = ['brasil', 'argentina', 'uruguai', 'paraguai', 'bolivia'];
  const isMercosul = mercosulCountries.includes(locCountry);

  const cityBanners = [];
  const stateBanners = [];
  const countryBanners = [];
  const mercosulBanners = [];
  const globalBanners = [];

  for (const b of allBanners) {
    const type = b.target_type || 'global';
    const loc = normalizeString(b.target_location);
    if (type === 'city' && loc === locCity) cityBanners.push(b);
    else if (type === 'state' && loc === locState) stateBanners.push(b);
    else if (type === 'country' && loc === locCountry) countryBanners.push(b);
    else if (type === 'mercosul' && isMercosul) mercosulBanners.push(b);
    else if (type === 'global') globalBanners.push(b);
  }

  if (cityBanners.length > 0) return cityBanners;
  if (stateBanners.length > 0) return stateBanners;
  if (countryBanners.length > 0) return countryBanners;
  if (mercosulBanners.length > 0) return mercosulBanners;
  
  return globalBanners;
}

// ??? CATEGORIAS ???????????????????????????????????????????????

async function getCategories() {
  const { data } = await getSupabase()
    .from('categories').select('*').eq('active', true).order('sort_order');
  return data || [];
}

// ??? ASSINATURAS ?????????????????????????????????????????????

async function getMySubscription() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await getSupabase()
    .from('subscriptions').select('*').eq('user_id', session.user.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

// ??? LIMITES POR PLANO ????????????????????????????????????????
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

// ??? ESTAT�STICAS REAIS DA PLATAFORMA ?????????????????????????
async function fetchPlatformStats() {
  try {
    const sb = getSupabase();
    const { count: adsCount } = await sb.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: auctionsCount } = await sb.from('auctions').select('*', { count: 'exact', head: true }).eq('status', 'live');
    const { count: bovinosCount } = await sb.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('category_id', 'cat-bovinos');
    const { count: maquinasCount } = await sb.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('category_id', 'cat-maquinas');

    const { data: settings } = await sb.from('platform_settings').select('key, value');
    const sMap = {};
    if (settings) {
      settings.forEach(s => sMap[s.key] = s.value);
    }
    const getVal = (key, realCount) => {
      const adminVal = parseInt(sMap[key] || 0);
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
  } catch(e) {
    console.error('Erro em fetchPlatformStats:', e);
    return null;
  }
}

// ??? TAGS POPULARES ???????????????????????????????????????????
const PROFANITY_LIST = ['merda', 'porra', 'caralho', 'puta', 'foda', 'buceta', 'cu', 'bosta', 'cacete', 'arrombado', 'viado'];
const STOP_WORDS = ['para', 'com', 'uma', 'venda', 'vendo', 'novo', 'nova', 'usado', 'usada', 'como', 'mais', 'este', 'esta', 'esse', 'essa'];

async function fetchPopularTags(lang) {
  try {
    const sb = getSupabase();
    const { data } = await sb.from('ads').select('title_pt, title_es').eq('status', 'active').limit(50);
    if (!data || data.length === 0) return null;
    let wordCount = {};
    data.forEach(ad => {
      const title = lang === 'es' ? (ad.title_es || ad.title_pt) : (ad.title_pt || '');
      if (!title) return;
      const words = title.toLowerCase().replace(/[.,!?;()]/g, '').split(/\s+/);
      words.forEach(w => {
        if (w.length > 3 && !PROFANITY_LIST.includes(w) && !STOP_WORDS.includes(w)) {
           wordCount[w] = (wordCount[w] || 0) + 1;
        }
      });
    });
    const sorted = Object.keys(wordCount).sort((a, b) => wordCount[b] - wordCount[a]).slice(0, 4);
    if (sorted.length === 0) return null;
    return sorted.map(w => w.charAt(0).toUpperCase() + w.slice(1));
  } catch(e) {
    console.error('Erro em fetchPopularTags:', e);
    return null;
  }
}

// ??? SYNC CATEGORIES DO BANCO ?????????????????????????????????
async function fetchCategoriesFromDB() {
  try {
    const dbCats = await getCategories();
    if (!dbCats || typeof CATEGORIES === 'undefined') return;
    if (dbCats.length > 0) {
      CATEGORIES.length = 0; // Clear mock categories if DB is available
    }
    
    dbCats.forEach(dbCat => {
        CATEGORIES.push({
          id: dbCat.id,
          name_pt: dbCat.name_pt || dbCat.name,
          name_es: dbCat.name_es || dbCat.nameEs || dbCat.name_pt,
          icon: dbCat.icon || '??',
          color: dbCat.color || '',
          active: dbCat.active !== false,
          count: 0
        });
    });
  } catch (e) {
    console.error('Erro em fetchCategoriesFromDB:', e);
  }
}

// ??? EVENTOS ??????????????????????????????????????????????????
async function fetchEventsFromDB() {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb.from('eventos').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Erro ao buscar eventos:', err);
    return [];
  }
}

/* ── PUBLIC SELLER PROFILE ────────────────────────────────────────── */
async function getSellerProfile(userId) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getSellerAds(userId) {
  const { data, error } = await getSupabase()
    .from('ads')
    .select('id, title_pt, title_es, price, currency, category_id, location, status, images, is_featured, created_at, categories(name_pt, name_es, icon)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

window.getSellerProfile = getSellerProfile;
window.getSellerAds = getSellerAds;


/* ── ANALYTICS: VIEWS ─────────────────────────────────────────────── */
async function incrementAdView(adId) {
  try {
    // Basic IP hash generation on client side (for debounce logic)
    const ipStr = window.navigator.userAgent + '_' + window.screen.width; 
    let hash = 0;
    for (let i = 0; i < ipStr.length; i++) {
        hash = ((hash << 5) - hash) + ipStr.charCodeAt(i);
        hash |= 0;
    }
    const ipHash = 'client_' + Math.abs(hash).toString(16);

    const { data, error } = await getSupabase().rpc('increment_ad_view_safe', {
      p_ad_id: adId,
      p_ip_hash: ipHash
    });
    
    // If RPC fails (maybe not deployed yet), fail silently
  } catch (err) {
    console.warn('Could not increment views via RPC', err);
  }
}
window.incrementAdView = incrementAdView;
