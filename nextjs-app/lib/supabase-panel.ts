// Funções adicionais do Supabase para o Painel
import { getSupabase, getSession } from './supabase';

// BUG CORRIGIDO (achado ao vivo, varredura de segurança/performance/RLS,
// 2026-09-24): 7 das 9 funções que existiam aqui (getMyAds, pauseAd,
// updateProfile, getMyBilling, getMySubscription, getUserAdStats,
// deleteConversation) nunca eram importadas em lugar nenhum do app — cada
// uma tinha uma versão homônima E DIVERGENTE de verdade em lib/supabase.ts
// (a que os componentes reais importam), então correções feitas aqui
// nunca chegavam ao código que roda em produção (foi exatamente o que
// aconteceu com o filtro de status='deleted' em getMyAds — corrigido
// nesta mesma sessão só na cópia certa). Removidas; só deleteAd e
// resendVerificationEmail (as duas realmente importadas, por
// MyAdsTab.tsx/ProfileTab.tsx) continuam aqui.

export async function deleteAd(adId: string) {
  const session = await getSession();
  if (!session) throw new Error('Não autenticado');
  const { error } = await getSupabase()
    .from('ads').update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', adId).eq('user_id', session.user.id);
  if (error) throw error;
}

export async function resendVerificationEmail(email: string) {
  const { error } = await getSupabase().auth.resend({ type: 'signup', email });
  if (error) throw error;
}
