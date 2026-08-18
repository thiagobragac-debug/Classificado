import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { AnunciarWizard } from './AnunciarWizard';
import { normalizeCountry } from '@/lib/geo-utils';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AnunciarPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();

  // Usar getUser() em vez de getSession() para validação real da sessão
  const { data: { user } } = await supabase.auth.getUser();

  // Handle both Next 14 and Next 15 searchParams paradigms safely
  const params = await Promise.resolve(searchParams);
  const id = params?.id as string | undefined;

  let initialData = null;
  let isEditMode = false;

  if (id) {
    // ─── Validar formato UUID antes de qualquer query ──────────
    if (!UUID_REGEX.test(id)) {
      redirect('/anunciar');
    }

    // ─── Exigir login para edição ──────────────────────────────
    if (!user) {
      redirect(`/login?redirectTo=/anunciar?id=${id}`);
    }

    // ─── Buscar anúncio garantindo que pertence ao usuário ──────
    // .eq('user_id', user.id) previne Information Disclosure entre usuários
    const { data } = await supabase
      .from('ads')
      .select('id, title_pt, category_id, price, description, images, video_url, country, state, city, condition, negotiable, currency, price_unit_pt, status')
      .eq('id', id)
      .eq('user_id', user.id) // ← CRÍTICO: garante que só o dono acessa
      .maybeSingle();

    if (data) {
      initialData = data;
      isEditMode = true;
    } else {
      // ID inválido ou não pertence ao usuário — redirecionar silenciosamente
      redirect('/painel');
    }
  } else if (user) {
    // Resume draft do usuário logado
    const { data: draftData } = await supabase
      .from('ads')
      .select('id, title_pt, category_id, price, description, images, video_url, country, state, city, condition, negotiable, currency, price_unit_pt, status')
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftData) {
      initialData = draftData;
    }
  }
  // Progressive Profiling: usuários não logados sem ?id podem preencher o formulário

  let userProfile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('country, state, city')
      .eq('id', user.id)
      .maybeSingle();
    userProfile = data;
  }

  if (userProfile?.country) {
    userProfile.country = normalizeCountry(userProfile.country);
  }

  return (
    <AnunciarWizard
      initialData={initialData}
      userProfile={userProfile}
      isEditMode={isEditMode}
    />
  );
}
