// usage: node scan.mjs <adminSrcRoot> > edges.json
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p = path.join(d,e.name);
  if (e.isDirectory()) { if (['node_modules','__tests__','__measurements__'].includes(e.name)) continue; walk(p); }
  else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p); } })(root);
const exts = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
function resolve(from, spec){ let base;
  if (spec.startsWith('@/')) base = path.join(root, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  base = base.replace(/\.js$/, '');
  for (const x of exts) { const c = base + x; if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; }
  return 'UNRESOLVED:' + base; }
const out = [];
const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
for (const f of files) { const src = fs.readFileSync(f,'utf8'); let m;
  while ((m = re.exec(src))) { const spec = m[4]||m[5]||m[6]; const r = resolve(f, spec); if (!r) continue;
    const idx = m.index + (m[0].startsWith('\n') ? 1 : 0);
    // line of the 'from' spec
    const specIdx = src.indexOf(spec, idx);
    const line = src.slice(0, specIdx).split('\n').length;
    let typeOnly = !!m[2];
    if (!typeOnly && m[3] && /^\{[\s\S]*\}$/.test(m[3].trim())) { const names = m[3].trim().slice(1,-1).split(',').map(s=>s.trim()).filter(Boolean); if (names.length && names.every(n=>n.startsWith('type '))) typeOnly = true; }
    out.push({ from: path.relative(root,f), line, spec, to: r.startsWith('UNRESOLVED') ? r : path.relative(root,r), typeOnly, kind: m[5]?'dynamic':m[6]?'side':m[1], names: (m[3]||'').replace(/\s+/g,' ').trim() }); } }
process.stdout.write(JSON.stringify(out));
