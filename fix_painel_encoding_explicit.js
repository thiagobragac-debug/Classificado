const fs = require('fs');

let content = fs.readFileSync('c:\\classificado\\painel.html', 'utf8');

const replacements = [
    ['Anǧncios', 'Anúncios'],
    ['anǧncios', 'anúncios'],
    ['anǧncio', 'anúncio'],
    ['Anǟncios', 'Anúncios'],
    ['anǟncios', 'anúncios'],
    ['anǟncio', 'anúncio'],
    ['Grǭtis', 'Grátis'],
    ['Grǟtis', 'Grátis'],
    ['GrÃ¡tis', 'Grátis'],
    ['AtǸ', 'Até'],
    ['vocǟ', 'você'],
    ['Alteraǧǧes', 'Alterações'],
    ['Alteraǟǟes', 'Alterações'],
    ['Apresentaǧǧo', 'Apresentação'],
    ['Apresentaǟǟo', 'Apresentação'],
    ['Paǟs', 'País'],
    ['Provǟncia', 'Província'],
    ['Inǟcio', 'Início'],
    ['Mǟquinas', 'Máquinas'],
    ['mǟquinas', 'máquinas'],
    ['Leilǧes', 'Leilões'],
    ['Leilǟes', 'Leilões'],
    ['Nǟo', 'Não'],
    ['nǟo', 'não'],
    ['Portuguǟs', 'Português'],
    ['Espaǟol', 'Español'],
    ['tǟtulo', 'título'],
    ['Informaǧǧes', 'Informações'],
    ['Informaǟǟes', 'Informações'],
    ['vocÃª', 'você'],
    ['anÃºncio', 'anúncio'],
    ['AnÃºncios', 'Anúncios'],
    ['AlteraÃ§Ãµes', 'Alterações'],
    ['ApresentaÃ§Ã£o', 'Apresentação']
];

replacements.forEach(([bad, good]) => {
    content = content.split(bad).join(good);
});

// Fix the "Nenhum anuncio ainda"
content = content.replace(/Nenhum an.+ncio ainda/g, 'Nenhum anúncio ainda');
content = content.replace(/Publicar primeiro an.+ncio/g, 'Publicar primeiro anúncio');

fs.writeFileSync('c:\\classificado\\painel.html', content, 'utf8');
console.log('Fixed painel.html explicit characters');
