const fs = require('fs');
let content = fs.readFileSync('c:/classificado/js/supabase.js', 'utf-8');

const oldFunc = `async function _rpcToggleFav(adId) {
  const session = await getSession();
  if (!session) { window.location.href = '/login.html'; return; }

  const { data: existing } = await getSupabase()
    .from('favorites').select('id').eq('user_id', session.user.id).eq('ad_id', adId).maybeSingle();

  if (existing) {
    await getSupabase().from('favorites').delete().eq('id', existing.id);
    return false; // removido
  } else {
    await getSupabase().from('favorites').insert({ user_id: session.user.id, ad_id: adId });
    return true; // adicionado
  }
}`;

const newFunc = `async function _rpcToggleFav(adId) {
  const session = await getSession();
  if (!session) { window.location.href = '/login.html'; return; }

  const { data: existingRecords, error } = await getSupabase()
    .from('favorites').select('id').eq('user_id', session.user.id).eq('ad_id', adId);

  if (error) {
    console.error('Erro ao buscar favorito:', error);
    throw error;
  }

  if (existingRecords && existingRecords.length > 0) {
    // Apaga todos os duplicados se houver
    const idsToDelete = existingRecords.map(r => r.id);
    await getSupabase().from('favorites').delete().in('id', idsToDelete);
    return false; // removido
  } else {
    await getSupabase().from('favorites').insert({ user_id: session.user.id, ad_id: adId });
    return true; // adicionado
  }
}`;

if (content.includes('.maybeSingle()')) {
    content = content.replace(oldFunc, newFunc);
    fs.writeFileSync('c:/classificado/js/supabase.js', content, 'utf-8');
}
