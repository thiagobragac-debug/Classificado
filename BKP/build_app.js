const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// List of exact files to copy (HTML files + manifest/sw)
const publicFiles = [
  'admin.html',
  'anunciar.html',
  'anuncio.html',
  'cancelado.html',
  'diagnostico.html',
  'eventos.html',
  'index.html',
  'institucional.html',
  'leilao.html',
  'leiloes.html',
  'listagem.html',
  'login.html',
  'painel.html',
  'planos.html',
  'reset.html',
  'sucesso.html',
  'vendedor.html',
  'manifest.json',
  'sw.js',
  'legal_content.json'
];

// Folders to copy completely
const publicFolders = [
  'css',
  'js',
  'assets'
];

function copyFileSync(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

function copyFolderRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyFolderRecursiveSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Cleaning www directory...');
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

console.log('Copying files...');
for (const file of publicFiles) {
  copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log('Copying folders...');
for (const folder of publicFolders) {
  copyFolderRecursiveSync(path.join(srcDir, folder), path.join(destDir, folder));
}

console.log('Build completed successfully!');
