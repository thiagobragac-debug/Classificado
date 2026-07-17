const fs = require('fs');
const path = require('path');

const dir = 'c:/classificado';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const fontTags = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">`;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('fonts.googleapis.com/css2')) {
    content = content.replace(/<link rel="stylesheet"/, fontTags + '\n  <link rel="stylesheet"');
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
