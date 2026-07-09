const fs = require('fs');

function forceFix(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Simplest possible regex: 'An' followed by 1 to 4 of ANYTHING, followed by 'ncios'
    content = content.replace(/An.{1,4}ncios/g, 'Anúncios');
    content = content.replace(/an.{1,4}ncios/g, 'anúncios');
    content = content.replace(/An.{1,4}ncio/g, 'Anúncio');
    content = content.replace(/an.{1,4}ncio/g, 'anúncio');
    content = content.replace(/Gr.{1,4}tis/g, 'Grátis');
    content = content.replace(/Altera.{1,4}es/g, 'Alterações');
    content = content.replace(/Apresenta.{1,4}o/g, 'Apresentação');
    content = content.replace(/Pa.{1,4}s/g, 'País');
    content = content.replace(/Prov.{1,4}ncia/g, 'Província');
    content = content.replace(/voc.{1,4}\s/g, 'você ');
    content = content.replace(/t.{1,4}tulo/g, 'título');
    content = content.replace(/In.{1,4}cio/g, 'Início');
    content = content.replace(/Leil.{1,4}es/g, 'Leilões');
    content = content.replace(/Leil.{1,4}o/g, 'Leilão');
    content = content.replace(/M.{1,4}quinas/g, 'Máquinas');
    content = content.replace(/m.{1,4}quinas/g, 'máquinas');
    content = content.replace(/Portugu.{1,4}s/g, 'Português');
    content = content.replace(/Espa.{1,4}ol/g, 'Español');
    
    // Specifically target Meus An<something>ncios again to be 100% sure
    content = content.replace(/Meus\s+Anúncios/g, 'Meus Anúncios');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
}

forceFix('c:\\classificado\\painel.html');
