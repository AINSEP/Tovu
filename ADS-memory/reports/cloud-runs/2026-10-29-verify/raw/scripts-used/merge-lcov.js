const fs=require("fs");
const [out,...ins]=process.argv.slice(2);
const files=new Map();
for(const f of ins){ if(!fs.existsSync(f))continue;
 const txt=fs.readFileSync(f,"utf8").replaceAll("\r\n","\n");
 for(const rec of txt.split(/^end_of_record$/m)){
  const sf=rec.match(/^SF:(.+)$/m); if(!sf)continue;
  let e=files.get(sf[1]); if(!e){e={da:new Map(),br:new Map(),fn:new Map(),fnda:new Map()};files.set(sf[1],e)}
  for(const l of rec.split("\n")){
   if(l.startsWith("DA:")){const [a,b]=l.slice(3).split(",");e.da.set(a,(e.da.get(a)||0)+Number(b))}
   else if(l.startsWith("BRDA:")){const p=l.slice(5).split(",");const k=p.slice(0,3).join(",");e.br.set(k,(e.br.get(k)||0)+(p[3]==="-"?0:Number(p[3])))}
   else if(l.startsWith("FN:")){const i=l.indexOf(",");e.fn.set(l.slice(i+1),l.slice(3,i))}
   else if(l.startsWith("FNDA:")){const i=l.indexOf(",");const n=l.slice(i+1);e.fnda.set(n,(e.fnda.get(n)||0)+Number(l.slice(5,i)))}
  }}}
let o="";
for(const [sf,e] of [...files].sort()){
 o+=`SF:${sf}\n`;
 for(const [n,l] of e.fn)o+=`FN:${l},${n}\n`;
 for(const n of e.fn.keys())o+=`FNDA:${e.fnda.get(n)||0},${n}\n`;
 o+=`FNF:${e.fn.size}\nFNH:${[...e.fn.keys()].filter(n=>(e.fnda.get(n)||0)>0).length}\n`;
 for(const [k,v] of e.br)o+=`BRDA:${k},${v>0?v:"-"}\n`;
 o+=`BRF:${e.br.size}\nBRH:${[...e.br.values()].filter(v=>v>0).length}\n`;
 const das=[...e.da].sort((a,b)=>a[0]-b[0]);
 for(const [l,h] of das)o+=`DA:${l},${h}\n`;
 o+=`LF:${das.length}\nLH:${das.filter(d=>d[1]>0).length}\nend_of_record\n`;
}
fs.writeFileSync(out,o);console.log("files",files.size);
