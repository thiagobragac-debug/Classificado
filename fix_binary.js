const fs = require('fs');

// Read file as binary to avoid utf8 parsing corruption
const buf = fs.readFileSync('c:\\classificado\\painel.html');

// Convert to string using latin1 to preserve every single byte exactly
let html = buf.toString('latin1');

// Now replace the double-encoded utf-8 bytes (which appear as Ãº etc in latin1)
html = html.replace(/An\xC3\xBAncios/g, 'Anúncios');
html = html.replace(/an\xC3\xBAncios/g, 'anúncios');
html = html.replace(/An\xC3\xBAncio/g, 'Anúncio');
html = html.replace(/an\xC3\xBAncio/g, 'anúncio');
html = html.replace(/Gr\xC3\xA1tis/g, 'Grátis');
html = html.replace(/Altera\xC3\xA7\xC3\xB5es/g, 'Alterações');
html = html.replace(/Apresenta\xC3\xA7\xC3\xA3o/g, 'Apresentação');
html = html.replace(/Pa\xC3\xADs/g, 'País');
html = html.replace(/Prov\xC3\xADncia/g, 'Província');
html = html.replace(/voc\xC3\xAA/g, 'você');
html = html.replace(/In\xC3\xADcio/g, 'Início');
html = html.replace(/M\xC3\xA1quinas/g, 'Máquinas');
html = html.replace(/m\xC3\xA1quinas/g, 'máquinas');
html = html.replace(/Leil\xC3\xB5es/g, 'Leilões');
html = html.replace(/N\xC3\xA3o/g, 'Não');
html = html.replace(/n\xC3\xA3o/g, 'não');
html = html.replace(/Portugu\xC3\xAAs/g, 'Português');
html = html.replace(/Espa\xC3\xB1ol/g, 'Español');
html = html.replace(/t\xC3\xADtulo/g, 'título');
html = html.replace(/Informa\xC3\xA7\xC3\xB5es/g, 'Informações');
html = html.replace(/At\xC3\xA9/g, 'Até');

// ALSO REPLACE the powershell mangled ones just in case
html = html.replace(/An\xE7ncios/g, 'Anúncios');
html = html.replace(/an\xE7ncios/g, 'anúncios');
html = html.replace(/An\xE7ncio/g, 'Anúncio');
html = html.replace(/an\xE7ncio/g, 'anúncio');
html = html.replace(/Gr\xE1tis/g, 'Grátis');
html = html.replace(/Altera\xE7\xF5es/g, 'Alterações');
html = html.replace(/Apresenta\xE7\xE3o/g, 'Apresentação');

// Also do regex for anything that starts with "Meus An" and ends with "ncios" within 10 characters
html = html.replace(/Meus An.{1,4}ncios/g, 'Meus Anúncios');
html = html.replace(/meus an.{1,4}ncios/g, 'meus anúncios');
html = html.replace(/Gr.{1,4}tis/g, 'Grátis');
html = html.replace(/Altera.{1,4}es/g, 'Alterações');

// Ensure the premium card is injected!
const oldPlanCardRegex = /<div id="plan-card"[^>]*>[\s\S]*?Fazer Upgrade[\s\S]*?<\/a>\s*<\/div>/;
const newPlanCard = `<div id="plan-card" style="background:var(--clr-surface); border:1px solid var(--clr-border); border-radius:1rem; padding:1.5rem; margin-bottom:2rem; display:flex; flex-wrap:wrap; align-items:center; gap:2rem; justify-content:space-between; box-shadow:var(--shadow-sm); position:relative; overflow:hidden;">
  <!-- Premium Top Accent -->
  <div style="position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg, var(--clr-primary), var(--clr-primary-mid));"></div>
  
  <div style="display:flex; flex-direction:column; gap:.25rem; flex:1; min-width:200px;">
    <div style="display:flex; align-items:center; gap:.75rem;">
      <h3 id="plan-card-name" style="margin:0; font-size:1.2rem; font-weight:800; color:var(--clr-text);">Plano Grátis</h3>
      <span style="font-size:0.7rem; font-weight:700; background:rgba(22,163,74,0.1); color:var(--clr-primary); padding:0.2rem 0.6rem; border-radius:1rem; text-transform:uppercase; letter-spacing:0.05em;">Atual</span>
    </div>
    <div id="plan-card-desc" style="font-size:.85rem; color:#64748b;">Aproveite os recursos básicos da plataforma</div>
  </div>

  <div style="display:flex; gap:2rem; flex-wrap:wrap; flex:2; min-width:250px;">
    <!-- Anúncios Progress -->
    <div style="flex:1; min-width:120px;">
      <div style="display:flex; justify-content:space-between; font-size:.8rem; margin-bottom:.3rem; color:var(--clr-text);">
        <span style="font-weight:600;">Anúncios</span>
        <span style="font-weight:700; color:var(--clr-primary);"><span id="pcl-ads">3</span> / 3</span>
      </div>
      <div style="width:100%; height:6px; background:#e2e8f0; border-radius:1rem; overflow:hidden;">
        <div style="width:100%; height:100%; background:var(--clr-primary); border-radius:1rem;"></div>
      </div>
    </div>
    
    <!-- Destaques Progress -->
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
    <a href="planos.html" style="display:inline-flex; align-items:center; gap:.5rem; padding:.75rem 1.5rem; border-radius:.75rem; background:var(--clr-primary); color:#fff; font-weight:700; font-size:.9rem; text-decoration:none; box-shadow:0 4px 12px rgba(22, 163, 74, 0.2); transition:all .2s;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
      Fazer Upgrade
    </a>
  </div>
</div>`;
html = html.replace(oldPlanCardRegex, newPlanCard);


// Finally convert back to utf8 bytes and save
const finalBuffer = Buffer.from(html, 'utf8');
fs.writeFileSync('c:\\classificado\\painel.html', finalBuffer);
console.log('Fixed file via binary buffer manipulation!');
