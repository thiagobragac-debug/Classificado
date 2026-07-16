const fs = require('fs');
let content = fs.readFileSync('painel.html', 'utf-8');

if (!content.includes('let currentAdsPage = 1;')) {
    content = content.replace('let _currentUser=null,_myAds=[],_messages=[],_favs=[];', 'let _currentUser=null,_myAds=[],_messages=[],_favs=[];\n  let currentAdsPage = 1;');
}

fs.writeFileSync('painel.html', content, 'utf-8');
