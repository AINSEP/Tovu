import fs from "node:fs";
const dir="/root/stryker/l15";
const order=fs.readFileSync(dir+"/order.txt","utf8").split("\n").filter(Boolean);
const rows=[];const surv=[];const nocov=[];
for(const n of order){
  const f=`${dir}/${n}.json`; if(!fs.existsSync(f)) continue;
  let j; try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch{continue}
  for(const [file,d] of Object.entries(j.files)){
    const c={Killed:0,Timeout:0,Survived:0,NoCoverage:0,RuntimeError:0,CompileError:0,Ignored:0};
    for(const m of d.mutants){c[m.status]=(c[m.status]||0)+1;
      if(m.status==="Survived")surv.push(`${file}:${m.location.start.line}:${m.location.start.column} ${m.mutatorName} -> ${(m.replacement||"").slice(0,60).replace(/\n/g," ")}`);
      if(m.status==="NoCoverage")nocov.push(`${file}:${m.location.start.line} ${m.mutatorName}`);}
    const det=c.Killed+c.Timeout, tot=det+c.Survived+c.NoCoverage;
    rows.push({file,tot,k:det,s:c.Survived,nc:c.NoCoverage,err:c.RuntimeError,score:tot?+(100*det/tot).toFixed(1):null});
  }
}
rows.sort((a,b)=>(a.score??101)-(b.score??101));
let out="| file | mutants | killed+timeout | survived | no-cov | score |\n|---|---|---|---|---|---|\n";
for(const r of rows)out+=`| ${r.file} | ${r.tot} | ${r.k} | ${r.s} | ${r.nc} | ${r.score}% |\n`;
const T=rows.reduce((a,r)=>({tot:a.tot+r.tot,k:a.k+r.k,s:a.s+r.s,nc:a.nc+r.nc}),{tot:0,k:0,s:0,nc:0});
out+=`\nTOTAL files=${rows.length} scored=${T.tot} killed=${T.k} survived=${T.s} nocov=${T.nc} score=${(100*T.k/T.tot).toFixed(2)}%\n`;
fs.writeFileSync(dir+"/table.md",out);fs.writeFileSync(dir+"/survivors.txt",surv.join("\n")+"\n");fs.writeFileSync(dir+"/nocov.txt",nocov.join("\n")+"\n");
console.log(out.split("\n").slice(-3).join("\n"));
