#!/usr/bin/env bash
# Per-package Jini vitest coverage (report-only). Usage: jini-cov.sh <covDir> <rawDir> [maxWorkers] [order: fwd|rev]
# Several lanes may run at once: each package is claimed with an atomic mkdir lock in <covDir>.
# Each package: vitest run --coverage --coverage.reportOnFailure=true (+ lcov/json-summary into <covDir>/<pkg>,
# JSON test results into <covDir>/<pkg>.results.json). commerce also runs its kernel config and node:test unit files.
set -u
export PATH=$HOME/.local/node24/bin:$PATH
COV=$1; RAW=$2; W=${3:-2}; ORDER=${4:-fwd}; mkdir -p "$COV" "$RAW"
cd /home/user/Jini/packages
PKGS=$(ls -d */ | tr -d / ); [ "$ORDER" = rev ] && PKGS=$(echo "$PKGS" | sort -r)
for p in $PKGS; do
  [ -f "$p/package.json" ] || continue
  mkdir "$COV/$p.lock" 2>/dev/null || continue
  s=$(date +%s)
  (cd "$p" && timeout 25m npx vitest run --coverage --coverage.reportOnFailure=true \
     --coverage.reporter=text-summary --coverage.reporter=lcov --coverage.reporter=json-summary \
     --coverage.reportsDirectory="$COV/$p" --maxWorkers=$W --minWorkers=1 \
     --reporter=dot --reporter=json --outputFile.json="$COV/$p.results.json") > "$RAW/jini-cov-$p.txt" 2>&1
  echo "$p exit $? $(( $(date +%s)-s ))s" | tee -a "$RAW/jini-cov-$p.txt" >> "$RAW/jini-cov-timing.txt"
done
mkdir "$COV/zz-commerce-extra.lock" 2>/dev/null || { echo "lane $ORDER done" >> "$RAW/jini-cov-timing.txt"; exit 0; }
cd commerce; s=$(date +%s)
timeout 25m npx vitest run -c vitest.kernel.config.ts --coverage --coverage.reportOnFailure=true \
  --coverage.reporter=text-summary --coverage.reporter=lcov --coverage.reporter=json-summary \
  --coverage.reportsDirectory="$COV/commerce-kernel" --maxWorkers=$W --minWorkers=1 \
  --reporter=dot --reporter=json --outputFile.json="$COV/commerce-kernel.results.json" > "$RAW/jini-cov-commerce-kernel.txt" 2>&1
echo "commerce-kernel exit $? $(( $(date +%s)-s ))s" | tee -a "$RAW/jini-cov-commerce-kernel.txt" >> "$RAW/jini-cov-timing.txt"
s=$(date +%s)
node --import tsx --test --test-reporter=tap src/catalog/__tests__/unit/*.unit.test.ts > "$RAW/jini-test-commerce-nodetest.txt" 2>&1
echo "commerce-nodetest exit $? $(( $(date +%s)-s ))s" | tee -a "$RAW/jini-test-commerce-nodetest.txt" >> "$RAW/jini-cov-timing.txt"
echo ALL-DONE >> "$RAW/jini-cov-timing.txt"
