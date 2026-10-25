const fs=require('fs');const rows=[];
for(const f of fs.readdirSync('/root/stryker/reports').filter(f=>f.endsWith('.json'))){
 const j=JSON.parse(fs.readFileSync('/root/stryker/reports/'+f));
 for(const [p,d] of Object.entries(j.files)){const c={};for(const m of d.mutants)c[m.status]=(c[m.status]||0)+1;
 const k=(c.Killed||0)+(c.Timeout||0),s=c.Survived||0,nc=c.NoCoverage||0,den=k+s+nc;
 rows.push({run:f.replace('.json',''),p:p.replace('apps/website/src/server/',''),tot:d.mutants.length,k,s,nc,ign:c.Ignored||0,err:c.RuntimeError||0,sc:den?100*k/den:NaN,den});}}
rows.sort((a,b)=>a.sc-b.sc);
let T={tot:0,k:0,s:0,nc:0,den:0};
console.log('| file | run | mutants | scored | killed | surv | nocov | score |\n|--|--|--|--|--|--|--|--|');
for(const r of rows){console.log(`| ${r.p} | ${r.run} | ${r.tot} | ${r.den} | ${r.k} | ${r.s} | ${r.nc} | ${isNaN(r.sc)?'-':r.sc.toFixed(1)}% |`);T.tot+=r.tot;T.k+=r.k;T.s+=r.s;T.nc+=r.nc;T.den+=r.den}
console.log(`\nTOTAL files=${rows.length} mutants=${T.tot} scored=${T.den} killed=${T.k} surv=${T.s} nocov=${T.nc} score=${(100*T.k/T.den).toFixed(1)}%`);
