import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const rows = [];
for (const name of ['site-assistant-loader.js', 'site-assistant-vanilla.js', 'site-assistant-vanilla.css', 'site-assistant.js', 'site-assistant.css', 'remixicon.css', 'remixicon.woff2']) {
  const bytes = readFileSync(fileURLToPath(new URL(`../dist/${name}`, import.meta.url)));
  rows.push({ asset: name, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length });
}
for (const [asset, names] of [['vanilla JS+CSS', ['site-assistant-vanilla.js', 'site-assistant-vanilla.css']], ['React JS+CSS', ['site-assistant.js', 'site-assistant.css']]]) {
  const selected = rows.filter(row => names.includes(row.asset));
  rows.push({ asset, raw: selected.reduce((sum, row) => sum + row.raw, 0), gzip: selected.reduce((sum, row) => sum + row.gzip, 0) });
}
console.table(rows);
if (rows[0].gzip >= 3000) throw new Error('Loader exceeds the 3 KB gzip budget');
