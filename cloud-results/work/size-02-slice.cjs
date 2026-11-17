// usage: node slice.cjs <fnName> <fileBase> <x-y> '<inputsJSON {name:type}>' '<extraImportsJSON [..lines]>' [--dry]
const ts=require('/home/user/Tovu/node_modules/typescript');const fs=require('fs');const path=require('path');
const {info,sf,fn}=require('./stmts.cjs');
const [,, fnName,fileBase,range,inputsJ='{}',extraJ='[]',flag]=process.argv;
const [x,y]=range.split('-').map(Number);
const inputs=JSON.parse(inputsJ), extra=JSON.parse(extraJ);
const file='/home/user/Tovu/apps/website/src/server/runtime/composition/app.ts';
const lines=fs.readFileSync(file,'utf8').split('\n');
const declAt=new Map();info.forEach(s=>s.decl.forEach(d=>declAt.set(d,s.i)));
const out=new Set();for(const s of info){if(s.i>y)for(const id of s.ids){const d=declAt.get(id);if(d>=x&&d<=y)out.add(id);}}
const inp=new Set(),def=new Set();for(const s of info){if(s.i>=x&&s.i<=y)for(const id of s.ids){const d=declAt.get(id);if(d!==undefined){if(d<x)inp.add(id);else if(d>y)def.add(id);}}}
if(def.size)console.error('WARNING deferred refs:',[...def].join(' '));
for(const i of inp)if(!(i in inputs))console.error('WARNING input without type:',i);
const startLine=(x===0?fn.body.statements[0].getStart(sf):0);
const prevEnd=x===0?sf.getLineAndCharacterOfPosition(fn.body.getStart(sf)).line+1:info[x-1].b;  // 1-indexed line of previous end
const a=prevEnd+1, b=info[y].b;
const bodyLines=lines.slice(a-1,b);
// imports
const imports=[];sf.forEachChild(n=>{if(ts.isImportDeclaration(n))imports.push(n);});
const bindings=new Map();
for(const imp of imports){const c=imp.importClause;if(!c)continue;
 if(c.name)bindings.set(c.name.text,{imp,kind:'default'});
 if(c.namedBindings){if(ts.isNamespaceImport(c.namedBindings))bindings.set(c.namedBindings.name.text,{imp,kind:'ns'});else c.namedBindings.elements.forEach(e=>bindings.set(e.name.text,{imp,kind:'named',el:e}));}}
const idsIn=t=>{const s=ts.createSourceFile('x.ts',t,ts.ScriptTarget.Latest,true);const r=new Set();const v=n=>{if(ts.isIdentifier(n))r.add(n.text);ts.forEachChild(n,v);};v(s);return r;};
const bodyText=bodyLines.join('\n');
const used=idsIn(bodyText+'\n'+Object.values(inputs).join('\n'));
const topDecls=new Set();sf.forEachChild(n=>{if((ts.isFunctionDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n))&&n.name)topDecls.add(n.name.text);if(ts.isVariableStatement(n))n.declarationList.declarations.forEach(d=>d.name.text&&topDecls.add(d.name.text));});
for(const id of used)if(topDecls.has(id)&&id!==fnName)console.error('WARNING uses module-level declaration of app.ts:',id);
const fixSpec=s=>s.startsWith('./')?'../../'+s.slice(2):s.startsWith('../')?'../../'+s:s;
const byImp=new Map();for(const id of used){const bnd=bindings.get(id);if(!bnd)continue;if(!byImp.has(bnd.imp))byImp.set(bnd.imp,{def:null,ns:null,named:[]});const e=byImp.get(bnd.imp);if(bnd.kind==='default')e.def=id;else if(bnd.kind==='ns')e.ns=id;else e.named.push(bnd.el);}
const importLines=[];
for(const [imp,e] of byImp){const spec=fixSpec(imp.moduleSpecifier.text);const q=imp.moduleSpecifier.getText(sf)[0];const tOnly=imp.importClause.isTypeOnly?'type ':'';
 const parts=[];if(e.def)parts.push(e.def);if(e.ns)parts.push('* as '+e.ns);if(e.named.length)parts.push('{ '+e.named.map(el=>el.getText(sf)).join(', ')+' }');
 importLines.push(`import ${tOnly}${parts.join(', ')} from ${q}${spec}${q};`);}
const have=new Set();for(const l of importLines){const m=/\{([^}]*)\}/.exec(l);if(m)m[1].split(',').forEach(n=>have.add(n.replace(/^\s*type\s+/,'').trim()));const d=/^import (?:type )?(\w+)/.exec(l);if(d)have.add(d[1]);}
const extraF=extra.map(l=>{const m=/^import type \{([^}]*)\} from (.*)$/.exec(l);if(!m)return l;const names=m[1].split(',').map(n=>n.trim()).filter(n=>n&&!have.has(n));return names.length?`import type { ${names.join(', ')} } from ${m[2]}`:null;}).filter(l=>l!==null);
const inNames=Object.keys(inputs);const outNames=[...out];
const sliceText=[...importLines,...extraF,'',
inNames.length?`export function ${fnName}(required: { ${inNames.map(n=>`${n}: ${inputs[n]}`).join('; ')} }, _optional = {}) {`:`export function ${fnName}(_required: Record<string, never> = {}, _optional = {}) {`,
...(inNames.length?[`  const { ${inNames.join(', ')} } = required;`]:[]),
...(bodyLines[0]===''?bodyLines.slice(1):bodyLines),
`  return { ${outNames.join(', ')} };`,'}',''].join('\n');
const dest=`/home/user/Tovu/apps/website/src/server/runtime/composition/memory-deps/slices/${fileBase}.ts`;
console.log('range lines',a,'-',b,'outputs',outNames.join(' '),'| inputs',[...inp].join(' '));
if(flag==='--dry'){console.log(sliceText.split('\n').slice(0,25).join('\n'));process.exit(0);}
fs.writeFileSync(dest,sliceText);
// replace in app.ts
const call=`  const { ${outNames.join(', ')} } = ${fnName}({ ${inNames.join(', ')} });`;
lines.splice(a-1,b-a+1,call);
let t=lines.join('\n');
const slicePath=`./memory-deps/slices/${fileBase}.js`;
const firstImportEnd=imports[imports.length-1].getEnd();
fs.writeFileSync(file,t);
console.log('wrote',dest,'and replaced',b-a+1,'lines');
console.log('IMPORT_NEEDED',`import { ${fnName} } from "${slicePath}";`);
