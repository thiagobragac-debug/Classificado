const fs = require('fs');
const files = fs.readdirSync('c:/classificado/js').filter(f => f.endsWith('.js') && f !== 'supabase.js');

files.forEach(f => {
  let c = fs.readFileSync('c:/classificado/js/' + f, 'utf8');
  // Simple regex to comment out debug console.logs
  // Does not comment out console.error or console.warn
  // We'll skip this if it's too risky. Let's just find them instead to see if they exist.
  let logs = (c.match(/console\.log\(/g) || []).length;
  if(logs > 0) {
    console.log(f + ' has ' + logs + ' console.logs');
    // c = c.replace(/console\.log\(/g, '// console.log(');
    // fs.writeFileSync('c:/classificado/js/' + f, c, 'utf8');
  }
});
