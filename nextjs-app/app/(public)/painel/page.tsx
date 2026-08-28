import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import { PLAN_META } from '@/lib/supabase';
import PainelClient from './PainelClient';

export default async function PainelPage() {
  // BUG CORRIGIDO (revalidação do zero da auditoria de i18n): fallback do
  // Suspense abaixo hardcoded em PT, sem nenhuma lógica de idioma — esse
  // fallback é alcançável de verdade via navegação client-side pro /painel
  // (Header.tsx e CtaSection.tsx usam next/link).
  const cookieStore = await cookies();
  const lang = cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt';
  const loadingText = lang === 'es' ? 'Cargando panel...' : 'Carregando painel...';

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
      // BUG CORRIGIDO (validação do zero, 3ª rodada): só buscava 'plan' —
      // CPF/CNPJ e endereço moraram para user_secrets desde a migration
      // 20260824210000, mas nunca voltaram a ser lidos aqui. ProfileTab.tsx
      // sempre resetava esses campos pra string vazia (achava que o usuário
      // nunca tinha preenchido nada) e, pior, "Salvar Perfil" reenviava
      // esses valores vazios pro updateProfile() — apagando CPF/endereço
      // reais em QUALQUER salvamento, mesmo editando só a bio. is_admin
      // continua propositalmente fora da lista — lógica de admin é server-only.
      .select('plan, document_number, zip_code, street, number, complement, neighborhood')
      .eq('id', user.id)
      .maybeSingle()
  ]);

  let profile = profileData ? {
    ...profileData,
    plan: secretsData?.plan || 'free',
    document_number: secretsData?.document_number || '',
    zip_code: secretsData?.zip_code || '',
    street: secretsData?.street || '',
    number: secretsData?.number || '',
    complement: secretsData?.complement || '',
    neighborhood: secretsData?.neighborhood || '',
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
      // O trigger no BD criará o user_secrets com plan='free', sem nenhum
      // dado de documento/endereço ainda.
      profile = {
        ...newProfileRaw,
        plan: 'free',
        document_number: '',
        zip_code: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
      };
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

  // BUG CORRIGIDO (teste do plano Grátis, 2026-08-25): o painel usava
  // PLAN_META, um objeto hardcoded em lib/supabase.ts desconectado da
  // tabela `plans` — se o admin mudasse max_ads/highlight_count em
  // /admin/planos, o contador do painel continuava com o valor antigo.
  // Busca a mesma tabela que o trigger enforce_ad_quota usa como fonte de
  // verdade, resolvendo a linha pelo mesmo critério já usado alhures no
  // código (webhook de pagamento usa nome pra pro/premium; o trigger usa
  // price=0 como fallback do plano grátis).
  const { data: plansData } = await supabase
    .from('plans')
    .select('name, description, max_ads, highlight_count')
    .eq('is_active', true);

  const planRow =
    (profile.plan === 'premium' && plansData?.find(p => p.name.toLowerCase().includes('premium'))) ||
    (profile.plan === 'pro' && plansData?.find(p => p.name.toLowerCase().includes('pro'))) ||
    plansData?.find(p => p.max_ads !== undefined && p.name && !p.name.toLowerCase().includes('pro') && !p.name.toLowerCase().includes('premium')) ||
    null;

  const fallbackMeta = PLAN_META[profile.plan] || PLAN_META.free;
  const planMeta = planRow ? {
    label: planRow.name,
    desc: planRow.description || '',
    ads: planRow.max_ads,
    featured: planRow.highlight_count,
    // Convenção de exibição: qualquer limite alto configurado no admin
    // (>= 999) é tratado como "ilimitado" na UI, sem depender de um valor
    // mágico específico (o valor real hoje é 9999).
    unlimited: planRow.max_ads >= 999,
  } : { ...fallbackMeta, unlimited: fallbackMeta.ads >= 999 }; // fallback só se a busca acima falhar

  // Suspense required: PainelClient uses useSearchParams() internally (detects ?subscribed=1).
  // Without this, Next.js 14 App Router throws a build error.
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontSize: '1rem', color: '#64748b' }}>{loadingText}</div>}>
      <PainelClient initialUser={fullUser} initialStats={adStats} initialPlanMeta={planMeta} />
    </Suspense>
  );
}
