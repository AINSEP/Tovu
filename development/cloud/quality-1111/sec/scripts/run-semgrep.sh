#!/usr/bin/env bash
# Semgrep security scan, offline rules (semgrep.dev registry is blocked in this container).
S=/home/user/Tovu/development/cloud/quality-1111/sec
SP=/tmp/claude-0/-home-user/22e759b2-6583-52c2-824f-84209cff904e/scratchpad
CFG="--config $SP/semgrep-rules/javascript --config $SP/semgrep-rules/typescript --config $SP/njsrules --config $SP/rules-audit-other"
EXC=""
for e in __tests__ __mocks__ __fixtures__ fixtures fixture mocks mock test tests e2e dist build node_modules vendor '*.test.*' '*.spec.*' '*.d.ts' '*.d.mts' '*.d.cts' '*.stories.*' '*.story.*'; do EXC="$EXC --exclude=$e"; done
cd /home/user/Tovu && ~/.local/bin/semgrep scan $CFG --metrics=off --disable-version-check -j 2 --timeout 30 --max-target-bytes 1000000 $EXC --json -o $S/raw/semgrep-tovu.json apps packages content > $S/raw/semgrep-tovu.stderr.txt 2>&1; echo "tovu exit $?" >> $S/raw/semgrep-tovu.stderr.txt
cd /home/user/Jini && ~/.local/bin/semgrep scan $CFG --metrics=off --disable-version-check -j 2 --timeout 30 --max-target-bytes 1000000 $EXC --json -o $S/raw/semgrep-jini.json packages/*/src > $S/raw/semgrep-jini.stderr.txt 2>&1; echo "jini exit $?" >> $S/raw/semgrep-jini.stderr.txt
echo SEMGREPDONE $(date +%T)
