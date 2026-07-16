const fs = require('fs');
let content = fs.readFileSync('c:/classificado/js/supabase.js', 'utf8');

const oldSync = `window.tcFavorites = new Set(ids);
    localStorage.setItem('tc_favorites', JSON.stringify(ids));`;

const newSync = `window.tcFavorites = new Set(ids);
    localStorage.setItem('tc_favorites', JSON.stringify(ids));
    // Atualizar UI
    document.querySelectorAll('.ad-card__fav').forEach(btn => {
      const adId = btn.closest('[aria-label]')?.getAttribute('aria-label') || btn.dataset.adId;
      if (adId) btn.classList.toggle('active', window.tcFavorites.has(adId));
    });`;

if (content.includes(oldSync) && !content.includes('document.querySelectorAll')) {
    content = content.replace(oldSync, newSync);
    fs.writeFileSync('c:/classificado/js/supabase.js', content, 'utf8');
}
