# arch-120 v3 — lane index (dependency order)

Base: Tovu `origin/integ/merge-3-2026-11-18` @ `2d82735a` (Tovu tip). Measured with the repo's own
`npm run check:architecture`: **exit 1, 115 `NEW cross-feature edge` lines, nothing else blocking**
(API surface 806 ≤ 821, back-edges 0, cycles 2 ≤ baseline, SCC 2). The 5 edges named in
`cloud-results/combine-3-fix.md` are V-rows in `facts/edges.v3.tsv` (L08, L03, L07, L06).
`npm run check:boundaries`: exit 14, 14 errors (5 are among the 115; the rest are L15).

Rule for every lane (owner, binding): an edge leaves the report only because the source file stops
importing the other feature. Three moves, nothing else:

| code | move | when |
|---|---|---|
| **J** | import the canonical `@jini-ai/*` export directly (delete the Tovu forwarding line if it has no other user) | the symbol is a Jini type/value forwarded by a sibling feature's barrel |
| **D** | move the declaration down to `apps/website/src/contracts/core/<file>.ts`, repoint **every** importer (prod + tests), leave no forwarder | pure type / constant / pure function whose own imports are only `@jini-ai/*`, `node:*` or `contracts/` |
| **S** | consumer declares the structural shape it reads (fields/methods it actually uses); the provider's value is assigned to it where composition already passes it | type-only edge to a Tovu-local type |
| **I** | consumer takes the function in its deps (required field, or `optional = {}` arg per API-args rule); `server/runtime/composition` passes the provider's function | value edge to behaviour with state, I/O or a feature-owned repo |
| **H** | rehome a file to the module that owns its job (no forwarder) | the file is wiring (`deps.ts`, the publish bag) or already imports its new owner |

No allow-list, filter, rank exemption or baseline addition anywhere. The baseline is only ever
**lowered** (rows deleted) — G-RATCHET below.

## Lanes

| # | lane | sheet | edges | fix mix | depends on | est. tokens (impl run) |
|---|---|---|---|---|---|---|
| 0 | L00 ratchet prune (124 stale rows) | `v3/L00-ratchet-prune.md` | 0 | baseline −124 rows | — | 15k |
| 1 | L01 Jini-direct types | `v3/L01-jini-direct.md` | 10 | J | L00 | 25k |
| 2 | L02 contracts-down: settings/credentials/secrets | `v3/L02-contracts-down-a.md` | 15 | D | L00 | 45k |
| 3 | L03 contracts-down: theme ids, tables, PostKind, ExportReport | `v3/L03-contracts-down-b.md` | 13 | D | L00 | 45k |
| 4 | L04 settings write port | `v3/L04-settings-write.md` | 2 | I, S | L02 | 20k |
| 5 | L05 credential store foundation (incl. P1) | `v3/L05-credential-store.md` | 10 | D, I, S | L01, L02 | 70k |
| 6 | L06 credentials ↔ source-control | `v3/L06-credentials-source-control.md` | 3 | I, H | L05 | 45k |
| 7 | L07 static export / packager | `v3/L07-static-export.md` | 4 | I, S | L03 | 40k |
| 8 | L08 media door (M1) | `v3/L08-media-door.md` | 9 | D, I, S | L00 | 50k |
| 9 | L09 theme + asset ops | `v3/L09-theme-assets.md` | 8 | I, D | L03 | 60k |
| 10 | L10 post readers | `v3/L10-post-readers.md` | 9 | D, I, S, H | L03 | 70k |
| 11 | L11 plugins / connections | `v3/L11-plugins-connections.md` | 8 | D, I, S | L01, L05 | 60k |
| 12 | L12 single-call consumers | `v3/L12-single-call.md` | 3 | I, S | L00 | 30k |
| 13 | L13 publish-content consumer shapes | `v3/L13-publish-consumer-shapes.md` | 4 | S | L00 | 30k |
| 14 | L14 publish bag to composition (C1) | `v3/L14-publish-bag.md` | 17 | S, H, I | L01, L08, L13 | 110k |
| 15 | L15 boundary doors (non-feature `check:boundaries` errors) | `v3/L15-boundary-doors.md` | 0 (10 boundary errors) | I | L08 | 45k — **owner decision: in scope?** |

Total 115 edges (partition checked: `cat v3/edges/L*.txt | sort` = `v3/edges/all-115.txt`).
Parallel-safe groups (disjoint source files): {L01, L02, L03, L08, L12, L13} → {L04, L05, L07, L09, L10}
→ {L06, L11, L14} → L15. Each lane is one branch off the integration tip, one PR, merged in this
order; the gate below is order-independent, so a lane re-run after a rebase stays valid.

## API-surface budget (hard metric; baseline 821, tip 806 → 15 files of headroom)

A declaration moved to a **new** `contracts/core` file adds that file to the surface (+1) when its
old home was reached through the owner's entry; it is neutral when the old home was already
deep-imported (measured in the dry-run: operator-locale +1, access-evidence 0 → 807). So moves reuse
one file per topic. Planned new files (12): `operator-locale.ts` (L02), `settings-vocabulary.ts`
(L02: `MailTestModeSetting`, `PUBLISHABLE_SETTINGS`), `credential-store.ts` (L02 conflict error;
L05 adds the scope helpers), `secret-scan.ts` (L02), `theme-ids.ts` (L03; L09 adds the theme import
policy constants), `declared-content-type-owners.ts`, `redirect-tables.ts`, `fs-folder-recovery.ts`,
`post-kind.ts`, `export-report.ts` (L03), `declared-api-connection.ts` (L11),
`term-sync-permission.ts` (L14); `media-access-evidence.ts` (L08) and `SYSTEM_ACTOR_ID` into the
existing `post-author.ts` (L10) are neutral. Worst case 806 + 12 = 818 ≤ 821 before counting the
deep imports the I/H moves delete. G2 fails the lane if the surface ever exceeds 821.

## Setup (once per run, before any lane step)

Checkouts side by side and named exactly `Tovu` and `Jini` (host deps resolve `../Jini`). Node 24.

```bash
set -euo pipefail
(cd Jini && git fetch origin integ/merge-3-2026-11-18 && git checkout --detach d37821a4 \
  && pnpm install --frozen-lockfile && pnpm --no-bail -r build)
cd Tovu && git fetch origin integ/merge-3-2026-11-18 plan/design-arch-120-2026-11-17
git switch -c "arch-120/$LANE" 2d82735a          # or the current integ tip that contains it
npm ci && JINI_PACKAGES_DIR="$PWD/../Jini/packages" npm run link:jini
git checkout origin/plan/design-arch-120-2026-11-17 -- designs/arch-120/v3/edges designs/arch-120/facts/check-boundaries.v3.2d82735a.txt
git reset -q designs/arch-120                      # gate inputs only; never committed on the lane branch
```

Run `npm run unlink:jini` before any `build`. If the integ tip has moved past `2d82735a`, first
re-run `npm run check:architecture` and confirm its NEW lines are a subset of `all-115.txt`
(G2's first `comm`); if not, STOP and report the extra lines — they need their own row.

## Shared gate (every lane; fail-closed; repo commands only)

Run from the Tovu root with `LANE=Lxx`. Every command's status is checked directly — no `|| true`,
no status hidden in a pipeline, no process substitution.

```bash
set -euo pipefail
LANE=Lxx; OUT=$(mktemp -d)          # per-run scratch, never shared between lanes
D=designs/arch-120/v3/edges          # committed on plan/design-arch-120-2026-11-17

# G1 compile (prod + tests)
npm run typecheck
npm run typecheck:tests

# G2 architecture: producer must complete; the NEW set may only shrink, and this lane's edges must be gone
set +e; npm run check:architecture > "$OUT/arch.txt" 2>&1; ARCH=$?; set -e
grep -q '^check:architecture — ' "$OUT/arch.txt"                     # checker reached its verdict
{ grep '  NEW cross-feature edge: ' "$OUT/arch.txt" || true; } | sed 's/.*NEW cross-feature edge: //' | LC_ALL=C sort > "$OUT/new.txt"
test -z "$(LC_ALL=C comm -13 "$D/all-115.txt" "$OUT/new.txt")"     # no edge outside the 115
test -z "$(LC_ALL=C comm -12 "$D/$LANE.txt" "$OUT/new.txt")"       # every edge of this lane removed
if [ -s "$OUT/new.txt" ]; then
  test "$ARCH" -eq 1 && grep -q 'FAILED: 1 metric(s) regressed against a hard constraint' "$OUT/arch.txt"
else
  test "$ARCH" -eq 0                                                # last lane: the gate is green
fi

# G3 boundaries: no error that is not already in the tip's report (facts/check-boundaries.v3.2d82735a.txt)
set +e; npm run check:boundaries > "$OUT/bnd.txt" 2>&1; BND=$?; set -e
grep -q 'dependency violations\|no dependency violations' "$OUT/bnd.txt"
grep '^  error ' "$OUT/bnd.txt" | LC_ALL=C sort > "$OUT/bnd-err.txt" || true
grep '^  error ' designs/arch-120/facts/check-boundaries.v3.2d82735a.txt | LC_ALL=C sort > "$OUT/bnd-base.txt"
test -z "$(LC_ALL=C comm -13 "$OUT/bnd-base.txt" "$OUT/bnd-err.txt")"   # no new boundary error
[ -s "$OUT/bnd-err.txt" ] || test "$BND" -eq 0

# G4 owner practices on touched files
npm run check:size
npm run check:complexity

# G5 named characterization suites (listed in the sheet), node:test, status checked
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks \
  $SUITES                                                            # from the sheet

# G-RATCHET lower the baseline: delete rows that no longer exist; never add one
B=development/scripts/check-architecture.baseline.json
cp "$B" "$OUT/baseline.orig"
npm run check:architecture -- --update > "$OUT/update.txt" 2>&1
jq -r '.crossFeatureEdges[]' "$B" | LC_ALL=C sort > "$OUT/now.txt"
cp "$OUT/baseline.orig" "$B"                                         # --update's other metrics are discarded
jq --rawfile now "$OUT/now.txt" \
  '.crossFeatureEdges |= map(select(. as $e | ($now | split("\n") | index($e)) != null))' \
  "$OUT/baseline.orig" > "$B"
test "$(git diff --numstat -- "$B" | cut -f1)" = "0" || test -z "$(git diff --numstat -- "$B")"  # 0 added lines
```

G2 replaces rev2's Gate G: it fails on a missing verdict line, on any edge outside the measured
set, on any of the lane's edges surviving, and on any additional failing metric (the summary must
say exactly 1 metric while edges remain, and the command must exit 0 when none remain). G-RATCHET
only ever deletes rows from `crossFeatureEdges` (checked by the numstat test); the other metrics in
the baseline file are byte-identical.

## Final acceptance (after L14, and L15 if the owner keeps it in scope)

`npm run check:architecture` exit 0 and `npm run check:boundaries` exit 0 on the integrated tip, plus
`npm run typecheck`, `npm run typecheck:tests`, `npm run test:ci` followed by
`npm run check:test-baseline` (both exit 0 — the runner's own status, not `|| true`).
