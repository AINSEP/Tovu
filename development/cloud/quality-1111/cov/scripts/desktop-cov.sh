#!/usr/bin/env bash
# apps/desktop `npm test` (both node:test invocations, same globs/imports) WITH node:test coverage, --test-concurrency=1.
# Usage: desktop-cov.sh <lcovDir> <rawDir>   (build:preload must already have run)
set -u
export PATH=$HOME/.local/node24/bin:$PATH
LCOV=$1; RAW=$2; mkdir -p "$LCOV"
cd /home/user/Tovu/apps/desktop
s=$(date +%s)
timeout 60m node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 \
  --experimental-test-coverage --test-reporter=lcov --test-reporter-destination="$LCOV/desktop-a.lcov.info" \
  --test-reporter=tap --test-reporter-destination="$RAW/tovu-desktop-a.tap.txt" --test-reporter=dot --test-reporter-destination=stdout \
  "src/*.test.ts" "src/!(renderer|contracts)/**/*.test.ts" > "$RAW/tovu-desktop-a.txt" 2>&1
echo "desktop-a exit $? $(( $(date +%s)-s ))s" | tee -a "$RAW/tovu-desktop-a.txt"
s=$(date +%s)
timeout 60m node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 \
  --experimental-test-coverage --test-reporter=lcov --test-reporter-destination="$LCOV/desktop-b.lcov.info" \
  --test-reporter=tap --test-reporter-destination="$RAW/tovu-desktop-b.tap.txt" --test-reporter=dot --test-reporter-destination=stdout \
  "src/renderer/**/*.test.ts" "src/renderer/**/*.test.tsx" "src/contracts/**/*.test.ts" > "$RAW/tovu-desktop-b.txt" 2>&1
echo "desktop-b exit $? $(( $(date +%s)-s ))s" | tee -a "$RAW/tovu-desktop-b.txt"
