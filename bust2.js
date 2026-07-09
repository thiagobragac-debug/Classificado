const fs = require('fs');
const path = require('path');

const dir = 'c:\\classificado';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
const ts = Date.now();

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/href="css\/style\.css(\?v=\d+)?"/g, `href="css/style.css?v=${ts}"`);
  fs.writeFileSync(p, content, 'utf8');
}
console.log('Style cache busted.');
