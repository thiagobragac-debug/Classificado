const fs = require('fs');

const idx = fs.readFileSync('index.html', 'utf8');
let pnl = fs.readFileSync('painel.html', 'utf8');

const headerRegex = /<header class="site-header"[^]*?<\/header>/;
const mobileRegex = /<nav class="mobile-menu"[^]*?<\/nav>/;

let newHeader = idx.match(headerRegex)[0];
let newMobile = idx.match(mobileRegex)[0];

// Remove active class from Início
newHeader = newHeader.replace('<a href="index.html" class="active" data-i18n="nav_home">Início</a>', '<a href="index.html" data-i18n="nav_home">Início</a>');
newMobile = newMobile.replace('<a href="index.html" class="active" data-i18n="nav_home">Início</a>', '<a href="index.html" data-i18n="nav_home">Início</a>');

// Replace login with avatar
const avatarHtmlHeader = `<div id="header-avatar" style="width:40px;height:40px;border-radius:50%;background:var(--clr-primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;cursor:pointer;font-size:.9rem;margin-left:var(--sp-2);" onclick="window.location.href='painel.html'">?</div>`;
newHeader = newHeader.replace('<a href="login.html" data-i18n="nav_login">Entrar</a>', avatarHtmlHeader);

const avatarHtmlMobile = `<a href="painel.html" data-i18n="nav_panel" style="font-weight:700; color:var(--clr-primary);">Meu Painel</a>`;
newMobile = newMobile.replace('<a href="login.html" data-i18n="nav_login">Entrar</a>', avatarHtmlMobile);

pnl = pnl.replace(headerRegex, newHeader);
pnl = pnl.replace(mobileRegex, newMobile);

fs.writeFileSync('painel.html', pnl);
console.log('painel.html updated successfully');
