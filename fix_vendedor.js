const fs = require('fs');
let html = fs.readFileSync('vendedor.html', 'utf8');

// Remove stray closing divs right after <main>
html = html.replace(/<main class="container" style="position: relative; z-index: 10; margin-top: -4rem; min-height:80vh; padding-bottom: 3rem;">\s*<\/div>\s*<\/div>/, '<main class="container" style="position: relative; z-index: 10; margin-top: -4rem; min-height:80vh; padding-bottom: 3rem;">');

// Center seller info
html = html.replace('class="seller-profile-info" style="display:flex; align-items:center; gap: 1.5rem; flex-wrap: wrap;"', 'class="seller-profile-info" style="display:flex; flex-direction:column; align-items:center; text-align:center; gap: 1rem;"');

fs.writeFileSync('vendedor.html', html);
console.log('vendedor.html fixed successfully');
