#!/usr/bin/env bash
# Runs sub-shards (same per-shard command as tovu-shards.sh) in parallel with a 30-minute cap (last chunks, started 02:14) so they end inside
# the session's 3-hour budget. Usage: tovu-subshards.sh <lcovDir> <rawDir> <shardId>...   (reads <lcovDir>/shard-<id>.txt)
set -u
export LCOV=$1 RAW=$2; shift 2
source <(sed -n '/^run() {/,/^}/p' "$(dirname "$0")/tovu-shards.sh" | sed 's/timeout 80m/timeout 25m/')
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Tovu
for i in "$@"; do run "$i" & sleep 3; done
wait
echo "SUBSHARDS-DONE $(date -u +%T)" >> "$RAW/tovu-root-shards-timing.txt"
