#!/usr/bin/env bash
# Starts the given shards immediately (same per-shard command as tovu-shards.sh, but a 95-minute cap so the run
# ends inside the session's 3-hour budget), then records when every shard's node process (incl. ones started
# earlier) exits. Usage: tovu-shards-late.sh <lcovDir> <rawDir> <shard>...
set -u
export LCOV=$1 RAW=$2; shift 2
source <(sed -n '/^run() {/,/^}/p' "$(dirname "$0")/tovu-shards.sh" | sed 's/timeout 80m/timeout 95m/')
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Tovu
for i in "$@"; do run "$i" & sleep 3; done
# completion watcher for all shards (lcov file is written when the shard's node process ends)
declare -A seen
while :; do
  alive=0
  for i in 0 1 2 3 4 5 6 7; do
    if pgrep -f "shard-$i.lcov.info" >/dev/null; then alive=1
    elif [ -z "${seen[$i]:-}" ] && [ -s "$LCOV/shard-$i.lcov.info" ]; then seen[$i]=1; echo "shard-watch: shard $i node process gone at $(date -u +%T), lcov $(wc -c < "$LCOV/shard-$i.lcov.info") bytes" >> "$RAW/tovu-root-shards-timing.txt"; fi
  done
  [ $alive = 0 ] && break
  sleep 20
done
wait
echo "LATE-DONE $(date -u +%T)" >> "$RAW/tovu-root-shards-timing.txt"
