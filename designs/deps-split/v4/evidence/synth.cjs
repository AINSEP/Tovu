// Design-time: synthesize composeSiteRouteDeps as it stands after M1-M3, B01-B25, H1-H4 and L1-L6 (each
// sheet's exact root replacement line), hoist the 3 later `let` cells (R step 1), then census R's phases.
// node synth.cjs <deps.ts> <B-census.json> <rest.json> <out-dir>
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs'); const crypto = require('crypto');
const [F, bF, rF, OUT] = process.argv.slice(2);
const lines = fs.readFileSync(F, 'utf8').split('\n'); const B = JSON.parse(fs.readFileSync(bF, 'utf8')); const R = JSON.parse(fs.readFileSync(rF, 'utf8'));
const args = (inputs) => inputs.map((i) => i.mode === 'getter' ? `${i.n}: () => ${i.n}` : i.n).join(', ');
const H = Object.fromEntries(R.H.flatMap((h) => h.fns.map((f) => [f.name, f])));
const ops = []; // [a, b, replacementLines]
for (const c of B) if (c.range) ops.push([c.a, c.b, [`  const { ${c.outputs.join(', ')} } = ${c.fn}({ ${args(c.inputs)} });`]]);
const hCall = (name, text) => { const f = H[name]; ops.push([f.a, f.b, []]); ops.push([f.callAt, f.callAt, [text(args(f.inputs))]]); };
hCall('warnCompositionChatOrphans', (a) => `  await warnCompositionChatOrphans({ ${a} });`);
hCall('compositionProjectKeys', (a) => `  const projectKeys = compositionProjectKeys({ ${a} });`);
ops.push([H.compositionSharedOAuth.a, H.compositionSharedOAuth.b, []]); // its call sits inside L2's run
hCall('compositionCommerce', (a) => `  const commerceBinding = compositionCommerce({ ${a} });`);
hCall('configureSiteSharing', (a) => `  configureSiteSharing({ ${a} });`);
hCall('configureSiteImports', (a) => `  configureSiteImports({ ${a} });`);
for (const l of R.L) for (const f of l.fns) ops.push([f.a, f.b, [`    ...${f.fn}({ ${args(f.callInputs || f.inputs)} }),`]]);
ops.sort((x, y) => y[0] - x[0]);
const out = lines.slice(); for (const [a, b, rep] of ops) out.splice(a - 1, b - a + 1, ...rep);
fs.writeFileSync(`${OUT}/deps.before-R.ts`, out.join('\n'));
// R step 1: hoist the three later `let` declarations (with their leading comments) to just after `let lifecycleTracker`
const hoist = [/^  let routeDepsBuiltForPluginHost:/, /^  let formCollectionProviders = /, /^  let bindSharedApiOAuth:/];
const moved = [];
for (const re of hoist) { const i = out.findIndex((l) => re.test(l)); let a = i; while (out[a - 1].trim().startsWith('//')) a--; moved.push(...out.splice(a, i - a + 1)); }
const lt = out.findIndex((l) => /^  let lifecycleTracker:/.test(l)); out.splice(lt + 1, 0, ...moved);
fs.writeFileSync(`${OUT}/deps.after-sheets.ts`, out.join('\n'));
console.log('hoisted', moved.length, 'lines');
