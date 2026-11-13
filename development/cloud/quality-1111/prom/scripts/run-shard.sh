#!/usr/bin/env bash
# PROM: lint one shard of apps/website with the two promise rules (classic project mode).
# Usage: run-shard.sh <n>   reads raw/shard-<n>.files.txt, writes raw/promises-shard-<n>.json + .txt
set -u
export PATH=$HOME/.local/node24/bin:$PATH
P=/home/user/Tovu/development/cloud/quality-1111/prom
export SEC_TOOLS=$HOME/promtools SEC_ROOT=/home/user/Tovu SEC_PROJECT=tsconfig.json
n=$1; list=$P/raw/shard-$n.files.txt; out=$P/raw/promises-shard-$n
cd /home/user/Tovu
start=$(date +%s)
echo "shard $n files=$(wc -l < "$list") start=$(date -u +%T)" > "$out.txt"
xargs -s 1800000 -a "$list" -d '\n' node --max-old-space-size=4096 "$SEC_TOOLS/node_modules/eslint/bin/eslint.js" \
  --no-config-lookup -c "$P/scripts/promises.eslint.config.mjs" -f json -o "$out.json" --no-error-on-unmatched-pattern \
  >> "$out.txt" 2>&1 &
xp=$!; peak=0
while kill -0 $xp 2>/dev/null; do
  for pid in $(pgrep -P $xp); do
    h=$(awk '/VmHWM/{print $2}' /proc/$pid/status 2>/dev/null); [ -n "$h" ] && [ "$h" -gt "$peak" ] && peak=$h
  done; sleep 2
done
wait $xp; rc=$?
echo "exit=$rc secs=$(( $(date +%s) - start )) peakRSS_MB=$(( peak / 1024 )) end=$(date -u +%T)" >> "$out.txt"
tail -n1 "$out.txt"
