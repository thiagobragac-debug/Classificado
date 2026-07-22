const fs = require('fs');
let c = fs.readFileSync('c:/classificado/js/main.js', 'utf8');

const pwaScript = `
// ── PWA Install Prompt ──────────────────────
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('classificado/')) {
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 20px;border-radius:12px;display:flex;align-items:center;gap:15px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);z-index:9999;width:90%;max-width:400px;justify-content:space-between;';
    banner.innerHTML = \`
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="background:#16a34a;color:#fff;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px;">T</div>
        <div>
          <div style="font-weight:700;font-size:0.95rem;">Tauze Class App</div>
          <div style="font-size:0.8rem;color:#cbd5e1;">Acesse mais rápido!</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button id="pwa-install-btn" style="background:#16a34a;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-weight:600;font-size:0.85rem;cursor:pointer;">Instalar</button>
        <button id="pwa-close-btn" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;line-height:1;">&times;</button>
      </div>
    \`;
    document.body.appendChild(banner);
    
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      banner.style.display = 'none';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
    
    document.getElementById('pwa-close-btn').addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }
});
`;

c = c + '\n' + pwaScript;
fs.writeFileSync('c:/classificado/js/main.js', c, 'utf8');
