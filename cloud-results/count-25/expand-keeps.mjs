// Usage: node expand-keeps.mjs <out-rules.json> KEEPDIR_OR_FILE...
// Extracts anchored keep rules from keep .md files (section 1 / first '## ' section only).
// Formats: ```js [/re/, 'why'] lines; table rows with `^regex$` (c/ p/ r/ prefixes expanded); brace globs (fenced lines or table first cell).
import fs from 'node:fs'; import path from 'node:path';
const [out, ...ins] = process.argv.slice(2);
const files = ins.flatMap((p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.md')).sort().map((f) => path.join(p, f)) : [p]);
const W = 'apps/website/src/';
function brace(s) { const i = s.indexOf('{'); if (i < 0) return [s]; let d = 0, j = i, parts = [], st = i + 1; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (!d) { parts.push(s.slice(st, j)); break; } } else if (s[j] === ',' && d === 1) { parts.push(s.slice(st, j)); st = j + 1; } } const pre = s.slice(0, i), post = s.slice(j + 1); return parts.flatMap((p) => brace(p).flatMap((a) => brace(post).map((b) => pre + a + b))); }
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
const rules = [];
const add = (src, f, why) => rules.push({ src, file: path.basename(f), why });
for (const f of files) {
  const base = path.basename(f); const lines = fs.readFileSync(f, 'utf8').split('\n');
  let sec = 0, fence = false, rowNo = 0, jsPre = null;
  for (const ln of lines) {
    if (/^## /.test(ln)) { sec++; rowNo = 0; continue; }
    if (/^```/.test(ln)) { fence = !fence; continue; }
    let m;
    if (sec > 1 && !/k0/.test(base)) continue; // only section 1 (keep rules) is extracted; MOVE ledgers / per-area / NOT-CHECKED are not keeps
    if (fence && jsPre !== null) { if (/^\s*`\]/.test(ln)) { jsPre = null; continue; } const t = ln.trim(); for (const tk of t.split(/\s+/).filter(Boolean)) for (const p of brace(jsPre.pre + tk)) add('^' + esc(p) + '$', f, jsPre.why); continue; }
    if (fence && (m = ln.match(/^\s*\['([^']+\/)',\s*'([^']*)',\s*`\s*$/))) { jsPre = { pre: m[1], why: m[2] }; continue; }
    if (fence && (m = ln.match(/^\[\/(.*)\/,\s*'(.*)'\],?\s*$/))) { add(m[1], f, m[2]); continue; }
    if (!fence && (m = ln.match(/^\| `(.+?)` \|/))) {
      rowNo++; let c = m[1].replace(/\\\|/g, '|');
      if (c.startsWith('^')) { c = c.replace(/^\^c\//, '^' + esc(W + 'contracts/')).replace(/^\^p\//, '^' + esc(W + 'platform/')).replace(/^\^r\//, '^' + esc(W + 'server/inbound/')); add(c, f, 'table regex'); continue; }
      let g = c; if (/w1/.test(base)) g = W + (rowNo > 5 ? 'features/' : '') + g; else continue;
      for (const p of brace(g)) add('^' + esc(p) + '$', f, 'glob');
      continue;
    }
    if (fence && ln.trim() && !/^#/.test(ln) && !/^\[\//.test(ln)) {
      const t = ln.trim();
      if (t.startsWith('^')) { add(t, f, 'anchored'); continue; }
      const pre = /count2-a/.test(base) ? 'apps/admin/src/' : /count2-w2/.test(base) ? W + 'features/' : null;
      if (pre === null) continue;
      for (const p of brace(pre + t)) add('^' + esc(p) + '$', f, 'glob');
    }
  }
}
// dedupe by source
const uniq = rules; // no dedupe: calibrated 507 = raw rule count
fs.writeFileSync(out, JSON.stringify(uniq));
const by = {}; for (const r of rules) by[r.file] = (by[r.file] || 0) + 1;
console.error('rules', rules.length, 'unique', uniq.length, JSON.stringify(by));
