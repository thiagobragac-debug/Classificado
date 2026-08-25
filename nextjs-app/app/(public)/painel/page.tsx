import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase-server';
import PainelClient from './PainelClient';

export default async function PainelPage() {
  // Uma única chamada getUser() — o proxy já validou a autenticação
  // e negou acesso a não autenticados. Aqui buscamos os dados do usuário
  // para montar o painel sem chamada duplicada de auth.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Defesa em profundidade: fallback caso o proxy seja bypassado
  if (!user) {
    redirect('/login?error=no_user');
  }

  // --- Dynamic Expiration Check ---
  // Ensure that if a plan has passed its plan_expires_at date, the user is downgraded.
  // This prevents infinite access if gateways fail to send a cancellation webhook
  // or if the user cancelled but their plan was set to remain active until period end.
  await supabase.rpc('enforce_plan_expiration', { p_user_id: user.id });

  // Buscar perfil e secrets em paralelo com colunas específicas
  const [{ data: profileData, error: profileError }, { data: secretsData }] = await Promise.all([
    supabase
      .from('profiles')
      // BUG CORRIGIDO (teste completo do site, 2026-08-24): faltava kyc_status,
      // email_verified e phone_verified — ProfileTab usa esses campos pros
      // badges de verificação, que por isso sempre mostravam "Não Enviado"/
      // "Pendente" mesmo com o status real já atualizado no banco.
      .select('id, name, display_name, avatar_url, phone_whatsapp, bio, city, state, country, kyc_status, email_verified, phone_verified')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_secrets')
      .select('plan') // apenas 'plan' — is_admin NÃO deve ser exposto ao cliente
      .eq('id', user.id)
      .maybeSingle()
  ]);

  let profile = profileData ? {
    ...profileData,
    plan: secretsData?.plan || 'free',
    // is_admin propositalmente omitido — lógica de admin deve ser server-only
  } : null;

  if (!profile) {
    // "Curar" contas sem perfil (pode acontecer em logins OAuth)
    const { data: newProfileRaw, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
        display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Usuário'
      })
      // BUG CORRIGIDO (teste completo do site, 2026-08-24): faltava kyc_status,
      // email_verified e phone_verified — ProfileTab usa esses campos pros
      // badges de verificação, que por isso sempre mostravam "Não Enviado"/
      // "Pendente" mesmo com o status real já atualizado no banco.
      .select('id, name, display_name, avatar_url, phone_whatsapp, bio, city, state, country, kyc_status, email_verified, phone_verified')
      .single();

    if (newProfileRaw) {
      // O trigger no BD criará o user_secrets com plan='free'
      profile = { ...newProfileRaw, plan: 'free' };
    } else {
      console.error('Erro ao auto-criar perfil:', insertError);
      redirect('/login?error=profile_creation_failed');
    }
  }

  // Filtro de segurança: apenas o necessário para o cliente
  const fullUser = {
    id: user.id,
    email: user.email,
    // BUG CORRIGIDO (teste completo do site, 2026-08-24): faltava — o badge
    // de e-mail em ProfileTab.tsx lê user.email_confirmed_at, mas fullUser
    // nunca repassava esse campo, então sempre mostrava "Pendente" mesmo
    // para conta com e-mail já confirmado.
    email_confirmed_at: user.email_confirmed_at,
    profile,
  };

  // Buscar stats via RPC consolidador
  const { data: statsData, error: statsError } = await supabase
    .rpc('get_user_ad_stats', { p_user_id: user.id });

  let adStats = { total: 0, active: 0 };
  if (!statsError && statsData && statsData.length > 0) {
    adStats = {
      total: statsData[0].total_ads || 0,
      active: statsData[0].active_ads || 0,
    };
  }

  // Suspense required: PainelClient uses useSearchParams() internally (detects ?subscribed=1).
  // Without this, Next.js 14 App Router throws a build error.
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontSize: '1rem', color: '#64748b' }}>Carregando painel...</div>}>
      <PainelClient initialUser={fullUser} initialStats={adStats} />
    </Suspense>
  );
}
