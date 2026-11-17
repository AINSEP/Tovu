// usage: node fiximports.cjs 'import { x } from "./memory-deps/slices/y.js";'
const ts=require('/home/user/Tovu/node_modules/typescript');const fs=require('fs');
const file='/home/user/Tovu/apps/website/src/server/runtime/composition/app.ts';
let text=fs.readFileSync(file,'utf8');
const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
const imports=sf.statements.filter(ts.isImportDeclaration);
const importIds=new Set();
imports.forEach(i=>i.importClause&&(i.importClause.name&&importIds.add(i.importClause.name.text),i.importClause.namedBindings&&(ts.isNamespaceImport(i.importClause.namedBindings)?importIds.add(i.importClause.namedBindings.name.text):i.importClause.namedBindings.elements.forEach(e=>importIds.add(e.name.text)))));
const used=new Set();
const v=n=>{if(ts.isImportDeclaration(n))return;if(ts.isIdentifier(n))used.add(n.text);ts.forEachChild(n,v);};sf.statements.forEach(v);
const edits=[];
for(const imp of imports){const c=imp.importClause;if(!c)continue;
 const keepDef=c.name&&used.has(c.name.text);let ns=null,named=[];
 if(c.namedBindings){if(ts.isNamespaceImport(c.namedBindings)){if(used.has(c.namedBindings.name.text))ns=c.namedBindings.name.text;}else named=c.namedBindings.elements.filter(e=>used.has(e.name.text));}
 const total=(c.name?1:0)+(c.namedBindings?(ts.isNamespaceImport(c.namedBindings)?1:c.namedBindings.elements.length):0);
 const kept=(keepDef?1:0)+(ns?1:0)+named.length;
 if(kept===total)continue;
 if(kept===0){edits.push([imp.getFullStart(),imp.getEnd(),'']);continue;}
 const q=imp.moduleSpecifier.getText(sf)[0];const parts=[];if(keepDef)parts.push(c.name.text);if(ns)parts.push('* as '+ns);if(named.length)parts.push('{ '+named.map(e=>e.getText(sf)).join(', ')+' }');
 edits.push([imp.getStart(sf),imp.getEnd(),`import ${c.isTypeOnly?'type ':''}${parts.join(', ')} from ${q}${imp.moduleSpecifier.text}${q};`]);}
edits.sort((a,b)=>b[0]-a[0]);for(const [a,b,r] of edits)text=text.slice(0,a)+r+text.slice(b);
const add=process.argv[2];if(add){const i=text.indexOf('\nimport ');text=text.slice(0,i+1)+add+'\n'+text.slice(i+1);}
fs.writeFileSync(file,text);console.log('pruned',edits.length,'import declarations');
