#!/usr/bin/env bash
# Cross-feature edges each live lane adds/removes relative to its merge-base with the facts base.
#   TOVU=/path/to/tovu-with-node_modules BASE=origin/refactor/import-cycle-b bash designs/arch-120/tools/lane-edges.sh <branch>...
set -euo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="${OUT:-$HERE/../facts/lanes}"; TOVU="${TOVU:?}"; BASE="${BASE:-origin/refactor/import-cycle-b}"
WT="$(mktemp -d)/lane"; mkdir -p "$OUT"
git -C "$TOVU" worktree add -q --detach "$WT" "$BASE"; ln -s "$TOVU/node_modules" "$WT/node_modules"
edges() { git -C "$WT" checkout -q "$1" && (cd "$WT" && node "$HERE/cross-feature-imports.mjs" .) | awk -F'\t' '{print $1" -> "$2}' | sort -u; }
for b in "$@"; do
  n=$(echo "$b" | tr / _); mb=$(git -C "$TOVU" merge-base "origin/$b" "$BASE")
  comm -13 <(edges "$mb") <(edges "origin/$b") > "$OUT/$n.added.txt"
  comm -23 <(edges "$mb") <(edges "origin/$b") > "$OUT/$n.removed.txt"
  echo "$b merge-base=${mb:0:9} added=$(wc -l < "$OUT/$n.added.txt") removed=$(wc -l < "$OUT/$n.removed.txt")"
done
git -C "$TOVU" worktree remove --force "$WT"
