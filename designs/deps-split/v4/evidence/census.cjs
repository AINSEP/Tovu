// Design-time census on the tip (not used by any sheet). node census.cjs <deps.ts> <readers.txt> <slices.json>
const ts=require('/opt/node-tools/node_modules/typescript');const fs=require('fs');const crypto=require('crypto');
const [f,readersFile,slicesFile]=process.argv.slice(2);const src=fs.readFileSync(f,'utf8');const lines=src.split('\n');
const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true);const L=p=>sf.getLineAndCharacterOfPosition(p).line+1;
const imports=new Map();const top=new Map();
for(const s of sf.statements){ if(ts.isImportDeclaration(s)&&s.importClause){const spec=s.moduleSpecifier.text;const c=s.importClause;
  if(c.name) imports.set(c.name.text,spec); if(c.namedBindings&&ts.isNamedImports(c.namedBindings)) c.namedBindings.elements.forEach(e=>imports.set(e.name.text,spec+(e.isTypeOnly||c.isTypeOnly?' (type)':'')));}
 else if(s.name&&!ts.isImportDeclaration(s)) top.set(s.name.text,L(s.getStart()));
 else if(ts.isVariableStatement(s)) s.declarationList.declarations.forEach(d=>top.set(d.name.getText(),L(s.getStart())));}
const fn=sf.statements.find(s=>s.name&&s.name.text==='composeSiteRouteDeps');
const params=new Set(['store','onStoreClose','dbPath','opened','overrides']);
function names(n,set){ if(ts.isIdentifier(n)) set.add(n.text); else if(ts.isObjectBindingPattern(n)||ts.isArrayBindingPattern(n)) n.elements.forEach(e=>{ if(!ts.isOmittedExpression(e)) names(e.name,set);}); }
const stmts=fn.body.statements.map(s=>{const decl=new Set();let isLet=false;
 if(ts.isVariableStatement(s)){isLet=!(s.declarationList.flags&ts.NodeFlags.Const);s.declarationList.declarations.forEach(x=>names(x.name,decl));}
 else if(ts.isFunctionDeclaration(s)) decl.add(s.name.text); return {s,a:L(s.getFullStart())+0,start:L(s.getStart()),b:L(s.end),decl,isLet};});
const declOf=new Map(),lets=new Set();for(const st of stmts) for(const n of st.decl){declOf.set(n,st);if(st.isLet)lets.add(n);}
function refsOf(node,root){const r=[];(function v(n,inFn){
 if(ts.isIdentifier(n)){const p=n.parent;
  if(p&&ts.isPropertyAccessExpression(p)&&p.name===n) return; if(p&&ts.isPropertyAssignment(p)&&p.name===n) return;
  if(p&&ts.isBindingElement(p)&&p.propertyName===n) return;
  if(p&&(ts.isVariableDeclaration(p)||ts.isBindingElement(p)||ts.isParameter(p)||ts.isFunctionDeclaration(p))&&p.name===n) return;
  if(p&&(ts.isPropertySignature(p)||ts.isMethodDeclaration(p)||ts.isPropertyDeclaration(p)||ts.isGetAccessor(p))&&p.name===n) return;
  if(p&&ts.isQualifiedName(p)&&p.right===n) return;
  const write=p&&ts.isBinaryExpression(p)&&p.left===n&&p.operatorToken.kind===ts.SyntaxKind.EqualsToken;
  r.push({n:n.text,inFn,write,line:L(n.getStart()),type:!!ts.findAncestor(n,x=>ts.isTypeNode(x))});return;}
 const isF=ts.isFunctionLike(n)&&n!==root;ts.forEachChild(n,c=>v(c,inFn||isF));})(node,false);return r;}
const allRefs=stmts.map(st=>refsOf(st.s,st.s));
const readerTexts=fs.readFileSync(readersFile,'utf8').trim().split('\n').map(p=>[p,fs.readFileSync(p,'utf8')]);
function lits(t){const out=new Set();const re=/(["'`])((?:\\.|(?!\1).){12,}?)\1|\/((?:\\.|[^\/\n]){12,})\/[gimsuy]*/g;let m;while((m=re.exec(t))){const s=(m[2]||m[3]||'');if(!/[a-z]/i.test(s)) continue; out.add(s.replace(/\\\\/g,'\\'));}return out;}
const readerLits=readerTexts.map(([p,t])=>[p,lits(t)]);
const slices=JSON.parse(fs.readFileSync(slicesFile,'utf8'));const res=[];
for(const sl of slices){ if(!sl.range){res.push(sl);continue;} const [A,B]=sl.range;
 const idx=stmts.map((st,i)=>i).filter(i=>stmts[i].start>=A&&stmts[i].b<=B);
 const inR=new Set(idx);const declIn=new Set();idx.forEach(i=>stmts[i].decl.forEach(n=>declIn.add(n)));
 const errs=[];const inputs=new Map();const usesTop=new Set(),usesImp=new Set();
 for(const i of idx){ for(const r of allRefs[i]){
  if(imports.has(r.n)) {usesImp.add(r.n);continue;} if(top.has(r.n)&&!declOf.has(r.n)&&!params.has(r.n)) {usesTop.add(r.n);continue;}
  if(declIn.has(r.n)) continue; if(!declOf.has(r.n)&&!params.has(r.n)) continue; if(r.type) continue;
  if(r.write) errs.push(`writes outer cell ${r.n} at ${r.line}`);
  const later=declOf.has(r.n)&&declOf.get(r.n).start>B;
  const o=inputs.get(r.n)||{eager:false,deferred:false,later,let:lets.has(r.n)}; if(r.inFn) o.deferred=true; else o.eager=true; inputs.set(r.n,o);}
  // awaits
  (function v(n){ if(ts.isFunctionLike(n)&&n!==stmts[i].s&&!ts.isFunctionDeclaration(stmts[i].s)) return; if(ts.isAwaitExpression(n)&&!ts.findAncestor(n.parent,x=>ts.isFunctionLike(x)&&x!==fn)) errs.push('await at '+L(n.getStart())); ts.forEachChild(n,v);})(stmts[i].s);
 }
 for(const n of declIn) if(lets.has(n)){ // let declared in range written outside?
   allRefs.forEach((rs,i)=>{ if(!inR.has(i)) rs.forEach(r=>{ if(r.n===n&&r.write) errs.push(`let ${n} written outside at ${r.line}`);});});}
 const outputs=[...declIn].filter(n=>allRefs.some((rs,i)=>!inR.has(i)&&rs.some(r=>r.n===n&&!r.type)));
 for(const [n,o] of inputs){ o.mode=(o.later||(o.let&&!o.eager))?'getter':'value'; if(o.later&&o.eager) errs.push(`eager read of later ${n}`);}
 const a=idx[0]>0?stmts[idx[0]-1].b+1:stmts[idx[0]].a, b=B; // include leading comments of first stmt
 const startLine=stmts[idx[0]].start;
 const region=lines.slice(a-1,b).join('\n')+'\n';
 const code=lines.slice(a-1,b).filter(l=>{const t=l.trim();return t&&!t.startsWith('//')&&!t.startsWith('*')&&!t.startsWith('/*');}).length;
 const outsideText=lines.slice(0,a-1).concat(lines.slice(b)).join('\n');
 const impRows=[...usesImp].sort().map(n=>({n,spec:imports.get(n),alsoOutside:new RegExp('\\b'+n+'\\b').test(outsideText.replace(/^import .*$/mg,''))}));
 const topRows=[...usesTop].sort().map(n=>({n,line:top.get(n),alsoOutside:new RegExp('\\b'+n+'\\b').test(outsideText.replace(new RegExp('^(export )?(async )?function '+n+'\\b','m'),''))}));
 const hits=readerLits.map(([p,ls])=>[p,[...ls].filter(s=>region.includes(s))]).filter(([,h])=>h.length);
 res.push({...sl,a,startLine,b,code,stmts:idx.length,sha:crypto.createHash('sha256').update(region).digest('hex'),first:lines[startLine-1],last:lines[b-1],
  inputs:[...inputs].map(([n,o])=>({n,mode:o.mode,decl:params.has(n)?'param':(declOf.get(n).start),declText:params.has(n)?'':lines[declOf.get(n).start-1].trim().slice(0,150),let:o.let})),
  outputs,imports:impRows,top:topRows,readers:hits,errs});}
fs.writeFileSync(process.argv[5]||'/dev/stdout',JSON.stringify(res,null,1));
