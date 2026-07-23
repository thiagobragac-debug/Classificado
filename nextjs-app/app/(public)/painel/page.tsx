import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import PainelClient from './PainelClient';

export default async function PainelPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // Fetch current user details
  const { data: user } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!user) {
    redirect('/login');
  }

  // Merging supabase session user email with profile for the client
  const fullUser = {
    ...session.user,
    profile: user
  };

  // Fetch AdStats in parallel
  const [activeCountRes, totalCountRes] = await Promise.all([
    supabase
      .from('ads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('status', 'active'),
    supabase
      .from('ads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
  ]);
  
  const activeAds = activeCountRes.count || 0;
  const totalCount = totalCountRes.count || 0;
    
  const adStats = {
    total: totalCount || 0,
    active: activeAds
  };

  return <PainelClient initialUser={fullUser} initialStats={adStats} />;
}
