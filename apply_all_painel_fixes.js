const fs = require('fs');

let html = fs.readFileSync('c:\\classificado\\painel.html', 'utf8');

// 1. HEADER FIX (remove search bar from panel header)
const badHeaderRegex = /<div class="header-search"[\s\S]*?<\/div>/;
html = html.replace(badHeaderRegex, '');

// 2. MOJIBAKES IN HEADER FIX
html = html.replace('Anǟncios', 'Anúncios');
html = html.replace('Inǟcio', 'Início');
html = html.replace('Grǟtis', 'Grátis');
html = html.replace('Portuguǟs', 'Português');
html = html.replace('Espaǟol', 'Español');
html = html.replace('mǟquinas', 'máquinas');

// 3. PROFILE FORM MOJIBAKES AND REDUNDANT BUTTON
html = html.replace('ðŸ‡§ðŸ‡· Brasil', '🇧🇷 Brasil');
html = html.replace('ðŸ‡¦ðŸ‡· Argentina', '🇦🇷 Argentina');
html = html.replace('ðŸ‡µðŸ‡¾ Paraguai', '🇵🇾 Paraguai');
html = html.replace('ðŸ‡ºðŸ‡¾ Uruguai', '🇺🇾 Uruguai');
html = html.replace('ðŸ‡ºðŸ‡¸ Estados Unidos', '🇺🇸 Estados Unidos');
html = html.replace('ðŸ‡µðŸ‡¹ Portugal', '🇵🇹 Portugal');

const badButtonsRegex = /<button type="submit" id="btn-save-profile"[\s\S]*?Salvar Altera[^\s<]*<\/button>\s*<button type="button" onclick="handleLogout\(\)"[\s\S]*?Sair da Conta\s*<\/button>/;
const fixedButtons = `<button type="submit" id="btn-save-profile"
                style="display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.75rem 2rem;border-radius:.75rem;background:#16a34a;color:#fff;font-weight:700;font-size:.95rem;border:none;cursor:pointer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Salvar Alterações
              </button>`;
html = html.replace(badButtonsRegex, fixedButtons);

const mojibakeRemover = /ðŸ—‘ Remover/g;
const svgRemover = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Remover`;
html = html.replace(mojibakeRemover, svgRemover);

// 4. PREMIUM PLAN CARD
const oldPlanCardRegex = /<div id="plan-card" style="background:linear-gradient[\s\S]*?<\/div>\s*<\/div>\s*<\/a>\s*<\/div>/;
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

// 5. ANY REMAINING MOJIBAKES (AnÃºncios etc)
const replacements = [
    ['AnÃºncios', 'Anúncios'],
    ['anÃºncios', 'anúncios'],
    ['AnÃºncio', 'Anúncio'],
    ['anÃºncio', 'anúncio'],
    ['GrÃ¡tis', 'Grátis'],
    ['AlteraÃ§Ãµes', 'Alterações'],
    ['ApresentaÃ§Ã£o', 'Apresentação'],
    ['PaÃs', 'País'],
    ['ProvÃncia', 'Província'],
    ['vocÃª', 'você'],
    ['InÃcio', 'Início'],
    ['MÃ¡quinas', 'Máquinas'],
    ['mÃ¡quinas', 'máquinas'],
    ['LeilÃµes', 'Leilões'],
    ['NÃ£o', 'Não'],
    ['nÃ£o', 'não'],
    ['PortuguÃªs', 'Português'],
    ['EspaÃ±ol', 'Español'],
    ['tÃtulo', 'título'],
    ['InformaÃ§Ãµes', 'Informações'],
    ['AtÃ©', 'Até'],
    ['PaÃ­s', 'País'],
    ['ProvÃ­ncia', 'Província'],
    ['tÃ­tulo', 'título'],
    ['InÃ­cio', 'Início'],
    ['Anǟncios', 'Anúncios'],
    ['anǟncios', 'anúncios'],
    ['Anǧncios', 'Anúncios'],
    ['anǧncios', 'anúncios'],
    ['Grǟtis', 'Grátis'],
    ['Grǭtis', 'Grátis'],
    ['AtǸ', 'Até'],
    ['vocǟ', 'você'],
    ['Alteraǧǧes', 'Alterações'],
    ['Apresentaǧǧo', 'Apresentação']
];

replacements.forEach(([bad, good]) => {
    html = html.split(bad).join(good);
});

// Finally, make absolutely sure "Meus An<mojibake>ncios" is "Meus Anúncios" everywhere
html = html.replace(/Meus An[^<]*?ncios/g, 'Meus Anúncios');
html = html.replace(/Bio \/ Apresenta[^<]*/g, 'Bio / Apresentação');

fs.writeFileSync('c:\\classificado\\painel.html', html, 'utf8');
console.log('ALL FIXES APPLIED SUCCESSFULLY!');
