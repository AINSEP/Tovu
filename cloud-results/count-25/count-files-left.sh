#!/usr/bin/env bash
# Usage: [OUT=dir] count-files-left.sh TOVU_ROOT JINI_ROOT KEEPDIR_OR_FILE...
# Prints: planner=<n> true=<n> rules=<n>; writes $OUT/true-left.txt (path<TAB>area), areas.txt, kept-by-rules.txt
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
TOVU="$(cd "$1" && pwd)"; JINI="$(cd "$2" && pwd)"; shift 2
OUT="${OUT:-$H/out-$(basename "$TOVU")}"; mkdir -p "$OUT/plan"
node "$H/scan.mjs" "$TOVU" "$OUT/tv.json" >/dev/null
QUIET=1 ROOT="$TOVU" JROOT="$JINI" node "$H/count-plan.mjs" "$OUT/tv.json" "$OUT/plan" >/dev/null
node "$H/expand-keeps.mjs" "$OUT/rules.json" "$@" 2>/dev/null
node "$H/apply-keeps.mjs" "$OUT/plan/planned.json" "$OUT/rules.json" "$OUT"
