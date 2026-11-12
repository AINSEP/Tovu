#!/usr/bin/env bash
# Runs the root Tovu `npm test` file set (website, agent-plugins, overlays, packages, site-chat,
# development/scripts, eslint-rules) WITH node:test coverage, in 8 round-robin shards, 3 at a time,
# --test-concurrency=1. Each shard writes its own lcov + TAP. Usage: tovu-shards.sh <lcovDir> <rawDir>
set -u
export PATH=$HOME/.local/node24/bin:$PATH
LCOV=$1; RAW=$2; mkdir -p "$LCOV" "$RAW"
cd /home/user/Tovu
git ls-files | grep -E '^(apps/website/src/.*\.test\.ts|content/agent-plugins/.*/__tests__/[^/]*\.test\.mjs|content/agent-plugin-overlays/.*/__tests__/[^/]*\.test\.mjs|packages/[^/]*/src/.*\.test\.ts|apps/site-chat/src/.*\.test\.ts|development/scripts/.*\.test\.ts|development/scripts/__tests__/build-server-portable\.test\.mjs|development/eslint-rules/.*\.test\.ts)$' | sort > "$LCOV/all-files.txt"
wc -l < "$LCOV/all-files.txt"
for i in 0 1 2 3 4 5 6 7; do awk -v n=8 -v i=$i 'NR%n==i' "$LCOV/all-files.txt" > "$LCOV/shard-$i.txt"; done
run() {
  i=$1; s=$(date +%s)
  TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json timeout 80m node --import tsx --import ./development/test-support/composed-bundle-env.ts \
    --test --experimental-test-module-mocks --test-concurrency=1 --test-timeout=300000 \
    --experimental-test-coverage --test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**" \
    --test-reporter=lcov --test-reporter-destination="$LCOV/shard-$i.lcov.info" \
    --test-reporter=tap --test-reporter-destination="$RAW/tovu-root-shard-$i.tap.txt" \
    --test-reporter=dot --test-reporter-destination=stdout \
    $(cat "$LCOV/shard-$i.txt") > "$RAW/tovu-root-shard-$i.txt" 2>&1
  echo "shard $i exit $? $(( $(date +%s)-s ))s" | tee -a "$RAW/tovu-root-shard-$i.txt" >> "$RAW/tovu-root-shards-timing.txt"
}
export -f run; export LCOV RAW
printf '%s\n' 0 1 2 3 4 5 6 7 | xargs -P 3 -I{} bash -c 'run {}'
echo ALL-DONE >> "$RAW/tovu-root-shards-timing.txt"
