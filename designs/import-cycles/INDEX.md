# Import cycles — index (hard item #6), 2026-11-16

Status: **COMPLETE** (design only; no source change). Branch `plan/import-cycle-design-2026-11-16`.
Measured on Tovu `integ/wave-b-r2` @ `65302ee5` and Jini `integ/wave-b-r2` @ `02edbb68`.

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | Measurement, the five cut edges and their fixes, target layering + exact dependency-cruiser rule, migration order, Jini module cycles, owner-practice check, unverified items, owner decisions. |
| `EDGES.tsv` | 263 rows: every feature → feature edge (127 runtime, 114 type-only), 4 shell edges, 18 Jini module-cycle edges. Columns: scope, from, to, kind, in_scc24, imports, importing_files, imported_names, sites, fix_kind, step. |
| `scripts/edges.mjs` | Import-edge extractor (TypeScript compiler API; runtime / erased / type; dynamic flag). |
| `scripts/graph.mjs` | SCCs, exact minimum feedback arc set, cut verification, ranks, per-step counts, file closures. |
| `scripts/jini-pkgs.mjs`, `scripts/graph-lib.mjs` | Jini package-level graph. |
| `scripts/feature-ranks.json`, `scripts/dc-rank-prototype.mjs` | The rank table and the dependency-cruiser rule prototype (run result in DESIGN §3.3). |
| `scripts/gen-edges-tsv.mjs` | Builds `EDGES.tsv` from the two edge dumps. |

## Numbers

| Item | Value |
|---|---|
| Runtime feature cycle | 1 cycle, 24 features, 64 internal runtime edges |
| File-level runtime cycles in the website | 0 (two tools agree) |
| Mutual feature pairs | 3 runtime (17 with type-only edges; the survey's 21 does not reproduce) |
| Minimum edges to cut | 5 feature edges = 11 import statements in 8 files (exact, dynamic programming over 2^24 orderings) |
| Cycle size per step | 24 → 7 → 5 → 3+2 → 2 → 0 |
| Fix kinds | 1 repoint to Jini, 1 pure move down, 1 repoint + binding moved to owner, 2 host-bound ports |
| Rule | `FEATURE_RANK` (68 features, ranks 0–8) + one generated dependency-cruiser rule per rank; prototype reports exactly the 11 statements |
| Second cycle (through `server/` and `assistant/`) | 8 units, 4 features caught; 2 edges free the features (lanes B1, B2) |
| Upward type-only feature edges | 37 edges, 56 import statements (lane T, optional) |
| Jini | 3 runtime module cycles (agent-runtime 6 files, daemon 4, admin 2); 0 package cycles |

## Steps

S0 rule at `warn` → S1 → S2 → S3a → S3b → S4 → S5a → S5b → S6 rule at `error`. Then B1–B3 (shell cycle), J1–J4 (Jini), T (type-only, optional). Table with files, tests and counts: DESIGN §4. Estimate: DESIGN §7.

## Design-brief lessons (the 11 in `size-designs/LESSONS-FOR-DESIGN-BRIEFS.md`) — where each is handled

| # | Lesson | Where |
|---|---|---|
| 1 | Partition by the real dependency graph | Parsed import graph with runtime / type / dynamic kinds; no line-range or name-based split (§1.1). J1/J2 leaf contents to be confirmed by the compiler, stated as not verified. |
| 2 | Inventory every edge and consumer | `EDGES.tsv` lists all 241 feature edges; each cut lists its importers and test-file counts (§2, §4). Builders of `CommitSiteDeps` and some `routeDeps` reads are named as not enumerated (§8). |
| 3 | Late-bound reads | S3b late-read rule (§2.3); J1 and J2 module-scope maps (§5). |
| 4 | Inputs, outputs, owner of state per slice | Port shapes and bindings in §2.4, §2.5; the cache instance rule in §2.4. |
| 5 | Each commit green alone with its caller/test updates | §4 table, one refactor kind per commit. |
| 6 | Characterization tests that can fail | S5a (exact file list, hashes, messages), S4 binding test (exact `cache.delete` arguments, load order), S2 unit test. |
| 7 | Keep optional values, fallbacks, errors distinct | §2.4 (absent port = no-op, rejection propagates), §2.5 (typed collision result vs thrown error). |
| 8 | Owner limits inside target files | §6 row 3 (file sizes measured; function-level limits not measured, stated). |
| 9 | Generic vs host binding | S2 keeps the host-owned vault scope in Tovu `platform/secrets`; nothing generic added to Tovu (§6 row 7). |
| 10 | Untangle lanes are prerequisites; path-keyed debt | J2 after R8, J3 after R1, S3b/S4/S5b serial with size designs 01/02; `vitest.config.ts:53` in J1. |
| 11 | Verify real commands | `check:boundaries` body run (exit 16 today), prototype rule run (exit 11); `npm ci`, `tsc` and tests not run (§8). |

The brief mentions 15 rules; the file has 11.

## Open for the owner

Eight decisions in DESIGN §9. The two that block execution: (1) barrels vs `no-deep-imports` (owner practice 5 conflicts with the existing rule family), (2) the boundaries gate already exits 16 on this commit, so S6 needs either those rows settled or its own CI step.
