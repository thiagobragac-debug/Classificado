const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('c:/classificado').filter(f => f.endsWith('.html'));
let updated = 0;
for (const file of files) {
  const p = path.join('c:/classificado', file);
  let content = fs.readFileSync(p, 'utf8');
  let changed = false;

  const loginStr = '<a href="login.html" data-i18n="nav_login">Entrar</a>';
  if (content.includes(loginStr)) {
    content = content.replace(
      loginStr,
      '<div class="auth-wrapper"><a href="login.html" data-i18n="nav_login">Entrar</a></div>'
    );
    changed = true;
  }

  if (content.includes('</head>') && !content.includes('is-logged-in')) {
    const script = `  <script>
    if (localStorage.getItem('sb-rfzuzuobwuanmbrcthqe-auth-token')) {
      document.documentElement.classList.add('is-logged-in');
    }
  </script>
</head>`;
    content = content.replace('</head>', script);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(p, content, 'utf8');
    updated++;
  }
}
console.log('Updated ' + updated + ' HTML files.');
