const fs = require('fs');
const p = 'c:\\classificado\\anunciar.html';
let content = fs.readFileSync(p, 'utf8');

// 1. Remove search bar
content = content.replace(/<div class="header-search".*?<\/div>/s, '');

// 2. Replace the header-nav block
const newNav = `<nav class="header-nav" role="navigation" aria-label="Menu principal">
      <a href="index.html" data-i18n="nav_home">Início</a>
      <a href="listagem.html" data-i18n="nav_ads">Anúncios</a>
      <a href="eventos.html" data-i18n="nav_events">Eventos</a>
      <a href="leiloes.html" class="nav-live"><span class="live-indicator"></span><span data-i18n="nav_auctions">Leilões Ao Vivo</span></a>
      <a href="planos.html" data-i18n="nav_plans">Planos</a>
      <a href="login.html" data-i18n="nav_login">Entrar</a>
    </nav>`;
content = content.replace(/<nav class="header-nav".*?<\/nav>/s, newNav);

// 3. Add data.js if missing
if (!content.includes('src="js/data.js"')) {
  content = content.replace(/<script src="(\/)?js\/supabase\.js"><\/script>/, 
    '<script src="$1js/supabase.js"></script>\n  <script src="$1js/data.js"></script>');
}

fs.writeFileSync(p, content, 'utf8');
console.log('Fixed anunciar.html manually');
