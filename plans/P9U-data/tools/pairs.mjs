import fs from 'node:fs';
const e = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const feat=p=>{const m=p.match(/^features\/([^/]+)\//);return m?m[1]:null};
const x=e.filter(r=>feat(r.from)&&feat(r.to)&&feat(r.from)!==feat(r.to));
function scc(edges){ const g={}; for(const [a,b] of edges){(g[a]=g[a]||new Set()).add(b); g[b]=g[b]||new Set();}
 let idx=0; const st=[], on=new Set(), I={}, L={}, res=[];
 function sc(v){ I[v]=L[v]=idx++; st.push(v); on.add(v); for(const w of g[v]){ if(I[w]===undefined){sc(w); L[v]=Math.min(L[v],L[w]);} else if(on.has(w)) L[v]=Math.min(L[v],I[w]); }
  if(L[v]===I[v]){ const c=[]; let w; do{ w=st.pop(); on.delete(w); c.push(w);}while(w!==v); if(c.length>1) res.push(c.sort()); } }
 for(const v of Object.keys(g)) if(I[v]===undefined) sc(v); return res; }
const all=[...new Set(x.map(r=>feat(r.from)+'|'+feat(r.to)))].map(s=>s.split('|'));
const val=[...new Set(x.filter(r=>!r.typeOnly).map(r=>feat(r.from)+'|'+feat(r.to)))].map(s=>s.split('|'));
console.log('SCC all:', JSON.stringify(scc(all))); console.log('SCC value:', JSON.stringify(scc(val)));
if (process.argv[3]==='list') { const by={}; for(const r of x){const k=feat(r.from)+' -> '+feat(r.to); (by[k]=by[k]||[]).push(r);} 
 for(const k of Object.keys(by).sort()){ console.log('\n## '+k); for(const r of by[k]) console.log(`  ${r.from.replace(/^features\//,'')}:${r.line} ${r.typeOnly?'[T]':''}${r.kind==='export'?'[RE]':''}${r.kind==='dynamic'?'[DYN]':''} -> ${r.to.replace(/^features\//,'')} {${r.names.slice(0,90)}}`); } }
