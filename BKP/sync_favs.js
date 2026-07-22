const fs = require('fs');

let sb = fs.readFileSync('c:/classificado/js/supabase.js', 'utf8');

const syncFn = `
async function syncFavoritesLocal() {
  const session = await getSession();
  if (!session) return;
  
  try {
    // Pegar favoritos locais
    const localStr = localStorage.getItem('tc_favorites');
    const localFavs = localStr ? JSON.parse(localStr) : [];
    
    // Pegar favoritos do banco
    const { data: dbRecords, error } = await getSupabase()
      .from('favorites').select('ad_id').eq('user_id', session.user.id);
      
    if (error) throw error;
    
    const dbFavs = dbRecords.map(r => r.ad_id);
    
    // Favoritos que estao no local mas não no banco
    const toInsert = localFavs.filter(id => !dbFavs.includes(id));
    if (toInsert.length > 0) {
      const inserts = toInsert.map(adId => ({ user_id: session.user.id, ad_id: adId }));
      await getSupabase().from('favorites').insert(inserts);
    }
    
    // Mesclar e atualizar o local storage
    const allFavs = new Set([...localFavs, ...dbFavs]);
    window.tcFavorites = allFavs;
    localStorage.setItem('tc_favorites', JSON.stringify(Array.from(allFavs)));
    
    // Atualizar visuais na pagina
    if (typeof updateFavoriteIcons === 'function') {
      window.tcFavorites.forEach(id => updateFavoriteIcons(id, true));
    }
    
  } catch (err) {
    console.error('Erro ao sincronizar favoritos locais:', err);
  }
}
`;

if (!sb.includes('async function syncFavoritesLocal')) {
    sb = sb.replace('async function getMyFavorites()', syncFn + '\nasync function getMyFavorites()');
    fs.writeFileSync('c:/classificado/js/supabase.js', sb, 'utf8');
}

let main = fs.readFileSync('c:/classificado/js/main.js', 'utf8');
if (!main.includes('syncFavoritesLocal()')) {
    main = main.replace('if (typeof updateHeaderAuth === \'function\') updateHeaderAuth();', 'if (typeof updateHeaderAuth === \'function\') updateHeaderAuth();\n    if (typeof syncFavoritesLocal === \'function\') { setTimeout(() => syncFavoritesLocal(), 1500); }');
    fs.writeFileSync('c:/classificado/js/main.js', main, 'utf8');
}
console.log('Synchronizer added');
