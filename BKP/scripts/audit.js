const fs = require('fs');
const dirs = ['c:/classificado/js', 'c:/classificado'];
const files = [];
dirs.forEach(d => {
  fs.readdirSync(d).forEach(f => {
    if (f.endsWith('.js') || f.endsWith('.html')) {
      const full = d + '/' + f;
      if (fs.statSync(full).isFile()) files.push(full);
    }
  });
});

const patterns = {
  loopQuery: /forEach[^{]*{[^}]*querySelector|for\s*\([^)]*\)\s*{[^}]*querySelector/g,
  setInterval: /setInterval\(/g,
  innerHTML_loop: /(?:for|forEach|while|map).*innerHTML\s*\+?=/g, // Needs a proper AST, but regex is a start
  unclosedSupabase: /\.on\('postgres_changes'(?![\s\S]*return channel)/g,
  unpaginatedGet: /await\s+sb\.from\([^)]+\)\.select\(['"][^'"]*['"]\)(?!.*\.(?:limit|range)\()/g
};

console.log('--- AUDIT REPORT ---');
let totalIssues = 0;
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  for (let [name, regex] of Object.entries(patterns)) {
    const matches = [...content.matchAll(regex)];
    if (matches.length > 0) {
      console.log(`${file} - ${name} - ${matches.length} occurrences`);
      totalIssues += matches.length;
    }
  }
});
console.log(`Total issues found: ${totalIssues}`);
