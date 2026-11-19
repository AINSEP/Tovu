// Design-time: cut the routeDeps literal into runs between its spreads (<=44 code lines, no top-level decision points). node runs.cjs <deps.ts>
const ts=require('/opt/node-tools/node_modules/typescript');const fs=require('fs');
const f=process.argv[2];const src=fs.readFileSync(f,'utf8');const lines=src.split('\n');
const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true);const L=p=>sf.getLineAndCharacterOfPosition(p).line+1;
const fn=sf.statements.find(s=>s.name&&s.name.text==='composeSiteRouteDeps');
const rd=fn.body.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations[0].name.getText()==='routeDeps');
const obj=rd.declarationList.declarations[0].initializer;
const isCode=l=>{const t=l.trim();return t&&!t.startsWith('//')&&!t.startsWith('*')&&!t.startsWith('/*');};
function points(n){let c=0;(function v(x,top){ if(x!==n&&ts.isFunctionLike(x)) return;
 if(ts.isConditionalExpression(x)) c++; if(ts.isBinaryExpression(x)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(x.operatorToken.kind)) c++;
 if((ts.isPropertyAccessExpression(x)||ts.isElementAccessExpression(x)||ts.isCallExpression(x))&&x.questionDotToken) c++;
 ts.forEachChild(x,y=>v(y));})(n);return c;}
let prevEnd=L(obj.getStart());const E=[];
for(const p of obj.properties){const a=prevEnd+1,s=L(p.getStart()),b=L(p.end);E.push({a,s,b,code:lines.slice(s-1,b).filter(isCode).length,spread:ts.isSpreadAssignment(p),pts:points(p),key:p.name?p.name.getText():null});prevEnd=b;}
// group into runs between spreads, then chunk
const runs=[];let cur=[];for(const e of E){ if(e.spread){ if(cur.length) runs.push(cur); runs.push([e]); cur=[]; } else cur.push(e);} if(cur.length) runs.push(cur);
const MAXC=44, MAXP=8; const out=[];
for(const r of runs){ if(r[0].spread){out.push({spread:true,a:r[0].a,b:r[0].b});continue;}
 let ch=[],c=0,p=0; for(const e of r){ const ec=e.b-e.a+1; const cc=lines.slice(e.a-1,e.b).filter(isCode).length; if(ch.length&&(c+cc>MAXC||p+e.pts>MAXP)){out.push({a:ch[0].a,b:ch.at(-1).b,code:c,pts:p,n:ch.length,keys:ch.map(x=>x.key)});ch=[];c=0;p=0;} ch.push(e);c+=cc;p+=e.pts;} if(ch.length) out.push({a:ch[0].a,b:ch.at(-1).b,code:c,pts:p,n:ch.length,keys:ch.map(x=>x.key)});}
for(const o of out) console.log(o.spread?`SPREAD ${o.a}-${o.b}`:`${o.a}-${o.b}\tcode=${o.code}\tpts=${o.pts}\tn=${o.n}\t${o.keys[0]}..${o.keys.at(-1)}`);
fs.writeFileSync(require('path').join(__dirname, 'runs-2d82735a.json'),JSON.stringify(out));
