const fs = require('fs');

let html = fs.readFileSync('c:\\classificado\\painel.html', 'utf8');

// Fix the title specifically
html = html.replace(/Meu Painel .*? Tauze Class/, 'Meu Painel - Tauze Class');

// Let's replace all standard Portuguese accents with HTML entities to be 1000% safe
const entities = {
    'ú': '&uacute;', 'Ú': '&Uacute;',
    'á': '&aacute;', 'Á': '&Aacute;',
    'ã': '&atilde;', 'Ã': '&Atilde;',
    'é': '&eacute;', 'É': '&Eacute;',
    'í': '&iacute;', 'Í': '&Iacute;',
    'ó': '&oacute;', 'Ó': '&Oacute;',
    'õ': '&otilde;', 'Õ': '&Otilde;',
    'ç': '&ccedil;', 'Ç': '&Ccedil;',
    'ê': '&ecirc;',  'Ê': '&Ecirc;'
};

for (const [char, entity] of Object.entries(entities)) {
    html = html.split(char).join(entity);
}

fs.writeFileSync('c:\\classificado\\painel.html', html, 'utf8');
console.log('Entities applied to painel.html');
