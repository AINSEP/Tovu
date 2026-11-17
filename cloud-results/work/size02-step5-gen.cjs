// usage: node gen.cjs [--write]
const ts=require('/home/user/Tovu/node_modules/typescript');const fs=require('fs');const path=require('path');
const COMP='/home/user/Tovu/apps/website/src/server/runtime/composition';
const file=COMP+'/app.ts';
const text=fs.readFileSync(file,'utf8');const lines=text.split('\n');
const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
const write=process.argv.includes('--write');
// ---- locate createRouteDeps, literal
let fn=null;sf.forEachChild(n=>{if(ts.isFunctionDeclaration(n)&&n.name&&n.name.text==='createRouteDeps')fn=n;});
let litDecl=null;const find=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='routeDeps'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer))litDecl=n;ts.forEachChild(n,find);};find(fn);
const lit=litDecl.initializer;const props=lit.properties;
// ---- locals of createRouteDeps (statements before the literal statement)
const litStmt=litDecl.parent.parent;
const localSource=new Map(); // name -> 'slice:fnName' | 'local'
const bindNames=(b,out)=>{if(ts.isIdentifier(b))out.push(b.text);else b.elements.forEach(e=>{if(ts.isBindingElement(e))bindNames(e.name,out);});};
for(const st of fn.body.statements){if(st===litStmt)break;if(!ts.isVariableStatement(st))continue;
  for(const d of st.declarationList.declarations){const names=[];bindNames(d.name,names);
    let src='local';const init=d.initializer;
    if(init&&ts.isCallExpression(init)&&ts.isIdentifier(init.expression)&&/^compose[A-Z]/.test(init.expression.text)&&ts.isObjectBindingPattern(d.name))src='slice:'+init.expression.text;
    names.forEach(n=>localSource.set(n,src));}}
localSource.set('options','options');localSource.set('routeDeps','routeDeps');
// ---- import bindings of app.ts
const bindings=new Map();
sf.forEachChild(n=>{if(!ts.isImportDeclaration(n))return;const c=n.importClause;if(!c)return;
 if(c.name)bindings.set(c.name.text,{imp:n,kind:'default'});
 if(c.namedBindings){if(ts.isNamespaceImport(c.namedBindings))bindings.set(c.namedBindings.name.text,{imp:n,kind:'ns'});else c.namedBindings.elements.forEach(e=>bindings.set(e.name.text,{imp:n,kind:'named',el:e}));}});
// ---- member ranges
const startLine=sf.getLineAndCharacterOfPosition(lit.getStart(sf)).line;let prev=startLine;
const members=props.map(p=>{const s=prev+1;const e=sf.getLineAndCharacterOfPosition(p.getEnd()).line;prev=e;
  const name=ts.isSpreadAssignment(p)?null:p.name.getText(sf);
  // include trailing comma if on next token
  return {p,s,e,name};});
// trailing comma may be on same line as end; check text
// ---- fragments
const FR=JSON.parse(fs.readFileSync('/tmp/claude-0/gen/fragments.json','utf8'));
const topDecls=new Set();sf.forEachChild(n=>{if((ts.isFunctionDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n))&&n.name)topDecls.add(n.name.text);if(ts.isVariableStatement(n))n.declarationList.declarations.forEach(d=>topDecls.add(d.name.getText(sf)));});
function paramShadow(id,name){for(let a=id.parent;a&&a!==fn;a=a.parent){if(ts.isFunctionLike(a)){for(const prm of a.parameters){const ns=[];bindNames(prm.name,ns);if(ns.includes(name))return true;}}
  if(ts.isBlock(a)&&a!==fn.body){for(const st of a.statements){if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations){const ns=[];bindNames(d.name,ns);if(ns.includes(name))return true;}}}}return false;}
const out={};const usedLocals=new Set();const reports=[];
for(const f of FR){
  const ms=members.slice(f.from,f.to+1);
  const used=new Set();const modUsed=new Set();const reps=[];
  const visit=(n)=>{
    if(ts.isIdentifier(n)){const par=n.parent;let isRef=true;
      if(ts.isPropertyAccessExpression(par)&&par.name===n)isRef=false;
      if(ts.isPropertyAssignment(par)&&par.name===n)isRef=false;
      if(ts.isPropertySignature(par)&&par.name===n)isRef=false;
      if(ts.isMethodDeclaration(par)&&par.name===n)isRef=false;
      if(ts.isParameter(par)&&par.name===n)isRef=false;
      if(ts.isBindingElement(par)&&(par.name===n||par.propertyName===n))isRef=false;
      if(ts.isVariableDeclaration(par)&&par.name===n)isRef=false;
      if(isRef){const name=n.text;
        if(localSource.has(name)&&!paramShadow(n,name)){used.add(name);
          if(name==='routeDeps'){ if(ts.isShorthandPropertyAssignment(par))reps.push([par.getStart(sf),par.getEnd(),'routeDeps: routeDeps()']);else reps.push([n.getStart(sf),n.getEnd(),'routeDeps()']);}}
        else if(bindings.has(name))modUsed.add(name);
        else if(topDecls.has(name)&&!localSource.has(name))modUsed.add('@@'+name);}}
    ts.forEachChild(n,visit);};
  ms.forEach(m=>visit(m.p));
  // text
  const a=ms[0].s,b=ms[ms.length-1].e;let body=lines.slice(a,b+1);
  // apply reps (positions are absolute) -> convert to per-line edits
  const base=lines.slice(0,a).join('\n').length+(a>0?1:0);
  let t=body.join('\n');const rr=reps.filter(r=>r[0]>=base&&r[0]<base+t.length).sort((x,y)=>y[0]-x[0]);
  for(const [x,y,s] of rr)t=t.slice(0,x-base)+s+t.slice(y-base);
  usedLocals.forEach(()=>{});used.forEach(u=>usedLocals.add(u));
  out[f.name]={f,used:[...used].filter(n=>n!=='routeDeps'||true),modUsed:[...modUsed],body:t,keys:ms.map(m=>m.name||'...spread')};
}
// ---- report
for(const k of Object.keys(out)){const o=out[k];const code=o.body.split('\n').filter(l=>{const t=l.trim();return t&&!t.startsWith('//')&&!t.startsWith('*')&&!t.startsWith('/*');}).length;
 console.log(k,'keys',o.keys.length,'rawlines',o.body.split('\n').length,'~code',code,'locals',o.used.length,'mod',o.modUsed.filter(x=>x.startsWith('@@')).join(','));}
console.log('LOCAL SOURCES used:');const bySrc={};for(const n of usedLocals){const s=localSource.get(n);(bySrc[s]=bySrc[s]||[]).push(n);}
for(const s of Object.keys(bySrc))console.log(' ',s,bySrc[s].join(' '));
fs.writeFileSync('/tmp/claude-0/gen/out.json',JSON.stringify({out,bySrc,bindingsInfo:[...bindings.keys()].length},null,1));
console.log('DEBUG localSource size',localSource.size,[...localSource.keys()].slice(0,5),'bindings',bindings.size);
