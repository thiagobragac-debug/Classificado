const fs = require('fs');

function fixMojibake(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if it has mojibake
    if (content.includes('AnÃºncios') || content.includes('GrÃ¡tis') || content.includes('Anǟncios')) {
        // It might be double mangled. Let's just do a brute force string replace for the common ones.
        content = content.replace(/AnÃºncios/g, 'Anúncios');
        content = content.replace(/anÃºncios/g, 'anúncios');
        content = content.replace(/AnÃºncio/g, 'Anúncio');
        content = content.replace(/anÃºncio/g, 'anúncio');
        content = content.replace(/GrÃ¡tis/g, 'Grátis');
        content = content.replace(/AlteraÃ§Ãµes/g, 'Alterações');
        content = content.replace(/ApresentaÃ§Ã£o/g, 'Apresentação');
        content = content.replace(/PaÃ­s/g, 'País');
        content = content.replace(/ProvÃ­ncia/g, 'Província');
        content = content.replace(/vocÃª/g, 'você');
        content = content.replace(/propriedadeâ€¦/g, 'propriedade…');
        content = content.replace(/tÃ­tulo/g, 'título');
        content = content.replace(/InÃ­cio/g, 'Início');
        content = content.replace(/LeilÃµes/g, 'Leilões');
        content = content.replace(/LeilÃ£o/g, 'Leilão');
        content = content.replace(/InformaÃ§Ãµes/g, 'Informações');
        content = content.replace(/AtÃ©/g, 'Até');
        content = content.replace(/MÃ¡quinas/g, 'Máquinas');
        content = content.replace(/mÃ¡quinas/g, 'máquinas');
        content = content.replace(/NÃ£o/g, 'Não');
        content = content.replace(/nÃ£o/g, 'não');
        content = content.replace(/PortuguÃªs/g, 'Português');
        content = content.replace(/Portuguǟs/g, 'Português');
        content = content.replace(/EspaÃ±ol/g, 'Español');
        content = content.replace(/Espaǟol/g, 'Español');
        content = content.replace(/Anǟncios/g, 'Anúncios');
        content = content.replace(/anǟncios/g, 'anúncios');
        content = content.replace(/Inǟcio/g, 'Início');
        content = content.replace(/Grǟtis/g, 'Grátis');
        content = content.replace(/mǟquinas/g, 'máquinas');
        content = content.replace(/anǟncio/g, 'anúncio');
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', filePath);
    }
}

fixMojibake('c:\\classificado\\painel.html');
