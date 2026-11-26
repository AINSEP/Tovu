// Usage: node make-k0.mjs appB.md k0-keeps.md  (appB.md = "Appendix B" section of reviews/x4-check-1125.md)
import fs from 'node:fs';
const [inp, out] = process.argv.slice(2); const W = 'apps/website/src';
const roots = { admin: 'apps/admin/src/', wal: W + '/features/', wmz: W + '/features/' };
const rest = { W, C: W + '/contracts/core', A: W + '/server/inbound/admin-http', P: W + '/server/inbound/public-http', D: 'apps/desktop/src' };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
let sec = null, fence = false; const paths = [];
for (const ln of fs.readFileSync(inp, 'utf8').split('\n')) {
  let m; if ((m = ln.match(/^#### (\w+) /))) { sec = m[1]; continue; }
  if (/^```/.test(ln)) { fence = !fence; continue; }
  if (!fence || !sec || !ln.trim()) continue; const t = ln.trim();
  if (sec === 'rest') { const k = t.match(/^([WCADP])\/(.*)$/); paths.push(rest[k[1]] + '/' + k[2]); } else paths.push(roots[sec] + t);
}
const uniq = [...new Set(paths)];
fs.writeFileSync(out, `# K0 keep ledger\n\nThis is Appendix B of \`reviews/x4-check-1125.md\` (Tovu branch \`plan/x4-check-1125\`): the 177 exact STAYS-HOST paths (196 STAYS-HOST minus the 19 corrections), expanded from the per-slice roots to full repo-relative paths. One anchored, regex-escaped rule per path; no directory or name patterns.\n\n\`\`\`text\n${uniq.map((p) => '^' + esc(p) + '$').join('\n')}\n\`\`\`\n`);
fs.writeFileSync(out.replace(/\.md$/, '.paths.txt'), uniq.join('\n') + '\n');
console.log('paths', paths.length, 'unique', uniq.length);
