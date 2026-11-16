# Import cycles — index (hard item #6), 2026-11-16, revision 2

Status: **COMPLETE** (design only; no source change). Revision 2 answers `CODEX-JUDGE.md`. Branch `plan/import-cycle-design-2026-11-16`.
Measured on Tovu `integ/wave-b-r2` @ `65302ee5` and Jini `integ/wave-b-r2` @ `02edbb68`.

## Judge tally

| Findings | Accepted | Accepted in part | Rejected | Blockers left |
|---|---|---|---|---|
| 10 (1 blocker, 6 major, 3 minor) | 9 | 1 (finding 7: two sub-claims do not hold, see DESIGN "Judge response") | 0 | **0** |

Three findings turned out wider than reported: S2 has 6 test importers (judge: 4), B2 has one more consumer (a dev eval harness), S3b/S4 touch 16 fixtures.

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | Measurement, the five cut edges and their fixes, target layering + rule + node check, migration order with size table, Jini module cycles, owner-practice check, unverified items, owner decisions, **Judge response**. |
| `CODEX-JUDGE.md` | The review this revision answers. |
| `EDGES.tsv` | 286 rows: every feature → feature edge (127 runtime, 114 type-only), 4 shell edges, 18 Jini module-cycle edges, **23 Jini imports the compiler keeps without a value use** (new). Columns: scope, from, to, kind, in_scc24, imports, importing_files, imported_names, sites, fix_kind, step. |
| `scripts/edges.mjs` | Import-edge extractor, **rewritten**: file list from the build tsconfig(s); runtime = the statement survives real compiler emission with that project's options. |
| `scripts/graph.mjs`, `scripts/graph-lib.mjs` | SCCs, exact minimum feedback arc set, cut verification, ranks, per-step counts. |
| `scripts/jini-pkgs.mjs` | Jini package graph, now from the emission dump. |
| `scripts/importers.mjs` (new) | Who imports which names from a file, tests included. Source of every consumer table in the design. |
| `scripts/fn-sizes.mjs` (new) | Code lines and complexity per function, as the repo's ESLint size rules count them. |
| `scripts/check-feature-ranks.mjs` (new) | Node check: every production feature folder has a rank, and the table has no stale entry. Has `--self-test`. |
| `scripts/feature-ranks.json`, `scripts/dc-rank-prototype.mjs` | The rank table and the rule prototype (the edge rule for unranked features is removed). |
| `scripts/jini-dc-prototype.mjs` (new) | The J4 cycle gate for Jini, run and confirmed. |
| `scripts/gen-edges-tsv.mjs` | Builds `EDGES.tsv` from the two dumps. |

## Numbers (changed ones marked)

| Item | Value |
|---|---|
| Runtime feature cycle | 1 cycle, 24 features, 64 internal runtime edges (unchanged under real emission, `tsc` program and single-file) |
| Tovu production files | **2,132** (was 2,133: the build tsconfig excludes one file); 8,615 edges, 6,355 runtime: unchanged |
| File-level runtime cycles in the website | 0 |
| Mutual feature pairs | 3 runtime (17 with type-only edges; the survey's 21 does not reproduce) |
| Minimum edges to cut | 5 feature edges = 11 import statements in **7 files** (was "8 files") |
| Cycle size per step | 24 → 7 → 5 → 3+2 → 2 → 0 |
| S-series commits | **9** (was "8") |
| Rule | `FEATURE_RANK` (68 features, ranks 0–8), one dependency-cruiser rule per rank (exactly the 11 statements), **plus a node check** for unranked folders (5 fixture cases; 68 folders, 0 problems on the real tree) |
| Second cycle (through `server/` and `assistant/`) | 8 units, 4 features caught; B1 reuses an existing host port, B2 moves one file with **18 files to repoint** (was "9 production files") |
| Upward type-only feature edges | 37 edges, 56 import statements (lane T, optional) |
| Jini production files | **3,632** in 40 build projects + 1 extra (was 3,735 from a directory walk) |
| Jini runtime statements the old rule missed | **23** (12 kept as `import {}`, 11 unused value imports); none in a cycle |
| Jini cycles | 3 runtime module cycles (6, 4, 2 files): unchanged; **82** runtime package edges (was 83), 0 package cycles |
| J4 gate | run: 9 rows = the three cycles; needs `tsPreCompilationDeps: false` **and** the tsconfig |

## Steps

**Now:** S0 (rule at `warn` + node check) → S1 → S2 → S3a. Cycle 24 → 5. No composition file touched.
**After size designs 01/02, or with owner decision 9:** S3b → S4 → S5a → S5b → S6 (rule at `error`).
Then B1–B3 (shell cycle), J1–J4 (Jini; J2 after untangle R8 and size design 10, J3 after untangle R1), T (type-only, optional).
Tables with files, fixtures, tests and counts: DESIGN §4. Size effect per step: DESIGN §4.1.

## Estimate

| Part | Revision 2 | Revision 1 |
|---|---|---|
| S0–S3a | about half a day | – |
| S3b–S6 | about 1.5 working days + Opus review of S3b, S4, S5b | S0–S6 together: 1.5–2 days |
| B1–B3 | 2 h + 2 h + 3 h | 3 h + 1 h + 3 h |
| J1–J4 | 2 h + 2.5 h + 1 h + 1 h | 2 h + 2 h + 1 h + 1 h |
| Tokens (S+B+J) | about 2.0M Sonnet, 0.3M Opus | 1.5M, 0.2M |

## Design-brief lessons — where each is handled

The brief says 21 rules. `size-designs/LESSONS-FOR-DESIGN-BRIEFS.md` on `plan/size-designs-2026-11-16` @ `b62acb7e` has 11, and no other plan branch has the file. The table covers those 11 and the 2 recurring classes from `CODEX-JUDGE.md`.

| # | Lesson | Where |
|---|---|---|
| 1 | Partition by the real dependency graph | Import graph from compiler emission (§1.1). J1/J2 leaf contents to be confirmed by the compiler, stated as not verified. |
| 2 | Inventory every declaration, export, consumer (tools, mock factories, source-reading tests) | `importers.mjs` over a dump with tests: S2 (9 importers), S3a (3), S3b (16 fixtures + 2 binder tests), S4 (16 fixtures + 2 pinned tests), S5 (22 input sites + 4 fixtures), J2 (10 + 4), B2 (18 files incl. 2 path mocks, desktop, eval harness). Not enumerated, stated: B1 and B3 fixtures. |
| 3 | Late-bound reads | §2.3 table of where each value is created in both roots; getters for the write port; §2.4 `get source()` and the TDZ warning; a test that binding reads nothing. |
| 4 | Inputs, outputs, init point, owner of state per slice | Port shapes and hop table in §2.5; cache instance in §2.4; `startup-secrets` single module instance in B2. |
| 5 | Migration graph: each commit with prerequisites and caller/test updates | §4 table and prerequisite paragraph; J2's two commits each list their consumers. |
| 6 | Characterization tests that can fail | S5a: 6 assertions incl. preview = commit files and preview makes no credential/provider call. S4: existing identity/order/load-count assertions kept. B2: mock-path tests must be seen red with a wrong path. |
| 7 | Keep optional values, fallbacks, errors distinct | S4 moves the six lines verbatim, so "no ingredients = no-op" and "rejected load propagates" stay one contract; S5 typed collision result vs thrown error. |
| 8 | Owner limits inside each file | §4.1: measured per function; what stays over the limit is named, not claimed fixed. |
| 9 | Generic vs host binding; existing owner first | S2 keeps the host-owned scope in Tovu `platform/secrets`; B1 reuses `RouteDeps.notifyRosterChanged`; S4 reuses the Jini operation type. |
| 10 | Untangle lanes are prerequisites; path-keyed debt | J2 after R8 and size design 10, J3 after R1, S3b/S4/S5b after size designs 01/02; `vitest.config.ts:53` in J1; module-mock paths in B2. |
| 11 | Verify real commands | Real: `check:boundaries` body (exit 16 today), rank prototype (exit 11), J4 prototype (9 rows), node check. Not run: `npm ci`, `tsc --noEmit`, `check:size`, tests (§8). |
| J-a | Runtime classification depends on compiler settings | `edges.mjs` uses emission per project; settings table in §1.1; Tovu rule's type filter is tied to the absence of `verbatimModuleSyntax` (§3.2); J1/J3 require statement-level `import type`; J4 config proven on empty and unused imports. |
| J-b | Layer-registration invariants need node checks | `check-feature-ranks.mjs` compares folders with the table in both directions (§3.2). |

## Open for the owner

Ten decisions in DESIGN §9. The ones that block execution:
1. Barrels vs `no-deep-imports` (owner practice 5 conflicts with the existing rule family).
2. The boundaries gate already exits 16 on this commit, so S6 needs those rows settled or its own CI step.
9. **(new) Size limits:** S3b/S4/S5b add 7 lines to each composition root (shrink-only ratchet) and 3 lines to `server/routes/types.ts` (518 code lines, limit 500). Wait for size designs 01/02 and decide the `types.ts` +3, or approve baseline raises. Three feature functions stay over 80 lines with no design covering them.
10. **(new)** `NotifyToolAccessChanged` takes one optional object, not `(required, optional = {})`; B1 reuses it unchanged.
