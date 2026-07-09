const fs = require('fs');
const html = fs.readFileSync('c:\\classificado\\painel.html', 'utf8');

const regex = /.{0,10}(?:Ã|ðŸ).{0,10}/g;
let match;
const matches = new Set();
while ((match = regex.exec(html)) !== null) {
    matches.add(match[0].replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
}

console.log("Remaining broken characters:");
for (const m of matches) {
    console.log(m);
}
