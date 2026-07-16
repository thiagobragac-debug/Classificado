const fs = require('fs');
let content = fs.readFileSync('c:/classificado/js/supabase.js', 'utf8');

const oldSyncFn = `async function syncFavoritesLocal() {
  const session = await getSession();
  if (!session) return;
  const { data } = await getSupabase().from('favorites').select('ad_id').eq('user_id', session.user.id);
  if (data) {
    const ids = data.map(r => r.ad_id);
    window.tcFavorites = new Set(ids);
    localStorage.setItem('tc_favorites', JSON.stringify(ids));
    // Atualizar UI
    document.querySelectorAll('.ad-card__fav').forEach(btn => {
      const adId = btn.closest('[aria-label]')?.getAttribute('aria-label') || btn.dataset.adId;
      if (adId) btn.classList.toggle('active', window.tcFavorites.has(adId));
    });
  }
}`;

const newSyncFn = `async function syncFavoritesLocal() {
  const session = await getSession();
  if (!session) return;
  
  // 1. Coleta favoritos salvos localmente
  const localFavs = Array.from(window.tcFavorites || new Set());
  
  // 2. Busca favoritos j� no banco
  const { data } = await getSupabase().from('favorites').select('ad_id').eq('user_id', session.user.id);
  
  if (data) {
    const dbFavs = data.map(r => r.ad_id);
    
    // 3. Encontra o que est� no local mas N�O est� no banco
    const pendingToSync = localFavs.filter(id => !dbFavs.includes(id));
    
    // 4. Se houver pendentes, insere silenciosamente
    if (pendingToSync.length > 0) {
      const rows = pendingToSync.map(id => ({ user_id: session.user.id, ad_id: id }));
      await getSupabase().from('favorites').insert(rows);
      dbFavs.push(...pendingToSync); // atualiza a lista dbFavs em mem�ria
    }
    
    // 5. O banco de dados passa a ser a nova fonte de verdade local
    window.tcFavorites = new Set(dbFavs);
    localStorage.setItem('tc_favorites', JSON.stringify(dbFavs));
    
    // Atualizar UI
    document.querySelectorAll('.ad-card__fav').forEach(btn => {
      const adId = btn.closest('[aria-label]')?.getAttribute('aria-label') || btn.dataset.adId;
      if (adId) btn.classList.toggle('active', window.tcFavorites.has(adId));
    });
  }
}`;

if (content.includes('async function syncFavoritesLocal() {')) {
    content = content.replace(oldSyncFn, newSyncFn);
    fs.writeFileSync('c:/classificado/js/supabase.js', content, 'utf8');
}
