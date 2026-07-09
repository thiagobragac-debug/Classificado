const fs = require('fs');

try {
    let content = fs.readFileSync('c:\\classificado\\painel.html', 'latin1');
    let bytes = Buffer.from(content, 'latin1');
    let cleanUtf8 = bytes.toString('utf8');
    
    // Check if it worked by looking for 'Anúncios'
    if (cleanUtf8.includes('Anúncios')) {
        fs.writeFileSync('c:\\classificado\\painel.html', cleanUtf8, 'utf8');
        console.log('Successfully fixed double-UTF8 encoding!');
    } else {
        console.log('Failed to decode properly. Found: ' + cleanUtf8.substring(1000, 1050));
    }
} catch(e) {
    console.log(e);
}
