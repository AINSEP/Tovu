const fs=require('fs');const n=process.argv[2];const j=JSON.parse(fs.readFileSync(`/root/stryker/reports/${n}.json`));
for(const [f,d] of Object.entries(j.files)){const c={};for(const m of d.mutants)c[m.status]=(c[m.status]||0)+1;
const k=(c.Killed||0)+(c.Timeout||0),s=c.Survived||0,nc=c.NoCoverage||0;const sc=(k+s+nc)?(100*k/(k+s+nc)).toFixed(1):'-';
console.log(`${f.split('/').slice(-2).join('/')}\tmut=${d.mutants.length} killed=${c.Killed||0} timeout=${c.Timeout||0} surv=${s} nocov=${nc} err=${c.RuntimeError||0} ign=${c.Ignored||0} score=${sc}`);
if(process.argv[3]){for(const m of d.mutants.filter(m=>m.status=='Survived'||m.status=='NoCoverage'))console.log(`  ${m.status[0]} ${m.location.start.line}:${m.location.start.column} ${m.mutatorName} -> ${String(m.replacement).slice(0,60).replace(/\n/g,' ')}`)}}
