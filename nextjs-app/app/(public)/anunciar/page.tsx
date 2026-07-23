import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { AnunciarWizard } from './AnunciarWizard';

export default async function AnunciarPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  // Handle both Next 14 and Next 15 searchParams paradigms safely
  const params = await Promise.resolve(searchParams);
  const id = params?.id as string | undefined;

  // 1. Removida a trava de login imediato para permitir Progressive Profiling.
  // Usuários podem preencher os dados do anúncio primeiro e só farão login na última etapa.

  let initialData = null;
  let isEditMode = false;

  if (id) {
    const { data } = await supabase
      .from('ads')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    if (data) {
      initialData = data;
      isEditMode = true;
    }
  } else if (session) {
    // Resume draft if exists
    const { data: draftData } = await supabase
      .from('ads')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftData) {
      initialData = draftData;
    }
  }

  let userProfile = null;
  if (session) {
    const { data } = await supabase
      .from('profiles')
      .select('country, state, city')
      .eq('id', session.user.id)
      .maybeSingle();
    userProfile = data;
  }

  let country = userProfile?.country;
  if (country) {
    if (country.includes('Brasil') || country === 'Brazil' || country === 'BR') country = 'Brasil';
    else if (country.includes('Argentina')) country = 'Argentina';
    else if (country.includes('Uruguai')) country = 'Uruguai';
    else if (country.includes('Paraguai')) country = 'Paraguai';
    if (userProfile) userProfile.country = country;
  }

  return (
    <AnunciarWizard 
      initialData={initialData} 
      userProfile={userProfile} 
      isEditMode={isEditMode} 
    />
  );
}
