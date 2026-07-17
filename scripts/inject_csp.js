const fs = require('fs');
const path = require('path');

const dir = 'c:/classificado';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.sentry-cdn.com https://browser.sentry-cdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://placehold.co https://rfzuzuobwuanmbrcthqe.supabase.co https://flagcdn.com; connect-src 'self' https://rfzuzuobwuanmbrcthqe.supabase.co wss://rfzuzuobwuanmbrcthqe.supabase.co https://ipapi.co https://freeipapi.com https://nominatim.openstreetmap.org https://*.sentry.io;">`;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('Content-Security-Policy')) {
    content = content.replace(/<head>/i, '<head>\n  ' + cspTag);
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file} with CSP`);
  }
});
