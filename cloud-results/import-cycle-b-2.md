# import-cycle-b-2 — Tovu half of refactor/import-cycle-b re-applied onto refactor/terra (2026-11-18)

Branch `wave3/import-cycle-b-2` (Tovu only; new, from `origin/refactor/terra` b5fbf2a5e). Jini needs nothing: its half (daemon cycle) was merged by combine-2 (Jini terra 6c9effae4, used as built/linked checkout). No PR, no force-push, no subagents.
Why a redo: combine-2 skipped this half because lo-dc1-sc2b moved the commit orchestration into Jini `@jini-ai/devops/source-control`; `commit-site.ts` is now a ~150-line binding, so the old-body edits could not apply.

## Commits (original -> here)
| Here | Original | How |
|---|---|---|
| 2f6bfeed7 | 5ef062bfe (+ the `StaticSiteHostPorts` part of db03e7e82) | **Re-done.** `commit-site.ts` conflicted. Cycle `site-backup <-> source-control` removed: `packageStaticSite` and `LANDING_FILE` left the binding; `StaticSitePackagerPort` owned by source-control, `createStaticSitePackager` in site-backup (body + why-comment moved), bound on `RouteDeps`. In the new shape the binding's `layout.arrangeFiles` calls `input.packager.packageSite`; a collision throws a local `StaticSiteCollision` which `describeStageError` maps to the same sentence as before; any other throw keeps the generic sentence. `entryPath` uses `packager.entryFile`. `RouteDeps` carries `StaticSiteHostPorts` (not two new fields: `routes/types.ts` is at its size debt, +1 line failed check:size). `app.ts` conflict: the in-memory root's binding now lives in `memory-deps/route-deps/publish-export.ts` (size-02 moved it). Test fixtures: 2 characterization fixtures + `Buffer` instead of `Uint8Array` in the new port test (terra's `CommitFile.data`). |
| e921980b7 | db03e7e82 | **Re-done** (conflict in `commit-site.ts`, `app.ts`): `bindStaticSiteContext` used by `deps.ts` and by `publish-export.ts`; the original's "log a dropped packaging failure" is now in `describeStageError`'s arrange branch. why-comment "existing site/theme resolvers..." moved onto `StaticSiteHostPorts.staticSiteContext`. |
| 4f6d39b38 | 73020166c | **Re-done** (conflicts: `feedback-setup.ts`, `app.ts`, `check-architecture.baseline.json`). Same repointing; in `app.ts` only the two still-existing imports; baseline edge swaps applied by script from the original's diff (all 11 removed entries were present). Committed as a plain commit (a stash dropped the cherry-pick state, the content is the same). |
| b6bb1d223 | a6a4de78a | Applied cleanly. |
| d1f1b3310 | 262db5244 (S3a-types) | Applied cleanly. |
| b4721c642 | a9965c88e (S3b) | `app.ts` conflict: the in-memory binding `...bindCredentialsHostPorts({ readDeps: routeDeps })` goes in `publish-export.ts`; rest clean. |
| 2bb30e2df | 1f0086e76 + 3dfac1023 + 6b6af4397 (S4) | Clean picks, **squashed**: the first alone adds a cross-feature edge/API-surface file (3dfac1023 removes it), and the why-comment keeper 6b6af4397 is needed for `check:why-comments` to be green in the same commit. Its stray `sites/tovu-dev/.form-files-protected-v1` hunk was not taken (file is already tracked on terra). |
| 147d7294b | 074979b78 (S5a + S6) | Clean; fixed `CommitFile` import in the parity test (not exported by terra's `commit-site.ts`; typecheck:tests was red). |
Not taken: the ratchets-arch/import-cycle-b docs commits and `ef5c95eca` (folded into the first commit's fixtures). Nothing from the original series is dropped.

## Result vs BASE (BASE = unmodified origin/refactor/terra, same machine, Node 24, Jini linked)
| Gate (command) | BASE | Final (147d7294b) |
|---|---|---|
| `npm run typecheck` | 0 | 0 (every commit) |
| `npm run typecheck:tests` | not run on base | 0 (every commit) |
| `npm run check:architecture` | exit 1, 120 NEW edges, cycle pairs 4 (largest SCC 5), API surface 842 | exit 1 (BASE-RED, same 3 hard-constraint metrics), **116 NEW edges**, **cycle pairs 1 (SCC 2)**, API surface **812** (baseline 821, "improved"). Hub count 366 -> 370 and runtime propagation 3.24 -> 3.23 (warn tier, already regressed on base) |
| `npm run check:boundaries` | exit 15 (15 errors, 9 `feature-rank` warns) | exit 14 (14 errors, 0 `feature-rank` rows; rule now `error`) |
| `check:size` / `check:complexity` / `check:errors` / `check:hooks` | all exit 0 | all exit 0 (size: 187 debt entries vs 188) |
| `check:why-comments -- --base origin/refactor/terra` | exit 0 | exit 0, 0 blocks lost |
| `cd apps/desktop && npm run gates` | not run on base | first run 5/6 (`tests` FAIL, no failing test named in the captured output); `npm test` alone then exit 0 (2302+928 tests, 0 fail) and the gates re-run **6/6 PASS, `check-gates: OK`**. Treat the first failure as a load flake, not reproduced |
Per-commit gates: after every commit typecheck, typecheck:tests, architecture, boundaries, size, complexity, errors, hooks, why-comments were run (all as above; each commit's NEW-edge count was <= BASE's 120, cycles never higher).

**Line-level check:architecture caveat:** the NEW-edge *count* fell 120 -> 116, but 5 NEW lines are not in BASE's list (9 BASE lines are gone): `site-backup/static-site-packager.ts -> site-export/index.ts`, `site-backup/static-site-packager.ts -> source-control/index.ts`, `source-control/static-site-packager-port.ts -> site-export/index.ts` (the port design's own edges, each replaces the five `commit-site.ts -> site-backup/*` edges), `source-control/write-port.ts -> custom-credentials/write-files-validation.ts` (design: binder keeps `validateRepositoryTarget`; replaces `credential-ports.ts -> provider-registry.ts`), and `forms/form-file-maintenance.ts -> media/index.ts` (a repoint of an edge already present in BASE as `-> media/...`). I did not hide them in the baseline file.

## Tests (changed areas, final tree; node --test, concurrency 2)
source-control + custom-credentials + deployments/publish-credentials + credential-cards goldens + mail-credential-cards: 999/999 pass. Wider run of mail-status, static-publish, forms, media-*, member-login, widgets, site-backup, source-control: 2715 pass, 4 fail, all four fail identically on unmodified terra (checked the 3 non-Postgres ones on a detached b5fbf2a5e): `site-backup/import-restore` "import keeps starter radio..." (Jini admin `html-rules` `fieldKinds` undefined), `static-publish/publish-run` "registry reload failure...", `media-import/import-local-file-search` "adding the local importer...", and one Postgres-only forms test. Composition suites were not run in full (need Postgres).

## Left
Not run: `check:jini-registry-drift`, full root test suite. The first desktop-gates `tests` failure is unexplained (not reproduced). Hub-count warn rose 366 -> 370 (new port/binder files).
