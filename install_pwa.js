const fs = require('fs');
let sb = fs.readFileSync('c:/classificado/js/main.js', 'utf8');

const pwaLogic = 
/* ── PWA INSTALL PROMPT ───────────────────────────────────────────── */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Criar o banner de instalar app se ele não existir
  if(!document.getElementById('pwa-install-banner')) {
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#0f172a; color:#fff; padding:12px 20px; border-radius:12px; display:flex; align-items:center; gap:16px; box-shadow:0 10px 25px rgba(0,0,0,0.3); z-index:9999; width:90%; max-width:400px; justify-content:space-between; animation: slideUp 0.5s ease-out;';
    banner.innerHTML = \
      <div style="display:flex; align-items:center; gap:12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        <div style="display:flex; flex-direction:column;">
          <strong style="font-size:0.95rem;">Instalar App</strong>
          <span style="font-size:0.8rem; color:#94a3b8;">Acesso rápido e offline</span>
        </div>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="btn-pwa-dismiss" style="background:transparent; border:none; color:#94a3b8; font-size:1rem; cursor:pointer; padding:4px;">✕</button>
        <button id="btn-pwa-install" style="background:#16a34a; border:none; color:#fff; font-weight:bold; padding:8px 16px; border-radius:8px; cursor:pointer;">Instalar</button>
      </div>
    \;
    document.body.appendChild(banner);
    
    // Animação CSS
    const style = document.createElement('style');
    style.textContent = '@keyframes slideUp { from { bottom:-100px; opacity:0; } to { bottom:20px; opacity:1; } }';
    document.head.appendChild(style);

    document.getElementById('btn-pwa-install').addEventListener('click', async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        banner.style.display = 'none';
      }
      deferredPrompt = null;
    });

    document.getElementById('btn-pwa-dismiss').addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }
});
;

if (!sb.includes('beforeinstallprompt')) {
  fs.writeFileSync('c:/classificado/js/main.js', sb + '\n' + pwaLogic, 'utf8');
}
