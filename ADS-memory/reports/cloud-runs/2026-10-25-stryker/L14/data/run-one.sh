#!/bin/bash
# usage: run-one.sh <src> ; writes config, runs stryker
export PATH=$HOME/.local/node24/bin:$PATH
f="$1"; name=$(echo "$f" | sed 's#apps/website/src/##; s#[/.]#_#g')
S=/tmp/claude-0/-home-user-Tovu/cd9bf2f4-9a90-55e2-acc7-2a02a371e32f/scratchpad
tests=$($S/find-tests.sh "$f" | head -${MAXT:-4})
[ -z "$tests" ] && { echo "NOTESTS $f" >> $S/results.txt; exit 0; }
node -e '
const [f,name,...t]=process.argv.slice(1);
require("fs").writeFileSync("/root/stryker/cfg-"+name+".json",JSON.stringify({testRunner:"tap",tap:{nodeArgs:["--import","tsx","--experimental-test-module-mocks","--test-reporter=tap"],testFiles:t},mutate:[f],coverageAnalysis:"off",concurrency:+(process.env.CONC||4),reporters:["json","clear-text"],jsonReporter:{fileName:"/root/stryker/reports/"+name+".json"},mutator:{excludedMutations:["StringLiteral"]},tempDirName:".stryker-tmp",cleanTempDir:true,disableTypeChecks:true,incremental:false,timeoutMS:20000,dryRunTimeoutMinutes:3},null,1));
' "$f" "$name" $tests
cd /home/user/Tovu
export TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json
s=$(date +%s)
timeout ${TMO:-900} /root/stryker/node_modules/.bin/stryker run /root/stryker/cfg-$name.json > /root/stryker/logs-$name.txt 2>&1
echo "$f rc=$? secs=$(( $(date +%s)-s )) tests=$(echo $tests|wc -w) $(grep -E 'Mutation score|All tests|Instrumented' /root/stryker/logs-$name.txt | tr '\n' ' ')" >> $S/results.txt
