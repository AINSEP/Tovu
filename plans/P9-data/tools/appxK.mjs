// Appendices + INDEX fragments for P9K. Usage: node -I appxK.mjs tv.json <old-rule plan.mjs out> <planK out> <plan repo> <fragments dir>
import fs from 'node:fs';
import path from 'node:path';
const [TV, OUT0, OUTK, REPO, FRAG] = process.argv.slice(2);
const g = JSON.parse(fs.readFileSync(TV, 'utf8'));
const rd = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const old = rd(OUT0, 'data.json'); const oldBlocked = rd(OUT0, 'blocked.json'); const oldShells = rd(OUT0, 'shells.json');
const K = rd(OUTK, 'k-data.json'); const work = rd(OUTK, 'work.json'); const keep = rd(OUTK, 'keep.json');
fs.mkdirSync(FRAG, { recursive: true });
const ROWS = [
  ['themes', ['theme', 'adm-themes']], ['publish-content', ['publish-content', 'publish-content-ui', 'publish-trust', 'adm-publish-content']], ['post', ['post', 'adm-posts']],
  ['newsletter', ['newsletter']], ['site-backup', ['site-backup']], ['deployments', ['deployments', 'adm-deployment']], ['security (admin → Jini admin/security)', ['adm-security']],
  ['rendering/routes', ['public-http', 'admin-http']], ['admin screens (other)', ['adm-other', 'adm-pages', 'adm-recovery', 'adm-source-control', 'adm-members', 'adm-users']],
  ['admin shell/transport/roles', ['adm-shell-lib', 'adm-shell-hooks', 'adm-shell-components', 'adm-roles']], ['desktop', ['desktop']], ['users U (members, member-login)', ['members', 'member-login']],
  ['devops other (source-control, site-export, domain-dns)', ['source-control', 'site-export', 'domain-dns']], ['shared contracts + platform helpers', ['contracts-core', 'contracts-headless', 'platform-html', 'platform-routing', 'platform-mail', 'presentation']],
];
const rowOf = (a) => (ROWS.find(([, xs]) => xs.includes(a)) || ['other generic features (X lane)'])[0];
const names = [...ROWS.map((r) => r[0]), 'other generic features (X lane)'];
// old INDEX text columns (goes to / stays why)
const idx = fs.readFileSync(path.join(REPO, 'INDEX-EXTRACTION.md'), 'utf8').split('\n');
const txt = new Map(); for (const l of idx) { const c = l.split(' | '); if (c.length >= 13 && /^\| [a-z]/.test(l)) txt.set(c[0].slice(2).trim(), { dirs: c[1], goes: c[11], why: (c[12] || '').replace(/ \|$/, '') }); }
// ---- table 1: re-measure, same columns as INDEX (old blocker rules) on the new bases
const r1 = new Map(names.map((n) => [n, { left: 0, loc: 0, sh: 0, ready: 0, dep: 0, xp: 0, via: 0, words: 0, keep: 0 }]));
for (const [a, s] of old.areaStats) { const r = r1.get(rowOf(a)); r.left += s.src; r.loc += s.loc; r.ready += s.ready; r.dep += s.tovuDep; r.xp += s.xp3; r.via += s.trans; r.words += s.words; r.keep += s.keep; }
for (const s of oldShells) { const r = r1.get(rowOf(s.area)); r.left++; r.sh++; }
const T = (n) => n.toLocaleString('en-US');
const L1 = ['| area | Tovu dirs measured | Jini-bound files left in Tovu | LOC | re-export shells to delete | verbatim-movable now | blocked: imports Tovu-kept code | blocked: would add a Jini cross-package edge | blocked: only through blocked deps | files with Tovu words | stays in Tovu (files) | goes to | stays in Tovu and why |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
const tot1 = { left: 0, loc: 0, sh: 0, ready: 0, dep: 0, xp: 0, via: 0, words: 0, keep: 0 };
for (const n of names) { const r = r1.get(n); for (const k in tot1) tot1[k] += r[k]; const t = txt.get(n) || { dirs: '', goes: '', why: '' }; L1.push(`| ${n} | ${t.dirs} | **${r.left}** | ${r.loc} | ${r.sh} | ${r.ready} | ${r.dep} | ${r.xp} | ${r.via} | ${r.words} | ${r.keep} | ${t.goes} | ${t.why} |`); }
L1.push(`| **TOTAL** | | **${tot1.left}** | ${tot1.loc} | ${tot1.sh} | ${tot1.ready} | ${tot1.dep} | ${tot1.xp} | ${tot1.via} | ${tot1.words} | ${tot1.keep} | | |`);
// ---- table 2: the K plan per area
const r2 = new Map(names.map((n) => [n, { left: 0, verb: 0, K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, keep: 0, codex: 0, steps: new Set() }]));
for (const w of work) { const r = r2.get(rowOf(w.area)); r.left++; const ks = new Set(w.k.map((x) => x.k.replace(/^(K4|K5).*/, '$1'))); if (![...ks].some((k) => /^K/.test(k))) r.verb++; for (const k of ['K1', 'K2', 'K3', 'K4', 'K5']) if (ks.has(k)) r[k]++; if (w.step) r.steps.add(w.step); }
for (const s of oldShells) r2.get(rowOf(s.area)).left++;
for (const k of keep) { const r = r2.get(rowOf(k.area)); r.keep++; if (/Codex|K1 host|K3:/.test(k.why)) r.codex++; }
const L2 = ['| area | Jini-bound files left (after Codex/K STAYS) | verbatim (no own K work) | K1 route spec | K2 injected kit | K3 copy arg | K4 type → core | K5 injected collaborator | stays in Tovu (files) | of which newly STAYS (Codex FIX, K1 host ports, K3 no-args) | steps |', '|---|---|---|---|---|---|---|---|---|---|---|'];
const tot2 = { left: 0, verb: 0, K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, keep: 0, codex: 0, steps: 0 };
for (const n of names) { const r = r2.get(n); for (const k in tot2) tot2[k] += k === 'steps' ? r.steps.size : r[k]; L2.push(`| ${n} | **${r.left}** | ${r.verb} | ${r.K1} | ${r.K2} | ${r.K3} | ${r.K4} | ${r.K5} | ${r.keep} | ${r.codex} | ${r.steps.size} |`); }
L2.push(`| **TOTAL** | **${tot2.left}** | ${tot2.verb} | ${tot2.K1} | ${tot2.K2} | ${tot2.K3} | ${tot2.K4} | ${tot2.K5} | ${tot2.keep} | ${tot2.codex} | ${tot2.steps} |`);
fs.writeFileSync(path.join(FRAG, 'table1.md'), L1.join('\n')); fs.writeFileSync(path.join(FRAG, 'table2.md'), L2.join('\n'));
fs.writeFileSync(path.join(REPO, 'plans/P9-data/files-left-table.md'), ['# Files left — re-measure on Tovu merge-12 + ex-sh/ex-core/ex-export (old blocker rules, same columns as INDEX)', '', L1.join('\n'), '', '# Files left — the K plan (owner K1–K5, 11-22)', '', L2.join('\n'), ''].join('\n'));
// ---- formerly blocked → step
const wk = new Map(work.map((w) => [w.f, w])); const kp = new Map(keep.map((k) => [k.f, k]));
const byArea = new Map(); for (const b of oldBlocked) { if (!byArea.has(b.area)) byArea.set(b.area, []); byArea.get(b.area).push(b); }
const viaStats = { via: 0, viaVerb: 0, viaK: 0, viaKeep: 0 };
const B = [`# P9K — the ${oldBlocked.length} formerly blocked files, each assigned under K1–K5`, '', 'Re-measured with the old rules on Tovu merge-12 + ex-sh/ex-core/ex-export (`plan.mjs`), then re-planned with `planK.mjs`. **old reason**: tovu-dep / xp3 / via X (as before). **K work**: the mechanisms its own imports need (K1 route spec, K2 kit, K3 copy arg, K4 type → core / local slice / i18n split, K5 injected collaborator, SH shell repoint); "verbatim" = none of its own, it only waited on its deps. **step**: the sheet in `plans/P9-steps/` that moves it, or STAYS with the reason.', ''];
for (const [a, xs] of [...byArea].sort()) {
  B.push(`## ${a} (${xs.length})`, '', '| file | LOC | old reason | K work | step |', '|---|---|---|---|---|');
  for (const b of xs.sort((x, y) => x.f.localeCompare(y.f))) {
    const w = wk.get(b.f); const kk = kp.get(b.f); const ks = w ? [...new Set(w.k.map((x) => x.k))].join(' ') || 'verbatim' : '';
    if (b.why.startsWith('via')) { viaStats.via++; if (kk) viaStats.viaKeep++; else if (ks === 'verbatim') viaStats.viaVerb++; else viaStats.viaK++; }
    B.push(`| \`${b.f}\` | ${b.loc} | ${b.why.startsWith('via') ? 'via `' + b.why.slice(4).replace(/^apps\/(website|admin)\/src\//, '') + '`' : b.why} | ${kk ? '—' : ks} | ${kk ? 'STAYS: ' + kk.why : '`' + (w?.step || '?') + '`'} |`);
  }
  B.push('');
}
fs.writeFileSync(path.join(REPO, 'plans/P9-data/blocked-files.md'), B.join('\n'));
fs.writeFileSync(path.join(FRAG, 'via.json'), JSON.stringify(viaStats));
// ---- stays
const S = [`# P9K — files in Jini-bound directories that STAY in Tovu (${keep.length})`, '', 'Rules: plan.mjs KEEP_RULES (product screens, desktop packaging, composition, product-named files), Codex FIX/BLOCK 11-22 (Tovu policy files; their types move to core in K4 seam steps), K1 host ports (Express auth/session/static helpers the host turns into `JsonRoutePorts`), K3 (product copy with no args object). Steps may add rows under their STOP rules; each such row names the step.', '', '| file | LOC | why it stays |', '|---|---|---|'];
for (const k of keep.sort((a, b) => a.f.localeCompare(b.f))) S.push(`| \`${k.f}\` | ${k.loc} | ${k.why} |`);
fs.writeFileSync(path.join(REPO, 'plans/P9-data/stays-in-tovu.md'), S.join('\n') + '\n');
// ---- step table (INDEX) + batches
const items = K.items.slice().sort((a, b) => a.batch - b.batch || (a.repo === 'Jini' ? -1 : 1) || a.id.localeCompare(b.id));
const ST = ['| step id | lane | repo | files | depends on | batch | est | files left after |', '|---|---|---|---|---|---|---|---|'];
for (const it of items) ST.push(`| ${it.id} | ${it.lane === 'old' ? 'P9 (' + it.id.split('-')[0] + ')' : it.lane} | ${it.repo} | ${it.n ? it.n + (it.repo === 'Tovu' ? ' (delete + repoint)' : ' (move)') : '—'} | ${it.deps.join(', ') || '—'} | ${it.batch ? "B" + it.batch : "done (tonight)"} | ${it.est} min | ${it.repo === 'Tovu' && it.files ? T(it.left) : ''} |`);
fs.writeFileSync(path.join(FRAG, 'steps.md'), ST.join('\n'));
const BT = ['| batch | items (≤6, one implementer each) | max est | files left after |', '|---|---|---|---|'];
const est = new Map(K.items.map((i) => [i.id, i.est]));
K.batches.forEach((b, i) => BT.push(`| B${i + 1} | ${b.join(', ')} | ${Math.max(...b.map((x) => est.get(x)))} min | ${T(K.curve[i])} |`));
fs.writeFileSync(path.join(FRAG, 'batches.md'), BT.join('\n'));
const wall = K.batches.reduce((a, b) => a + Math.max(...b.map((x) => est.get(x))), 0);
const marks = [10, 20, 30, 40, 50, 60, 80, 100, 120, 140, 160, K.batches.length].filter((x) => x <= K.batches.length);
let acc = 0; const cw = K.batches.map((b) => (acc += Math.max(...b.map((x) => est.get(x)))));
fs.writeFileSync(path.join(FRAG, 'curve.md'), ['| after batch | files left | cumulative wall (h, sum of batch max est) |', '|---|---|---|', `| start | ${T(K.startLeft)} | 0 |`, ...marks.map((m) => `| B${m} | ${T(K.curve[m - 1])} | ${Math.round(cw[m - 1] / 60)} |`)].join('\n'));
fs.writeFileSync(path.join(FRAG, 'meta.json'), JSON.stringify({ wallH: Math.round(wall / 60), batches: K.batches.length, implH: Math.round(K.items.reduce((a, i) => a + i.est, 0) / 60), tot1, tot2, via: viaStats, oldBlocked: oldBlocked.length, oldCounts: oldBlocked.reduce((a, b) => { const k = b.why.startsWith('via') ? 'via' : b.why; a[k] = (a[k] || 0) + 1; return a; }, {}) }));
console.log(JSON.stringify({ tot1, tot2, via: viaStats, wallH: Math.round(wall / 60) }));
