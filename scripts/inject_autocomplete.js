const fs = require('fs');
const files = ['anunciar.html','anuncio.html','leilao.html','leiloes.html','listagem.html','painel.html','planos.html'];
const tag = '<script src="js/search_autocomplete.js"></script>';
for (const f of files) {
  const p = 'c:/classificado/' + f;
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('search_autocomplete')) {
    c = c.replace('</body>', tag + '\n</body>');
    fs.writeFileSync(p, c, 'utf8');
    console.log('Updated:', f);
  } else {
    console.log('Skipped (already done):', f);
  }
}
