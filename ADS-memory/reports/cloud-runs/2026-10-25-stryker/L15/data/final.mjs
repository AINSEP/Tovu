import fs from "node:fs";
const dir="/root/stryker/l15";
function load(re){const by={};const surv=[];const nc=[];
 for(const f of fs.readdirSync(dir).filter(f=>re.test(f))){const j=JSON.parse(fs.readFileSync(`${dir}/${f}`,"utf8"));
  for(const [file,d] of Object.entries(j.files)){const r=by[file]??={tot:0,k:0,s:0,nc:0};
   for(const m of d.mutants){const st=m.status;
    if(st==="Killed"||st==="Timeout"){r.k++;r.tot++}
    else if(st==="Survived"){r.s++;r.tot++;surv.push(`${file}:${m.location.start.line}:${m.location.start.column} ${m.mutatorName} -> ${(m.replacement||"").slice(0,50).replace(/\n/g," ")}`)}
    else if(st==="NoCoverage"){r.nc++;r.tot++;nc.push(`${file}:${m.location.start.line} ${m.mutatorName}`)}}}}
 return {by,surv,nc}}
const A=load(/^plug_.*\.json$/), B=load(/^r2_.*\.json$/);
// merge partial r2 shards per file: only trust r2 if full file covered (single run) -> note ranges
const rows=[];
for(const [file,r] of Object.entries(A.by)){const b=B.by[file];
 rows.push({file:file.replace("content/agent-plugins/",""),a:r,b});}
rows.sort((x,y)=>(x.b?100*x.b.k/x.b.tot:100*x.a.k/x.a.tot)-(y.b?100*y.b.k/y.b.tot:100*y.a.k/y.a.tot));
const pct=r=>r?`${(100*r.k/r.tot).toFixed(1)}% (${r.k}/${r.tot}, surv ${r.s}, nocov ${r.nc})`:"–";
let out="| file | mapped-tests run | broad-tests re-run |\n|---|---|---|\n";
for(const r of rows)out+=`| ${r.file} | ${pct(r.a)} | ${pct(r.b)} |\n`;
const T=o=>Object.values(o).reduce((a,r)=>({tot:a.tot+r.tot,k:a.k+r.k,s:a.s+r.s,nc:a.nc+r.nc}),{tot:0,k:0,s:0,nc:0});
// effective: use r2 where exists (for r2 partial-range files, replace only if r2 file present)
const eff={};for(const [f,r] of Object.entries(A.by))eff[f]=B.by[f]&&B.by[f].tot>=0.5*r.tot?B.by[f]:r;
const E=T(eff),M=T(A.by);
out+=`\nMAPPED-ONLY total: files=${Object.keys(A.by).length} scored=${M.tot} killed=${M.k} surv=${M.s} nocov=${M.nc} score=${(100*M.k/M.tot).toFixed(2)}%\nEFFECTIVE (broad where re-run, 50%+ of mutants) total: scored=${E.tot} killed=${E.k} surv=${E.s} nocov=${E.nc} score=${(100*E.k/E.tot).toFixed(2)}%\n`;
fs.writeFileSync(dir+"/pfinal.md",out);fs.writeFileSync(dir+"/psurv-mapped.txt",A.surv.join("\n")+"\n");fs.writeFileSync(dir+"/psurv-broad.txt",B.surv.join("\n")+"\n");fs.writeFileSync(dir+"/pnocov-mapped.txt",A.nc.join("\n")+"\n");fs.writeFileSync(dir+"/pnocov-broad.txt",B.nc.join("\n")+"\n");
console.log(out);
