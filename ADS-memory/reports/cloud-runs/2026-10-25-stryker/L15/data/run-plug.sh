#!/bin/bash
# usage: run-plug.sh <src path rel repo root> <outname> [timeout]
export PATH=$HOME/.local/node24/bin:$PATH; export TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json
cd /home/user/Tovu
SRC="$1"; OUT="$2"; RANGE="$4"; BASE=$(basename "$SRC" .mjs); PL=$(echo $SRC | cut -d/ -f3)
TESTS=$(grep -lE "[\"'/]${BASE}(\.mjs)?[\"']" $(find content/agent-plugins/$PL -name '*.test.mjs' -not -path '*/node_modules/*') 2>/dev/null | sort -u | tr '\n' ' ')
[ -n "$TESTS_OVERRIDE" ] && TESTS="$TESTS_OVERRIDE"
if [ -z "$(echo $TESTS)" ]; then echo "NO DIRECT TEST" > /root/stryker/l15/$OUT.meta; exit 0; fi
DROPPED=""
for attempt in 1 2 3 4; do
  JT=$(echo $TESTS | node -e 'process.stdin.on("data",d=>console.log(JSON.stringify(d.toString().trim().split(/\s+/).filter(Boolean))))')
  cat > /root/stryker/l15/cfg-$OUT.json <<JSON
{"testRunner":"tap","tap":{"nodeArgs":["--import","tsx","--experimental-test-module-mocks","--test-reporter=tap"],"testFiles":$JT},
"mutate":["$SRC$RANGE"],"coverageAnalysis":"off","concurrency":4,"reporters":["json","clear-text","progress-append-only"],
"jsonReporter":{"fileName":"/root/stryker/l15/$OUT.json"},"mutator":{"excludedMutations":["StringLiteral"]},
"tempDirName":".stryker-tmp","cleanTempDir":"always","disableTypeChecks":true,"incremental":false,"timeoutMS":20000,
"ignorePatterns":["apps/desktop","apps/admin","sites","**/.git","development/coverage"]}
JSON
  timeout ${3:-1500} /root/stryker/node_modules/.bin/stryker run /root/stryker/l15/cfg-$OUT.json > /root/stryker/l15/$OUT.log 2>&1
  BAD=$(grep -oE 'Error running file "[^"]+"' /root/stryker/l15/$OUT.log | head -1 | sed -E 's/.*"([^"]+)"/\1/'); [ -z "$BAD" ] && BAD=$(grep -A1 'failed in the initial test run' /root/stryker/l15/$OUT.log | tail -1 | tr -d '\t ' | sed 's/\x1b.*//')
  if [ -n "$BAD" ] && [ ! -f /root/stryker/l15/$OUT.json ]; then DROPPED="$DROPPED $BAD"; TESTS=$(echo $TESTS | tr ' ' '\n' | grep -vx "$BAD" | tr '\n' ' '); [ -z "$(echo $TESTS)" ] && break; else break; fi
done
echo "tests: $TESTS" > /root/stryker/l15/$OUT.meta
echo "dropped(dry-run fail): $DROPPED" >> /root/stryker/l15/$OUT.meta
cat /root/stryker/l15/$OUT.meta
