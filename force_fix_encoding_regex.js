const fs = require('fs');

function fixMojibakeRegex(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace all An<anything>ncios with Anúncios
    content = content.replace(/An[^n]+ncios/g, 'Anúncios');
    content = content.replace(/an[^n]+ncios/g, 'anúncios');
    content = content.replace(/An[^n]+ncio/g, 'Anúncio');
    content = content.replace(/an[^n]+ncio/g, 'anúncio');
    content = content.replace(/Gr[^t]+tis/g, 'Grátis');
    content = content.replace(/Altera[^e]+es/g, 'Alterações');
    content = content.replace(/Apresenta[^o]+o/g, 'Apresentação');
    content = content.replace(/Pa[^s]+s/g, 'País');
    content = content.replace(/Prov[^n]+ncia/g, 'Província');
    content = content.replace(/voc[^ ]+ /g, 'você ');
    content = content.replace(/propriedade[^<]+/g, 'propriedade…');
    content = content.replace(/t[^t]+tulo/g, 'título');
    content = content.replace(/In[^c]+cio/g, 'Início');
    content = content.replace(/Leil[^e]+es/g, 'Leilões');
    content = content.replace(/Leil[^o]+o/g, 'Leilão');
    content = content.replace(/Informa[^e]+es/g, 'Informações');
    content = content.replace(/At[^ ]+ /g, 'Até ');
    content = content.replace(/M[^q]+quinas/g, 'Máquinas');
    content = content.replace(/m[^q]+quinas/g, 'máquinas');
    content = content.replace(/N[^o]+o /g, 'Não ');
    content = content.replace(/n[^o]+o /g, 'não ');
    content = content.replace(/Portugu[^s]+s/g, 'Português');
    content = content.replace(/Espa[^o]+ol/g, 'Español');
    
    // Also the new Plan card might have mojibake
    // Actually the Plan Card was injected via Node script, so it has CORRECT utf-8!
    // But let's apply the replace just in case.
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
}

fixMojibakeRegex('c:\\classificado\\painel.html');
