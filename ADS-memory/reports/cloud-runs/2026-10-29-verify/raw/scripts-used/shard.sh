#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Tovu
R=ADS-memory/reports/cloud-runs/2026-10-29-verify/raw
i=$1
[ -e ADS-memory/reports/cloud-runs/2026-10-29-verify/raw/shards/$i/stdout.txt ] && exit 0
mkdir -p $R/shards/$i
s=$(date +%s)
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json timeout 4000 node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-timeout=600000 \
  --experimental-test-coverage --test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**" \
  --test-reporter=lcov --test-reporter-destination=$R/shards/$i/lcov.info \
  --test-reporter=spec --test-reporter-destination=$R/shards/$i/spec.txt \
  $(cat $R/30-shard-$i.list) > $R/shards/$i/stdout.txt 2>&1
echo "shard $i exit=$? secs=$(( $(date +%s)-s ))" >> $R/shards/_exit-codes.txt
