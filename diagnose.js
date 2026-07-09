const fs = require('fs');

// Read as binary buffer to preserve everything
const buf = fs.readFileSync('c:\\classificado\\painel.html');

// Convert to hex string to inspect the exact bytes around "An" problem
// â€¦ in UTF-8 is: e2 80 a6 (that's the "..." character U+2026 HORIZONTAL ELLIPSIS)
// When double-encoded: c3 a2 c2 80 c2 a6 in UTF-8

// ðŸ‡§ in double-encoded form = c3 b0 c5 b8 e2 80 a1
// Flag emoji bytes:
// Brazil flag = F0 9F 87 A7 F0 9F 87 B7 
// When saved as UTF-8 but read as latin1 becomes multi-char mess

// Strategy: Read as utf-8, then do simple string replacements for known bad patterns
let html = buf.toString('utf8');

// Check what we have
const pos = html.indexOf('An');
const sample = html.substring(pos-2, pos+20);
console.log('Sample around An:', JSON.stringify(sample));
console.log('Hex:', Buffer.from(sample).toString('hex'));
console.log('File length:', html.length);
