# Sheet R1 — the cross-feature ratchet judges only same-rank and upward edges

Executor: one agent, unattended. Budget ≤ 120k context, ≤ 90 tool calls, 75 min. Branch `refactor/arch-120-r1` from `$BASE` (INDEX). Design: REVISION-2 §2–§3.
Owner rules: args `(required, optional = {})`; functions ≤ 50 lines, complexity ≤ 10; why-comments stay with their code; tests first; every commit passes Gate block G against the base; never force-push; push only your branch.

## 1. Prerequisites (run all; each STOPs)

```bash
set -euo pipefail
S=development/scripts/check-architecture.ts
test -f development/boundaries/feature-ranks.json || { echo "STOP P1: rank table missing"; exit 1; }
test "$(grep -c '^function introducedCrossFeatureEdges(' $S)" = 1 || { echo "STOP P2: introducedCrossFeatureEdges moved"; exit 1; }
test "$(grep -c '^function crossFeatureEdges(' $S)" = 1 || { echo "STOP P3: crossFeatureEdges moved"; exit 1; }
! grep -q 'feature-ranks' $S || { echo "STOP P4: the checker already reads the rank table"; exit 1; }
node -e 'const r=require("./development/boundaries/feature-ranks.json"); if (r["project-keys"]!==0||r["object-storage"]!==1) process.exit(1)' || { echo "STOP P5: rank rows changed since the design"; exit 1; }
```

Then run Setup and Gate block G for the base (INDEX). Save `$RUN/base/architecture.new`: it must hold 120 lines on `b5fbf2a5e` (117 on a base that has 2f6bfeed). A different count is not a STOP; record it in the report.

## 2. Characterization first (no code change)

`npm run test:ci` covers `development/scripts/__tests__/check-architecture.test.ts` (4 cases, all green on base). They pin today's behavior: an edge between two **unranked** fixture features is reported as NEW and exits 1. R1 keeps that unchanged, because an unranked edge fails closed.

## 3. Red tests (add, run, see them fail, then implement)

Append to `development/scripts/__tests__/check-architecture.test.ts` one table-driven test. Reuse the file's fixture shape: scratch copy of the script, symlinked `node_modules`, `features/sample/value.ts`, `features/neighbor/types.ts`, and composition `app.ts` exposing `neighbor/types.ts` so the API surface cannot trip. Before the `--update` run, the test writes `development/boundaries/feature-ranks.json` into the scratch root. It then appends `export type NewEdge = import("../neighbor/types.js").Neighbor;` to `sample/value.ts` and runs the checker without `--update`:

| ranks file | expected |
|---|---|
| `{"sample":1,"neighbor":0}` | exit 0; stdout/stderr has no `NEW cross-feature edge`; the `cross-feature import edges (all-import)` line prints `1` |
| `{"sample":0,"neighbor":1}` | exit 1; stderr matches `NEW cross-feature edge: .*sample/value\.ts -> .*neighbor/types\.ts` |
| `{"sample":0,"neighbor":0}` | exit 1, same line (same rank) |
| `{"sample":1}` | exit 1, same line (unranked target fails closed) |

Red check. The status must be non-zero, and it must be the new test that failed:

```bash
rc=0; node --import tsx --test development/scripts/__tests__/check-architecture.test.ts > "$RUN/red.log" 2>&1 || rc=$?
test "$rc" -ne 0 || { echo "STOP R1: new tests pass before the change"; exit 1; }
grep -q 'ranks file' "$RUN/red.log" || { echo "STOP R2: failure is not the new test"; exit 1; }
```

(Name the test `ratchet follows the rank table: ranks file …` so the grep finds it.)

## 4. Implementation (`development/scripts/check-architecture.ts`)

1. Add `const FEATURE_RANKS_PATH = path.join(REPO_ROOT, "development", "boundaries", "feature-ranks.json");`.
2. Add `loadFeatureRanks()`. It returns `null` when the file does not exist, and throws on invalid JSON or a non-integer value.
3. Add `isStrictlyDownward({ edge, ranks })`. Split the edge on `" -> "`, take `moduleOf()` of each side, strip `features/`, and return true only when both names are in `ranks` and `ranks[source] > ranks[target]`. With a `null` table it returns false.
4. In `main()`, keep `current.crossFeatureEdges` as the ratchet set: `crossFeatureEdges({ forward: forwardAll }).filter(edge => !isStrictlyDownward({ edge, ranks }))`. The informational print line at `:782` keeps the full count: compute `allCrossFeatureEdges` once and print its length.
5. Doc comments. On `Baseline.crossFeatureEdges`: *"Same-rank and upward directed imports between distinct features (development/boundaries/feature-ranks.json), including erased type dependencies — the only edges that can close a feature cycle. A strictly downward edge is judged by check:boundaries (rank and door rules). A feature missing from the table is treated as not downward (fail closed). Re-ranking cannot hide an edge: raising a rank turns the edges into that feature from same-or-lower ranks into ratcheted edges."* Next to the type filter, add the same `verbatimModuleSyntax` caveat as `.dependency-cruiser.mjs:851`.
6. `development/boundaries/feature-ranks.json`: set `"object-storage": 9` and `"project-keys": 1`. Evidence is in REVISION-2 §3.2. G4 (no new boundaries warning) verifies that no value edge turns into a rank warning.

Green check: `node --import tsx --test development/scripts/__tests__/check-architecture.test.ts` exits 0.

## 5. One-time baseline key edit (no `--update` of other metrics)

`--update` rewrites every metric (`check-architecture.ts:866`), so it runs only in a scratch copy. The committed edit changes one key, to old-baseline ∩ current-ratchet-set. A NEW tangle therefore cannot enter.

```bash
set -euo pipefail
J=development/scripts/check-architecture.baseline.json
cp "$J" "$RUN/baseline.before.json"
npx tsx development/scripts/check-architecture.ts --update > "$RUN/update.log" 2>&1
cp "$J" "$RUN/baseline.updated.json"; cp "$RUN/baseline.before.json" "$J"
node -e '
const fs=require("fs");const [before,updated,out]=process.argv.slice(1);
const b=JSON.parse(fs.readFileSync(before,"utf8")), u=JSON.parse(fs.readFileSync(updated,"utf8"));
const keep=new Set(u.crossFeatureEdges); b.crossFeatureEdges=b.crossFeatureEdges.filter(e=>keep.has(e)).sort();
fs.writeFileSync(out, JSON.stringify(b,null,2)+"\n");' "$RUN/baseline.before.json" "$RUN/baseline.updated.json" "$J"
node -e '
const fs=require("fs");const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8")), b=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const changed=Object.keys({...a,...b}).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
if (changed.join()!=="crossFeatureEdges") { console.error("changed keys:", changed); process.exit(1); }' "$RUN/baseline.before.json" "$J" || { echo "STOP B1: more than crossFeatureEdges changed"; exit 1; }
git diff --stat -- "$J"
```

Check the key-only diff against the original formatting with `git diff`. If the writer's format differs (indentation, trailing newline), reformat only that key to match. STOP B2 if `git diff` shows lines outside the `crossFeatureEdges` array.

Expected on `b5fbf2a5e`: the key holds the 27 lines of `designs/arch-120/rev2/facts/baseline-after-R1.txt`. The gate then prints exactly these **26** NEW lines (20 on a base with 2f6bfeed):

```bash
awk -F'\t' 'NR>1 && $11 ~ /^TANGLE-(type|value)-up$/ {print "  NEW cross-feature edge: apps/website/src/features/"$9" -> apps/website/src/features/"$10}' \
  <(git show origin/plan/design-arch-120-2026-11-17:designs/arch-120/rev2/facts/EDGES.terra.tsv) | sort > "$RUN/expected.new"
rc=0; npm run check:architecture > "$RUN/after.txt" 2>&1 || rc=$?
grep 'NEW cross-feature edge' "$RUN/after.txt" | sort > "$RUN/after.new" || true
test -z "$(comm -13 "$RUN/expected.new" "$RUN/after.new")" || { echo "STOP B3: a NEW line that is not a classified TANGLE"; comm -13 "$RUN/expected.new" "$RUN/after.new"; exit 1; }
```

If the base merged a lane that adds a non-downward edge, B3 names it. That edge needs a decision; it is not added to any list.

## 6. Gate and commits

Commit 1 holds the tests, the code and the rank table. Commit 2 holds the baseline key. Before each commit, run Gate block G with `OUT=$RUN/now` and `FILES="development/scripts/check-architecture.ts development/scripts/__tests__/check-architecture.test.ts"`. G5 must pass: R1 may only remove NEW lines. API surface and pairs are unchanged. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Then `git pull --rebase`, re-run G (`OUT=$RUN/rebased`), and push.

Report: the base and final NEW-line counts, the 27-line key (or the count on your base), every SHA, and B3's output.
