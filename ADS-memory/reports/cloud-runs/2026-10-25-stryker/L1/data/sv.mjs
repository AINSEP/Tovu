import fs from 'fs';
const [,,json,root,...files]=process.argv;
const r=JSON.parse(fs.readFileSync(json));
for(const f of files){const d=r.files[f];if(!d)continue;const src=fs.readFileSync(root+'/'+f,'utf8').split('\n');
const sv=d.mutants.filter(m=>m.status==='Survived'||m.status==='NoCoverage');
console.log('## '+f+' ('+sv.length+')');
for(const m of sv.slice(0,10)){const L=m.location.start.line;const o=src[L-1].trim().slice(0,110);console.log(`${L}:${m.location.start.column} ${m.mutatorName} -> ${String(m.replacement).slice(0,50).replace(/\n/g,' ')} | ${o}`)}
const by={};for(const m of sv.slice(10))by[m.mutatorName]=(by[m.mutatorName]||0)+1;if(sv.length>10)console.log('rest:',JSON.stringify(by))}
