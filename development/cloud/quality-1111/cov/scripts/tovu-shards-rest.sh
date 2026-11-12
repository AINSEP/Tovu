#!/usr/bin/env bash
# Second-stage scheduler for tovu-shards.sh (same per-shard command): runs the remaining shards so that
# at most MAX shard processes run at once (counting still-running first-wave shards). Replaces the
# fixed `xargs -P 3` once it became clear the 3-at-a-time tail would leave cores idle near the cap.
# Usage: tovu-shards-rest.sh <lcovDir> <rawDir> <max> <shard>...
set -u
export LCOV=$1 RAW=$2; MAX=$3; shift 3
source <(sed -n '/^run() {/,/^}/p' "$(dirname "$0")/tovu-shards.sh")
export -f run; export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Tovu
for i in "$@"; do
  while [ "$(pgrep -fc '^timeout 80m node')" -ge "$MAX" ]; do sleep 10; done
  bash -c "run $i" &
  sleep 5
done
wait
echo REST-DONE >> "$RAW/tovu-root-shards-timing.txt"
