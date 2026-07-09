const fs = require('fs');

function forceFix(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Using simple regex wildcard for the broken characters
    content = content.replace(/An[^\w\s]*ncios/g, 'Anúncios');
    content = content.replace(/an[^\w\s]*ncios/g, 'anúncios');
    content = content.replace(/An[^\w\s]*ncio/g, 'Anúncio');
    content = content.replace(/an[^\w\s]*ncio/g, 'anúncio');
    content = content.replace(/Gr[^\w\s]*tis/g, 'Grátis');
    content = content.replace(/Altera[^\w\s]*es/g, 'Alterações');
    content = content.replace(/Apresenta[^\w\s]*o/g, 'Apresentação');
    content = content.replace(/Pa[^\w\s]*s/g, 'País');
    content = content.replace(/Prov[^\w\s]*ncia/g, 'Província');
    content = content.replace(/voc[^\w\s]* /g, 'você ');
    content = content.replace(/t[^\w\s]*tulo/g, 'título');
    content = content.replace(/In[^\w\s]*cio/g, 'Início');
    content = content.replace(/Leil[^\w\s]*es/g, 'Leilões');
    content = content.replace(/Leil[^\w\s]*o/g, 'Leilão');
    content = content.replace(/M[^\w\s]*quinas/g, 'Máquinas');
    content = content.replace(/m[^\w\s]*quinas/g, 'máquinas');
    content = content.replace(/Portugu[^\w\s]*s/g, 'Português');
    content = content.replace(/Espa[^\w\s]*ol/g, 'Español');
    
    // Also explicitly target "Anǧncios" which showed up in output
    content = content.replace(/Anǧncios/g, 'Anúncios');
    content = content.replace(/anǧncios/g, 'anúncios');
    content = content.replace(/Grǧtis/g, 'Grátis');
    content = content.replace(/GrÃ¡tis/g, 'Grátis');
    content = content.replace(/AlteraÃ§Ãµes/g, 'Alterações');
    content = content.replace(/ApresentaÃ§Ã£o/g, 'Apresentação');
    content = content.replace(/PaÃs/g, 'País');
    content = content.replace(/ProvÃncia/g, 'Província');
    content = content.replace(/vocÃª/g, 'você');
    content = content.replace(/AnÃºncios/g, 'Anúncios');
    content = content.replace(/anÃºncio/g, 'anúncio');
    content = content.replace(/Meus An\w+ncios/g, 'Meus Anúncios');
    
    // Just force the known strings 
    content = content.replace(/Nenhum an.+ncio ainda/g, 'Nenhum anúncio ainda');
    content = content.replace(/Publicar primeiro an.+ncio/g, 'Publicar primeiro anúncio');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
}

forceFix('c:\\classificado\\painel.html');
