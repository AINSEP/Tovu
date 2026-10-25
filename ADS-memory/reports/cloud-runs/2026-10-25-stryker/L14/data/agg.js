const fs=require('fs'),d='/root/stryker/reports/';const rows=[];
for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.json'))){
 const r=JSON.parse(fs.readFileSync(d+f));
 for(const [file,v] of Object.entries(r.files)){const c={Killed:0,Survived:0,NoCoverage:0,Timeout:0,CompileError:0,RuntimeError:0,Ignored:0};
  for(const m of v.mutants)c[m.status]=(c[m.status]||0)+1;
  const det=c.Killed+c.Timeout,den=det+c.Survived+c.NoCoverage;
  rows.push({file:file.replace('apps/website/src/',''),tot:v.mutants.length,k:c.Killed,t:c.Timeout,s:c.Survived,nc:c.NoCoverage,err:c.CompileError+c.RuntimeError,score:den?+(100*det/den).toFixed(1):null});}}
rows.sort((a,b)=>(a.score??101)-(b.score??101));
const T=rows.reduce((a,r)=>({tot:a.tot+r.tot,det:a.det+r.k+r.t,s:a.s+r.s,nc:a.nc+r.nc}),{tot:0,det:0,s:0,nc:0});
fs.writeFileSync(process.argv[2]||'/dev/stdout',JSON.stringify({rows,T})+'\n');
console.log(rows.length,'files',T, (100*T.det/(T.det+T.s+T.nc)).toFixed(1)+'%');
