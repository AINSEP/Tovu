// survivors listing for files with score<80 or >=10 survivors; up to 10 per file
const fs=require('fs'),d='/root/stryker/reports/';const out=[];
for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.json'))){const r=JSON.parse(fs.readFileSync(d+f));
 for(const [file,v] of Object.entries(r.files)){const s=v.mutants.filter(m=>m.status==='Survived'),n=v.mutants.filter(m=>m.status==='NoCoverage');
  const det=v.mutants.filter(m=>m.status==='Killed'||m.status==='Timeout').length,den=det+s.length+n.length;const sc=den?100*det/den:100;
  if(sc<80||s.length>=10){const src=fs.readFileSync('/home/user/Tovu/'+file,'utf8').split('\n');
   out.push(`### ${file.replace('apps/website/src/','')} (${sc.toFixed(1)}%, ${s.length} surv, ${n.length} nocov)`);
   for(const m of s.slice(0,10))out.push(`- L${m.location.start.line} ${m.mutatorName}: \`${(src[m.location.start.line-1]||'').trim().slice(0,90)}\` → \`${String(m.replacement||'').replace(/\n/g,' ').slice(0,60)}\``);
   if(n.length){const ls=[...new Set(n.map(m=>m.location.start.line))].sort((a,b)=>a-b);out.push(`- no-cov lines: ${ls.slice(0,40).join(',')}${ls.length>40?'…':''}`);}}}}
console.log(out.join('\n'));
