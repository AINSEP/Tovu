import fs from 'node:fs';
const e = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const feat=p=>{const m=p.match(/^features\/([^/]+)\//);return m?m[1]:null};
const isHost=p=>/^(App[^/]*|panels\.tsx|panel-pages\.ts|panel-contracts\.ts|media-panel\.ts|nav\.ts|main\.tsx|site-section-availability\.hooks\.ts)$/.test(p);
const adj={}; for(const r of e){ (adj[r.from]=adj[r.from]||[]).push(r); }
// for each shared (non-feature, non-host) file, compute set of features reachable through shared-only chain
const memo={};
function reach(f, seen=new Set()){ if(memo[f]) return memo[f]; if(seen.has(f)) return {}; seen.add(f); const out={};
  for(const r of adj[f]||[]){ const t=r.to; if(t.startsWith('UNRES')) continue; const g=feat(t);
    if(g){ (out[g]=out[g]||[]).push(`${f}:${r.line}->${t}`); continue; }
    if(isHost(t)) { (out['HOST']=out['HOST']||[]).push(`${f}:${r.line}->${t}`); continue; }
    const sub=reach(t, seen); for(const k in sub){ (out[k]=out[k]||[]).push(...(f===t?[]:[`${f}:${r.line}->${t}`])); } }
  memo[f]=out; return out; }
const res={};
for(const r of e){ const F=feat(r.from); if(!F) continue; const t=r.to; if(t.startsWith('UNRES')||feat(t)||isHost(t)) { if(isHost(t)) (res[F+' -> HOST']=res[F+' -> HOST']||new Set()).add(`${r.from}:${r.line}->${t}`); continue; }
  const sub=reach(t); for(const G in sub){ if(G===F) continue; (res[F+' -> '+G]=res[F+' -> '+G]||new Set()).add(`${r.from.replace('features/','')}:${r.line} via ${t} ⇒ ${sub[G][0]}`); } }
for(const k of Object.keys(res).sort()){ console.log('## '+k); for(const s of [...res[k]].slice(0,6)) console.log('   '+s); if(res[k].size>6) console.log('   …+'+(res[k].size-6)); }
