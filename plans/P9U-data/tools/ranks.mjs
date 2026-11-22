import fs from 'node:fs';
const e = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const feat=p=>{const m=p.match(/^features\/([^/]+)\//);return m?m[1]:null};
const SCC=[["ai-assistant","integrations","plugins","providers","settings"],["dashboard","media","pages","posts","publish-content","taxonomy","themes"],["deployment","import-export","security","source-control"]];
const comp={}; SCC.forEach((c,i)=>c.forEach(f=>comp[f]=i));
const x=e.filter(r=>feat(r.from)&&feat(r.to)&&feat(r.from)!==feat(r.to));
const loopFiles=new Set(x.filter(r=>comp[feat(r.from)]!==undefined && comp[feat(r.from)]===comp[feat(r.to)]).map(r=>r.from));
// extra files the loop steps rewrite (wired hooks moving to composition): listed explicitly
for (const f of (process.argv[3]||'').split(',').filter(Boolean)) loopFiles.add(f);
const rem=x.filter(r=>!loopFiles.has(r.from));
const pairs={}; for(const r of rem){const k=feat(r.from)+'|'+feat(r.to); (pairs[k]=pairs[k]||[]).push(`${r.from.replace('features/','')}:${r.line}${r.typeOnly?'T':''}`);}
console.log('loop files',loopFiles.size,'remaining edges',rem.length,'pairs',Object.keys(pairs).length);
for(const k of Object.keys(pairs).sort()) console.log(k.replace('|',' -> '), pairs[k].join(' '));
const g={}; for(const k of Object.keys(pairs)){const [a,b]=k.split('|'); (g[a]=g[a]||[]).push(b);}
const dirs=fs.readdirSync(process.argv[4]).filter(d=>fs.statSync(process.argv[4]+'/'+d).isDirectory());
const memo={}; const rank=f=>memo[f]??(memo[f]=Math.max(0,...(g[f]||[]).map(t=>rank(t)+1)));
const out={}; for(const d of dirs.sort()) out[d]=rank(d); console.log(JSON.stringify(out));
