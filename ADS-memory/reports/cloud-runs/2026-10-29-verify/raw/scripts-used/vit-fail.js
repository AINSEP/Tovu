// extract failing tests / suites with first ~15 lines each from vitest text output
const fs=require("fs");const [file]=process.argv.slice(2);
const L=fs.readFileSync(file,"utf8").replace(/\x1b\[[0-9;]*m/g,"").split("\n");
const out=[];
for(let i=0;i<L.length;i++){
 if(/^ FAIL /.test(L[i])){
  // avoid duplicates from summary lines at the top (they have no following Error line within 3)
  const blk=L.slice(i,i+16).map(s=>s.slice(0,230));
  if(blk.slice(1,6).some(s=>/Error|expected|Failed to|Cannot|ENOENT/.test(s))) out.push(blk.join("\n"));
 }}
console.log(out.join("\n\n"));
