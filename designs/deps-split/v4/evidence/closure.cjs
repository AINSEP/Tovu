const ts=require('/opt/node-tools/node_modules/typescript');const F=process.argv[2];
const prog=ts.createProgram([F],{noResolve:true,noLib:true,types:[]});const sf=prog.getSourceFile(F);const ck=prog.getTypeChecker();const L=p=>sf.getLineAndCharacterOfPosition(p).line+1;
const top=new Map();for(const s of sf.statements){if(ts.isImportDeclaration(s))continue;if(s.name)top.set(s.name.text,s);else if(ts.isVariableStatement(s))s.declarationList.declarations.forEach(d=>top.set(d.name.getText(),s));}
const refsTop=(node)=>{const out=new Set();(function v(n){if(ts.isIdentifier(n)){const sym=ck.getSymbolAtLocation(n);const d=sym&&sym.declarations&&sym.declarations[0];if(d){const st=sf.statements.find(s=>s.pos<=d.pos&&d.end<=s.end);if(st&&st!==node&&!ts.isImportDeclaration(st)&&(st.name&&top.get(st.name.text)===st||ts.isVariableStatement(st)))out.add(st.name?st.name.text:d.name.getText());}}ts.forEachChild(n,v);})(node);return out;};
const users=new Map();for(const [n,s] of top){for(const r of refsTop(s)){(users.get(r)||users.set(r,new Set()).get(r)).add(n);}}
for(const n of process.argv.slice(3)){const seen=new Set([n]);const q=[n];while(q.length){const x=q.pop();for(const r of refsTop(top.get(x)))if(!seen.has(r)){seen.add(r);q.push(r);}}
 console.log(n,'->',[...seen].map(x=>`${x}@${L(top.get(x).getStart())} users:[${[...(users.get(x)||[])].join(',')}]`).join(' | '));}
