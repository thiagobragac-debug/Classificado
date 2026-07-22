// Funções adicionais do Supabase para o Painel
import { getSupabase, getSession } from './supabase';

export async function getMyAds({ status = 'all', page = 1, limit = 12 } = {}): Promise<{ data: any[], total: number }> {
  const session = await getSession();
  if (!session) return { data: [], total: 0 };
  const from = (page - 1) * limit;
  let q = getSupabase()
    .from('ads')
    .select('id, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at', { count: 'exact' })
    .eq('user_id', session.user.id)
    .not('status', 'eq', 'deleted')
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);
  if (status !== 'all') q = (q as any).eq('status', status);
  const { data, count, error } = await (q as any);
  if (error) throw error;
  return { data: data || [], total: count || 0 };
}

export async function deleteAd(adId: string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { error } = await getSupabase()
    .from('ads').update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', adId).eq('user_id', session.user.id);
  if (error) throw error;
}

export async function pauseAd(adId: string, currentStatus: string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const newStatus = currentStatus === 'paused' ? 'active' : 'paused';
  const { error } = await getSupabase()
    .from('ads').update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', adId).eq('user_id', session.user.id);
  if (error) throw error;
  return newStatus;
}

export async function updateProfile(profileData: Record<string, any>) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { error } = await getSupabase()
    .from('profiles').update(profileData).eq('id', session.user.id);
  if (error) throw error;
}

export async function getMyBilling(): Promise<any[]> {
  const session = await getSession();
  if (!session) return [];
  const { data } = await getSupabase()
    .from('payments').select('*').eq('user_id', session.user.id)
    .order('created_at', { ascending: false }).limit(50);
  return data || [];
}

export async function getMySubscription() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await getSupabase()
    .from('subscriptions').select('*').eq('user_id', session.user.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function getUserAdStats(userId: string) {
  const { data } = await getSupabase().rpc('get_user_ads_stats', { p_user_id: userId });
  return data;
}

export async function deleteConversation(adId: string, otherUserId: string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { error } = await getSupabase()
    .from('messages')
    .delete()
    .eq('ad_id', adId)
    .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${session.user.id})`);
  if (error) throw error;
}

export async function resendVerificationEmail(email: string) {
  const { error } = await getSupabase().auth.resend({ type: 'signup', email });
  if (error) throw error;
}

export async function uploadKycDocument(docFile: File, selfieFile: File) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  
  const uid = session.user.id;
  
  // Funcao helper para upload
  const up = async (file: File, path: string) => {
    const { error } = await getSupabase().storage.from('kyc-docs').upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };
  
  const docPath = await up(docFile, `${uid}/doc.jpg`);
  const selfiePath = await up(selfieFile, `${uid}/selfie.jpg`);
  
  // Update Profile
  await updateProfile({
    kyc_status: 'pending',
    kyc_doc_url: docPath,
    kyc_selfie_url: selfiePath
  });
}
