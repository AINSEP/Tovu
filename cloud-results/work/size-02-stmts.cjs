const ts=require('/home/user/Tovu/node_modules/typescript');const fs=require('fs');
const file='/home/user/Tovu/apps/website/src/server/runtime/composition/app.ts';
const text=fs.readFileSync(file,'utf8');const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
let fn;sf.forEachChild(n=>{if(ts.isFunctionDeclaration(n)&&n.name&&n.name.text==='createRouteDeps')fn=n;});
const stmts=fn.body.statements;
const line=p=>sf.getLineAndCharacterOfPosition(p).line+1;
function declared(st){const out=[];if(ts.isVariableStatement(st)){for(const d of st.declarationList.declarations){const walk=b=>{if(ts.isIdentifier(b))out.push(b.text);else b.elements&&b.elements.forEach(e=>e.name&&walk(e.name));};walk(d.name);}}return out;}
function idents(node){const s=new Set();const v=n=>{if(ts.isIdentifier(n))s.add(n.text);ts.forEachChild(n,v);};v(node);return s;}
const info=stmts.map((st,i)=>({i,a:line(st.getStart(sf)),b:line(st.end),decl:declared(st),ids:idents(st),kind:ts.SyntaxKind[st.kind]}));
module.exports={info,fn,sf,line};
if(require.main===module){const mode=process.argv[2];
 const declAt=new Map();info.forEach(s=>s.decl.forEach(d=>declAt.set(d,s.i)));
 if(!mode){for(const s of info){console.log(`${s.i}\t${s.a}-${s.b}\t${s.decl.join(',')||s.kind}`);}}
 else {const [x,y]=mode.split('-').map(Number);const inp=new Set(),out=new Set(),def=new Set();
  for(const s of info){ if(s.i>=x&&s.i<=y){ for(const id of s.ids){const d=declAt.get(id); if(d!==undefined){ if(d<x)inp.add(id); else if(d>y)def.add(id);} } }
    else if(s.i>y){ for(const id of s.ids){const d=declAt.get(id); if(d>=x&&d<=y)out.add(id);} } }
  console.log('lines',info[x].a,'-',info[y].b,'\nINPUTS',[...inp].join(' '),'\nOUTPUTS',[...out].join(' '),'\nDEFERRED(declared after)',[...def].join(' '));}
}
