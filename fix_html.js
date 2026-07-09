const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('c:/classificado').filter(f => f.endsWith('.html'));

for (const file of files) {
  const p = path.join('c:/classificado', file);
  let content = fs.readFileSync(p, 'utf8');
  
  // Encontrar o bloco <script> inteiro do is-logged-in
  const regex = /<script>\s*let hasToken = false;[\s\S]*?<\/script>/;
  const newScript = `<script>
    let hasToken = false;
    for(let i=0; i<localStorage.length; i++){
      if(localStorage.key(i).includes('auth-token')){ hasToken=true; break; }
    }
    if (hasToken) {
      document.documentElement.classList.add('is-logged-in');
      let ini = localStorage.getItem('tc_user_initials');
      if (ini) document.documentElement.style.setProperty('--tc-user-ini', '"' + ini + '"');
    }
  </script>`;
  
  if (regex.test(content)) {
    content = content.replace(regex, newScript);
    fs.writeFileSync(p, content, 'utf8');
    console.log('Updated ' + file);
  }
}
