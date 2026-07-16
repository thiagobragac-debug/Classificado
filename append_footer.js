const fs = require('fs');
let html = fs.readFileSync('c:/classificado/anuncio.html', 'utf8');

const simplifiedFooter = `  <footer class="site-footer simplified-footer" style="background: transparent; color: var(--clr-muted); padding: 2.5rem 0; border-top: 1px solid rgba(0,0,0,0.05); margin-top: auto;" role="contentinfo">
    <div class="container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; text-align: center;">
      <div style="font-weight: 600; color: var(--clr-text); font-size: 1rem;">Tauze Class</div>
      <div style="display:flex; gap: 1.5rem; font-size: var(--fs-sm); flex-wrap: wrap; justify-content: center;">
        <a href="index.html" style="transition: color 0.2s;">Início</a>
        <a href="#" style="transition: color 0.2s;">Ajuda e Suporte</a>
        <a href="#" style="transition: color 0.2s;">Termos de Uso</a>
      </div>
      <div style="font-size: var(--fs-xs); opacity: 0.7;" data-i18n="footer_copy">© 2026 Tauze Class. Todos os direitos reservados.</div>
    </div>
  </footer>
`;

const bodyEnd = html.indexOf('</body>');
if (bodyEnd > -1 && html.indexOf('<footer') === -1) {
  html = html.substring(0, bodyEnd) + simplifiedFooter + html.substring(bodyEnd);
  fs.writeFileSync('c:/classificado/anuncio.html', html, 'utf8');
  console.log('Appended simplified footer to anuncio.html');
}
