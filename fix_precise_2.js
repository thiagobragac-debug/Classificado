const fs = require('fs');

// Read as raw bytes
const buf = fs.readFileSync('c:\\classificado\\painel.html');
let html = buf.toString('utf8');

const fixes = [
    ['InÃ­cio', 'Início'],
    ['PortuguÃªs', 'Português'],
    ['EspaÃ±ol', 'Español'],
    ['PaÃ­s', 'País'],
    ['ProvÃ­ncia', 'Província'],
    ['IntegraÃ§ão', 'Integração'],
    ['ðŸ—‘', '🗑️'], // Trash icon that got garbled
    ['vÃª-los', 'vê-los'],
    ['IntegraÃ§Ã£o', 'Integração']
];

let count = 0;
fixes.forEach(([bad, good]) => {
    if (html.includes(bad)) {
        html = html.split(bad).join(good);
        count++;
        console.log(`Fixed: "${bad}" -> "${good}"`);
    }
});

fs.writeFileSync('c:\\classificado\\painel.html', html, 'utf8');
console.log(`\nTotal: ${count} replacements. File length: ${html.length}`);
