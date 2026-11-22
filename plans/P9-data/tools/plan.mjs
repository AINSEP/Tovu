// Generate the P9 extraction measure + step sheets from the Tovu import graph.
// Usage: node plan.mjs tv.json <outDir>
import fs from 'node:fs';
import path from 'node:path';
const g = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3]; const QUIET = !!process.env.QUIET;
fs.mkdirSync(path.join(OUT, 'steps'), { recursive: true });
const ROOT = process.env.ROOT || '/home/user/tv12';
const srcOf = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
function shellKind(f) { const raw = srcOf(f); const s = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); const stm = s.split(/;\s*\n|\n(?=\s*(?:export|import)\b)/).map((x) => (x || '').trim()).filter(Boolean); const re = stm.filter((x) => /^export\s+(type\s+)?(\*|\{[\s\S]*?\})\s+from\s+["']@jini-ai\//.test(x)); if (re.length && re.length === stm.filter((x) => !/^import\s/.test(x)).length) return 'shell'; if (re.length && /compatibility adapter|deprecated compat/i.test(raw)) return 'adapter'; return null; }
const W = 'apps/website/src/';
const A = 'apps/admin/src/';
// ---- areas: id, lane, src prefix, Jini package, Jini dir under packages/<pkg>/src/
const AREAS = [
  // contracts first (shared deps)
  ['contracts-core', 'C', W + 'contracts/core/', 'core', 'contracts/site/'],
  ['contracts-headless', 'C', W + 'contracts/headless/', 'core', 'contracts/headless/'],
  ['platform-html', 'C', W + 'platform/html/', 'cms', 'html/site/'],
  ['platform-routing', 'C', W + 'platform/routing/', 'cms', 'routing/site/'],
  ['platform-mail', 'C', W + 'platform/mail/', 'user-management', 'mail/'],
  ['presentation', 'C', W + 'features/presentation/', 'cms', 'presentation/site/'],
  // T lane
  ['theme', 'T', W + 'features/theme/', 'cms', 'themes/site/'],
  ['post', 'T', W + 'features/post/', 'cms', 'posts/'],
  ['newsletter', 'T', W + 'features/newsletter/', 'user-management', 'newsletter/'],
  // P lane (publishing)
  ['publish-content-ui', 'P', W + 'features/publish-content/ui/', 'admin', 'publish-content/'],
  ['publish-content', 'P', W + 'features/publish-content/', 'cms', 'publish/content/'],
  ['publish-trust', 'P', W + 'features/publish-trust/', 'cms', 'publish/trust/'],
  // D lane (devops)
  ['site-backup', 'D', W + 'features/site-backup/', 'devops', 'backup/site/'],
  ['deployments', 'D', W + 'features/deployments/', 'devops', 'deploy/site/'],
  ['source-control', 'D', W + 'features/source-control/', 'devops', 'source-control/site/'],
  ['site-export', 'D', W + 'features/site-export/', 'devops', 'static-export/site/'],
  ['domain-dns', 'D', W + 'features/domain-dns/', 'devops', 'dns/site/'],
  // U lane
  ['members', 'U', W + 'features/members/', 'user-management', 'members/'],
  ['member-login', 'U', W + 'features/member-login/', 'user-management', 'member-login/'],

  // other Jini-bound website features (generic CMS / integrations), destination = owning Jini package
  ['media', 'X', W + 'features/media/', 'cms', 'media/site/'],
  ['media-import', 'X', W + 'features/media-import/', 'cms', 'media/site-import/'],
  ['media-generation', 'X', W + 'features/media-generation/', 'cms', 'media/site-generation/'],
  ['image-transform', 'X', W + 'features/image-transform/', 'cms', 'media/site-transform/'],
  ['widgets', 'X', W + 'features/widgets/', 'cms', 'widgets/site/'],
  ['settings', 'X', W + 'features/settings/', 'cms', 'settings/site/'],
  ['taxonomy', 'X', W + 'features/taxonomy/', 'cms', 'taxonomy/site/'],
  ['entries', 'X', W + 'features/entries/', 'cms', 'entries/site/'],
  ['navigation', 'X', W + 'features/navigation/', 'cms', 'navigation/site/'],
  ['content-types', 'X', W + 'features/content-types/', 'cms', 'content-types/site/'],
  ['comments', 'X', W + 'features/comments/', 'cms', 'comments/site/'],
  ['forms', 'X', W + 'features/forms/', 'cms', 'forms/site/'],
  ['form-destinations', 'X', W + 'features/form-destinations/', 'cms', 'forms/destinations/'],
  ['redirects', 'X', W + 'features/redirects/', 'cms', 'redirects/site/'],
  ['seo', 'X', W + 'features/seo/', 'cms', 'seo/site/'],
  ['pages', 'X', W + 'features/pages/', 'cms', 'pages/'],
  ['trash', 'X', W + 'features/trash/', 'cms', 'trash/site/'],
  ['permanent-delete', 'X', W + 'features/permanent-delete/', 'cms', 'trash/permanent/'],
  ['workspace', 'X', W + 'features/workspace/', 'cms', 'workspace/site/'],
  ['change-sets', 'X', W + 'features/change-sets/', 'cms', 'change-sets/'],
  ['content-duplication', 'X', W + 'features/content-duplication/', 'cms', 'content-duplication/'],
  ['fs-files', 'X', W + 'features/fs-files/', 'cms', 'fs-files/'],
  ['origin', 'X', W + 'features/origin/', 'cms', 'origin/'],
  ['webmcp', 'X', W + 'features/webmcp/', 'cms', 'webmcp/'],
  ['asset-transfer', 'X', W + 'features/asset-transfer/', 'cms', 'asset-transfer/'],
  ['site-inspection', 'X', W + 'features/site-inspection/', 'cms', 'site-inspection/'],
  ['consent', 'X', W + 'features/consent/', 'cookie-consent', 'site/'],
  ['analytics', 'X', W + 'features/analytics/', 'analytics', 'site/'],
  ['site-search', 'X', W + 'features/site-search/', 'search', 'site/'],
  ['webhooks', 'X', W + 'features/webhooks/', 'integrations', 'webhooks/site/'],
  ['api-connections', 'X', W + 'features/api-connections/', 'integrations', 'api-connections/'],
  ['custom-credentials', 'X', W + 'features/custom-credentials/', 'integrations', 'custom-credentials/'],
  ['vendor-credentials', 'X', W + 'features/vendor-credentials/', 'integrations', 'vendor-credentials/'],
  ['web-screenshot', 'X', W + 'features/web-screenshot/', 'integrations', 'web-screenshot/'],
  ['web', 'X', W + 'features/web/', 'integrations', 'web/'],
  ['object-storage', 'X', W + 'features/object-storage/', 'platform', 'object-store/site/'],
  ['external-mcp', 'X', W + 'features/external-mcp/', 'mcp', 'external/'],
  ['identity', 'X', W + 'features/identity/', 'user-management', 'identity/'],
  ['project-keys', 'X', W + 'features/project-keys/', 'user-management', 'project-keys/'],
  ['mail', 'X', W + 'features/mail/', 'user-management', 'mail/site/'],
  ['mail-status', 'X', W + 'features/mail-status/', 'user-management', 'mail/status/'],
  ['email-templates', 'X', W + 'features/email-templates/', 'user-management', 'mail/templates/'],
  ['agent-plugins', 'X', W + 'features/agent-plugins/', 'agent-plugins', 'site/'],
  ['plugin-runtime', 'X', W + 'features/plugin-runtime/', 'plugins', 'runtime/'],
  ['plugins', 'X', W + 'features/plugins/', 'plugins', 'site/'],
  ['skills', 'X', W + 'features/skills/', 'agentic', 'skills/site/'],
  ['database', 'X', W + 'features/database/', 'db', 'site/'],
  ['database-transfer', 'X', W + 'features/database-transfer/', 'db', 'transfer/'],
  ['recovery', 'X', W + 'features/recovery/', 'db', 'recovery/'],
  ['server-logs', 'X', W + 'features/server-logs/', 'diagnostics', 'server-logs/'],
  ['observability', 'X', W + 'features/observability/', 'diagnostics', 'site/'],
  ['tool-audit', 'X', W + 'features/tool-audit/', 'diagnostics', 'tool-audit/'],
  ['sites', 'X', W + 'features/sites/', 'KEEP', ''],
  // R lane (rendering / routes)
  ['public-http', 'R', W + 'server/inbound/public-http/', 'cms', 'public-http/'],
  ['admin-http', 'R', W + 'server/inbound/admin-http/', 'cms', 'admin-http/'],
  // A lane (admin screens + shell)
  ['adm-security', 'SEC', A + 'features/security/', 'admin', 'security/host/'],
  ['adm-roles', 'A', A + 'features/roles/', 'admin', 'roles/'],
  ['adm-users', 'A', A + 'features/users/', 'admin', 'users/'],
  ['adm-themes', 'A', A + 'features/themes/', 'admin', 'themes/'],
  ['adm-posts', 'A', A + 'features/posts/', 'admin', 'posts/'],
  ['adm-pages', 'A', A + 'features/pages/', 'admin', 'pages/'],
  ['adm-publish-content', 'A', A + 'features/publish-content/', 'admin', 'publish-content/screen/'],
  ['adm-deployment', 'A', A + 'features/deployment/', 'admin', 'deployment/'],
  ['adm-source-control', 'A', A + 'features/source-control/', 'admin', 'source-control/host/'],
  ['adm-recovery', 'A', A + 'features/recovery/', 'admin', 'recovery/'],
  ['adm-members', 'A', A + 'features/members/', 'admin', 'members/'],
  ['adm-other', 'A', A + 'features/', 'admin', 'screens/'],
  ['adm-shell-lib', 'A', A + 'lib/', 'admin', 'shell/lib/'],
  ['adm-shell-hooks', 'A', A + 'hooks/', 'admin', 'shell/hooks/'],
  ['adm-shell-components', 'A', A + 'components/', 'admin', 'shell/components/'],
  ['desktop', 'DT', 'apps/desktop/src/', 'desktop-host', 'shell/'],
];
// Admin features that are Tovu product (assistant dock wiring, product dashboard) stay; listed explicitly.
const KEEP_RULES = [
  [/^apps\/website\/src\/features\/(sites|site-guide|site-evidence|site-glue|admin-parity)\//, 'Tovu product: site management / owner guidance'],
  [/\/tovu[-.]|tovu-[a-z-]+\.(ts|tsx)$/, 'product-named file (tovu-*)'],
  [/server\/runtime\/|\/cli\//, 'composition / bootstrap'],
  [/^apps\/admin\/src\/features\/(ai-assistant|dashboard|playground|admin-ui|workspace|sites|voice-input)\//, 'Tovu product screen (assistant dock / dashboard / sites switcher)'],
  [/^apps\/admin\/src\/(App|main|nav|panels|panel-|media-panel|app-i18n|site-section)/, 'admin composition'],
  [/^apps\/admin\/src\/(admin-themes|styles)\//, 'Tovu product look (admin themes, styles)'],
  [/^apps\/desktop\/src\/(?!(find-in-page|spellcheck-menu|find-menu|auto-update-controller|durable-json-file|pty-helpers|instance-presence|node-toolchain|asar-verify|desktop-memory-sampler|js-backslide-guard|app-version-ipc|shell-staleness|speech\/))/, 'desktop packaging / site management (Tovu product)'],
  [/^apps\/admin\/src\/lib\/(i18n|locales)/, 'Tovu product words'],
];
const areaOf = (f) => { for (const a of AREAS) if (f.startsWith(a[2])) return a; return null; };
// tool-metadata/<x>.ts follows its feature
const TM = W + 'contracts/core/tool-metadata/';
const TM_MAP = { deployments: 'deployments', 'deploy-ops': 'deployments', 'domain-dns': 'domain-dns', posts: 'post', post: 'post', themes: 'theme', theme: 'theme', newsletter: 'newsletter', members: 'members', 'publish-content': 'publish-content', 'site-backup': 'site-backup', 'source-control': 'source-control', 'site-export': 'site-export' };
function placement(f) {
  if (f.startsWith(TM)) { const b = path.basename(f).replace(/\.(ts|tsx)$/, ''); const id = TM_MAP[b]; if (id) { const a = AREAS.find((x) => x[0] === id); return { area: a, dest: `packages/${a[3]}/src/${a[4]}tool-metadata.ts`, pkg: a[3] }; } }
  const a = areaOf(f); if (!a) return null;
  let rel = f.slice(a[2].length);
  if (a[0] === 'adm-other') { /* features/<x>/... */ }
  return { area: a, dest: `packages/${a[3]}/src/${a[4]}${rel}`, pkg: a[3] };
}
function keepReason(f) { for (const [re, why] of KEEP_RULES) if (re.test(f)) return why; return null; }
// ---- classify
const files = Object.keys(g).filter((f) => !g[f].isTest && /\.(ts|tsx|mjs|css)$/.test(f));
const P = new Map(); // moving set: f -> placement
const KEEP = new Map(); const SHELL = new Map();
for (const f of files) { const p = placement(f); if (!p) continue; const k = keepReason(f); if (k) { KEEP.set(f, { area: p.area, why: k }); continue; } const sk = /\.tsx?$/.test(f) ? shellKind(f) : null; if (sk) { SHELL.set(f, { area: p.area, kind: sk }); continue; } P.set(f, p); }
// blockers: deps on Tovu files that are not moving
const VIRT=(process.env.VIRTUAL||'').split(',').filter(Boolean); const IGX=(process.env.IGNORE_XP||'').split(',').filter(Boolean);
const isVirt=(t)=>VIRT.some(v=>t.startsWith(v)) || SHELL.has(t);
const directBlock = new Map();
const xp = new Map(); // cross-package edges that would be new in Jini
for (const [f, p] of P) {
  const bl = []; const x = new Set();
  for (const i of g[f].imps) {
    if (i.to) { if (g[i.to]?.isTest) continue; const q = P.get(i.to); if (!q) { if (!isVirt(i.to)) bl.push(i.to); } else if (q.pkg !== p.pkg && q.pkg !== 'core') x.add('@jini-ai/' + q.pkg); }
    else if (i.spec.startsWith('@jini-ai/')) { const t = i.spec.split('/')[1]; if (t !== p.pkg && t !== 'core') x.add('@jini-ai/' + t); }
    else if (i.spec.startsWith('@tovu/')) { if (!isVirt(i.spec)) bl.push(i.spec); }
  }
  if (bl.length) directBlock.set(f, bl);
  for (const e of [...x]) if (IGX.includes(p.pkg+'->'+e.slice(9))||IGX.includes('*->'+e.slice(9))) x.delete(e);
  if (x.size) xp.set(f, [...x]);
}
// transitive blocked (through moving deps)
const memo = new Map();
function blocked(f, stack = new Set()) {
  if (memo.has(f)) return memo.get(f); if (stack.has(f)) return null; stack.add(f);
  let r = directBlock.has(f) ? 'tovu-dep' : (xp.has(f) ? 'xp3' : null);
  if (!r) for (const i of g[f].imps) if (i.to && P.has(i.to)) { const b = blocked(i.to, stack); if (b) { r = 'via ' + i.to; break; } }
  stack.delete(f); memo.set(f, r); return r;
}
for (const f of P.keys()) blocked(f);
// levels for ready files
const level = new Map();
function lvl(f, stack = new Set()) { if (level.has(f)) return level.get(f); if (stack.has(f)) return 0; stack.add(f); let l = 0; for (const i of g[f].imps) if (i.to && P.has(i.to) && i.to !== f) l = Math.max(l, lvl(i.to, stack) + 1); stack.delete(f); level.set(f, l); return l; }
const ready = [...P.keys()].filter((f) => !memo.get(f));
for (const f of ready) lvl(f);
// ---- measure table
const areaStats = new Map();
const bump = (id, k, n = 1) => { const s = areaStats.get(id) || { trans: 0, comp: 0, src: 0, loc: 0, ready: 0, readyLoc: 0, tovuDep: 0, xp3: 0, words: 0, keep: 0, keepLoc: 0, keepWhy: new Set(), tests: 0 }; s[k] += n; areaStats.set(id, s); return s; };
for (const [f, p] of P) { const id = p.area[0]; bump(id, 'src'); bump(id, 'loc', g[f].loc); if (g[f].tovuWords) bump(id, 'words'); const b = memo.get(f); if (!b) { bump(id, 'ready'); bump(id, 'readyLoc', g[f].loc); } else if (b === 'xp3') bump(id, 'xp3'); else if (b.startsWith('via')) bump(id, 'trans'); else bump(id, 'tovuDep'); }
for (const [f, k] of KEEP) { const s = bump(k.area[0], 'keep'); s.keepLoc += g[f].loc; s.keepWhy.add(k.why); }
for (const f of Object.keys(g)) if (g[f].isTest) { const a = areaOf(f); if (a) bump(a[0], 'tests'); }
// importers index
const importers = new Map();
for (const [f, v] of Object.entries(g)) for (const i of v.imps) if (i.to) { if (!importers.has(i.to)) importers.set(i.to, []); importers.get(i.to).push({ from: f, line: i.line, spec: i.spec }); }
for (const [f, p] of P) if ((importers.get(f) || []).some((im) => /server\/runtime\//.test(im.from) && !g[im.from].isTest)) bump(p.area[0], 'comp');
// ---- steps: chunk ready files per area by level
const LIM_FILES = 14, LIM_LOC = 1600, LIM_IMP = 140;
const impCount = (f) => (importers.get(f) || []).length;

const steps = [];
const stepOf = new Map();
for (const a of AREAS) {
  const fs_ = ready.filter((f) => P.get(f).area === a).sort((x, y) => level.get(x) - level.get(y) || x.localeCompare(y));
  let cur = null; let n = 0;
  for (const f of fs_) {
    if (!cur || cur.files.length >= LIM_FILES || cur.loc + g[f].loc > LIM_LOC || (cur.imps + impCount(f) > LIM_IMP && cur.files.length)) { n++; cur = { id: `${a[1]}-${a[0]}-${n}`, lane: a[1], area: a, files: [], loc: 0, imps: 0 }; steps.push(cur); }
    cur.files.push(f); cur.loc += g[f].loc; cur.imps += impCount(f); stepOf.set(f, cur.id);
  }
}
const order = new Map(steps.map((s, i) => [s.id, i]));
const rel = (from, to) => { let r = path.relative(path.dirname(from), to).replace(/\.(ts|tsx)$/, '.js'); if (!r.startsWith('.')) r = './' + r; return r; };
const exportKey = (p) => { const d = p.dest.replace(`packages/${p.pkg}/src/`, '').replace(/\.(ts|tsx|mjs|css)$/, ''); return './' + d.replace(/\/index$/, ''); };
for (const s of steps) {
  s.deps = new Set(); s.imp = []; s.testsMove = []; s.testsStay = new Set(); s.exports = new Set(); s.words = []; s.i18n = [];
  const set = new Set(s.files);
  for (const f of s.files) {
    for (const i of g[f].imps) if (i.to && P.has(i.to) && !set.has(i.to)) { const d = stepOf.get(i.to); if (d) s.deps.add(d); }
    if (g[f].tovuWords) s.words.push(f);
    const txt = srcOf(f);
    if (/apps\/(?:website|admin|desktop)|#src\//.test(txt.replace(/from\s*["'][^"']*["']/g, ''))) (s.n2 ||= []).push(f);
    for (const [i, l] of txt.split('\n').entries()) if (/tovu/i.test(l) && !/^\s*(\*|\/\/|\/\*)/.test(l) && !/^\s*import\b|from\s*["']@tovu/.test(l)) (s.breaks ||= []).push(`${f}:${i + 1}: ${l.trim().slice(0, 140)}`);
    if (f.startsWith('apps/admin/') && /\.tsx$/.test(f) && /from ["'][^"']*\.hooks(\.js)?["']/.test(txt)) (s.hk ||= []).push(f);
    if (/\.tsx$/.test(f) && /className=["'{`](?![^"'`]*jini-)[a-z]/.test(txt)) (s.cls ||= []).push(f);
    if (g[f].imps.some((i) => /locales?|i18n/.test(i.spec))) s.i18n.push(f);
    const p = P.get(f);
    for (const im of importers.get(f) || []) {
      if (set.has(im.from)) continue;
      const imP = P.get(im.from);
      if (g[im.from]?.isTest) {
        const ta = areaOf(im.from);
        const allIn = g[im.from].imps.every((i) => !i.to || set.has(i.to) || (P.has(i.to) && order.get(stepOf.get(i.to)) < order.get(s.id)) || g[i.to]?.isTest);
        if (ta && ta === p.area && allIn) { if (!s.testsMove.includes(im.from)) s.testsMove.push(im.from); continue; }
        s.testsStay.add(im.from);
      }
      s.exports.add(`"@jini-ai/${p.pkg}" exports["${exportKey(p)}"]`);
      const il = (srcOf(im.from).split('\n').slice(0, im.line).reverse().find((l) => /^\s*(import|export)\b/.test(l)) || '');
      const barrel = /^\s*export\b/.test(il) && /(^|\/)index\.tsx?$/.test(im.from);
      s.imp.push(`${im.from}:${im.line}  '${im.spec}' -> '@jini-ai/${p.pkg}/${exportKey(p).slice(2)}'${barrel ? '   [BARREL re-export: DELETE this line; repoint the barrel\'s users of these names to the Jini subpath]' : ''}`);
    }
  }
  s.testLoc = s.testsMove.reduce((a, f) => a + g[f].loc, 0);
  s.estJ = Math.min(120, 25 + 3 * s.files.length + 2 * s.testsMove.length + Math.round(s.loc / 200));
  s.estT = Math.min(120, 15 + Math.round(s.imp.length * 0.6) + s.testsStay.size);
}
// mutation: largest file + a moving test that imports it
for (const s of steps) {
  const big = [...s.files].sort((a, b) => g[b].loc - g[a].loc)[0];
  const t = s.testsMove.find((t) => g[t].imps.some((i) => i.to === big)) || s.testsMove[0] || [...s.testsStay].find((t) => g[t].imps.some((i) => i.to === big));
  s.mutation = `in the Jini copy of \`${path.basename(big)}\`, negate the first \`if (\` condition of its first exported function; ${t ? '`' + path.basename(t) + '`' : 'a NEW characterization test (write it first, tests-first rule)'} must go red, then revert`;
}
// ---- batches over J/T items: <=6 per batch, <=2 J per Jini package, T items with disjoint Tovu importer files
const items = [];
for (const s of steps) { s.impFiles = new Set(s.imp.map((l) => l.split(':')[0])); items.push({ id: s.id + '.J', s, kind: 'J' }, { id: s.id + '.T', s, kind: 'T' }); }
const doneI = new Set(); const batches = []; let left = [...items];
while (left.length && batches.length < 200) {
  const b = []; const pk = new Map(); const touched = new Set();
  const can = (it) => it.kind === 'J' ? [...it.s.deps].every((d) => doneI.has(d + '.J')) : doneI.has(it.s.id + '.J');
  const ord = [...left.filter((i) => i.kind === 'T'), ...left.filter((i) => i.kind === 'J')];
  for (const it of ord) {
    if (b.length >= 6) break;
    if (!can(it)) continue;
    if (it.kind === 'J') { const n = pk.get(it.s.area[3]) || 0; if (n >= 2) continue; pk.set(it.s.area[3], n + 1); }
    else { const files = [...it.s.impFiles, ...it.s.files]; if (files.some((x) => touched.has(x))) continue; files.forEach((x) => touched.add(x)); }
    b.push(it);
  }
  if (!b.length) break;
  b.forEach((it) => { doneI.add(it.id); it.batch = batches.length + 1; if (it.kind === 'J') it.s.batchJ = it.batch; else it.s.batchT = it.batch; });
  batches.push(b); left = left.filter((it) => !doneI.has(it.id));
}
for (const s of steps) s.batch = `J:${s.batchJ} T:${s.batchT}`;
// ---- write
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify({ areaStats: [...areaStats].map(([k, v]) => [k, { ...v, keepWhy: [...v.keepWhy] }]), steps: steps.map((s) => ({ id: s.id, lane: s.lane, area: s.area[0], pkg: s.area[3], files: s.files.length, loc: s.loc, deps: [...s.deps], batch: s.batch, estJ: s.estJ, estT: s.estT, imp: s.imp.length, testsMove: s.testsMove.length, testsStay: s.testsStay.size, words: s.words.length, i18n: s.i18n.length })) }, null, 1));
const blockedList = [...P.keys()].filter((f) => memo.get(f)).map((f) => ({ f, area: P.get(f).area[0], why: memo.get(f), tovu: directBlock.get(f) || [], xp: xp.get(f) || [], loc: g[f].loc, dest: P.get(f).dest }));
fs.writeFileSync(path.join(OUT, 'blocked.json'), JSON.stringify(blockedList));
fs.writeFileSync(path.join(OUT, 'keep.json'), JSON.stringify([...KEEP].map(([f, k]) => ({ f, area: k.area[0], why: k.why, loc: g[f].loc }))));
for (const s of steps) {
  const L = [];
  L.push(`# ${s.id} — ${s.area[0]} → @jini-ai/${s.area[3]} (Jini step J then Tovu step T)`, '');
  L.push(`Lane ${s.lane}. Batch ${s.batch ?? 'later'}. Depends on: ${[...s.deps].join(', ') || 'none (only already-Jini code)'}. Est: J ${s.estJ} min, T ${s.estT} min.`, '');
  L.push(`## J — move verbatim into Jini (${s.files.length} files, ${s.loc} LOC)`, '', '| Tovu source | Jini destination | LOC | flags |', '|---|---|---|---|');
  for (const f of s.files) { const col = fs.existsSync(path.join(process.env.JROOT || '/home/user/j12', P.get(f).dest)); if (col) (s.col ||= []).push(f); L.push(`| \`${f}\` | \`${P.get(f).dest}\` | ${g[f].loc} | ${[g[f].tovuWords ? 'W' + g[f].tovuWords : '', col ? 'COLLISION' : ''].filter(Boolean).join(' ')} |`); }
  L.push('', '**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):', ...[...s.exports].sort().map((e) => '- ' + e), s.exports.size ? '' : '- none (no Tovu importer outside this step)', '');
  L.push('**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.', '');
  L.push(`## Tests that move with the code (${s.testsMove.length}, ${s.testLoc} LOC) → Jini \`__tests__/\` beside the destination`, ...s.testsMove.map((t) => `- \`${t}\``), s.testsMove.length ? '' : '- none: write characterization tests first in Jini for the moved behaviour (tests-first)', '');
  L.push(`## T — Tovu repoint: delete the ${s.files.length} sources, rewrite every importer (${s.imp.length} lines)`, '', '```', ...s.imp, '```', '');
  L.push(`## Tovu tests that must stay green (${s.testsStay.size}; import lines are repointed above, assertions untouched)`, ...[...s.testsStay].sort().map((t) => `- \`${t}\``), '');
  if (s.words.length) L.push(`## Tovu words (Jini guard N1 fails on /tovu/i, comments included)`, ...s.words.map((f) => `- \`${f}\` (${g[f].tovuWords})`), 'Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.', '');
  if (s.col?.length) L.push('## COLLISION — Jini already has a file at the destination', ...s.col.map((f) => `- \`${f}\` → \`${P.get(f).dest}\`: diff the two first. Same behaviour → this is a leftover duplicate: delete the Tovu copy and repoint its importers to the existing Jini export (no move). Different → STOP and report the diff (do not merge behaviours).`), '');
  if (s.n2?.length) L.push('## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)', ...s.n2.map((f) => `- \`${f}\`: reword each comment path citation to name the host module in words ("the host\'s theme routes"), keeping the why`), '');
  if (s.breaks?.length) L.push('## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)', '```', ...s.breaks, '```', '');
  if (s.hk?.length) L.push('## Hook-injection gate (Jini `check:hook-injection`)', ...s.hk.map((f) => `- \`${f}\` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.`), '');
  if (s.cls?.length) L.push('## Class names (Jini packages use `jini-*`)', ...s.cls.map((f) => `- \`${f}\`: rename its own class names to \`jini-<block>__<element>\` in the same commit as the matching CSS selectors; list every rename in the step report`), '');
  if (s.i18n.length) L.push(`## i18n`, ...s.i18n.map((f) => `- \`${f}\` imports locale/i18n; move the keys it reads into the Jini package's locale file in the same step (same keys, same text), delete them from Tovu in step T`), '');
  L.push('## Named mutation', s.mutation, '');
  fs.writeFileSync(path.join(OUT, 'steps', s.id + '.md'), L.join('\n'));
}
{ const L = ['# SH — delete Tovu re-export shells / compat adapters of Jini (owner: no re-export shells)', '', 'For each file: every importer line below imports names the shell re-exports from Jini. Replace the specifier with the Jini specifier the shell re-exports those names from (shown per shell); if one import pulls names from two Jini specifiers, split it into two import lines. Then delete the shell. **adapter** files also hold host values (product constants such as transfer schema names): move ONLY the re-export lines out (importers import Jini directly), keep the host constants in the file, and delete the file only if nothing else remains.', ''];
  for (const [f, v] of [...SHELL].sort()) { const src = srcOf(f); const specs = [...src.matchAll(/from\s*["'](@jini-ai\/[^"']+)["']/g)].map((m) => m[1]); L.push(`## \`${f}\` (${v.kind}, ${g[f].loc} LOC) → ${[...new Set(specs)].map((x) => '`' + x + '`').join(', ')}`, '```'); for (const im of importers.get(f) || []) L.push(`${im.from}:${im.line}  '${im.spec}'${g[im.from].isTest ? '  (test)' : ''}`); L.push('```', ''); }
  fs.writeFileSync(path.join(OUT, 'steps', 'SH-shells-1.md'), L.join('\n')); fs.writeFileSync(path.join(OUT, 'shells.json'), JSON.stringify([...SHELL].map(([f, v]) => ({ f, ...v, area: v.area[0], imps: (importers.get(f) || []).length })))); }
fs.writeFileSync(path.join(OUT, 'breaks.txt'), steps.flatMap((s) => (s.breaks || []).map((b) => s.id + ' | ' + b)).join('\n'));
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(items.map((it) => ({ id: it.id, lane: it.s.lane, repo: it.kind === 'J' ? 'Jini' : 'Tovu', files: it.s.files.length, loc: it.s.loc, deps: it.kind === 'J' ? [...it.s.deps].map((d) => d + '.J') : [it.s.id + '.J'], batch: it.batch, est: it.kind === 'J' ? it.s.estJ : it.s.estT, area: it.s.area[0], pkg: it.s.area[3], imp: it.s.imp.length }))));
console.log('moving', P.size, 'ready', ready.length, 'blocked', blockedList.length, 'keep', KEEP.size, 'steps', steps.length, 'batches', batches.length, 'unbatched', left.length);
