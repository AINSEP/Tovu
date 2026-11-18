#!/usr/bin/env bash
# Runs every gate an arch-120 sheet must keep, and writes one normalized file per gate into OUT.
#   bash designs/arch-120/tools/sheet-gates.sh <OUT-dir>            (from the Tovu root; Node 24; Jini linked; @tovu/sdk built)
#   bash designs/arch-120/tools/sheet-gates.sh --compare <BASE-dir> <AFTER-dir>
# Compare rule (owner decision BASE-RED, lesson 44): a gate that exits 0 on the base must exit 0 after;
# for a gate red on the base, every finding line after must already be in the base output. Exit 1 = STOP.
set -uo pipefail
export LC_ALL=C
if [ "${1:-}" = "--compare" ]; then
  base="$2"; after="$3"; bad=0
  for f in "$base"/*.exit; do
    g=$(basename "$f" .exit); b=$(cat "$f"); a=$(cat "$after/$g.exit" 2>/dev/null || echo missing)
    if [ "$b" = 0 ] && [ "$a" != 0 ]; then echo "STOP: $g exited $a (base 0)"; bad=1; fi
    new=$(comm -13 <(sort -u "$base/$g.lines") <(sort -u "$after/$g.lines"))
    if [ "$b" != 0 ] && [ -n "$new" ]; then echo "STOP: $g has lines not in the base output:"; echo "$new" | sed 's/^/  /'; bad=1; fi
    echo "$g: base exit $b, after exit $a, new lines: $(printf '%s' "$new" | grep -c . || true)"
  done
  exit $bad
fi
OUT="${1:?usage}"; mkdir -p "$OUT"
run() { # name, grep-pattern for finding lines, command...
  local name="$1" pat="$2"; shift 2
  "$@" > "$OUT/$name.log" 2>&1; echo $? > "$OUT/$name.exit"
  grep -E "$pat" "$OUT/$name.log" | sed -E 's/[0-9]+(\.[0-9]+)?ms//g' | sort -u > "$OUT/$name.lines" || true
}
run tsc 'error TS' npx tsc -p tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=6144 run tsc-tests 'error TS' npx tsc -p tsconfig.tests.json --noEmit
run architecture 'NEW cross-feature edge|new pair|regressed against a hard' npm run check:architecture
run boundaries '^ +error ' npm run check:boundaries
run size 'NEW|Worse|over|exceed|FAIL|fail' npm run check:size
run complexity 'NEW|Worse|FAIL|fail' npm run check:complexity
run why-comments '\[[0-9a-f]{12}\]' npm run check:why-comments
run hooks 'error|FAIL|fail' npm run check:hooks
run errors 'New|Worse|FAIL' npm run check:errors
run error-rule-copies 'error|FAIL|fail' npm run check:error-rule-copies
for f in "$OUT"/*.exit; do echo "$(basename "$f" .exit): exit $(cat "$f"), $(wc -l < "${f%.exit}.lines") finding lines"; done
