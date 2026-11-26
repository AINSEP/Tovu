// Build an import graph of a Tovu checkout. Usage: node scan.mjs <root> <out.json>
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const out = process.argv[3];
const EXT = /\.(ts|tsx|mts|mjs|js|cjs|css)$/;
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name === 'build' || e.name === 'out') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (EXT.test(e.name) && !e.name.endsWith('.d.ts')) files.push(path.relative(root, p));
  }
}
for (const top of ['apps', 'packages', 'development/scripts', 'scripts']) if (fs.existsSync(path.join(root, top))) walk(path.join(root, top));
const set = new Set(files);
const ALIAS = {
  '@tovu/headless': 'apps/website/src/contracts/headless/index.ts',
  '@tovu/publish-content-ui': 'apps/website/src/features/publish-content/ui/index.ts',
  '@tovu/assistant-run-events': 'apps/website/src/contracts/core/assistant-run-events.ts',
};
function tryRes(base) {
  const c = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base.replace(/\.mjs$/, '.mts'), base + '.ts', base + '.tsx', base + '.mjs', base + '.js', base + '/index.ts', base + '/index.tsx', base + '/index.js'];
  for (const x of c) if (set.has(x)) return x;
  return null;
}
function resolve(from, spec) {
  if (spec.startsWith('.')) return tryRes(path.normalize(path.join(path.dirname(from), spec)));
  if (spec.startsWith('#src/')) return tryRes('apps/website/src/' + spec.slice(5));
  if (spec.startsWith('@/') && from.startsWith('apps/admin/')) return tryRes('apps/admin/src/' + spec.slice(2));
  if (ALIAS[spec]) return ALIAS[spec];
  return null;
}
const RE = [/(?:^|[;\n}])\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?['"]([^'"\n]+)['"]/g, /import\(\s*['"]([^'"\n]+)['"]\s*\)/g, /vi\.mock\(\s*['"]([^'"\n]+)['"]/g];
const graph = {};
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const imps = [];
  if (!f.endsWith('.css')) for (const re of RE) { re.lastIndex = 0; let m; while ((m = re.exec(src))) { const spec = m[1]; const line = src.slice(0, m.index + m[0].length).split('\n').length; imps.push({ spec, line, to: resolve(f, spec) }); } }
  const isTest = /__tests__|\.test\.|\.spec\.|__measurements__|testkit|test-support|\/fixtures?\//.test(f);
  const tovuWords = (src.match(/\btovu\b|Tovu|TOVU_|_tovu|\/_tovu|\.tovu\b/gi) || []).length;
  graph[f] = { loc: src.split('\n').length, isTest, imps, tovuWords };
}
fs.writeFileSync(out, JSON.stringify(graph));
console.log('files', files.length);
