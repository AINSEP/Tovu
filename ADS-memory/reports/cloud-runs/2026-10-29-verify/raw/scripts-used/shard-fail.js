const fs=require("fs");const R=process.argv[2];
const out=[];
for(const d of fs.readdirSync(R+"/shards")){ if(d==="_exit-codes.txt"||d.includes("killed"))continue;
 const p=`${R}/shards/${d}/spec.txt`; if(!fs.existsSync(p))continue;
 const L=fs.readFileSync(p,"utf8").split("\n");
 let i=L.findIndex(l=>l.startsWith("✖ failing tests:"));
 if(i<0){ // killed shard: names only
   for(const l of L) if(l.startsWith("✖ ")&&!l.includes("failing tests")) out.push({shard:d,name:l.slice(2).replace(/ \([\d.]+ms\)$/,""),file:null,err:["(shard killed before summary; name only)"]});
   continue;}
 for(i++;i<L.length;i++){
  const m=L[i].match(/^test at (.+?):(\d+):(\d+)$/);
  if(m){const name=(L[i+1]||"").replace(/^✖ /,"").replace(/ \([\d.]+ms\)$/,"");const err=[];let j=i+2;
   while(j<L.length&&!/^test at /.test(L[j])&&err.length<15){ if(L[j].trim()&&!/^\s+at /.test(L[j]))err.push(L[j].slice(0,220)); j++}
   out.push({shard:d,file:m[1],line:+m[2],name,err});}
 }}
fs.writeFileSync(R+"/33-shard-failures.json",JSON.stringify(out,null,1));
console.log(out.length);
const files=[...new Set(out.filter(o=>o.file).map(o=>o.file))];fs.writeFileSync(R+"/33-failing-files.txt",files.join("\n")+"\n");console.log(files.length);
