import fs from 'fs';
const r=JSON.parse(fs.readFileSync(process.argv[2]));
const rows=[];let T={};
for(const [f,d] of Object.entries(r.files)){const c={};for(const m of d.mutants){c[m.status]=(c[m.status]||0)+1;T[m.status]=(T[m.status]||0)+1}
const k=c.Killed||0,t=c.Timeout||0,s=c.Survived||0,n=c.NoCoverage||0;const tot=k+t+s+n;rows.push([f,tot,k,s,n,t,(100*(k+t)/Math.max(tot,1)).toFixed(1)])}
rows.sort((a,b)=>a[6]-b[6]);
if(process.argv[3]==='table'){console.log('| file | mutants | killed | survived | no-cov | timeout | score |\n|---|---|---|---|---|---|---|');for(const r of rows)console.log('| '+r.join(' | ')+' |')}
console.log(JSON.stringify(T));
