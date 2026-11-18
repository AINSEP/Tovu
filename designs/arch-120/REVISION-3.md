# arch-120 — revision 3 (a rethink; answers CODEX-JUDGE-1 and CODEX-JUDGE-2, both REJECT)

Base: Tovu `origin/integ/merge-3-2026-11-18` @ `2d82735a` (the Tovu tip), Jini
`origin/integ/merge-3-2026-11-18` @ `d37821a4`. Supersedes DESIGN.md, REVISION-2.md, INDEX.md and
`sheets/`. Index: [`INDEX-v3.md`](INDEX-v3.md). Sheets: [`v3/`](v3/). Facts:
[`facts/edges.v3.tsv`](facts/edges.v3.tsv), `facts/check-architecture.v3.2d82735a.txt`,
`facts/check-boundaries.v3.2d82735a.txt`, `facts/stale-baseline.v3.2d82735a.txt`,
`facts/v3-evidence/` (the AST extractors used to *write* the sheets — review evidence, never a gate).

## 0. Why a rethink and not a third patch round

Owner rule: two review rounds with the same class of finding means the design is wrong. Both
rounds failed on the same two classes:

1. **Edges disappeared from the report without the code changing** — rev1 accepted 119 of 120 rows
   into the baseline; rev2 filtered 86 "downward" rows by rank and re-ranked 3 more (judge 2 #1).
2. **Bespoke verification that could pass on failure** — rev1's S2 helpers and `sheet-gates.sh`,
   rev2's Gate G and R1 B3 (judge 1 Major ×2, judge 2 #2).

Both are symptoms of one design choice: rev1/rev2 asked *"which reported edges are legitimate?"* and
built machinery to encode the answer. The owner's decision removes that question: **every reported
edge is removed by a real dependency change**. Once there is nothing to classify, there is nothing
to waive, rank, filter or baseline, and the only gate needed is the repo's own command plus an
exact set comparison. v3 therefore has:

- **no classification** (no OLD/MOVED/LEGITIMATE/TANGLE); one rule: a feature file never imports
  another feature — it imports `@jini-ai/*`, `contracts/core`, or receives the behaviour from
  composition;
- **five moves only** (J, D, S, I, H — INDEX-v3), each chosen per edge from facts measured on the tip;
- **no new gate machinery**: `npm run check:architecture`, `check:boundaries`, `typecheck`,
  `typecheck:tests`, `check:size`, `check:complexity`, node:test on named files; glue limited to
  `grep/sort/comm/jq`, every status checked;
- **the baseline only shrinks** (L00 deletes 124 stale rows: 426 → 302; verified on the tip).

## 1. What was measured (on the tip, with the repo's own command)

`npm run check:architecture` on `2d82735a`: exit 1; **115** `NEW cross-feature edge` lines; summary
`FAILED: 1 metric(s) regressed against a hard constraint`; API surface 806 (baseline 821), back-edges
0, cycles 2 (baseline 5), SCC 2. So the 115 edges are the **only** blocking item — judge 2 #5's
"no integration state satisfies the blocking commands" no longer holds for `check:architecture`:
the tip already passes every other hard metric (merge-3 removed 10 edges and 36 API-surface files).

Per edge, `facts/edges.v3.tsv` records the import line, import kind (55 type-only / 60 value), every
imported symbol and **where it is really declared** (re-export chains followed through the AST):
27 symbols are `@jini-ai/*` types forwarded by a sibling barrel; 179 are Tovu-local.

`npm run check:boundaries`: exit 14, 14 errors. 5 are among the 115 (L06: 1, L08: 4 incl. the
server `media-rendition.ts` one); 9 are not feature edges (L15, owner decision).

The 5 edges named in `cloud-results/combine-3-fix.md` are rows V-… of lanes L08
(`forms/form-file-maintenance.ts → media/index.ts`), L03 (`static-site-packager.ts → site-export/index.ts`,
`static-site-packager-port.ts → site-export/index.ts`), L07 (`static-site-packager.ts →
source-control/index.ts`) and L06 (`write-port.ts → custom-credentials/write-files-validation.ts`).
Combine-3's open question "where do cross-feature port types live (contracts layer vs the consuming
feature)" gets one answer applied everywhere: **a port lives with its consumer; a type two features
share lives in `contracts/core`; a type the implementer needs only to conform is not imported at all
— conformance is checked where composition assigns it.**

## 2. What changed vs rev2

| rev2 | v3 | why it converges |
|---|---|---|
| R1: rank-keyed filter removes 86 rows, 3 rank fixes remove 3 | deleted. Every one of the 115 has a sheet row with a move | nothing left for a judge to call a waiver |
| Gate G / R1 B3 / bespoke scripts | INDEX-v3 shared gate: repo commands; verdict line required; NEW set ⊆ measured 115; lane's edges ∩ NEW = ∅; exactly 1 failing metric while edges remain, exit 0 when none | order-independent, fails on producer failure, on extra metrics and on surviving edges |
| M1: route invalidators through `media/index.ts` | L08: the 38-line import-free evidence cache moves to `contracts/core` (module identity kept); also clears 4 boundary errors | no new runtime closure (judge 2 #6), no ~200-file constructor change, no silent default |
| P1: list-only port also used for invalidation | L05: on the tip invalidation is already a separate injected port (`publishCompatibility`); only the create-form enrichment is narrowed | invalidation keeps `get()` + eligibility untouched (judge 2 #4) |
| C1: remove the registry's default generic, move `TaxonomyPublishPorts` into taxonomy's private file | L14: contributors own their slice; the bag and the concrete tool-deps move to composition; engine stays generic; compile-time negative cases | the cycle is removed by construction instead of re-pointed (judge 2 #3) |
| 4 sheets covering ~31 rows + an external lane | 16 lanes (L00–L15), 115/115 rows, partition checked | small lanes, each self-verifying |
| facts on `b5fbf2a5e`/`2f6bfeed` | facts on the tip `2d82735a` | judge 1 claims-table, judge 2 #8 |

## 3. Judge findings — answer per finding

### CODEX-JUDGE-1

| finding | v3 answer |
|---|---|
| Baseline refs wrong (`f0613d9e5` vs current refs) | Re-measured on the current tip `2d82735a`; all facts carry that SHA. |
| Edge inventory reproduced on `f0613d9e5` / wrong on `b5fbf2a5e` | Inventory re-derived on the tip from the checker's own output (`facts/check-architecture.v3.2d82735a.txt`); `v3/edges/all-115.txt` is that output verbatim; lane lists partition it exactly. |
| Baseline creation commit / history | Not used. v3 does not reason from provenance; every edge is removed regardless of age. |
| Graph/S1 cycle comparison wrong | Not used; the tip's checker reports cycles 2 ≤ 5 and SCC 2; G2 fails if any metric other than edges fails. |
| Lane counts via `git diff --name-only` wrong | Lane scope is defined by edge lists, not diffs; G2 checks the lane's exact edges. |
| **Blocker: S3 cannot turn the gate green (API 842 > 821, runtime pair)** | On the tip API surface is 806 and no pair regresses; G2's final branch requires exit 0. |
| **Blocker: acceptance evidence = blanket waiver for OLD edges** | No acceptance list exists. The baseline is only pruned (L00, G-RATCHET adds 0 rows, numstat-checked). |
| Major: gate failures look successful (exit 127, SIGKILL, missing dirs) | G2 requires the `check:architecture — ` verdict line; statuses captured with `set +e … ; X=$?; set -e` and tested; no `comm` on a producer that can fail silently; per-run `mktemp -d`. |
| Major: STOPs not enforced (pipelines, BSD wc/grep/sed) | No `wc`, `grep -P`, `sed -i` in gates; `test -z "$(comm …)"` on sorted files; node:test status taken directly. |
| Major: collision/execution prerequisites, shared `/tmp` | One branch per lane off the tip; scratch is `mktemp -d`; INDEX-v3 lists parallel-safe groups; a lane rebased onto a moved tip re-runs the gate (it is order-independent). |
| Minor: Python tools exit 0 on empty input; extractor drops unresolved imports | No Python/extractor in any gate. The design-time extractor resolved 125/125 import lines (0 unresolved, checked) and is kept only as evidence. |
| Over-engineering: permanent CLI for a one-time baseline edit | Deleted. L00 is one jq key-only edit verified with `git diff --numstat`. |
| Use repo gates + dependency-cruiser graph | Done: `check:architecture` and `check:boundaries` are the gates. |

### CODEX-JUDGE-2

| # | finding | v3 answer |
|---|---|---|
| 1 | R1 waives 89 rows by filter/re-rank; E085/N083, N054–N055, N065 have no plan | R1 deleted. N054–N055 → L01 (`@jini-ai/devops/deploy`, as the judge suggested). `webhooks` Jini types → L01. E085/N083 (`import-plugin-state.ts → soon-lock.ts`) → L11: the lookup is bound in composition, restore tests kept. Every remaining path has a lane row. |
| 2 | Gate G fails open; TAP may be empty; grep matches passing subtest | G2/G3/G5 as in §2; final acceptance requires `npm run test:ci` **and** `check:test-baseline` exit 0 with the runner's own status; red runs are not used as gates. |
| 3 | C1 incomplete: registry default, repo-handler, apply-run, tool-deps keyed types, fallback `hooks`, harness/video tests, private-file deep import, positive-only assertion | L14: lists every boundary (type-registry :80/:385, apply-port :25, tool-deps :22-66, tool-registrations :440-451, repo-handler, apply-run, planner/export) and every test importer (AST inventory in the sheet); no slice moves into a private file of another feature (slices are declared by their own contributor); keyed bag preserves `redirect`, `hooks`, `active-theme`, `theme-files`; negative `@ts-expect-error` for a missing apply member **and** for an empty slice. |
| 4 | P1 list-only port breaks invalidation | Re-checked on the tip: invalidation already runs through `publishCompatibility.prepareInvalidation` (`custom-credentials/tool-registrations.ts:100,429`, bound in `deployments/publish-credentials/compatibility-port.ts` over the full registry). L05 narrows only the create-form catalog; `extract-s8-x-host-operations.test.ts:300-337` stays in G5. |
| 5 | No integration state satisfies blocking commands | Tip measured: architecture's only failing metric is the 115 edges; boundaries' 14 errors are all assigned (L06, L08, L15). Final acceptance needs both exit 0; L15 needs an owner scope decision (§4). |
| 6 | M1 public path/runtime loads/cache behaviour | L08 does not use `media/index.ts`; the cache module moves whole (one `WeakMap`), so the runtime closure only shrinks; the new characterization test drives SQLite and memory repos built by **both** composition roots, including a pending scan. |
| 7 | P1 canonical Jini types, `DeclaredApiConnection` consumers, `SharedOAuthOwnerStorage` narrowing, `PostRecord` preview | `ApiConnectionConnectStatus`/`ExternalMcpConnectStart` → L01 Jini-direct. `DeclaredApiConnection` → L11 moves once to `contracts/core`, all four consumers + tests repointed. `SharedOAuthOwnerStorage` stays full; only the disconnect input is narrowed (L05). `PostRecord` preview → one local shape (L10). |
| 8 | Dispatch order, `$RUN` before Setup, missing refs, S3b overlap | INDEX-v3: setup first, single pinned base (tip SHAs above); S3b's port already landed on the tip (§ judge 2 #4), so no replay and no overlap; `ExportReport`/packager rows re-derived on the tip. |

## 4. Owner decisions needed

1. **L15 scope** — 9 `check:boundaries` errors that are not `features → features` edges (server /
   assistant / platform deep imports). Fix plan is in the sheet; say whether arch-120 owns them.
2. **`contracts/core` holding a stateful helper (L08)** — the evidence cache is a module-level
   `WeakMap`. Precedent: `contracts/core/operation-lock.ts`. If contracts must stay declaration-only,
   the alternative is I with a required repo callback (~200 constructor sites; INDEX estimate ×3).
3. **L14 home of the product publish bag** — v3 puts it in `server/runtime/composition/` (wiring).
   Confirm, since it moves ~150 lines of types out of the feature.

## 5. Risks

- L14 is the largest lane (17 edges, ~110k tokens). It is last and depends on L01/L08/L13 so its own
  diff is only the bag move.
- A lane can add an edge elsewhere (e.g. a moved type pulling an import into contracts): G2's
  "NEW ⊆ all-115" and the contracts rule in `check:boundaries` catch it.
- Line numbers in sheets are at `2d82735a`; the AST inventories are regenerable with
  `facts/v3-evidence/` if the tip moves.
