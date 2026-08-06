const fs = require('fs');
const fp = 'src/routes/(admin)/account/(menu)/agworld/+page.svelte';
let s = fs.readFileSync(fp, 'utf8');

// Replace garbled dot patterns with actual middle dot
const fixes = [
    ['\u00c3\u0192\u00c6\u2019\u00e2\u20ac\u0160\u00e2\u20ac\u017e\u00c3\u201a\u00c2\u00b7', '\u00b7'],
    ['\u00c3\u00a2\u00e2\u201a\u00ac\u00c5\u00a1\u00c3\u00a2\u00e2\u201a\u00ac\u00c5\u00a1\u00c3\u00a2\u00e2\u20ac\u0161\u00c3\u201a\u00c2\u00b7', '\u00b7'],
    ['\u00c3\u0192\u00c6\u2019\u00e2\u20ac\u0160\u00e2\u20ac\u017e\u00c3\u201a\u00c2\u00b0', '\u00b0'],
];

for (const [garbled, real] of fixes) {
    const n = (s.match(new RegExp(garbled.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (n > 0) {
        s = s.split(garbled).join(real);
        console.log(`Fixed ${n} instances`);
    }
}

fs.writeFileSync(fp, s, 'utf8');
console.log('Done');
