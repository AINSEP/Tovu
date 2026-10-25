#!/bin/bash
# usage: run.sh name "src1,src2" "test1,test2"
export PATH=$HOME/.local/node24/bin:$PATH
name=$1; IFS=, read -ra S <<<"$2"; IFS=, read -ra T <<<"$3"
cd /home/user/Tovu
node -e '
const [name,S,T]=process.argv.slice(1);
const c={testRunner:"tap",tap:{nodeArgs:["--import","tsx","--experimental-test-module-mocks","--test-reporter=tap"],testFiles:T.split(",")},
mutate:S.split(","),coverageAnalysis:"off",concurrency:3,reporters:["json","clear-text","progress-append-only"],
jsonReporter:{fileName:"/root/stryker/reports/"+name+".json"},mutator:{excludedMutations:["StringLiteral"]},tempDirName:".stryker-tmp",cleanTempDir:true,disableTypeChecks:true,incremental:false,timeoutMS:20000,timeoutFactor:2,
tap_env:{}};
require("fs").writeFileSync("/root/stryker/cfg-"+name+".json",JSON.stringify(c,null,1));' "$name" "$2" "$3"
export TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json
S0=$(date +%s)
timeout 3000 /root/stryker/node_modules/.bin/stryker run /root/stryker/cfg-$name.json > /root/stryker/reports/$name.log 2>&1
echo "$name exit=$? wall=$(( $(date +%s)-S0 ))s" >> /root/stryker/reports/summary.txt
