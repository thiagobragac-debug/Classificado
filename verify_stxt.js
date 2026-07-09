const fs = require('fs');

const buf = fs.readFileSync('c:\\classificado\\painel.html');
let html = buf.toString('latin1');

console.log("Found sTxt function:", /function sTxt\(id,v\)\{const el=document\.getElementById\(id\);if\(el\)el\.textContent=v;\}/.test(html));
