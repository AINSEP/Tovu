const ts=require('/home/user/Tovu/node_modules/typescript');const fs=require('fs');
function keysOf(file){const t=fs.readFileSync(file,'utf8');const sf=ts.createSourceFile(file,t,ts.ScriptTarget.Latest,true);let out=null;
 const v=n=>{ if(ts.isCallExpression(n)&&n.expression.getText(sf)==='toPublishContentApplyDeps'){const o=n.arguments[0];const ports=o.properties.find(p=>p.name&&p.name.getText(sf)==='ports');
   const walk=(obj)=>obj.properties.map(p=>{ if(ts.isSpreadAssignment(p)){const c=p.expression;return 'spread:'+c.expression.getText(sf)+'{'+c.arguments[0].properties.map(q=>q.name?q.name.getText(sf):'?').sort().join(',')+'}';}
     const nm=p.name.getText(sf); if(p.initializer&&ts.isObjectLiteralExpression(p.initializer)) return nm+'{'+p.initializer.properties.map(q=>q.name?q.name.getText(sf):'?').sort().join(',')+'}'; return nm;});
   out={outer:o.properties.map(p=>p.name.getText(sf)).sort(),ports:walk(ports.initializer)};} ts.forEachChild(n,v);}; v(sf); return out;}
const a=keysOf('deps.ts'), b=keysOf('app.ts');
console.log(JSON.stringify(a)===JSON.stringify(b)?'EQUAL port sets':'DIFFERENT');console.log(JSON.stringify(a));if(JSON.stringify(a)!==JSON.stringify(b))console.log(JSON.stringify(b));
