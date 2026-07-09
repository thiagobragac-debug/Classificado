const fs = require('fs');

let html = fs.readFileSync('c:\\classificado\\painel.html', 'utf8');

// Fix Mojibakes in options
html = html.replace('ðŸ‡§ðŸ‡· Brasil', '🇧🇷 Brasil');
html = html.replace('ðŸ‡¦ðŸ‡· Argentina', '🇦🇷 Argentina');
html = html.replace('ðŸ‡µðŸ‡¾ Paraguai', '🇵🇾 Paraguai');
html = html.replace('ðŸ‡ºðŸ‡¾ Uruguai', '🇺🇾 Uruguai');
html = html.replace('ðŸ‡ºðŸ‡¸ Estados Unidos', '🇺🇸 Estados Unidos');
html = html.replace('ðŸ‡µðŸ‡¹ Portugal', '🇵🇹 Portugal');

// Replace Mojibake "ðŸ—‘ Remover" with proper SVG in Favoritos
const mojibakeRemover = /ðŸ—‘ Remover/g;
const svgRemover = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Remover`;
html = html.replace(mojibakeRemover, svgRemover);

// Fix Plan Card Layout
const oldPlanCardRegex = /<div id="plan-card" style="background:linear-gradient[\s\S]*?<\/div>\s*<\/div>\s*<\/a>\s*<\/div>/;
const newPlanCard = `<div id="plan-card" style="background:linear-gradient(135deg,#16a34a,#059669);color:#fff;border-radius:1rem;padding:2rem;margin-bottom:1.5rem;position:relative;overflow:hidden; display:flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.2);">
          <div style="position:absolute;top:-40px;right:-10%;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%);"></div>
          <div style="position:relative; z-index:1;">
            <div id="plan-card-name" style="font-size:1.5rem;font-weight:800;margin-bottom:.25rem">Plano Grátis</div>
            <div id="plan-card-desc" style="font-size:.9rem;opacity:.9;margin-bottom:1.25rem">Até 3 anúncios ativos</div>
            <div style="display:flex;gap:2rem;">
              <div style="font-size:.85rem; opacity:.9;"><span id="pcl-ads" style="font-size:1.4rem;font-weight:800;display:block;color:#fff;opacity:1;">3</span>anúncios</div>
              <div style="font-size:.85rem; opacity:.9;"><span id="pcl-featured" style="font-size:1.4rem;font-weight:800;display:block;color:#fff;opacity:1;">0</span>destaques</div>
            </div>
          </div>
          <div style="position:relative; z-index:1;">
            <a href="planos.html" style="display:inline-flex;align-items:center;gap:.5rem;padding:.8rem 1.6rem;border-radius:.75rem;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);color:#fff;font-weight:700;font-size:.95rem;text-decoration:none; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(255,255,255,.3)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.background='rgba(255,255,255,.2)'; this.style.transform='translateY(0)';">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
              Fazer Upgrade
            </a>
          </div>
        </div>`;
html = html.replace(oldPlanCardRegex, newPlanCard);

// Fix "Salvar AlteraçÃµes" and remove redundant "Sair da Conta"
const badButtonsRegex = /<button type="submit" id="btn-save-profile"[\s\S]*?Salvar AlteraçÃµes\s*<\/button>\s*<button type="button" onclick="handleLogout\(\)"[\s\S]*?Sair da Conta\s*<\/button>/;
const fixedButtons = `<button type="submit" id="btn-save-profile"
                style="display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.75rem 2rem;border-radius:.75rem;background:#16a34a;color:#fff;font-weight:700;font-size:.95rem;border:none;cursor:pointer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Salvar Alterações
              </button>`;
html = html.replace(badButtonsRegex, fixedButtons);

fs.writeFileSync('c:\\classificado\\painel.html', html);
console.log('Fixed painel.html layout and buttons completely');
