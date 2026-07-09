const fs = require('fs');
const path = require('path');

const dir = 'c:\\classificado';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
const ts = Date.now();

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/src="(\/)?js\/main\.js(\?v=\d+)?"/g, `src="$1js/main.js?v=${ts}"`);
  content = content.replace(/src="(\/)?js\/supabase\.js(\?v=\d+)?"/g, `src="$1js/supabase.js?v=${ts}"`);
  content = content.replace(/src="(\/)?js\/data\.js(\?v=\d+)?"/g, `src="$1js/data.js?v=${ts}"`);
  fs.writeFileSync(p, content, 'utf8');
}
console.log('Cache busted.');
