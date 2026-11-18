# arch-120 — sheet index (revision 2)

Design: [`REVISION-2.md`](REVISION-2.md), which supersedes DESIGN.md §0–§6. Judge: [`CODEX-JUDGE-1.md`](CODEX-JUDGE-1.md). Facts: [`rev2/facts/`](rev2/facts/); `facts/` holds the revision-1 facts on `f0613d9e5`, kept for the record.
Base: Tovu `origin/refactor/terra` `b5fbf2a5e`, Jini `origin/refactor/terra` `6c9effae`. The coordinator may name a later integration branch that contains it; every sheet's prerequisites are re-checked on that branch.

## Order

| # | sheet | removes | prerequisite (checked by the sheet's own STOP block) | size |
|---|---|---|---|---|
| 1 | [R1](sheets/R1-rank-keyed-edge-ratchet.md) | the ratchet stops judging strictly-downward edges; 2 rank fixes; baseline key cut to the legacy non-downward set | ranks file present; gate prints NEW lines | ≤ 120k |
| 2 | [M1](sheets/M1-media-door-and-owned-shapes.md) | N030 N031 N036 N062 N063 (door) and N046 N050 (type-up) | R1 in base | ≤ 150k |
| 2 | [P1](sheets/P1-consumer-owned-ports.md) | N001 N002 N003 N016 N059 N064 | R1 in base | ≤ 200k |
| 3 | [C1](sheets/C1-publish-ports-generic-engine.md) | N068–N078 | R1 in base; `wave3/moves-b1` merged | ≤ 250k |
| lane | `wave3/import-cycle-b-2` (not a sheet here) | N102–N106, N111 (done in 2f6bfeed); N015 (S3b, still to re-apply) | — | — |

M1 and P1 touch disjoint files and can run in parallel. When every row is done, `check:architecture` prints **no** `NEW cross-feature edge` line and no new mutual pair. It still exits 1 on the API surface until F-S lands (REVISION-2 §7). That is stated, not hidden.

## Setup (every sheet; Node 24; checkouts named exactly `Tovu` and `Jini`, side by side)

```bash
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$PATH"
BASE="${BASE:-origin/refactor/terra}"
(cd Jini && git fetch origin refactor/terra && git checkout --detach origin/refactor/terra && pnpm install --frozen-lockfile && pnpm --no-bail -r build)
cd Tovu && git fetch origin "${BASE#origin/}"
git checkout -b "$SHEET_BRANCH" "$BASE"            # e.g. refactor/arch-120-r1
npm ci
JINI_PACKAGES_DIR="$PWD/../Jini/packages" node development/scripts/link-jini.mjs
npm --prefix packages/contracts run build && npm --prefix packages/sdk run build   # tsc needs @tovu/sdk
RUN=$(mktemp -d); echo "RUN=$RUN"                 # per-run scratch; never a shared /tmp path
mkdir "$RUN/base"; OUT="$RUN/base"                 # then run the Gate block once, unmodified, to record the base
```

Base on `b5fbf2a5e` (`rev2/facts/base-gates.b5fbf2a5e.txt`): typecheck, typecheck:tests, check:complexity, check:size, check:why-comments, check:errors, check:error-rule-copies and check:hooks exit 0. `check:boundaries` exits 15 (15 errors), `check:architecture` exits 1, and `lint` exits 1 (559 errors repo-wide), so the block runs lint only on the files the sheet touches.

## Gate block G

Run it once for the base (`OUT=$RUN/base`, with `FILES` empty: lint is skipped) and after every commit (`OUT=$RUN/now`, with `FILES` set to the sheet's changed `.ts` files). Every command is the repo's own. The block stops at the first failure. A red-on-base gate passes only when its run completed (summary line present) and it prints no finding line beyond the base.

```bash
set -euo pipefail
mkdir -p "$OUT"
npm run typecheck
npm run typecheck:tests
npm run check:complexity
npm run check:size
npm run check:why-comments
npm run check:errors
npm run check:error-rule-copies
npm run check:hooks
if [ -n "${FILES:-}" ]; then npx biome lint $FILES; fi
rc=0; npm run check:boundaries > "$OUT/boundaries.txt" 2>&1 || rc=$?
grep -q 'modules, .* dependencies cruised' "$OUT/boundaries.txt" || { echo "STOP G1: check:boundaries did not complete (exit $rc)"; exit 1; }
grep '^  error' "$OUT/boundaries.txt" | sort > "$OUT/boundaries.errors"
grep '^  warn' "$OUT/boundaries.txt" | sort > "$OUT/boundaries.warns"
rc=0; npm run check:architecture > "$OUT/architecture.txt" 2>&1 || rc=$?
grep -q 'cross-feature import edges (all-import)' "$OUT/architecture.txt" || { echo "STOP G2: check:architecture did not complete (exit $rc)"; exit 1; }
grep 'NEW cross-feature edge' "$OUT/architecture.txt" | sort > "$OUT/architecture.new" || true
awk '/module API surface \(files exposed\) /{print $NF; exit}' "$OUT/architecture.txt" > "$OUT/api"
awk '/module cycles \(mutual pairs, runtime-only\)/{print $NF; exit}' "$OUT/architecture.txt" > "$OUT/pairs"
if [ "$OUT" != "$RUN/base" ]; then
  B="$RUN/base"
  test -z "$(comm -13 "$B/boundaries.errors" "$OUT/boundaries.errors")" || { echo "STOP G3: new check:boundaries error"; comm -13 "$B/boundaries.errors" "$OUT/boundaries.errors"; exit 1; }
  test -z "$(comm -13 "$B/boundaries.warns" "$OUT/boundaries.warns")"   || { echo "STOP G4: new check:boundaries warning"; comm -13 "$B/boundaries.warns" "$OUT/boundaries.warns"; exit 1; }
  test -z "$(comm -13 "$B/architecture.new" "$OUT/architecture.new")"   || { echo "STOP G5: new NEW cross-feature edge"; comm -13 "$B/architecture.new" "$OUT/architecture.new"; exit 1; }
  test "$(cat "$OUT/api")"   -le "$(cat "$B/api")"   || { echo "STOP G6: API surface rose"; exit 1; }
  test "$(cat "$OUT/pairs")" -le "$(cat "$B/pairs")" || { echo "STOP G7: runtime mutual pairs rose"; exit 1; }
fi
npm run test:ci          # the repo's full suite (TAP to development/coverage/test-results-all.tap)
npm run check:test-baseline
```

`npm run test:ci` exits non-zero on any failing test. If the base itself has failures that `development/scripts/repo-test-failure-baseline.json` tolerates, use `npm run test:ci || true` followed by `npm run check:test-baseline`, which then decides: it reads the TAP file and fails on any failure not in that baseline. Record which form the base needed, in the sheet's report.

After `git pull --rebase` and before every push, run the block again (`OUT=$RUN/rebased`). Never push a red block.

## Lane overlap

Measured 2026-11-18 over the 110 lanes updated since 11-16 with `git diff --name-only $(git merge-base <lane> b5fbf2a5e) <lane>` (`rev2/facts/lane-overlap.txt`):

| lane | files it shares with a sheet | effect | action |
|---|---|---|---|
| `wave3/import-cycle-b-2` | `source-control/commit-site.ts`, `tool-registrations.ts` | removes the 6 value-up edges and the runtime pair; adds 3 LEGITIMATE edges | runs in parallel; it must also re-apply S3b (N015) |
| `wave3/su-cms-3` (contains terra) | `entries/trash-aware-memory-repo.ts` (M1) | removes N031; adds `entries/unreadable-owner-entries-repair.ts → trash/repo.sqlite.ts` (4→3, down, LEGITIMATE under R1) | if merged first, M1 drops its N031 step (M1 P-check) |
| `wave3/su-cms` | the same file | the same | the same |
| `wave3/moves-b1` | `media/where-used.ts` (M1), `publish-content/tovu-publish-ports.ts` (C1) | repoints `EntryRefsRepoPort` to `@jini-ai/cms/widgets` (no feature edge change) | C1 waits for it; M1 rebases over it (import-line conflict only) |
| `wave3/xpkg-c12obs-r12` | `custom-credentials/tool-registrations.ts` (P1), `credential-ports.ts` | swaps an `ObservabilityPort` import (Jini path) | P1 rebases over it (import-line conflict only) |
| `wave3/admin-j3-t1a` | `external-mcp/contracts.ts` (P1), `source-control/commit-site.ts` | 4 changed lines in contracts.ts | P1's STOP re-checks the `ExternalMcpConnectStart` export |
| `fix/vendor-names-out-of-core` | `api-connections/shared-owner.ts` (P1) | 4 changed lines | P1 re-checks `SharedOAuthOwnerStorage` |
| `integ/ratchets-arch-2026-11-17`, `refactor/import-cycle-b` | `check-architecture.baseline.json` (R1) | pre-terra bases, superseded by `wave3/import-cycle-b-2` | if either merges, R1's baseline step re-derives the key on the merge result (it never hand-copies the list) |
| `fix/desktop-waveb` | `publish-content/media-references.ts` | not a C1 file | none |

Reproduce:

```bash
git for-each-ref --format='%(committerdate:short) %(refname:short)' refs/remotes/origin | awk '$1>="2026-11-16"' | while read d b; do
  mb=$(git merge-base "$b" b5fbf2a5e) || continue
  git diff --name-only "$mb" "$b" | grep -E 'check-architecture|feature-ranks|features/(media|post|entries|forms|agent-plugins|api-connections|external-mcp|project-keys|custom-credentials|plugin-runtime|publish-content)/' | sed "s#^#$b #"
done
```
