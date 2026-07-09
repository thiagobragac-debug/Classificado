const fs = require('fs');

// Read file as UTF-8
let html = fs.readFileSync('c:\\classificado\\painel.html', 'utf8');

// 1. Change sTxt to use innerHTML so HTML Entities work inside JavaScript too!
html = html.replace('function sTxt(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}', 'function sTxt(id,v){const el=document.getElementById(id);if(el)el.innerHTML=v;}');

// 2. Remove Duplicate "Sair da Conta" Button
const badButtonsRegex = /<button type="submit" id="btn-save-profile"[^>]*>[\s\S]*?Salvar Altera[^<]*<\/button>\s*<button type="button" onclick="handleLogout\(\)"[^>]*>[\s\S]*?Sair da Conta\s*<\/button>/;
const fixedButtons = `<button type="submit" id="btn-save-profile"
                style="display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.75rem 2rem;border-radius:.75rem;background:#16a34a;color:#fff;font-weight:700;font-size:.95rem;border:none;cursor:pointer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Salvar Altera&ccedil;&otilde;es
              </button>`;
html = html.replace(badButtonsRegex, fixedButtons);

// 3. New Plan Card
const oldPlanCardRegex = /<div id="plan-card"[^>]*>[\s\S]*?Fazer Upgrade[\s\S]*?<\/a>\s*<\/div>/;
const newPlanCard = `<div id="plan-card" style="background:var(--clr-surface); border:1px solid var(--clr-border); border-radius:1rem; padding:1.5rem; margin-bottom:2rem; display:flex; flex-wrap:wrap; align-items:center; gap:2rem; justify-content:space-between; box-shadow:var(--shadow-sm); position:relative; overflow:hidden;">
  <div style="position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg, var(--clr-primary), var(--clr-primary-mid));"></div>
  <div style="display:flex; flex-direction:column; gap:.25rem; flex:1; min-width:200px;">
    <div style="display:flex; align-items:center; gap:.75rem;">
      <h3 id="plan-card-name" style="margin:0; font-size:1.2rem; font-weight:800; color:var(--clr-text);">Plano Gr&aacute;tis</h3>
      <span style="font-size:0.7rem; font-weight:700; background:rgba(22,163,74,0.1); color:var(--clr-primary); padding:0.2rem 0.6rem; border-radius:1rem; text-transform:uppercase; letter-spacing:0.05em;">Atual</span>
    </div>
    <div id="plan-card-desc" style="font-size:.85rem; color:#64748b;">Aproveite os recursos b&aacute;sicos da plataforma</div>
  </div>
  <div style="display:flex; gap:2rem; flex-wrap:wrap; flex:2; min-width:250px;">
    <div style="flex:1; min-width:120px;">
      <div style="display:flex; justify-content:space-between; font-size:.8rem; margin-bottom:.3rem; color:var(--clr-text);">
        <span style="font-weight:600;">An&uacute;ncios</span>
        <span style="font-weight:700; color:var(--clr-primary);"><span id="pcl-ads">3</span> / 3</span>
      </div>
      <div style="width:100%; height:6px; background:#e2e8f0; border-radius:1rem; overflow:hidden;">
        <div style="width:100%; height:100%; background:var(--clr-primary); border-radius:1rem;"></div>
      </div>
    </div>
    <div style="flex:1; min-width:120px;">
      <div style="display:flex; justify-content:space-between; font-size:.8rem; margin-bottom:.3rem; color:var(--clr-text);">
        <span style="font-weight:600;">Destaques</span>
        <span style="font-weight:700; color:#f59e0b;"><span id="pcl-featured">0</span> / 0</span>
      </div>
      <div style="width:100%; height:6px; background:#e2e8f0; border-radius:1rem; overflow:hidden;">
        <div style="width:0%; height:100%; background:#f59e0b; border-radius:1rem;"></div>
      </div>
    </div>
  </div>
  <div style="display:flex; align-items:center;">
    <a href="planos.html" style="display:inline-flex; align-items:center; gap:.5rem; padding:.75rem 1.5rem; border-radius:.75rem; background:var(--clr-primary); color:#fff; font-weight:700; font-size:.9rem; text-decoration:none; box-shadow:0 4px 12px rgba(22, 163, 74, 0.2); transition:all .2s;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
      Fazer Upgrade
    </a>
  </div>
</div>`;
html = html.replace(oldPlanCardRegex, newPlanCard);

// 4. FIX EVERYTHING! Since we are saving this with BOM, we don't even need entities.
// I will just revert everything back to normal UTF-8 characters and prepend BOM!
html = html.replace(/&uacute;/g, 'ú');
html = html.replace(/&Uacute;/g, 'Ú');
html = html.replace(/&aacute;/g, 'á');
html = html.replace(/&Aacute;/g, 'Á');
html = html.replace(/&atilde;/g, 'ã');
html = html.replace(/&Atilde;/g, 'Ã');
html = html.replace(/&eacute;/g, 'é');
html = html.replace(/&Eacute;/g, 'É');
html = html.replace(/&iacute;/g, 'í');
html = html.replace(/&Iacute;/g, 'Í');
html = html.replace(/&oacute;/g, 'ó');
html = html.replace(/&Oacute;/g, 'Ó');
html = html.replace(/&otilde;/g, 'õ');
html = html.replace(/&Otilde;/g, 'Õ');
html = html.replace(/&ccedil;/g, 'ç');
html = html.replace(/&Ccedil;/g, 'Ç');
html = html.replace(/&ecirc;/g, 'ê');

// Clean up any remaining mojibakes the script didn't catch
html = html.replace(/Meus An.*?ncios/g, 'Meus Anúncios');
html = html.replace(/meus an.*?ncios/g, 'meus anúncios');
html = html.replace(/Gr.*?tis/g, 'Grátis');
html = html.replace(/Altera.*?es/g, 'Alterações');
html = html.replace(/Apresenta.*?o/g, 'Apresentação');
html = html.replace(/Pa.*?s/g, 'País');
html = html.replace(/Prov.*?ncia/g, 'Província');
html = html.replace(/In.*?cio/g, 'Início');
html = html.replace(/Leil.*?es/g, 'Leilões');
html = html.replace(/N.*?o/g, 'Não');
html = html.replace(/Portugu.*?s/g, 'Português');
html = html.replace(/Espa.*?ol/g, 'Español');

// Title specifically
html = html.replace(/<title>Meu Painel.*?Tauze Class<\/title>/, '<title>Meu Painel - Tauze Class</title>');

// Save with BOM to override any HTTP server encoding defaults
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
const finalBuffer = Buffer.concat([BOM, Buffer.from(html, 'utf8')]);

fs.writeFileSync('c:\\classificado\\painel.html', finalBuffer);
console.log('Final ultimate fix applied with BOM!');
