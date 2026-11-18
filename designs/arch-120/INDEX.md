# arch-120 — sheet index

Design: [`DESIGN.md`](DESIGN.md). Facts: [`facts/`](facts/) (regenerate with `tools/regenerate-facts.sh`). Reviewed list: [`ACCEPTED-EDGES.tsv`](ACCEPTED-EDGES.tsv) (119 rows).
Facts base: `origin/refactor/import-cycle-b` `f0613d9e5` (terra + import-cycle-b). Jini: `origin/refactor/terra` `4c189236`, built and linked.

## Order and prerequisites

| # | sheet | responsibility | prerequisite (checked by the sheet's own STOP block) | base branch | effect on `check:architecture` |
|---|---|---|---|---|---|
| 1 | [S1](sheets/S1-soon-lock-through-lifecycle.md) | remove E085: site-backup asks the lifecycle owner `findSoonPlugin` | E085 import present once; `findSoonPlugin` absent | `origin/refactor/import-cycle-b` or any later branch containing it | 120 → 119 NEW lines (all in the base output) |
| 2 | [S2](sheets/S2-accept-edges-tool.md) | dev tool that adds reviewed edges to the baseline (no other metric) | the gate still prints `NEW cross-feature edge: <edge>`; baseline file round-trips in the writer format | same as S1; independent of S1 (can run in parallel) | unchanged |
| 3 | [S3](sheets/S3-apply-accepted-edges.md) | regenerate facts on the live base, apply the reviewed list | S1 and S2 merged into its base; `9240cbe1` reachable | the integration branch that holds S1 + S2 | → **exit 0** |

S1 and S2 touch disjoint files and can run at the same time; S3 runs once both are merged into one branch. Estimated size: S1 ~80k context, S2 ~70k, S3 ~70k (each sheet ≤ 120k, far under the 250k cap).

Every sheet: Node 24; Jini `refactor/terra` built (`pnpm --no-bail -r build`) and linked with `link-jini.mjs` (it covers the root, `apps/admin` and `apps/site-chat`; no sheet touches `apps/desktop`); `@tovu/sdk` built (without it `tsc` reports `TS2307 '@tovu/sdk'`, which is an environment error, not a regression). Each sheet records its own base gate output first and judges every commit with `tools/sheet-gates.sh --compare` (owner decision BASE-RED: no new line beyond the base output).

## Base gate output (facts base, `tools/sheet-gates.sh`)

```
architecture: exit 1, 121 finding lines        (120 NEW edges + the "regressed against a hard constraint" line)
boundaries: exit 15, 15 finding lines          (15 no-deep-imports errors; facts/base-gates.f0613d9e.txt)
why-comments: exit 1, 1 finding lines          (ac521b7d86c5, server/routes/types.ts:1720, inherited from ratchets-arch)
complexity / errors / error-rule-copies / hooks / size / tsc / tsc-tests: exit 0
```

## File overlap with the live lanes

Files each sheet changes:

| sheet | files |
|---|---|
| S1 | `apps/website/src/features/agent-plugins/lifecycle.ts`, `apps/website/src/features/site-backup/import-plugin-state.ts`, `apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts` |
| S2 | new: `development/scripts/accept-architecture-edges.ts`, `development/scripts/architecture-edge-acceptance.ts`, `development/scripts/__tests__/accept-architecture-edges.test.ts` |
| S3 | `development/scripts/check-architecture.baseline.json`, new: `development/boundaries/accepted-cross-feature-edges.tsv` |

Lane diffs measured 2026-11-18 against each lane's merge-base with the facts base (`git diff --name-only $(git merge-base origin/<lane> origin/refactor/import-cycle-b) origin/<lane>`):

| lane | branch (tip date) | files changed | overlap with S1/S2/S3 files | cross-feature edges the lane adds / removes (`tools/lane-edges.sh`) |
|---|---|---|---|---|
| S/U cms chain | `wave3/su-cms` (11-18) | 96 | none | +1 `entries/repo.sqlite.ts → media/access-evidence.ts` (classifier: MOVED, same names as `entries/repo.ts → media/access-evidence.ts`); −3: `entries/repo.ts → media/access-evidence.ts`, `publish-content/tovu-publish-ports.ts → entries/contracts.ts`, `→ taxonomy/contracts.ts` |
| S/U | `wave3/su-s5` (11-18) | 83 | none (touches `site-backup/__tests__/integration/saved-keys-store.fixture.ts`, not S1's files) | −1 `tovu-publish-ports.ts → taxonomy/contracts.ts` |
| K lane | `wave3/kt-k03-k04`, `kt-k05`, `kt-k07`, `kt-k09-k10`, `kt-t-po` (11-18) | 50 / 101 / 43 / 55 / 34 | none | removals only: `site-backup/import-keep-off.ts → widgets/media-html.ts` (k03-k04, k05, k07, k09-k10), `tovu-publish-ports.ts → taxonomy/contracts.ts` (k05), `site-backup/static-download-landing.ts → post/html-plain-text.ts` (t-po) |
| admin J/JM | `wave3/admin-j3-t1a`, `wave2/admin-j` (11-18) | 339 / 1 | none (touches other files in `agent-plugins/__tests__/unit/`: `a10c-access-token-seam`, `host-signals`) | none |
| daemon R7/R8 | `wave2/daemon-r7`, `wave2/daemon-r8` (11-18) | 20 / 13 | none | none |
| desktop D0c | `wave3/desktop-d0c` (11-18) | 162 | none (touches other `agent-plugins/__tests__/unit/` files) | none |
| publish-engine | `wave2/publish-p0-rest` (11-17) | 162 | none; it edits `publish-content/tovu-publish-ports.ts` (owner of RC2's code, see DESIGN §3.6) | none |
| moves | `wave3/moves-b1` (11-18) | 136 | none | −1 `member-login/link-policy.ts → members/index.ts` |

Reproduce:

```bash
for b in wave3/su-cms wave3/su-s5 wave3/kt-k03-k04 wave3/kt-k05 wave3/kt-k07 wave3/kt-k09-k10 wave3/kt-t-po wave3/admin-j3-t1a wave2/admin-j wave2/daemon-r7 wave2/daemon-r8 wave3/desktop-d0c wave2/publish-p0-rest wave3/moves-b1; do
  git fetch -q origin $b; mb=$(git merge-base origin/$b origin/refactor/import-cycle-b)
  git diff --name-only $mb origin/$b | grep -E 'agent-plugins/lifecycle.ts|site-backup/import-plugin-state.ts|soon-lock.unit.test.ts|accept-architecture-edges|architecture-edge-acceptance|check-architecture.baseline.json|accepted-cross-feature-edges' | sed "s#^#$b: #"
done                                      # prints nothing on 2026-11-18
TOVU="$PWD" bash designs/arch-120/tools/lane-edges.sh wave3/su-cms wave3/su-s5 wave3/kt-k05 wave3/kt-t-po wave3/moves-b1
```

### What the edge changes mean for merge order

- **No file conflicts.** No lane edits any S1/S2/S3 file, and no lane edits `check-architecture.baseline.json`.
- **Removals are harmless.** A lane that removes an edge leaves a stale baseline entry (follow-up F-1), never a red gate.
- **The one addition (`wave3/su-cms`)**: if su-cms merges **before** S3, S3's regeneration classifies its edge as MOVED and accepts it with evidence (no action). If su-cms merges **after** S3, that merge makes `check:architecture` print one NEW line. Whoever merges then runs, on the merge result:

```bash
OUT=/tmp/arch120/facts TOVU="$PWD" bash designs/arch-120/tools/regenerate-facts.sh   # tools from origin/plan/design-arch-120-2026-11-17
python3 designs/arch-120/tools/make-accepted.py /tmp/arch120/facts/EDGES.tsv > /tmp/arch120/accepted.tsv || echo "STOP: a NEW edge needs a decision"
L=development/boundaries/accepted-cross-feature-edges.tsv
awk -F'\t' 'NR==FNR { have[$1]=1; next } FNR>1 && !($1 in have)' $L /tmp/arch120/accepted.tsv >> $L
npx tsx development/scripts/accept-architecture-edges.ts $L && npm run check:architecture
```

- Any other lane that adds an edge after S3 gets the same treatment: the tool accepts nothing without a row, and `make-accepted.py` writes a row only for OLD/MOVED/RENAMED or a named design edge. A genuinely new dependency stops there and needs a decision, which is the gate doing its job.

## Not in these sheets

F-1 (prune 124 stale baseline entries), F-2 (lane T: 37 upward type-only edges, owner question Q3 of the import-cycle design), F-3 (whether `check:architecture` runs in CI). See DESIGN §9.
