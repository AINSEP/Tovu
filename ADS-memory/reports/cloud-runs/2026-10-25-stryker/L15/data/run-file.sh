#!/bin/bash
# usage: run-file.sh <src path rel to apps/desktop> <outname> [timeout]
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Tovu/apps/desktop
SRC="$1"; OUT="$2"; BASE=$(basename "$SRC" | sed -E 's/\.(ts|mts|cts)$//')
TESTS=$(grep -lE "[\"'/]${BASE}(\.js|\.ts)?[\"']" $(find src -name '*.test.ts' -not -path '*/renderer/*' -not -name 'nested-sites-migration.test.ts') | sort -u | tr '\n' ' ')
DROPPED=""
for attempt in 1 2 3 4; do
  JT=$(echo $TESTS | node -e 'process.stdin.on("data",d=>console.log(JSON.stringify(d.toString().trim().split(/\s+/).filter(Boolean))))')
  cat > /root/stryker/l15/cfg-$OUT.json <<JSON
{"testRunner":"tap","tap":{"nodeArgs":["--experimental-test-module-mocks","--import","./scripts/resolve-ts-ext.ts","--test-skip-pattern=through Tovu's actual CLI|desktop source CLI creation","--test-reporter=tap"],"testFiles":$JT},
"mutate":["$SRC"],"coverageAnalysis":"off","concurrency":3,"reporters":["json","clear-text","progress-append-only"],
"jsonReporter":{"fileName":"/root/stryker/l15/$OUT.json"},"mutator":{"excludedMutations":["StringLiteral"]},
"tempDirName":".stryker-tmp","cleanTempDir":false,"disableTypeChecks":true,"incremental":false,"timeoutMS":20000}
JSON
  timeout ${3:-1500} /root/stryker/node_modules/.bin/stryker run /root/stryker/l15/cfg-$OUT.json > /root/stryker/l15/$OUT.log 2>&1
  rm -rf /home/user/Tovu/apps/desktop/.stryker-tmp/sandbox-*
  BAD=$(grep -oE 'Error running file "[^"]+"' /root/stryker/l15/$OUT.log | head -1 | sed -E 's/.*"([^"]+)"/\1/')
  if [ -n "$BAD" ] && [ ! -f /root/stryker/l15/$OUT.json ]; then DROPPED="$DROPPED $BAD"; TESTS=$(echo $TESTS | tr ' ' '\n' | grep -vx "$BAD" | tr '\n' ' '); [ -z "$(echo $TESTS)" ] && break; else break; fi
done
echo "tests: $TESTS" > /root/stryker/l15/$OUT.meta
echo "dropped(dry-run fail): $DROPPED" >> /root/stryker/l15/$OUT.meta
cat /root/stryker/l15/$OUT.meta
