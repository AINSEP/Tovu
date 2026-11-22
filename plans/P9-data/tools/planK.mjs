// P9K — plan every Jini-bound file under the owner's K1–K5 answers (11-22).
// Usage: ROOT=<Tovu> JROOT=<Jini> OLD=<plans/P9-steps> node -I planK.mjs tv.json <outDir>
// Reuses plan.mjs's AREAS/KEEP_RULES/placement verbatim (read from its source) and replaces its
// "blocked" verdict with a per-edge K mechanism: K1 route spec, K2 injected admin kit, K3 copy arg,
// K4 contract to core, K5 injected collaborator. Writes data + one sheet per step + batches.
import fs from 'node:fs';
import path from 'node:path';
const g = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3]; fs.mkdirSync(path.join(OUT, 'steps'), { recursive: true });
const WIDTH = +(process.env.WIDTH || 6); const ROOT = process.env.ROOT; const JROOT = process.env.JROOT; const OLD = process.env.OLD;
const cache = new Map();
const srcOf = (f) => { if (!cache.has(f)) { try { cache.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { cache.set(f, ''); } } return cache.get(f); };
const planSrc = fs.readFileSync(new URL('./plan.mjs', import.meta.url), 'utf8');
const shellSrc = planSrc.match(/^function shellKind[\s\S]*?\n(?=const W)/m)[0];
const block = planSrc.slice(planSrc.indexOf('const W = '), planSrc.indexOf('// ---- classify'));
const M = new Function('path', 'srcOf', shellSrc + block + '; return {W,A,AREAS,KEEP_RULES,areaOf,placement,keepReason,shellKind};')(path, srcOf);
const { W, A, AREAS, areaOf, placement, keepReason, shellKind } = M;

// ---- STAYS decided after merge-12 by Codex FIX (plans/P9-codex-verify-N1-N4.md) and tonight's reports.
const CODEX_KEEP = [
  ['contracts/core/', ['approval-i18n', 'assistant-content-guidance', 'fs-folder-recovery', 'consent-refusal', 'credential-store', 'custom-credential-categories', 'redirect-tables', 'publish-history-list-limit', 'public-page-security-headers', 'gated-mutations/ports', 'gated-mutations/token', 'runtime-mode', 'theme-ids', 'theme-slots', 'settings-vocabulary', 'site-key-state', 'tool-metadata/approval-policy', 'widget-tables', 'scheduled-publish', 'gated-mutations/gateway', 'gated-mutations/composition', 'tool-metadata/site-guide', 'tool-metadata/sites', 'tool-metadata/site-evidence', 'tool-metadata/post']],
  ['contracts/headless/', ['assistant-permanent-deletes-policy']],
  ['platform/html/', ['menu-render', 'published-webmcp-strip', 'safe-url']],
  ['features/site-export/', ['export-failure-summary']],
  ['features/publish-content/ui/', ['sections']],
];
// K1 host ports: the Express-bound auth/session/static helpers become the host's JsonRoutePorts (stay as composition).
const K1_HOST = /^apps\/website\/src\/server\/inbound\/admin-http\/(authorize-guard|dev-auth|local-admin-request|admin-dev-proxy|admin-static|sea-runtime|publish-trust-auth)\.ts$/;
const codexKeep = new Map();
for (const [dir, names] of CODEX_KEEP) for (const n of names) for (const ext of ['.ts', '.tsx']) { const f = W + dir + n + ext; if (g[f]) codexKeep.set(f, `Codex FIX/BLOCK 11-22: Tovu policy (${n}); K4 moves only its types to core`); }

const files = Object.keys(g).filter((f) => !g[f].isTest && /\.(ts|tsx|mjs|css)$/.test(f));
const P = new Map(); const KEEP = new Map(); const SHELL = new Map();
for (const f of files) {
  const p = placement(f); if (!p) continue;
  const k = keepReason(f) || codexKeep.get(f) || (K1_HOST.test(f) ? 'K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition)' : null); if (k) { KEEP.set(f, { area: p.area, why: k }); continue; }
  const sk = /\.tsx?$/.test(f) ? shellKind(f) : null; if (sk) { SHELL.set(f, { area: p.area, kind: sk }); continue; }
  P.set(f, p);
}
let startLeft = P.size + SHELL.size;

// ---- import statement → names, type-only
function stmtAt(f, line) { const L = srcOf(f).split('\n'); let s = line - 1; while (s > 0 && !/^\s*(import|export)\b/.test(L[s])) s--; return L.slice(s, line).join(' ').replace(/\s+/g, ' '); }
function names(st) {
  const m = st.match(/\{([^}]*)\}/);
  if (/^\s*(import|export)\s+type\b/.test(st)) return { typeOnly: true, names: m ? m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '')).filter(Boolean) : ['*'] };
  if (!m) { const d = st.match(/import\s+(\*\s+as\s+\w+|\w+)/); return { typeOnly: false, names: [d ? d[1] : 'side-effect'] }; }
  const parts = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  return { typeOnly: parts.length > 0 && parts.every((x) => /^type\s/.test(x)), names: parts.map((x) => x.replace(/^type\s+/, '')) };
}
// ---- AdminKit facade names (Jini packages/admin/src/react/kit.tsx)
const kitSrc = fs.readFileSync(path.join(JROOT, 'packages/admin/src/react/kit.tsx'), 'utf8');
const KIT = new Set([...kitSrc.matchAll(/^export const (\w+) = slot\('/gm)].map((m) => m[1]).concat([...kitSrc.matchAll(/^export (?:const|function) (use\w+)/gm)].map((m) => m[1])));
KIT.add('InteractiveHtmlEditor'); // Tovu passes it as kit HtmlEditor
const IGX = new Set(['user-management->ui-kit']); // option C (XC table)

const K1T = /^apps\/website\/src\/(server\/routes\/(types|route-deps\/)|server\/inbound\/shared\/|platform\/express\/|server\/http\/request-cookie|server\/error-mapping\/|server\/inbound\/admin-http\/(authorize-guard|dev-auth|local-admin-request|publish-trust-auth)\.ts$)/;
const I18N_COMMON = 'apps/admin/src/lib/i18n-common.ts';
const K3T = /^apps\/admin\/src\/(lib\/i18n|app-i18n|features\/[^/]+\/[^/]*-i18n\.tsx?$)|\/locales?\//;
const DBT = /^apps\/website\/src\/platform\/db\/(content-kernel|content-database\.generated|sqlite\/content-db|kernel\/|drift)/;
const isR = (p) => p.area[1] === 'R';
const hasArgs = (f) => /\.tsx$/.test(f) || /(^|\/)use-|\.hooks\.ts$/.test(f) || /\(\s*\{[^)]*\}\s*[:=,)]|\brequired\b|_optional|_options/.test(srcOf(f));

const STAYK3 = new Map();
function classify() {
  const work = new Map();
  for (const [f, p] of P) {
    const items = [];
    for (const i of g[f].imps) {
      const st = stmtAt(f, i.line); const nm = names(st);
      const push = (k, target, extra = {}) => items.push({ k, target, line: i.line, spec: i.spec, names: nm.names, typeOnly: nm.typeOnly, ...extra });
      if (i.to) {
        if (g[i.to]?.isTest) continue;
        const q = P.get(i.to);
        if (q) { if (q.pkg !== p.pkg && q.pkg !== 'core') push(nm.typeOnly ? 'K4x' : 'K5x', i.to, { pkg: q.pkg }); continue; }
        if (SHELL.has(i.to)) { push('SH', i.to); continue; }
        const t = i.to;
        if (K1T.test(t)) push(isR(p) ? 'K1' : (nm.typeOnly ? 'K4' : 'K5'), t);
        else if (t === I18N_COMMON) push('K4i', t);
        else if (K3T.test(t)) push('K3', t);
        else if (/\.css$/.test(t)) push('K5css', t);
        else if (nm.typeOnly) push(DBT.test(t) ? 'K4db' : 'K4', t);
        else if (/\.hooks\.ts$|\/use-[^/]+$/.test(t)) push('K5hook', t);
        else push('K5', t);
      } else if (i.spec.startsWith('@tovu/')) {
        if (i.spec.startsWith('@tovu/contracts/')) push('K3', i.spec); else push(nm.typeOnly ? 'K4' : 'K5', i.spec);
      } else if (i.spec.startsWith('@jini-ai/')) {
        const t = i.spec.split('/')[1]; if (t === p.pkg || t === 'core' || IGX.has(p.pkg + '->' + t)) continue;
        if (p.pkg === 'admin' && ['ui', 'ui-kit', 'chat'].includes(t)) push('K2', i.spec, { pkg: t, inKit: nm.names.map((n) => n.replace(/\s+as\s+\w+$/, '')).filter((n) => !KIT.has(n)) });
        else push(nm.typeOnly ? 'K4j' : 'K5j', i.spec, { pkg: t });
      }
    }
    work.set(f, items);
  }
  return work;
}
let work; for (let it = 0; it < 6; it++) {
  work = classify(); let changed = 0;
  for (const [f, items] of work) if (items.some((x) => x.k === 'K3') && !hasArgs(f)) { STAYK3.set(f, P.get(f)); KEEP.set(f, { area: P.get(f).area, why: 'K3: imports product copy and has no args object to carry it (owner K3: stays)' }); P.delete(f); changed++; }
  if (!changed) break;
}

startLeft = P.size + SHELL.size; // after the K3 STAYS fixpoint
// ---- dependency levels inside the moving set (cycles cut)
const level = new Map();
function lvl(f, stack = new Set()) { if (level.has(f)) return level.get(f); if (stack.has(f)) return 0; stack.add(f); let l = 0; for (const i of g[f].imps) if (i.to && P.has(i.to) && i.to !== f) l = Math.max(l, lvl(i.to, stack) + 1); stack.delete(f); level.set(f, l); return l; }
for (const f of P.keys()) lvl(f);
const importers = new Map();
for (const [f, v] of Object.entries(g)) for (const i of v.imps) if (i.to) { if (!importers.has(i.to)) importers.set(i.to, []); importers.get(i.to).push({ from: f, line: i.line, spec: i.spec }); }

// ---- old sheets: which old steps are done / still valid
const oldSteps = new Map();
if (OLD) for (const n of fs.readdirSync(OLD)) {
  if (!/^[A-Z]+-.*-\d+\.md$/.test(n) || /^(SH|RT-K1|A-K2|K3|K4|K5|V)-/.test(n)) continue;
  const t = fs.readFileSync(path.join(OLD, n), 'utf8'); const id = n.replace(/\.md$/, '');
  const fl = [...t.matchAll(/^\| `([^`]+)` \| `packages\//gm)].map((m) => m[1]);
  const gone = fl.filter((f) => !g[f]); const kept = fl.filter((f) => KEEP.has(f));
  const live = fl.filter((f) => P.has(f));
  const valid = live.length > 0 && live.every((f) => !work.get(f).some((x) => x.k !== 'SH'));
  oldSteps.set(id, { id, files: fl, gone, kept, live, status: !live.length ? (gone.length ? 'DONE' : 'ALL-STAY') : (gone.length ? (valid ? 'PART-DONE, rest valid' : 'PART-DONE, rest re-sheeted under K') : (valid ? 'VALID (re-run refresh first)' : 'SUPERSEDED by K steps')) });
}
const oldOwner = new Map();
for (const s of oldSteps.values()) if (s.status.includes('VALID') || s.status.includes('rest valid')) for (const f of s.live) oldOwner.set(f, s.id);

// ---- effort model (minutes)
const k1Routes = (f) => [...srcOf(f).matchAll(/app\.(get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
const nonJson = (f) => /res\.(write|send|sendFile|redirect|end|type|download|attachment|setHeader|set)\(|\.pipe\(|event-stream|multer|express\.(raw|text|static)/.test(srcOf(f));
const depFields = (f) => [...new Set([...srcOf(f).matchAll(/\bdeps\.(\w+)/g)].map((m) => m[1]))].sort();
function costJ(f) {
  const w = work.get(f); let c = 2 + g[f].loc / 150;
  for (const x of w) c += { K1: 0, K2: x.inKit?.length ? 4 : 1.5, K3: 5, K4: 2, K4x: 1.5, K4j: 2, K4db: 3, K4i: 1, K5: 6, K5x: 5, K5j: 5, K5css: 1, K5hook: 4, SH: 0.5 }[x.k] ?? 0;
  if (w.some((x) => x.k === 'K1') || (isR(P.get(f)) && k1Routes(f).length)) c += 8 + 6 * Math.max(1, k1Routes(f).length) + g[f].loc / 80;
  return c;
}
function costT(f) { const w = work.get(f); let c = 0.6 * (importers.get(f) || []).filter((x) => !P.has(x.from) || true).length; c += 3 * w.filter((x) => /^K5/.test(x.k)).length; if (isR(P.get(f))) c += 4 * Math.max(1, k1Routes(f).length); return c; }

// ---- group: area + feature subgroup (routes by feature, admin by screen)
function group(f) {
  const p = P.get(f); const a = p.area; const rel = f.slice(a[2].length).split('/');
  if (a[0] === 'admin-http' || a[0] === 'public-http') {
    if (rel[0] === 'routes') return `${a[0]}:${rel[1].replace(/\.ts$/, '')}`;
    if (rel[0] === 'http' && rel.length === 2) return `${a[0]}:${rel[1].replace(/\.ts$/, '')}`;
    if (rel[0] === 'http' && rel[1] === 'site') return `${a[0]}:site-${rel[2]?.replace(/\.ts$/, '') || 'x'}`;
    return `${a[0]}:${rel[0].replace(/\.tsx?$/, '')}`;
  }
  if (a[0] === 'adm-other') return `adm-${rel[0]}`;
  if (a[1] === 'A' || a[1] === 'SEC') return a[0];
  return a[0];
}
const laneOf = (gid, fl) => gid.startsWith('admin-http') || gid.startsWith('public-http') ? 'RT-K1' : gid.startsWith('adm-') ? 'A-K2' : fl.some((f) => work.get(f).some((x) => /^K5/.test(x.k))) ? 'K5' : fl.some((f) => work.get(f).some((x) => x.k === 'K3')) ? 'K3' : fl.some((f) => work.get(f).some((x) => /^K4/.test(x.k))) ? 'K4' : 'V';
const groups = new Map();
for (const f of P.keys()) { if (oldOwner.has(f)) continue; const k = group(f); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
const steps = []; const stepOf = new Map();
for (const [gid, fl] of [...groups].sort()) {
  fl.sort((x, y) => level.get(x) - level.get(y) || x.localeCompare(y));
  let cur = null; let n = 0;
  for (const f of fl) {
    const cj = costJ(f); const ct = costT(f);
    if (!cur || cur.cj + cj > 105 || cur.ct + ct > 110 || cur.files.length >= 16) { n++; cur = { gid, files: [], cj: 20, ct: 15, loc: 0, n }; steps.push(cur); }
    cur.files.push(f); cur.cj += cj; cur.ct += ct; cur.loc += g[f].loc;
  }
}
for (const s of steps) { const lane = laneOf(s.gid, s.files); s.lane = lane; s.id = `${lane}-${s.gid.replace(/^(admin-http|public-http):/, (m, x) => (x === 'admin-http' ? 'adm' : 'pub') + '-').replace(/^adm-/, s.lane === 'A-K2' ? '' : 'adm-')}-${s.n}`.replace(/--+/g, '-'); s.area = P.get(s.files[0]).area; s.files.forEach((f) => stepOf.set(f, s.id)); }
for (const s of oldSteps.values()) for (const f of s.live) if (oldOwner.get(f) === s.id) stepOf.set(f, s.id);

// ---- prerequisite seam steps: K4 (Tovu-kept types → core), K4i (i18n-common split), RT-K1-0
const seam = new Map(); // target → {names:Set, users:Set}
for (const [f, w] of work) for (const x of w) if (x.k === 'K4' || x.k === 'K4j') { const t = x.target; if (!seam.has(t)) seam.set(t, { names: new Set(), users: new Set(), j: x.k === 'K4j' }); x.names.forEach((n) => seam.get(t).names.add(n)); seam.get(t).users.add(f); }
const seamSteps = []; { let cur = null; let n = 0;
  for (const [t, v] of [...seam].sort((a, b) => b[1].users.size - a[1].users.size)) {
    const c = 6 + 2 * v.names.size + 0.6 * ((importers.get(t) || []).length);
    if (!cur || cur.cost + c > 100 || cur.targets.length >= 8) { n++; cur = { id: `K4-seam-${n}`, lane: 'K4', targets: [], cost: 15 }; seamSteps.push(cur); }
    cur.targets.push([t, v]); cur.cost += c;
  } }
const seamOf = new Map(); for (const s of seamSteps) for (const [t] of s.targets) seamOf.set(t, s.id);
for (const s of steps) {
  s.deps = new Set(); const set = new Set(s.files);
  for (const f of s.files) {
    for (const i of g[f].imps) if (i.to && P.has(i.to) && !set.has(i.to)) { const d = stepOf.get(i.to); if (d && d !== s.id) s.deps.add(d); }
    for (const x of work.get(f)) {
      if ((x.k === 'K4' || x.k === 'K4j') && seamOf.get(x.target)) s.deps.add(seamOf.get(x.target));
      if (x.k === 'K4i') s.deps.add('K4-i18n-common');
      if (x.k === 'K1') s.deps.add('RT-K1-0');
      if (x.k === 'K2' && x.inKit.length) s.deps.add('A-K2-0');
      if (x.k === 'SH') s.deps.add('SH-3');
    }
  }
}
// cut dependency cycles between generated steps (keep the edge from the lower-level step)
const byId = new Map(steps.map((s) => [s.id, s]));
const minLvl = (s) => Math.min(...s.files.map((f) => level.get(f)));
let cut = 0;
for (const s of steps) for (const d of [...s.deps]) { const o = byId.get(d); if (!o) continue; const reach = (a, b, seen = new Set()) => { if (a === b) return true; if (seen.has(a)) return false; seen.add(a); const x = byId.get(a); return !!x && [...x.deps].some((y) => reach(y, b, seen)); }; if (reach(d, s.id)) { if (minLvl(s) <= minLvl(o)) { s.deps.delete(d); (s.cycle ||= []).push(d); cut++; } } }
for (const s of steps) {
  s.imp = []; s.testsStay = new Set(); s.testsMove = []; s.exports = new Set(); s.callers = []; s.impFiles = new Set(); const set = new Set(s.files);
  for (const f of s.files) {
    const p = P.get(f);
    for (const im of importers.get(f) || []) {
      if (set.has(im.from)) continue;
      if (g[im.from]?.isTest) {
        const ta = areaOf(im.from);
        const allIn = !isR(p) && g[im.from].imps.every((i) => !i.to || set.has(i.to) || g[i.to]?.isTest);
        if (ta && ta === p.area && allIn) { if (!s.testsMove.includes(im.from)) s.testsMove.push(im.from); continue; }
        s.testsStay.add(im.from);
      }
      const d = p.dest.replace(`packages/${p.pkg}/src/`, '').replace(/\.(ts|tsx|mjs|css)$/, '').replace(/\/index$/, '');
      s.exports.add(`"@jini-ai/${p.pkg}" exports["./${d}"]`);
      if (P.has(im.from)) continue; // a Jini-bound importer is rewritten by its own step
      s.imp.push(`${im.from}:${im.line}  '${im.spec}' -> '@jini-ai/${p.pkg}/${d}'`); s.impFiles.add(im.from);
    }
  }
  s.estJ = Math.min(120, Math.round(s.cj)); s.estT = Math.min(120, Math.round(s.ct));
}

// ---- batches: J then T items, ≤6 per batch, ≤2 J per Jini package, T items on disjoint Tovu files
const pre = [
  { id: 'RT-K1-0.J', repo: 'Jini', lane: 'RT-K1', deps: [], est: 100, pkg: 'core', files: 0 },
  { id: 'RT-K1-0.T', repo: 'Tovu', lane: 'RT-K1', deps: ['RT-K1-0.J'], est: 90, files: 0, touch: ['apps/website/src/server/inbound/admin-http/admin-json-route-ports.ts', 'apps/website/src/server/inbound/admin-http/routes/settings/shared.ts'] },
  { id: 'A-K2-0a.J', repo: 'Jini', lane: 'A-K2', deps: [], est: 110, pkg: 'admin', files: 0 },
  { id: 'A-K2-0b.J', repo: 'Jini', lane: 'A-K2', deps: ['A-K2-0a.J'], est: 110, pkg: 'admin', files: 0 },
  { id: 'A-K2-0.J', repo: 'Jini', lane: 'A-K2', deps: ['A-K2-0b.J'], est: 110, pkg: 'admin', files: 0 },
  { id: 'A-K2-0.T', repo: 'Tovu', lane: 'A-K2', deps: ['A-K2-0.J'], est: 45, files: 0, touch: ['apps/admin/src/integrations/jini-kits.ts'] },
  { id: 'K4-i18n-common.J', repo: 'Jini', lane: 'K4', deps: [], est: 80, pkg: 'admin', files: 0 },
  { id: 'K4-i18n-common.T', repo: 'Tovu', lane: 'K4', deps: ['K4-i18n-common.J'], est: 60, files: 0, touch: [I18N_COMMON] },
  { id: 'SH-3', repo: 'Tovu', lane: 'SH', deps: [], est: 45, files: SHELL.size, touch: [...SHELL.keys()] },
];
// hand lanes (no files-left change): XC (Jini cross-package, K5 injection), SEC, S
const HAND = [['XC-1', 'chat', 100, []], ['XC-2', 'chat', 80, ['XC-1']], ['XC-3', 'agent-runtime', 110, []], ['XC-4', 'daemon', 100, []], ['XC-5', 'integrations', 80, []],
  ['XC-6a', 'node-adapters', 90, []], ['XC-6b', 'server', 100, ['XC-6a']], ['XC-6c', 'server', 110, ['XC-6b']], ['XC-6d', 'server', 110, ['XC-6c']], ['S6b.J', 'integrations', 110, []]];
for (const [id, pkg, est, deps] of HAND) pre.push({ id, repo: 'Jini', lane: id.slice(0, 2), deps, est, pkg, files: 0 });
pre.push({ id: 'SEC-0', repo: 'Tovu', lane: 'SEC', deps: [], est: 90, files: 0, touch: [] }, { id: 'S6b.T', repo: 'Tovu', lane: 'S', deps: ['S6b.J'], est: 60, files: 0, touch: ['apps/website/src/platform/db/repos/webhook-repo.ts'] });
for (const s of seamSteps) { pre.push({ id: s.id + '.J', repo: 'Jini', lane: 'K4', deps: [], est: Math.min(110, Math.round(s.cost)), pkg: 'core', files: 0 }); pre.push({ id: s.id + '.T', repo: 'Tovu', lane: 'K4', deps: [s.id + '.J'], est: Math.min(110, Math.round(s.cost * 0.8)), files: 0, touch: s.targets.map(([t]) => t).filter((t) => g[t]) }); }
const items = [...pre];
for (const s of steps) { items.push({ id: s.id + '.J', repo: 'Jini', lane: s.lane, deps: [...s.deps].map((d) => d.startsWith('SH') ? d : d + '.J'), est: s.estJ, pkg: s.area[3], files: 0, s }); items.push({ id: s.id + '.T', repo: 'Tovu', lane: s.lane, deps: [s.id + '.J', ...[...s.deps].filter((d) => d.startsWith('K4-') || d === 'RT-K1-0' || d === 'A-K2-0').map((d) => d + '.T')], est: s.estT, files: s.files.length, touch: [...s.files, ...s.impFiles], s }); }
for (const o of oldSteps.values()) if (o.status.includes('VALID') || o.status.includes('rest valid')) { const t = fs.readFileSync(path.join(OLD, o.id + '.md'), 'utf8'); const dl = (t.match(/Depends on: ([^.]*)\./) || [, ''])[1].split(',').map((x) => x.trim()).filter((x) => /^[A-Z]/.test(x) && oldSteps.has(x) && oldSteps.get(x).live.length); const imf = [...new Set([...t.matchAll(/^(apps\/[^:\s]+):\d+ /gm)].map((m) => m[1]))]; items.push({ id: o.id + '.J', repo: 'Jini', lane: 'old', deps: dl.map((d) => d + '.J'), est: 60, pkg: (t.match(/@jini-ai\/([a-z-]+)/) || [, 'x'])[1], files: 0, old: o }); items.push({ id: o.id + '.T', repo: 'Tovu', lane: 'old', deps: [o.id + '.J'], est: 60, files: o.live.length, touch: [...o.live, ...imf], old: o }); }
const known = new Set(items.map((i) => i.id)); for (const it of items) it.deps = it.deps.filter((d) => known.has(d));
// unlock score: Tovu files a J item eventually lets go
const unl = new Map(); for (const it of items) if (it.repo === 'Tovu') { for (const d of it.deps) unl.set(d, (unl.get(d) || 0) + it.files); }
const done = new Set((process.env.DONEJ || '').split(',').filter(Boolean)); for (const it of items) if (done.has(it.id)) it.batch = 0; const batches = []; let left = items.filter((it) => !done.has(it.id)); let filesLeft = startLeft; const curve = [];
while (left.length && batches.length < 400) {
  const b = []; const pk = new Map(); const touched = new Set();
  const ready = left.filter((it) => it.deps.every((d) => done.has(d)));
  const base = (it) => /^(RT-K1-0|A-K2-0|K4-)/.test(it.id) ? 1 : 0; // bases unlock whole lanes
  ready.sort((x, y) => (y.repo === 'Tovu') - (x.repo === 'Tovu') || (y.files - x.files) || (base(y) - base(x)) || ((unl.get(y.id) || 0) - (unl.get(x.id) || 0)));
  for (const it of ready) {
    if (b.length >= WIDTH) break;
    if (it.repo === 'Jini') { const n = pk.get(it.pkg) || 0; if (n >= 2) continue; pk.set(it.pkg, n + 1); }
    else { const t = it.touch || []; if (t.some((x) => touched.has(x))) continue; t.forEach((x) => touched.add(x)); }
    b.push(it);
  }
  if (!b.length) break;
  b.forEach((it) => { done.add(it.id); it.batch = batches.length + 1; filesLeft -= it.repo === 'Tovu' ? it.files : 0; });
  batches.push(b); curve.push(filesLeft); left = left.filter((it) => !done.has(it.id));
}
for (const it of items) it.left = it.batch ? curve[it.batch - 1] : startLeft;

// ---- write data
const sum = (k) => { const c = {}; for (const [f, w] of work) if (P.has(f)) for (const x of w) if (x.k === k) c[f] = 1; return Object.keys(c).length; };
const areaRows = new Map();
for (const [f, p] of P) { const id = p.area[0]; const r = areaRows.get(id) || { left: 0, loc: 0, verb: 0, K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, keep: 0 }; r.left++; r.loc += g[f].loc; const ks = new Set(work.get(f).map((x) => x.k.replace(/^(K4|K5).*/, '$1'))); if (![...ks].some((k) => /^K/.test(k))) r.verb++; for (const k of ['K1', 'K2', 'K3', 'K4', 'K5']) if (ks.has(k)) r[k]++; areaRows.set(id, r); }
for (const [f, v] of SHELL) { const r = areaRows.get(v.area[0]) || { left: 0, loc: 0, verb: 0, K1: 0, K2: 0, K3: 0, K4: 0, K5: 0, keep: 0 }; r.left++; r.shell = (r.shell || 0) + 1; areaRows.set(v.area[0], r); }
for (const [f, k] of KEEP) { const r = areaRows.get(k.area[0]); if (r) r.keep++; }
fs.writeFileSync(path.join(OUT, 'k-data.json'), JSON.stringify({ startLeft, moving: P.size, shells: SHELL.size, keep: KEEP.size, staysK3: [...STAYK3.keys()], codexKeep: [...codexKeep.keys()], cyclesCut: cut, areaRows: [...areaRows], steps: steps.map((s) => ({ id: s.id, lane: s.lane, area: s.area[0], pkg: s.area[3], files: s.files, loc: s.loc, deps: [...s.deps], cycle: s.cycle || [], estJ: s.estJ, estT: s.estT, imp: s.imp.length, testsMove: s.testsMove.length, testsStay: s.testsStay.size })), seam: seamSteps.map((s) => ({ id: s.id, targets: s.targets.map(([t, v]) => ({ t, names: [...v.names], users: v.users.size, importers: (importers.get(t) || []).length, jini: v.j })) })), old: [...oldSteps.values()].map((o) => ({ id: o.id, status: o.status, files: o.files.length, gone: o.gone.length, kept: o.kept.length, live: o.live.length })), items: items.map((it) => ({ id: it.id, lane: it.lane, repo: it.repo, files: it.files, deps: it.deps, batch: it.batch, est: it.est, left: it.left, n: it.s ? it.s.files.length : (it.old ? it.old.live.length : 0) })), curve, batches: batches.map((b) => b.map((i) => i.id)) }, null, 1));
fs.writeFileSync(path.join(OUT, 'keep.json'), JSON.stringify([...KEEP].map(([f, k]) => ({ f, area: k.area[0], why: k.why, loc: g[f].loc }))));
fs.writeFileSync(path.join(OUT, 'work.json'), JSON.stringify([...work].filter(([f]) => P.has(f)).map(([f, w]) => ({ f, step: stepOf.get(f), area: P.get(f).area[0], dest: P.get(f).dest, k: w.map((x) => ({ k: x.k, t: x.target, l: x.line, n: x.names, kit: x.inKit })) }))));

// ---- sheets
const kdesc = { K1: 'K1 route → framework-neutral spec', K2: 'K2 injected admin kit', K3: 'K3 product copy via args field', K4: 'K4 Tovu-kept type → @jini-ai/core contract (seam step)', K4x: 'K4 cross-package type → core (lands with its definer)', K4j: 'K4 Jini cross-package type → core (seam step)', K4db: 'K4 DB schema type → local structural table slice', K4i: 'K4 i18n-common split (Jini common dictionary)', K5: 'K5 inject Tovu-kept collaborator through args/props', K5x: 'K5 inject cross-package collaborator', K5j: 'K5 inject Jini cross-package implementation', K5css: 'K5 host imports the stylesheet at the mount', K5hook: 'K5 custom hook arrives as a prop', SH: 'SH shell import → Jini specifier (SH-3)' };
const rel = (from, to) => { let r = path.relative(path.dirname(from), to).replace(/\.(ts|tsx)$/, '.js'); return r.startsWith('.') ? r : './' + r; };
for (const s of steps) {
  const L = []; const set = new Set(s.files);
  L.push(`# ${s.id} — ${s.gid} → @jini-ai/${s.area[3]} (lane ${s.lane}; Jini step J, then Tovu step T)`, '');
  L.push(`Generated by \`plans/P9-data/tools/planK.mjs\` on Tovu merge-12 + ex-sh/ex-core/ex-export, Jini merge-12 + ex-core/ex-export/ex-html/ex-sh/jx-chatlinks. Contract: \`plans/P9-extraction.md\` §1 plus \`plans/P9K-extraction.md\` §2 (K recipes). Depends on: ${[...s.deps].join(', ') || 'none'}.${s.cycle ? ` Cycle cut (run in the same batch or after): ${s.cycle.join(', ')}.` : ''} Est: J ${s.estJ} min, T ${s.estT} min.`, '');
  L.push(`## J — move into Jini (${s.files.length} files, ${s.loc} LOC)`, '', '| Tovu source | Jini destination | LOC | K work |', '|---|---|---|---|');
  for (const f of s.files) { const ks = [...new Set(work.get(f).map((x) => x.k))]; const col = fs.existsSync(path.join(JROOT, P.get(f).dest)); L.push(`| \`${f}\` | \`${P.get(f).dest}\` | ${g[f].loc} | ${ks.join(' ') || 'verbatim'}${col ? ' COLLISION' : ''}${g[f].tovuWords ? ' W' + g[f].tovuWords : ''} |`); }
  L.push('', '**package.json export entries** (dist triple, `jini.entries` key, `typesVersions` if present):', ...[...s.exports].sort().map((e) => '- ' + e), s.exports.size ? '' : '- none', '');
  const per = (k) => s.files.flatMap((f) => work.get(f).filter((x) => x.k === k).map((x) => ({ f, ...x })));
  const k1 = s.files.filter((f) => isR(P.get(f)) && (k1Routes(f).length || work.get(f).some((x) => x.k === 'K1')));
  if (k1.length) {
    L.push('## K1 — route specs (recipe: P9K §2.K1)', '', '| file | routes | kind | its own deps type fields (`deps.*` read today) | host helpers it drops |', '|---|---|---|---|---|');
    for (const f of k1) { const hs = work.get(f).filter((x) => x.k === 'K1').flatMap((x) => x.names); L.push(`| \`${f}\` | ${k1Routes(f).join('<br>') || '(helper)'} | ${nonJson(f) ? '**ServerRoute** (non-JSON)' : 'defineJsonRoute'} | ${depFields(f).map((x) => '`' + x + '`').join(', ') || '—'} | ${[...new Set(hs)].join(', ') || '—'} |`); }
    L.push('');
  }
  const k2 = per('K2'); if (k2.length) { L.push('## K2 — kit lookups (recipe: P9K §2.K2)', ...k2.map((x) => `- \`${x.f}:${x.line}\` \`${x.spec}\` { ${x.names.join(', ')} }${x.inKit.length ? ` — **not in AdminKit yet: ${x.inKit.join(', ')}** (A-K2-0 adds them)` : ' — all names have kit facades: change the import to `../react/kit.js`-relative'}`), ''); }
  for (const k of ['K3', 'K4', 'K4x', 'K4j', 'K4db', 'K4i', 'K5', 'K5x', 'K5j', 'K5css', 'K5hook', 'SH']) { const xs = per(k); if (!xs.length) continue; L.push(`## ${kdesc[k]}`, ...xs.map((x) => `- \`${x.f}:${x.line}\` from \`${x.target}\`: ${x.names.join(', ')}${seamOf.get(x.target) ? ` (type lands in core in ${seamOf.get(x.target)})` : ''}`), ''); }
  const k5 = s.files.filter((f) => work.get(f).some((x) => /^K5/.test(x.k) && x.k !== 'K5css'));
  if (k5.length) { L.push('## K5 callers that must pass the collaborator (composer side; every caller outside this step)'); for (const f of k5) for (const im of (importers.get(f) || []).filter((x) => !set.has(x.from))) L.push(`- \`${im.from}:${im.line}\` (calls into \`${path.basename(f)}\`)${P.has(im.from) ? ' — Jini-bound: its own step passes it through' : ''}`); L.push(''); }
  L.push(`## Tests that move (${s.testsMove.length})`, ...s.testsMove.map((t) => `- \`${t}\``), s.testsMove.length ? '' : (k1.length ? '- none: route tests stay in Tovu as the wire-parity proof; write the Jini spec unit tests FIRST (parse + handle, one per route)' : '- none: write characterization tests first in Jini for the moved behaviour'), '');
  L.push(`## T — Tovu repoint: delete the ${s.files.length} sources, rewrite every importer (${s.imp.length} lines)`, '', '```', ...s.imp, '```', '');
  if (k1.length) L.push('**K1 mount (T)**: in the registrar that registered each route above, replace the `register…Route({ app, deps })` call with `mountJsonRoute({ app, spec: { ...spec, ports: adminJsonRoutePorts }, deps: <small deps object built from RouteDeps> })` (`@jini-ai/http-kit`; ServerRoute kind: `createNodeDispatcher` from `@jini-ai/http-kit/node-bridge`). RouteDeps is only read here, never passed whole.', '');
  L.push(`## Tovu tests that must stay green (${s.testsStay.size})`, ...[...s.testsStay].sort().map((t) => `- \`${t}\``), '');
  const big = [...s.files].sort((a, b) => g[b].loc - g[a].loc)[0];
  L.push('## Named mutation', k1.length ? `in the Jini spec for the first route of \`${path.basename(k1[0])}\`, make \`parse\` accept a missing required field; its new Jini spec test and the Tovu route test for that 400 must both go red, then revert` : `in the Jini copy of \`${path.basename(big)}\`, negate the first \`if (\` of its first exported function; ${s.testsMove[0] ? '`' + path.basename(s.testsMove[0]) + '`' : 'the step\'s new characterization test'} must go red, then revert (no \`if\`: break the first returned field instead)`, '');
  L.push('## STOP (in addition to §1)', '- a K5 collaborator needs a NEW args object (not a field on an existing one) → leave the file in Tovu, list it as STAYS in the report, continue', '- a K3 file has no args/props object that reaches the copy use site → STAYS (owner K3)', '- a K1 route body/status differs from its Tovu route test after the mount → fix the spec, never the test', '- a K2 name is not a kit facade and A-K2-0 has not added it → STOP', '');
  fs.writeFileSync(path.join(OUT, 'steps', s.id + '.md'), L.join('\n'));
}
for (const s of seamSteps) {
  const L = [`# ${s.id} — move Tovu-kept and cross-package TYPES into @jini-ai/core (K4 seam split)`, '', 'Types only. The Tovu file keeps every value and its policy; it imports the moved types from core. Every other Tovu importer of those names repoints to core. No re-export from the Tovu file (no shells).', '', '| target | names (as imported by Jini-bound files) | Jini-bound users | all importers | Jini destination |', '|---|---|---|---|---|'];
  for (const [t, v] of s.targets) { const slug = t.replace(/^apps\/(website|admin|desktop)\/src\//, '').replace(/^@tovu\//, 'tovu-').replace(/^@jini-ai\//, '').replace(/\.(tsx?|mjs)$/, '').replace(/\/index$/, '').replace(/[^a-z0-9/-]/gi, '-').split('/').slice(-2).join('-'); L.push(`| \`${t}\` | ${[...v.names].join(', ')} | ${v.users.size} | ${(importers.get(t) || []).length} | \`packages/core/src/contracts/site/${slug}.ts\` (export \`./contracts/site/${slug}\`)${v.j ? ' — Jini-internal: move from the owning package' : ''} |`); }
  L.push('', 'If a type references a third-party type (kysely, express, react, drizzle), it cannot enter core (core has no dependencies): each Jini-bound user then declares the structural slice it reads beside itself (K4db rule) and the target is dropped from this step. ' + 'Rename product names at move (`TovuPublishPorts` → `PublishPorts`, …) and add a P9-BREAKS row only if the name is persisted. Mutation: type-only → `pnpm typecheck` must fail when one moved field is renamed in core, then revert. Est ' + Math.round(s.cost) + ' min (J), T about ' + Math.round(s.cost * 0.8) + ' min.', '');
  fs.writeFileSync(path.join(OUT, 'steps', s.id + '.md'), L.join('\n'));
}
console.log(JSON.stringify({ startLeft, moving: P.size, shells: SHELL.size, keep: KEEP.size, staysK3: STAYK3.size, codexKeep: codexKeep.size, steps: steps.length, seam: seamSteps.length, oldValid: [...oldSteps.values()].filter((o) => /VALID|rest valid/.test(o.status)).length, items: items.length, batches: batches.length, unbatched: left.length, cyclesCut: cut, final: curve[curve.length - 1] }));
