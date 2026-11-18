# import-cycle-b — run report (2026-11-18)

Branch `refactor/import-cycle-b` in Tovu and Jini, from `origin/refactor/terra` (Tovu `ada11733f`, Jini `4c1892368`). No PR. No force-push. No subagents.
Design: `plan/import-cycle-design-2026-11-16` DESIGN.md rev 2, `plan/reconcile-2026-11-16` AMENDMENTS-A A7 and SEQUENCE H1/H2.

Status: **PARTIAL by the stop rule, but every assigned step is done.** `check:architecture` still exits 1 on the 120-edge blocker (not covered by the design). `check:boundaries` exits 15 = base (15 `no-deep-imports` errors, 0 `feature-rank`).

## Commits

Tovu (pushed to `origin/refactor/import-cycle-b`; last pushed SHA `074979b78`; `6b6af4397` is committed locally and pushed with this report):
| SHA | Step |
|---|---|
| `b7ec2c7a1` | merge `integ/ratchets-arch-2026-11-17` (one --no-ff, clean). It already holds **S5**: the packager port owned by `source-control` (`5ef062bf`), see below |
| `262db5244` | S3a-types: `CredentialsDeps` moved to `server/routes/route-deps/credentials-deps.ts`; importer repointed; 3 doc comments repointed; stale `types.ts` max-lines debt row deleted |
| `ef5c95eca` | fix of merge fallout: two terra characterization fixtures built `CommitSiteInput` without `packager` (typecheck:tests red, 10 tests red) |
| `a9965c88e` | S3b: write port moved to `source-control/write-port.ts`, injected; 15 fixtures; binder tests moved + late-read pin |
| `1f0086e76`, `3dfac1023` | S4: `PublishCompatibilityPort` (custom-credentials) / `bindPublishCompatibility` (deployments, no import back); 15 fixtures; host-operations pins kept; 3 new pins; type pin |
| `074979b78` | S5a (the one missing characterization: preview = commit files, preview resolves no credential, no adapter) + S6 (`feature-rank:*` → `error`) |
| `6b6af4397` | keeps three why-comment blocks with the moved code |

Jini (pushed, `origin/refactor/import-cycle-b`): `03c3529bc` J2 commit 1 (leaf `agent-executor/mcp-json-file.ts`), `0ad345d30` debt list emptied (R14 demanded it), `f2e432b91` J2 commit 2 (two `export … from` lines deleted, consumers repointed).

## What S5 was
ratchets-arch (`5ef062bf`, `db03e7e8`) already did DESIGN §2.5 S5b (packager on `CommitSiteInput`, `RouteDeps.staticSitePackager`, `site-backup/static-site-packager.ts`) plus `bindStaticSiteContext`. I did not redo it. Its tests cover S5a assertions 1-4 and 6; assertion 5 (preview and commit send the same files) was missing and is now `source-control/__tests__/commit-site.preview-parity.unit.test.ts`.

## Cycle numbers (design scripts, program emit, HEAD)
Features-only runtime: 53 nodes, 122 edges, **0 mutual pairs, 0 SCCs** (design target 122 edges). Type-incl: still 1 SCC of 25 (lane T). Unit-level runtime cycles left: `assistant <-> features/external-mcp` and `server/inbound <-> server/runtime` (B lanes, not in this run). File-level runtime SCCs: 0.
check:architecture module cycles 3 → **1** pair, largest SCC 22 → **2**.

## Gates (exact command → result)
| Command (Tovu root, Node 24, Jini linked from `../Jini/packages` on its `refactor/terra` build) | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | 0 errors |
| `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit` | 0 errors (2 errors on the merged base, fixed in `ef5c95eca`) |
| `npm run check:boundaries` | exit 15, 15 errors: the base's 15 `no-deep-imports`. 0 `feature-rank` rows (8 on terra base before the series; rule is now an error). Diff vs base: only removals, plus one moved line (`credentials-deps.ts → settings/tool-registrations.ts`, was `types.ts → …`) |
| `npm run check:architecture` | exit 1, **120 NEW cross-feature edges = same count as the merged base (120)**; API surface 821 (= baseline); module cycles 1 (baseline 3); SCC 2. Line diff vs base: one edge gone (`custom-credentials/credential-ports.ts → source-control/provider-registry.ts`), one edge new (`source-control/write-port.ts → custom-credentials/write-files-validation.ts`, from the design's "binder keeps calling `validateRepositoryTarget`"). Warn tier unchanged |
| `npm run check:size` | ok, 202 violations, 192 debt entries (193 before; the `types.ts` row deleted); no baseline raised |
| `npm run check:errors` / `check:complexity` / `check:hooks` / `check:error-rule-copies` | ok |
| `npm run check:why-comments` | 1 block left, **inherited from ratchets-arch** (`types.ts` "existing site/theme resolvers, bound for portable static packaging."); mine fixed in `6b6af4397` |
| `npm run check:jini-registry-drift` | not usable here (`apps/admin` has no `node_modules`: ENOENT tsc) |
| Tests (`node --test`, concurrency 2): custom-credentials + source-control + deployments/publish-credentials + 3 assistant fixtures + mail-credential-cards | 1017 / 1017 pass (before the last 4 new tests; those 4 pass alone) |
| `composition/__tests__` + `modules/__tests__` | 16 failing test names; the one I compared (`app-federation-reload.observability`, `charts-recharts` init) fails identically on a clean `origin/refactor/terra` worktree; the rest are Postgres/PGlite/charts names. Not compared one by one. Run was cut by its time limit, so no totals |
Jini: `npx tsc -p tsconfig.json --noEmit` (daemon) 0 errors; `vitest run` daemon (threads 1-2) 236 files / 4729 tests pass, 1 skipped; `pnpm guard` exit 0 (R14 cycles: none, debt list empty).

## Deviations from the design (honest list)
- **S4 binding returns an inferred type** and does not import `PublishCompatibilityPort`; importing it was a new cross-feature edge and a +1 API-surface file. A type pin (`extract-s8-c2p1-ports.type-pin.ts`) keeps both shapes equal.
- **S3b**: the late-read getters live in one composition helper `composition/credentials-host-ports.ts` (`bindCredentialsHostPorts({ readDeps })`), spread in both roots (+1 line each, absorbed; `check:size` stayed ok). Not the literal in each root. Also removed the now-dead `observability?` field from `CustomCredentialsToolDeps`.
- **Binder type-pin file** `extract-s8-c2p1-ports.type-pin.ts` was repointed, not split.
- J2: leaf imports `isRecord` from `./values.js` (a pure local leaf), not only `node:` built-ins; lane K must move or replace it. J2 ran before size 10 as A7.4 allows. I did not verify R8b is merged; the 4-file cycle was gone after commit 1 anyway.
- The design's S3b prerequisite (size 01/02) is **not** satisfied (`deps.ts` 3,036 lines, `app.ts` 1,002); I followed the task order and kept `check:size` green instead.

## SEQUENCE H1: which steps are done (needed for error-system E3)
At this base: step 1 (size-02 steps 1-3) and 2 (3a-3c) look done (`app.ts` 1,757 → 1,002 lines, `createInMemoryApp`) — not re-verified step by step. **Steps 3, 4, 5 NOT done: `deps.ts` is still 3,036 lines (size 01 not run), `memory-route-deps` root move not confirmed.** Step 6 (S3a-types → S3b → S4 → S5b): **done** (S5b via ratchets-arch). So **E3 must still wait for H1 steps 3-5** (size 01, size-02 steps 4-7).

## Left
1. `check:architecture` blocker: the 120 NEW cross-feature edges (`cloud-results/ratchets-arch-new-edges.txt`). The import-cycle design does not cover it; needs a per-pair decision.
2. B1-B3 (second runtime cycle), lane T, optional.
3. Re-run the composition suites in an environment with Postgres.
## Next step
Owner/coordinator: decide the 120 edges (port or re-baseline), then run size 01 (`deps.ts`) so H1 steps 4-5 close and E3 can start. Overlaps with other runs: `server/routes/types.ts`, `route-deps/credentials-deps.ts`, `composition/{deps,app}.ts`, `features/{custom-credentials,source-control,deployments}/*`, 15 fixture files, `development/scripts/size-debt.json`, `.dependency-cruiser.mjs`.
