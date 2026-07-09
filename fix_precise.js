const fs = require('fs');

// Read as raw bytes
const buf = fs.readFileSync('c:\\classificado\\painel.html');
let html = buf.toString('utf8');

// These are the exact strings as they appear when Node reads the file as UTF-8
// The file has "quadruple-encoded" characters: UTF8 bytes stored as latin1, 
// then stored as UTF8 again. We need exact string replacements.
// Sample confirmed: "AnÃºncios" is what we see in the file.

const fixes = [
    // ú (u-acute) appears as Ãº  
    ['AnÃºncios', 'Anúncios'],
    ['anÃºncios', 'anúncios'],
    ['AnÃºncio',  'Anúncio'],
    ['anÃºncio',  'anúncio'],
    ['anÃºcio',   'anúncio'],
    // á (a-acute) appears as Ã¡
    ['mÃ¡quinas', 'máquinas'],
    ['MÃ¡quinas', 'Máquinas'],
    ['GrÃ¡tis',   'Grátis'],
    ['Ãstimos',   'Últimos'],
    // ã/Ã (a-tilde) appears as Ã£/Ã
    ['AlteraÃ§Ãµes', 'Alterações'],
    ['InformaÃ§Ãµes', 'Informações'],
    ['ApresentaÃ§Ã£o', 'Apresentação'],
    ['AÃ§Ã£o',    'Ação'],
    ['NÃ£o',      'Não'],
    ['nÃ£o',      'não'],
    ['irreversÃ­vel', 'irreversível'],
    ['Ã£o',       'ão'],
    // é (e-acute) appears as Ã©
    ['alguÃ©m',   'alguém'],
    ['vocÃª',     'você'],
    ['VocÃª',     'Você'],
    // í (i-acute) appears as Ã­
    ['tÃ­tulo',   'título'],
    ['BolÃ­via',  'Bolívia'],
    ['excluÃ­do', 'excluído'],
    ['irreversÃ­vel', 'irreversível'],
    // ç (cedilla) appears as Ã§
    ['aÃ§Ã£o',   'ação'],
    ['VisualizaÃ§Ãµes', 'Visualizações'],
    ['visualizaÃ§Ãµes', 'visualizações'],
    // ó appears as Ã³
    ['histÃ³rico', 'histórico'],
    // ú in UsuÃ¡rio
    ['UsuÃ¡rio', 'Usuário'],
    // AtÃ©
    ['AtÃ©', 'Até'],
    // â€¦ is the double-encoded ellipsis (…)
    ['â€¦', '...'],
    ['Carregandoâ€¦', 'Carregando...'],
    ['mensagemâ€¦', 'mensagem...'],
    ['propriedadeâ€¦', 'propriedade...'],
    ['Salvandoâ€¦', 'Salvando...'],
    // â€" is the em-dash (—)
    ['â€"', '—'],
    // Flag emojis: ðŸ‡§ðŸ‡· = 🇧🇷 etc
    ['ðŸ‡§ðŸ‡·', '🇧🇷'],
    ['ðŸ‡¦ðŸ‡·', '🇦🇷'],
    ['ðŸ‡µðŸ‡¾', '🇵🇾'],
    ['ðŸ‡ºðŸ‡¾', '🇺🇾'],
    ['ðŸ‡§ðŸ‡´', '🇧🇴'],
    // Trash icon: ðŸ—'
    ['ðŸ—\'', '🗑️'],
    // Edit icon: âœï¸
    ['âœï¸', '✏️'],
    // Pause: â¸
    ['â¸', '⏸'],
    // Play: â–¶
    ['â–¶', '▶'],
    // Dash in title: â€"
    ['Meu Painel Ã¢â¬â Tauze Class', 'Meu Painel - Tauze Class'],
    ['Meu Painel â€" Tauze Class', 'Meu Painel - Tauze Class'],
    // More patterns from the JS
    ['NÃ£o ainda', 'Nenhum anúncio ainda'],
    ['N\u00e3o ainda', 'Nenhum anúncio ainda'],
    ['nÃ£o tem anÃºncios', 'não tem anúncios'],
    ['Paísado', 'Pausado'],
    ['Pa\u00edsado', 'Pausado'],
    ['isPaísed', 'isPaused'],
    ['isPa\u00edsed', 'isPaused'],
    ['isPaísed', 'isPaused'],
    ['NãoLocaleString', 'ad.price.toLocaleString'],
    ['N\u00e3oLocaleString', 'ad.price.toLocaleString'],
    ['NÃ£oLocaleString', 'ad.price.toLocaleString'],
    ['NÃ£oUpperCase', '.toUpperCase'],
    ['NãoUpperCase', '.toUpperCase'],
    ['N\u00e3oUpperCase', '.toUpperCase'],
    ['otherNÃ£onv.adTitle', 'otherName);sTxt(\'thread-subtitle\',conv.adTitle'],
    ['otherN\u00e3onv.adTitle', 'otherName);sTxt(\'thread-subtitle\',conv.adTitle'],
    ['conv.otherNÃ£onv.adTitle', 'conv.otherName);sTxt(\'thread-subtitle\',conv.adTitle'],
    ['conv.otherN\u00e3onv.adTitle', 'conv.otherName);sTxt(\'thread-subtitle\',conv.adTitle'],
    // PAINão => PAINEL
    ['PAINão', 'PAINEL'],
    ['PAIN\u00e3o', 'PAINEL'],
    ['PAINÃão', 'PAINEL'],
    // Nãova => Nova
    ['NÃ£ova mensagem', 'Nova mensagem'],
    ['N\u00e3ova mensagem', 'Nova mensagem'],
    // Nãorito => Nenhum favorito
    ['NÃ£orito', 'Nenhum favorito'],
    ['N\u00e3orito', 'Nenhum favorito'],
    // Nãome => Nome  
    ['NÃ£ome completo', 'Nome completo'],
    ['N\u00e3ome completo', 'Nome completo'],
    // Titles with bad Não at wrong place
    ['NÃ£o alguÃ©m', 'Quando alguém'],
    ['N\u00e3o alguém', 'Quando alguém'],
    // âˆž is infinity ∞
    ['âˆž', '∞'],
    // isPaísed -> isPaused in the button
    ['isPaísed', 'isPaused'],
    ['isPa\u00edsed', 'isPaused'],
    // Paísado -> Pausado in ST object
    ['Pa\u00edsado', 'Pausado'],
    ['Paísado', 'Pausado'],
    // Pa\u00edar -> Pausar
    ['Pa\u00edsar', 'Pausar'],
    ['Pa\u00edsed', 'Paused'],
    ['Pa\u00eds ', 'Pausar '],
    // VocÃª ainda nÃ£o tem anÃºncios
    ['VocÃª ainda nÃ£o tem anÃºncios', 'Você ainda não tem anúncios'],
    // Erro ao carregar anÃºncios
    ['anÃºncios', 'anúncios'],
    // Botão button toggle
    ['â¸ Pa\u00edsed', '⏸ Pausar'],
    ['â¸ Pa\u00edses', '⏸ Pausar'],
    ['â¸ Países', '⏸ Pausar'],
];

let count = 0;
fixes.forEach(([bad, good]) => {
    if (html.includes(bad)) {
        html = html.split(bad).join(good);
        count++;
        console.log(`Fixed: "${bad}" -> "${good}"`);
    }
});

// Final check: fix any remaining "País" that are actually "Pausa" in JS
html = html.replace(/isPa\u00eds/g, 'isPaused');
html = html.replace(/isPaís/g, 'isPaused');
html = html.replace(/'Pa\u00edsar'/g, "'Pausar'");
html = html.replace(/'Países'/g, "'Pausar'");
html = html.replace(/NãoLocaleString/g, 'ad.price.toLocaleString');
html = html.replace(/NÃ£oLocaleString/g, 'ad.price.toLocaleString');
html = html.replace(/otherN.{1,5}nv\.adTitle/g, "otherName);sTxt('thread-subtitle',conv.adTitle");
html = html.replace(/conv\.otherN.{1,5}nv\.adTitle/g, "conv.otherName);sTxt('thread-subtitle',conv.adTitle");

fs.writeFileSync('c:\\classificado\\painel.html', html, 'utf8');
console.log(`\nTotal: ${count} replacements. File length: ${html.length}`);
