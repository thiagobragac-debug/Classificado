// ============================================
//   TAUZE CLASS — Supabase Client (Next.js)
//   Mesma lógica do supabase.js original,
//   agora tipada e compatível com SSR.
// ============================================

import { createBrowserClient } from '@supabase/ssr';

export const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// PostgREST embeda relação 1:1 ora como objeto, ora como array de 1 item
// (depende de FK/inferência de cardinalidade) — usado nos vários lugares que
// juntam profiles/ads com user_secrets (relação 1:1 por id compartilhado).
export function flattenOne<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

// Singleton do cliente (browser)
let _sb: ReturnType<typeof createBrowserClient> | null = null;
export function getSupabase() {
  if (!_sb) {
    // BUG CORRIGIDO (auditoria de segurança, 2026-08-31): ver o mesmo
    // comentário em lib/supabase-server.ts — sem cookieOptions, o cookie de
    // sessão sai sem a flag `secure`.
    _sb = createBrowserClient(SUPABASE_URL, SUPABASE_ANON, {
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    });
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
  const { data: profileRaw } = await getSupabase()
    .from('profiles')
    // BUG CORRIGIDO (teste completo do site, 2026-08-24): 'pais' não existe
    // em profiles (a coluna real é 'country') — a query inteira falhava
    // (42703), fazendo getCurrentUser() sempre devolver null. Função sem
    // nenhum chamador hoje (código morto), mas quebraria assim que alguém
    // reativasse — corrigido preventivamente.
    .select('id, name, display_name, avatar_url, verified, country, user_secrets(plan)')
    .eq('id', session.user.id)
    .maybeSingle();

  const profile = profileRaw ? {
    ...profileRaw,
    plan: flattenOne(profileRaw.user_secrets)?.plan
  } : null;

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

// BUG CORRIGIDO (feature aprovada pelo usuário, 2026-09-02): caminho
// PRINCIPAL do login com Google agora é este — signInWithIdToken aceita o
// ID token que o Google Identity Services devolve direto no navegador (ver
// lib/google-identity.ts), sem nenhum redirect, então a tela "Prosseguir
// para <projeto>.supabase.co" nunca aparece. Não precisa de rota de
// callback (não existe /auth/callback?code=... pra trocar por sessão) — o
// resultado já vem pronto aqui, o chamador só decide pra onde navegar.
export async function loginWithGoogleIdToken(idToken: string, nonce: string) {
  const { data, error } = await getSupabase().auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce,
  });
  if (error) throw error;
  return data;
}

// FALLBACK do login com Google (achado ao vivo, 2026-09-02): o fluxo
// principal acima (signInWithIdToken) depende do seletor de conta do
// Google (FedCM) conseguir abrir — testado ao vivo e confirmado que isso
// falha em aba anônima (Chrome desliga FedCM de propósito, por
// privacidade) e em qualquer Chrome sem login feito NO PRÓPRIO
// NAVEGADOR (diferente de estar logado no Gmail numa aba) — os dois são
// cenários reais que uma parte real dos usuários vai bater. Mantido como
// segunda opção: LoginForm.tsx cai pra este fluxo automaticamente quando
// o seletor de conta não consegue nem abrir (GoogleIdentityUnavailable),
// nunca quando o usuário só fechou o seletor sem escolher nada
// (GoogleSignInCancelled) — nesse caso a intenção do usuário foi não
// logar agora, não "tenta de outro jeito".
export async function loginWithGoogle(redirectTo?: string) {
  const path = redirectTo || '/painel';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(path)}` }
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

export async function logout(reason?: 'inactivity') {
  await getSupabase().auth.signOut();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('tc_favorites');
    localStorage.removeItem('tc_user_initials');
    localStorage.removeItem('tc_user_id');
  }
  if (typeof window !== 'undefined') window.location.href = reason ? `/?logout=${reason}` : '/';
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
  localize?: boolean;
}

export async function getAds({
  category, country, state, city, search, preco_min, preco_max,
  featured, page, cursor, limit = 20, status = 'active', user_id, signal, localize
}: AdFilters = {}) {
  const currentPage = cursor ? cursor : (page ? page : 1);
  const from = (currentPage - 1) * limit;
  
  if (localize) {
    // Para paginação infinita da home (Recent Ads) com geolocalização
    let rpcQ = getSupabase().rpc('get_localized_recent_ads', {
      p_city: city || null,
      p_state: state || null,
      p_country: country || null,
      p_limit: limit,
      p_offset: from
    }).select('id, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at, profiles(name, avatar_url, verified)');
    
    if (signal) rpcQ = rpcQ.abortSignal(signal);
    const { data, error } = await rpcQ.limit(limit);
    if (error) throw error;
    
    const rows = ((data as any[]) || []).slice(0, limit);
    const hasMore = rows.length === limit;
    const nextCursor = hasMore ? currentPage + 1 : null;
    return { ads: rows, total: null, nextCursor, hasMore };
  }

  let q = getSupabase()
    .from('ads')
    .select('id, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at, profiles(name, avatar_url, verified)')
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
    // BUG CORRIGIDO (varredura de segurança, vazamento de dados): função
    // sem chamador hoje (código morto), mas o mesmo padrão desta query já
    // vazou telefone de vendedor pro RSC payload público em
    // app/(public)/anuncio/[id]/page.tsx antes de ser corrigido lá (ver
    // comentário "GAP DE SEGURANÇA CORRIGIDO" naquele arquivo). Removido
    // preventivamente aqui também.
    .select('*, profiles(id, name, display_name, avatar_url, verified, country, created_at), categories(name_pt, name_es, icon)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
// ─── Tipos do Payload de Anúncio ──────────────────────────────

/** Campos permitidos ao criar/editar um anúncio via cliente */
export interface AdPayload {
  title_pt: string;
  description: string;
  category_id: string;
  subcategory_id?: string | null;
  purpose?: string | null;
  price: number | null;
  currency: string;
  price_unit_pt?: string | null;
  country: string;
  state: string;
  city: string;
  negotiable: boolean;
  condition?: string | null;
  // status: apenas 'draft' ou 'pending' — 'active' é definido pelo servidor após moderação
  status: 'draft' | 'pending';
  images: string[];
  video_url?: string | null;
}

export async function createAd(payload: AdPayload) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  // user_id é sempre sobrescrito com o da sessão — nunca pode vir do cliente
  const safePayload: AdPayload & { user_id: string } = {
    ...payload,
    user_id: session.user.id,
  };

  if (safePayload.description) {
    // BUG CORRIGIDO (re-auditoria de segurança, 2026-08-30): DOMPurify.sanitize()
    // sem config usa a allowlist DEFAULT da lib — bem mais permissiva que o
    // necessário aqui (mantém <img>, <table>, <h1>, atributo style etc.).
    // Hoje isso só não vira XSS porque a leitura pública (anuncio/[id]/page.tsx)
    // re-sanitiza com allowlist restrita antes de renderizar — mas depender de
    // um único choke point de leitura é frágil. Usa a mesma allowlist restrita
    // do resto do projeto (lib/sanitize.ts), escrita e leitura consistentes.
    const { sanitizeHtml } = await import('./sanitize');
    safePayload.description = sanitizeHtml(safePayload.description);
  }

  const { data, error } = await getSupabase().from('ads').insert([safePayload]).select().single();
  if (error) throw error;
  return data;
}

export async function updateAd(id: string, payload: AdPayload) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  if (payload.description) {
    // Ver comentário equivalente em createAd() — mesma correção.
    const { sanitizeHtml } = await import('./sanitize');
    payload.description = sanitizeHtml(payload.description);
  }

  // .eq('user_id', session.user.id) garante que o usuário só edita seus próprios anúncios
  const { data, error } = await getSupabase()
    .from('ads')
    .update(payload)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// BUG CORRIGIDO (auditoria de segurança, 2026-08-30): a extensão vinha direto
// de `file.name` (controlado pelo cliente — dá pra construir um File com
// qualquer `name` via JS) sem sanitização, ao contrário do fluxo de KYC
// (VerificacaoClient.tsx), que já normaliza. Sem isso, um nome de arquivo sem
// nenhum '.' faz `.split('.').pop()` devolver o nome inteiro como "extensão"
// — incluindo `/` ou `..` — compondo o path final do objeto de storage com
// segmentos não previstos. Mesma sanitização do fluxo de KYC, agora
// centralizada para os demais pontos de upload (ad-images, ad-videos,
// profile-banners, banners do admin).
export function safeFileExt(fileName: string, fallback = 'jpg'): string {
  const raw = fileName.split('.').pop() || fallback;
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '') || fallback;
}

export async function uploadAdImage(file: File, folder = 'draft'): Promise<string | null> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const ext = safeFileExt(file.name);
  // uid como primeiro segmento do path: a policy de INSERT do bucket ad-images
  // (supabase/migrations/20260826110000_validacao_zero_3a_rodada.sql) exige
  // (auth.uid())::text = (storage.foldername(name))[1] — com pasta antes do
  // uid, [1] nunca bate com auth.uid() e TODO upload cai em 403 (RLS), como o
  // fluxo normal de anúncio (StepPhotos.tsx) e os uploads do admin
  // (leilões/banners). Confirmado ao vivo: uid/pasta/arquivo passa, pasta/uid
  // não passa. Mesma convenção já usada pelo upload de KYC.
  const fileName = `${session.user.id}/${folder}/${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;
  
  const { data, error } = await getSupabase().storage.from('ad-images').upload(fileName, file, {
    cacheControl: '31536000',
    upsert: false
  });
  
  if (error) throw error;
  
  const { data: { publicUrl } } = getSupabase().storage.from('ad-images').getPublicUrl(fileName);
  return publicUrl;
}

// BUG CORRIGIDO (achado em auditoria de imagens): remover uma foto no
// wizard (ou trocar a galeria inteira ao editar um anúncio) só tirava a URL
// do array `images` — o objeto já enviado ao bucket nunca era apagado,
// ficando órfão pra sempre. Best-effort de propósito (chamador não deve
// travar o fluxo principal por causa disso): filtra só URLs que são de fato
// deste bucket (nunca tenta apagar uma URL externa) antes de chamar remove().
export async function deleteAdImages(urls: string[]): Promise<void> {
  const paths = urls
    .map(url => url.split('/ad-images/')[1])
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  const { error } = await getSupabase().storage.from('ad-images').remove(paths);
  if (error) console.error('[deleteAdImages] Falha ao limpar fotos removidas:', error.message);
}

// Bucket `ad-videos` já existia provisionado (50MB, mp4/webm) antes desta
// função — a promessa de "vídeo no anúncio" (planos PRO/Premium) nunca
// tinha upload de verdade, só o campo de exibição em AdGallery. A checagem
// de plano (has_video) é reforçada no banco (enforce_ad_media_plan_limits,
// supabase/migrations/20260825150300) — aqui só sobe o arquivo.
export async function uploadAdVideo(file: File, folder = 'draft'): Promise<string | null> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const ext = safeFileExt(file.name);
  const fileName = `${folder}/${session.user.id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;

  const { error } = await getSupabase().storage.from('ad-videos').upload(fileName, file, {
    cacheControl: '31536000',
    upsert: false
  });

  if (error) throw error;

  const { data: { publicUrl } } = getSupabase().storage.from('ad-videos').getPublicUrl(fileName);
  return publicUrl;
}

// BUG CORRIGIDO: mesmo problema de deleteAdImages, só que pro vídeo do
// anúncio (bucket ad-videos) — trocar ou remover o vídeo nunca limpava o
// arquivo anterior.
export async function deleteAdVideo(url: string | null | undefined): Promise<void> {
  const path = url?.split('/ad-videos/')[1];
  if (!path) return;
  const { error } = await getSupabase().storage.from('ad-videos').remove([path]);
  if (error) console.error('[deleteAdVideo] Falha ao limpar vídeo removido:', error.message);
}

// ─── FAVORITOS ─────────────────────────────────────────────────

// BUG CORRIGIDO (varredura cruzada de cenários): o fallback abaixo tratava
// QUALQUER erro da RPC (rate limit, permissão, o que for) como "a função não
// existe", mascarando erros de negócio reais como sucesso silencioso E
// reabrindo a race condition de check-then-act que a RPC atômica existe pra
// evitar. Só cai no fallback quando o próprio Postgres/PostgREST sinaliza
// que a função não foi encontrada — qualquer outro erro sobe pro chamador.
const RPC_NOT_FOUND_CODES = new Set(['PGRST202', '42883']);

export async function rpcToggleFav(adId: string) {
  const session = await getSession();
  if (!session) return false;

  const { data, error } = await getSupabase().rpc('toggle_favorite_atomic', { p_ad_id: adId });
  if (!error) return data;
  if (!RPC_NOT_FOUND_CODES.has(error.code)) throw error;

  // Fallback apenas quando a RPC realmente não existe no schema cache
  const { data: existing } = await getSupabase()
    .from('favorites')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('ad_id', adId)
    .maybeSingle();

  if (existing) {
    await getSupabase().from('favorites').delete().eq('id', existing.id);
    return { status: 'removed' };
  } else {
    await getSupabase().from('favorites').insert({ user_id: session.user.id, ad_id: adId });
    return { status: 'added' };
  }
}

export async function getMyFavorites() {
  const session = await getSession();
  if (!session) return [];
  // BUG CORRIGIDO (validação adversarial final): sem .limit(), buscava
  // TODOS os favoritos do usuário com ads+profiles aninhados de uma vez —
  // FavoritesTab fica sempre montada (ver PainelClient.tsx), então esta
  // query roda em TODA visita a /painel, não só quando a aba é aberta.
  // Mesmo teto de lib/supabase-panel.ts/getMyBilling.
  const { data, error } = await getSupabase()
    .from('favorites')
    .select('*, ads(*, profiles(name))')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((f: any) => f.ads);
}

// ─── MENSAGENS ─────────────────────────────────────────────────

export async function getMyMessages() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await getSupabase()
    .from('messages')
    // BUG CORRIGIDO (auditoria de i18n, verificação independente 2026-08-27):
    // só buscava title_pt — MessagesTab.tsx já sabia escolher title_es
    // quando lang='es', mas a query nunca trazia essa coluna, então o
    // título do anúncio na conversa ficava sempre em português.
    .select('*, ads(title_pt, title_es, images), sender:profiles!messages_sender_id_fkey(name, avatar_url), receiver:profiles!messages_receiver_id_fkey(name, avatar_url)')
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
  // A função deriva o usuário de auth.uid() internamente — nunca aceita
  // p_user_id do cliente. Ver supabase/migrations/20260823140000.
  const { data, error } = await getSupabase().rpc('place_bid_atomic', {
    p_auction_id: auctionId, p_amount: numAmount
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Erro ao processar lance.');
  return data;
}

// FUNCIONALIDADE NOVA: lance por LOTE do "Leilão Virtual"
// (auction_events/auction_lots) — sistema separado do leilão de anúncio
// individual acima (auctions/auction_bids). Antes desta função existir,
// LotBiddingModal chamava placeBid() passando o id do EVENTO, que
// place_bid_atomic procurava na tabela errada (auctions) — todo lance
// falhava com "Leilão não encontrado". Ver
// supabase/migrations/20260824160000_add_lot_bidding_system.sql.
export async function placeLotBid(lotId: string, amount: number | string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const sanitized = typeof amount === 'string'
    ? amount.replace(/\./g, '').replace(',', '.')
    : amount;
  const numAmount = Number(sanitized);
  if (!isFinite(numAmount) || numAmount <= 0) throw new Error('Valor do lance inválido.');
  const { data, error } = await getSupabase().rpc('place_lot_bid_atomic', {
    p_lot_id: lotId, p_amount: numAmount
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Erro ao processar lance.');
  return data;
}

// ─── BANNERS ────────────────────────────────────────────────────

// Mapa bidirecional UF <-> nome completo do estado — mesmo conteúdo de
// BR_STATES em lib/services/ads.service.ts (server-only, não pode ser
// importado por este arquivo client-safe) e da cópia local em
// app/(public)/anunciar/_components/StepLocation.tsx. Duplicado aqui de
// propósito, seguindo o mesmo padrão já usado nesses dois arquivos.
const BR_STATES: Record<string, string> = {
  'Acre': 'AC', 'AC': 'Acre',
  'Alagoas': 'AL', 'AL': 'Alagoas',
  'Amapá': 'AP', 'AP': 'Amapá',
  'Amazonas': 'AM', 'AM': 'Amazonas',
  'Bahia': 'BA', 'BA': 'Bahia',
  'Ceará': 'CE', 'CE': 'Ceará',
  'Distrito Federal': 'DF', 'DF': 'Distrito Federal',
  'Espírito Santo': 'ES', 'ES': 'Espírito Santo',
  'Goiás': 'GO', 'GO': 'Goiás',
  'Maranhão': 'MA', 'MA': 'Maranhão',
  'Mato Grosso': 'MT', 'MT': 'Mato Grosso',
  'Mato Grosso do Sul': 'MS', 'MS': 'Mato Grosso do Sul',
  'Minas Gerais': 'MG', 'MG': 'Minas Gerais',
  'Pará': 'PA', 'PA': 'Pará',
  'Paraíba': 'PB', 'PB': 'Paraíba',
  'Paraná': 'PR', 'PR': 'Paraná',
  'Pernambuco': 'PE', 'PE': 'Pernambuco',
  'Piauí': 'PI', 'PI': 'Piauí',
  'Rio de Janeiro': 'RJ', 'RJ': 'Rio de Janeiro',
  'Rio Grande do Norte': 'RN', 'RN': 'Rio Grande do Norte',
  'Rio Grande do Sul': 'RS', 'RS': 'Rio Grande do Sul',
  'Rondônia': 'RO', 'RO': 'Rondônia',
  'Roraima': 'RR', 'RR': 'Roraima',
  'Santa Catarina': 'SC', 'SC': 'Santa Catarina',
  'São Paulo': 'SP', 'SP': 'São Paulo',
  'Sergipe': 'SE', 'SE': 'Sergipe',
  'Tocantins': 'TO', 'TO': 'Tocantins',
};

// Fisher-Yates — usado pra alternar impressão entre banners concorrentes
// (mesma posição + mesmo alvo geográfico) em vez de sempre exibir o mesmo.
function shuffleBanners<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function getBanners(position: string, userLoc: any = null) {
  const { data } = await getSupabase()
    .from('banners')
    .select('id, image_url, link_url, name, target_type, target_location')
    .eq('position', position)
    .eq('status', 'active')
    .limit(20);
  const allBanners = data || [];
  if (!userLoc) return shuffleBanners(allBanners);
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const locCity = norm(userLoc.city);
  const locState = norm(userLoc.state);
  const locCountry = norm(userLoc.country);
  // Membros plenos do Mercosul — usado pelo alvo 'mercosul' (banner regional,
  // sem target_location próprio, ver app/(admin)/admin/banners/page.tsx).
  const MERCOSUL_COUNTRIES = new Set(['brasil', 'argentina', 'uruguai', 'paraguai']);

  const cityB: any[] = [], stateB: any[] = [], countryB: any[] = [], mercosulB: any[] = [], globalB: any[] = [];
  for (const b of allBanners) {
    const type = b.target_type || 'global';
    const loc = norm(b.target_location);
    if (type === 'city') {
      // Separador '|' (não '-'): nomes reais de município têm hífen (ex.:
      // Embu-Guaçu/SP), o que quebrava tanto a UI de cadastro quanto este
      // parsing quando ambos usavam '-'.
      const rawParts = (b.target_location || '').split('|');
      const targetCity = norm(rawParts[0] || '');
      // BUG CRITICO CORRIGIDO (teste completo de monetizacao de banners,
      // 2026-09-01): a UI de cadastro so permite digitar a UF (2 letras, ex.
      // "SP") neste campo, mas userLoc.state (useGeoLocation/lib/geoip.ts)
      // vem como o NOME COMPLETO do estado (ex. "Sao Paulo") - a UF nunca
      // batia com o nome completo e nenhum banner de cidade jamais era
      // exibido a ninguem. Corrigido com o MESMO criterio ja usado pela
      // pagina de listagem (getAdsListagem em lib/services/ads.service.ts):
      // expande o valor salvo nos dois sentidos via BR_STATES (UF -> nome
      // completo e vice-versa) e aceita casar com qualquer uma das duas
      // formas. O lookup precisa ser feito ANTES de normalizar (chaves de
      // BR_STATES sao exatas, ex. "SP"/"Sao Paulo"), so normalizando o
      // resultado da busca.
      const rawTargetState = (rawParts[1] || '').trim();
      const targetStateAlt = BR_STATES[rawTargetState] || BR_STATES[rawTargetState.toUpperCase()] || '';
      const targetState = norm(rawTargetState);
      const targetStateAltNorm = norm(targetStateAlt);
      const stateMatches = targetState === locState || (!!targetStateAltNorm && targetStateAltNorm === locState);
      if (targetCity === locCity && stateMatches) cityB.push(b);
    }
    else if (type === 'state' && loc === locState) stateB.push(b);
    else if (type === 'country' && loc === locCountry) countryB.push(b);
    else if (type === 'mercosul' && MERCOSUL_COUNTRIES.has(locCountry)) mercosulB.push(b);
    else if (type === 'global') globalB.push(b);
  }
  const winner = cityB.length ? cityB : stateB.length ? stateB : countryB.length ? countryB : mercosulB.length ? mercosulB : globalB;
  return shuffleBanners(winner);
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
  // BUG CORRIGIDO (varredura de segurança, vazamento de dados): função sem
  // chamador hoje (código morto), mas expunha phone_whatsapp de OUTRO
  // usuário pra quem chamasse — mesma classe de vazamento já corrigida em
  // app/(public)/anuncio/[id]/page.tsx. Removido preventivamente.
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, name, display_name, avatar_url, verified, country, created_at')
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

// BUG CORRIGIDO (fechamento pré-produção): phone_whatsapp mudou de profiles
// pra user_secrets (RLS self-only) — vazava pra qualquer usuário autenticado
// via profiles antes (RLS de profiles é pública, só a coluna era revogada de
// anon). Precisa entrar aqui pra updateProfile() gravar no lugar certo.
const SECRET_KEYS = ['document_type', 'document_number', 'zip_code', 'street',
  'number', 'complement', 'neighborhood', 'kyc_doc_url', 'kyc_selfie_url', 'account_type',
  'phone_whatsapp'];

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
    const { error } = await getSupabase().from('user_secrets').upsert(secretUpdates);
    if (error) throw error;
  }
}

export async function getProfile(userId: string) {
  const [profileResult, secretsResult] = await Promise.all([
    // Selecionar colunas específicas — sem select('*') que exporia campos sensíveis
    getSupabase()
      .from('profiles')
      .select('id, name, display_name, avatar_url, bio, city, state, country, verified, kyc_status, created_at')
      .eq('id', userId)
      .maybeSingle(),
    // user_secrets: apenas dados que o próprio usuário precisa ver no painel
    // NUNCA retornar: is_admin (client não deve saber), kyc_doc_url/kyc_selfie_url (URLs de storage privado)
    getSupabase()
      .from('user_secrets')
      .select('plan, document_type, zip_code, street, number, complement, neighborhood, phone_whatsapp')
      .eq('id', userId)
      .maybeSingle(),
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
  // Soft-delete: preserva o registro para auditoria, enquanto o remove da listagem pública
  const { error } = await getSupabase()
    .from('ads')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', adId)
    .eq('user_id', session.user.id);
  if (error) throw error;
}

// ── COTA DE ANÚNCIOS (janela de graça de downgrade) ─────────────────────────
// Ver supabase/migrations/20260901110000_grace_period_pausa_anuncios_excedentes.sql.
// Mesmo padrão de toggleAdStatus/rpcToggleFav logo acima: chamada direta do
// client (anon key + sessão do usuário), não passa por rota de API — as duas
// funções SQL abaixo derivam o usuário de auth.uid() internamente.
export async function getAdQuotaPending() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await getSupabase()
    .from('ad_quota_pending')
    .select('max_ads, deadline')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function applyAdQuotaGraceSelection(keepAdIds: string[]) {
  const { error } = await getSupabase().rpc('apply_ad_quota_grace_selection', { p_keep_ad_ids: keepAdIds });
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

// BUG CORRIGIDO (varredura cruzada de cenários, feature aprovada pelo
// usuário): lia de `transactions`, uma tabela de um design de billing
// anterior ao atual (subscriptions + gateways reais) — nenhum código hoje
// grava linhas nela, então "Histórico de Faturas" estava sempre vazio ou
// mostrando dados congelados/nunca atualizados pra qualquer usuário real.
// `subscriptions` não é um livro-razão de faturas (não há uma linha por
// cobrança/mês) — é o estado atual da assinatura, ocasionalmente com mais
// de uma linha por usuário (ex.: assinatura antiga cancelada + nova). Por
// isso BillingTab.tsx passou a chamar isso de "Histórico de Assinaturas",
// não "Histórico de Faturas" — mostrar como se fosse uma fatura por mês
// seria inventar dados que o schema não tem.
export async function getMyBilling(): Promise<any[]> {
  const session = await getSession();
  if (!session) return [];
  const { data } = await getSupabase()
    .from('subscriptions').select('*').eq('user_id', session.user.id)
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
