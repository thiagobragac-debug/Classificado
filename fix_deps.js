const fs = require('fs');
const path = require('path');
const filesToFix = ['anunciar.html', 'login.html', 'painel.html'];

for (const file of filesToFix) {
  const p = path.join('c:\\classificado', file);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  
  if (!content.includes('src="js/data.js"')) {
    content = content.replace(/<script src="(\/)?js\/supabase\.js"><\/script>/, 
      '<script src="$1js/supabase.js"></script>\n  <script src="$1js/data.js"></script>');
    fs.writeFileSync(p, content, 'utf8');
    console.log(`Fixed ${file}`);
  }
}
