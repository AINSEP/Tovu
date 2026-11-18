#!/usr/bin/env bash
# Regenerates every file in designs/arch-120/facts/ from a prepared Tovu checkout.
# Prerequisites: TOVU = a Tovu worktree at the facts base (origin/refactor/import-cycle-b = terra + import-cycle-b,
# f0613d9e when this design was written) with `npm ci` done and Jini linked
# (JINI_PACKAGES_DIR=<jini>/packages node development/scripts/link-jini.mjs; Jini at origin/refactor/terra, built).
# Node 24 on PATH. Writes only to OUT (default: the facts/ folder beside this script) and a scratch worktree.
#   TOVU=/path/to/tovu bash designs/arch-120/tools/regenerate-facts.sh
set -euo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="${OUT:-$HERE/../facts}"; TOVU="${TOVU:?set TOVU}"
SCRATCH="${SCRATCH:-$(mktemp -d)}/tovu-9240"
X="$HERE/cross-feature-imports.mjs"
mkdir -p "$OUT/lanes"
cd "$TOVU"
echo "facts base: $(git rev-parse --short=9 HEAD)"
# 1. The gate itself (expected exit 1).
npm run check:architecture > "$OUT/check-architecture.head.txt" 2>&1 || true
sed -n 's/^ *NEW cross-feature edge: //p' "$OUT/check-architecture.head.txt" | sort > "$OUT/new-edges.head.txt"
echo "NEW edges at head: $(wc -l < "$OUT/new-edges.head.txt")"
# 2. Independent import facts (names + type/value) for every cross-feature edge.
node "$X" . > "$OUT/imports.head.tsv"
GATE_TOTAL=$(sed -n 's/^ *cross-feature import edges (all-import) *//p' "$OUT/check-architecture.head.txt")
MINE=$(cut -f1,2 "$OUT/imports.head.tsv" | sort -u | wc -l)
echo "edge count: gate=$GATE_TOTAL extractor=$MINE (must be equal)"
MISSING=$(comm -23 "$OUT/new-edges.head.txt" <(awk -F'\t' '{print $1" -> "$2}' "$OUT/imports.head.tsv" | sort -u) | wc -l)
echo "NEW edges the extractor does not see: $MISSING (must be 0)"
# 3. The commit that created the baseline list (9240cbe1): its tree and its own gate verdict.
git worktree add -q --detach "$SCRATCH" 9240cbe1
ln -s "$TOVU/node_modules" "$SCRATCH/node_modules"
( cd "$SCRATCH" && node "$X" . > "$OUT/imports.9240cbe1.tsv" && { npx tsx development/scripts/check-architecture.ts > "$OUT/check-architecture.9240cbe1.txt" 2>&1 || true; } )
echo "NEW edges reported by the gate at its own baseline commit: $(grep -c 'NEW cross-feature edge' "$OUT/check-architecture.9240cbe1.txt")"
git worktree remove --force "$SCRATCH"
# 4. Classification.
python3 "$HERE/classify-edges.py" "$OUT/new-edges.head.txt" "$OUT/imports.head.tsv" "$OUT/imports.9240cbe1.tsv" \
  development/boundaries/feature-ranks.json PublishContentPorts=TovuPublishPorts > "$OUT/EDGES.tsv"
cut -f5 "$OUT/EDGES.tsv" | sort | uniq -c
