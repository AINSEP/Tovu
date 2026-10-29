const fs=require("fs");const R=process.argv[2]+"/jini-vitest";
const under=[];const pk={};
for(const f of fs.readdirSync(R).filter(f=>f.endsWith(".coverage-summary.json"))){
 const p=f.replace(".coverage-summary.json","");const j=JSON.parse(fs.readFileSync(R+"/"+f));
 const t=j.total;pk[p]={lines:t.lines.pct,branches:t.branches.pct,functions:t.functions.pct,statements:t.statements.pct,files:Object.keys(j).length-1};
 for(const [file,v] of Object.entries(j)){ if(file==="total")continue;
  if(/\/examples\//.test(file)||/provider-plugins\/plugins\/[^/]+\/(dist|bundle|build)/.test(file))continue;
  if(v.lines.pct<100||v.branches.pct<100||v.functions.pct<100)
   under.push({pkg:p,file:file.replace("/home/user/Jini/",""),lines:v.lines.pct,branches:v.branches.pct,funcs:v.functions.pct,uncoveredLines:v.lines.total-v.lines.covered})}}
fs.writeFileSync(process.argv[2]+"/jini-files-under-100.json",JSON.stringify(under,null,1));
fs.writeFileSync(process.argv[2]+"/jini-coverage-per-package.json",JSON.stringify(pk,null,1));
console.table(pk);console.log("under100:",under.length)
