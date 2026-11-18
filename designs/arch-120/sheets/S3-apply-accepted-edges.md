# Sheet S3 — regenerate the edge facts on the live base and accept the reviewed edges (gate turns green)

Executor: Sonnet, unattended. Budget: ≤ 100k context, ≤ 60 tool calls, 45 min. One responsibility: add the reviewed edges to `check-architecture.baseline.json` with the S2 tool and commit the list that explains them. No product code.
Design: `origin/plan/design-arch-120-2026-11-17:designs/arch-120/DESIGN.md` §2-§4, §6.

Rules: never hand-edit the baseline JSON; never run `check:architecture --update`; never add a row for an edge the classifier calls `NEW` unless it is one of the two DESIGNED edges named in `tools/make-accepted.py`. Every commit green against the base output. Never force-push.

## 0. Setup (Node 24)

```bash
export PATH="$HOME/.local/node24/bin:$PATH"
BASE="${BASE:?the coordinator names the branch that contains S1 and S2 (e.g. an integration branch)}"
cd Jini && git fetch origin refactor/terra && git checkout --detach origin/refactor/terra && pnpm install --frozen-lockfile && pnpm --no-bail -r build && cd ..
cd Tovu && git fetch origin "${BASE#origin/}" plan/design-arch-120-2026-11-17
git checkout -b refactor/arch-120-s3 "$BASE"
npm ci && JINI_PACKAGES_DIR="$PWD/../Jini/packages" node development/scripts/link-jini.mjs
npm --prefix packages/contracts run build && npm --prefix packages/sdk run build
mkdir -p /tmp/arch120 && git archive origin/plan/design-arch-120-2026-11-17 designs/arch-120 | tar -x -C /tmp/arch120
T=/tmp/arch120/designs/arch-120/tools
```

## 1. Prerequisites (STOP on failure)

```bash
grep -q 'findSoonPlugin' apps/website/src/features/agent-plugins/lifecycle.ts || { echo "STOP P1: S1 is not in this base"; exit 1; }
! grep -q 'from "#src/features/agent-plugins/soon-lock"' apps/website/src/features/site-backup/import-plugin-state.ts || { echo "STOP P2: E085 is still in this base"; exit 1; }
test -f development/scripts/accept-architecture-edges.ts && test -f development/scripts/architecture-edge-acceptance.ts || { echo "STOP P3: S2 is not in this base"; exit 1; }
git cat-file -e 9240cbe1^{commit} || { echo "STOP P4: commit 9240cbe1 (the baseline's creation) is not in this clone; fetch full history"; exit 1; }
```

## 2. Record the base

```bash
bash $T/sheet-gates.sh /tmp/arch120/base
grep -c 'NEW cross-feature edge' /tmp/arch120/base/architecture.log     # 119 on the design's base + S1
```

## 3. Regenerate the facts on THIS base (lesson 43) and build the accept list

```bash
OUT=/tmp/arch120/facts TOVU="$PWD" SCRATCH=/tmp/arch120/scratch bash $T/regenerate-facts.sh | tee /tmp/arch120/regen.txt
awk '/edge count:/ { split($3,g,"="); split($4,x,"="); exit !(g[2]==x[2]) }' /tmp/arch120/regen.txt || { echo "STOP F1: the extractor and the gate disagree on the edge count; the classification cannot be trusted"; exit 1; }
grep -q 'NEW edges the extractor does not see: 0' /tmp/arch120/regen.txt || { echo "STOP F2: some NEW edges are invisible to the extractor"; exit 1; }
python3 $T/make-accepted.py /tmp/arch120/facts/EDGES.tsv > /tmp/arch120/accepted.tsv || { echo "STOP F3: a NEW edge has no decision (listed above). Do not accept it. Report it: it needs its own sheet."; exit 1; }
```

Compare with the reviewed list in the design. Differences are allowed only when a live lane removed an edge (row gone) or moved one (a new `OLD`/`MOVED`/`RENAMED` row the classifier proved); print them for the report:

```bash
diff <(cut -f1,2 /tmp/arch120/designs/arch-120/ACCEPTED-EDGES.tsv | sort) <(cut -f1,2 /tmp/arch120/accepted.tsv | sort) | tee /tmp/arch120/accepted.diff
! grep -P '^>.*\tDESIGNED$' /tmp/arch120/accepted.diff || { echo "STOP F4: a DESIGNED row appeared that the design did not review"; exit 1; }
```

(On the design's base + S1, `accepted.diff` is empty: the design's list has 119 rows: 93 OLD, 16 MOVED, 8 RENAMED, 2 DESIGNED.)

## 4. Apply

The list is kept as the audit trail at `development/boundaries/accepted-cross-feature-edges.tsv` (next to `feature-ranks.json`). If the file already exists, append only rows whose edge it does not have.

```bash
L=development/boundaries/accepted-cross-feature-edges.tsv
if [ -f $L ]; then awk -F'\t' 'NR==FNR { have[$1]=1; next } FNR>1 && !($1 in have)' $L /tmp/arch120/accepted.tsv >> $L; else cp /tmp/arch120/accepted.tsv $L; fi
npx tsx development/scripts/accept-architecture-edges.ts $L --check || { echo "STOP A1: NEW edges without a row (listed above)"; exit 1; }
npx tsx development/scripts/accept-architecture-edges.ts $L
git show HEAD:development/scripts/check-architecture.baseline.json > /tmp/arch120/baseline.before.json
node -e '
const fs = require("fs"); const a = JSON.parse(fs.readFileSync("/tmp/arch120/baseline.before.json", "utf8")); const b = JSON.parse(fs.readFileSync("development/scripts/check-architecture.baseline.json", "utf8"));
const kept = a.crossFeatureEdges.every(e => b.crossFeatureEdges.includes(e));
const same = JSON.stringify({ ...a, crossFeatureEdges: 0 }) === JSON.stringify({ ...b, crossFeatureEdges: 0 });
console.log(`edges ${a.crossFeatureEdges.length} -> ${b.crossFeatureEdges.length}; every old edge kept: ${kept}; every other key unchanged: ${same}`);
process.exit(kept && same ? 0 : 1);' || { echo "STOP A2: the tool removed an edge or changed another metric"; exit 1; }
npm run check:architecture > /tmp/arch120/arch-after.txt 2>&1 || { tail -20 /tmp/arch120/arch-after.txt; echo "STOP A3: the gate is still red"; exit 1; }
```

Commit:

```bash
git add development/boundaries/accepted-cross-feature-edges.tsv development/scripts/check-architecture.baseline.json
git commit -m "build(architecture): accept the reviewed cross-feature edges; check:architecture is green (arch-120 S3)

The 119 edges the gate called NEW are recorded with their evidence in
development/boundaries/accepted-cross-feature-edges.tsv: 93 were already in the tree of 9240cbe1, the
commit that created the baseline list (the gate reports 107 NEW there and on origin/main); 16 moved
files that import the same names across the same feature pairs; 8 import TovuPublishPorts, the
publish-engine P0.3 rename of PublishContentPorts; 2 were created on purpose by the import-cycle
design (S5 packager port, S3b write port). Only crossFeatureEdges changed, by the S2 tool; no
other metric was rewritten. Design: plan/design-arch-120-2026-11-17:designs/arch-120/DESIGN.md.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Adjust the counts in the message to the regenerated list if `accepted.diff` was not empty.)

## 5. Gates

```bash
bash $T/sheet-gates.sh /tmp/arch120/after-s3
bash $T/sheet-gates.sh --compare /tmp/arch120/base /tmp/arch120/after-s3 || { echo "STOP G1: a gate got worse"; exit 1; }
test "$(cat /tmp/arch120/after-s3/architecture.exit)" = 0 || { echo "STOP G2: check:architecture does not exit 0"; exit 1; }
grep -E 'module API surface|cross-feature import edges' /tmp/arch120/after-s3/architecture.log    # surface unchanged vs base
node --import tsx --test development/scripts/__tests__/check-architecture.test.ts development/scripts/__tests__/accept-architecture-edges.test.ts 2>&1 | grep -E '^ℹ (pass|fail)'
```

## 6. Push and report

```bash
git pull --rebase origin refactor/arch-120-s3 2>/dev/null || true
git push -u origin refactor/arch-120-s3
git log --oneline "$BASE"..HEAD
```

Report (≤ 12 lines): SHA, branch, the regenerate summary (counts per class), `accepted.diff` (empty or its lines), the `check:architecture` verdict line, `--compare` output.
