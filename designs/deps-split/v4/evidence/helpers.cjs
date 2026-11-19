// Design-time: ranges, anchors, hashes and imports of module helpers that move with a sheet.
// node helpers.cjs <deps.ts> <sheetRangeStart-End> <name...>
const ts=require('/opt/node-tools/node_modules/typescript');const fs=require('fs');const crypto=require('crypto');
const [F,range,...names]=process.argv.slice(2);const [RA,RB]=range.split('-').map(Number);
const src=fs.readFileSync(F,'utf8');const lines=src.split('\n');
const prog=ts.createProgram([F],{noResolve:true,noLib:true,types:[]});const sf=prog.getSourceFile(F);const ck=prog.getTypeChecker();const L=p=>sf.getLineAndCharacterOfPosition(p).line+1;
const imp=new Map();for(const s of sf.statements)if(ts.isImportDeclaration(s)&&s.importClause){const c=s.importClause,spec=s.moduleSpecifier.text;if(c.name)imp.set(c.name.text,{spec,type:c.isTypeOnly});if(c.namedBindings&&ts.isNamedImports(c.namedBindings))c.namedBindings.elements.forEach(e=>imp.set(e.name.text,{spec,type:c.isTypeOnly||e.isTypeOnly}));if(c.namedBindings&&ts.isNamespaceImport(c.namedBindings))imp.set(c.namedBindings.name.text,{spec});}
const decls=names.map(n=>{const s=sf.statements.find(x=>x.name&&x.name.text===n);const i=sf.statements.indexOf(s);let a=L(sf.statements[i-1].end)+1;while(!lines[a-1].trim())a++;const start=L(s.getStart()),b=L(s.end);
 return {n,a,start,b,code:lines.slice(a-1,b).filter(l=>{const t=l.trim();return t&&!t.startsWith('//')&&!t.startsWith('*')&&!t.startsWith('/*')}).length,sha:crypto.createHash('sha256').update(lines.slice(a-1,b).join('\n')+'\n').digest('hex'),anchor:lines[start-1],node:s};});
const spans=decls.map(d=>[d.a,d.b]).concat([[RA,RB]]);
const used=new Set();for(const d of decls)(function v(n){if(ts.isIdentifier(n)&&imp.has(n.text)){const sym=ck.getSymbolAtLocation(n);const dd=sym&&sym.declarations&&sym.declarations[0];if(dd&&(ts.isImportSpecifier(dd)||ts.isImportClause(dd)||ts.isNamespaceImport(dd)))used.add(n.text);}ts.forEachChild(n,v);})(d.node);
const outside=lines.filter((_,i)=>!spans.some(([a,b])=>i+1>=a&&i+1<=b)).join('\n').replace(/^import [\s\S]*?;$/mg,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/mg,'');
const rows=[...used].sort().map(n=>({n,...imp.get(n),alsoOutside:new RegExp('\\b'+n+'\\b').test(outside)}));
const q=s=>s.replace(/'/g,"'\\''");
console.log(JSON.stringify({decls:decls.map(({node,...d})=>d),rows},null,1));
for(const d of decls){console.log(`# ${d.n} (module helper)\ntest "$(grep -cxF -- '${q(d.anchor)}' "$F")" -eq 1\ns=$(grep -nxF -- '${q(d.anchor)}' "$F" | cut -d: -f1)\ntest "$(sed -n "$((s-${d.start-d.a})),$((s+${d.b-d.start}))p" "$F" | sha256sum | cut -d' ' -f1)" = ${d.sha}`);}
