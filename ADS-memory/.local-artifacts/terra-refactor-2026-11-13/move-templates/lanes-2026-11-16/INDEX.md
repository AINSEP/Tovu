# Lanes S (database code) and U (users): plan index — 2026-11-16/17, planning only, nothing executed

Status: **PARTIAL, revision 2 (2026-11-17): every sheet is on HOLD** (banner at the top of each; context budget reached again). All 16 judge findings were verified against code and accepted; none is fixed in a sheet body yet. See "Revision 2 - judge response" at the end.
Round-1 status: PARTIAL (context budget reached). Written: 12 hand sheets + 11 generated facts files + 1 template.
Remaining work is numbered in "Not written".

Code read from Tovu `origin/integ/merge-b-2026-11-16` @ `491632dc5` (it exists, so it replaced `refactor/terra`; all seven
`moves/*` branches are merged into it) and Jini `origin/refactor/terra` @ `02edbb68`. Jini has no `integ/merge-b` branch;
its eight `moves/*` branches (3-23 commits ahead) were NOT read: re-take every Jini guard on the Jini integration branch.

## 1. Verified size now (production lines, tests excluded; `inventory.tsv`)
| Lane | 11-05 figure | Verified now | Files | Test files importing them |
|---|---|---|---|---|
| S | ~7k | **9,705** | 78 | S1 18, S2 27, S3 19, S4 40, S5 12, S6 40, S7 27, S8 53 (overlapping) |
| U | ~5.5k | **5,320** | 22 | members 55 + 16, API keys 7 |
The layout changed since 11-05: the SQL code is now `features/<domain>/repo*.ts` and `platform/db/repos/*.ts`, not `server/db/*`.
Scope was re-derived by role (Kysely repos, their bindings, the named contracts files), listed per file in `inventory.tsv`.

## 2. Already covered vs new (`coverage.tsv`: one row per file, with CLASSIFY label, audit row, sheet/design mentions)
| | Lines | What |
|---|---|---|
| S, existing executable sheet | 676 | `move-workspace.md` (workspace repo, 116), `move-entry-refs.md` (entry-refs contracts, 560) — plan/w1-sheets-d. Neither is executed yet. |
| S, existing blocked note | 286 | `move-events.md` (5 `contracts/core/events` outbox files) — waits on OD-6 |
| U, existing executable sheet | 1,814 | audit2 A07 `split-a07-members-server-domain.md` (6 members files, 1,785); `delete-site-guide.gen.md` (capability-card, 29) |
| Done on moves/* | 0 of these files | adjacent only: admin Members/Users ports, `InMemoryChangeSetRepo` repoint, stopped-database, postgres db-ops |
| S, new sheets here | 7,222 | S1-S8 below |
| U, new sheets here | 2,695 | U1, U2a, U2b, U3 |
| S/U, no executable sheet (planned-not-written, STAY, or another lane's) | 2,332 | see "Not written"; includes `trash/ports.ts` 61 and `origin/configured-origin.ts` 82 (STAY) |
Recount from `coverage.tsv` (judge finding 16; round 1 said 69/31): **60 of the 100 files have a CLASSIFY label, 40 have none; 51 labelled files have no sheet or design mention** (`awk -F'\t' 'NR>1{l=($4==""||$4=="-")?"unlabelled":"labelled"; m=($6==""||$6=="-")?"nomention":"mention"; c[l" "m]++} END{for(k in c) print c[k], k}' coverage.tsv`). Unlabelled files include `identity/repo.ts` 710, `members/repo.ts` 604, `settings/repo.ts` 426.

## 3. Sheets (assemble: `cat T-SQLREPO.md <sheet>.md <sheet>.facts.md ../COMMON.md`)
| Run | Sheet | Lines | Target | Est. tokens (one Sonnet run) | Needs |
|---|---|---|---|---|---|
| S0 | `S/S0-pins.md` | tests only | Tovu | 110k | — (gate for everything) |
| — | `move-workspace.md` (existing) | 116 | cms/workspace/sql | ~80k | C3 landed |
| S1a / S1b / S1c | `S/S1-…-sql.md` | 680 / 355 / 95 | cms taxonomy / navigation / presentation `/sql` | 200k / 150k / 80k | S0, move-workspace, R9 |
| S2a / S2b | `S/S2-…-sql.md` | 194 / 351 | cms content-types / entries `/sql` | 90k / 190k | S0, OD-5, serial with A08 |
| S3a / S3b | `S/S3-identity-sql.md` | 794 / 224 | user-management/server/sql | 210k / 150k | S0, P-DEP, R3 |
| S4a / S4b | `S/S4-trash-sql.md` | 494 / 874 | cms/trash/sql | 170k / 230k | S0, R9 |
| S5a / S5b / S5c | `S/S5-…-sql.md` | 441 / 143 / 277 | db settings / gated-mutations / verified-origin | 170k / 90k / 130k | S0, OD-1, R11 |
| S6a / S6b / S6c | `S/S6-…-sql.md` | 368 / 420 / 290 | db/events; integrations/webhooks/sql; cms/forms/sql | 200k / 190k / 170k | S0, OD-1, OD-6, P-DEP (S6b) |
| S7a / S7b | `S/S7-media-sql.md` | 232 / 765 | cms/media, cms/media/sql | 110k / 240k | S0, OD-5, serial with A08 |
| S8a / S8b | `S/S8-….md` | 141 / 84 | cms/widgets/sql; cms/widgets/markers | 110k / 60k | move-entry-refs |
| U1a / U1b | `U/U1-members-sql.md` | 974 | user-management/members/sql | 210k / 180k | A07, S3a, S4b, P-DEP, OD-3 |
| U2a / U2b | `U/U2-members-auth-domain.md` | 403 / 441 | user-management/members, platform/mail | 120k / 200k | A07, U1 |
| U3a / U3b | `U/U3-api-keys.md` | 877 (102 of it STAY) + repo 64 | user-management core + server/api-keys + server/sql | 190k / 200k | S3a, OD-4 |
**Total: 26 runs, about 4.15M Sonnet tokens** (S 3.05M in 20 runs, U 1.1M in 6), every run sized under 250k. Not included:
the batched cloud verification runs (one per wave), and the unwritten items below (~0.9M Sonnet + one ~250k Opus design).
Estimates use PLAN.md's rate (30k + 25 tokens/line) plus the measured test-repoint load; none is measured.

## 4. Order and prerequisites
Outside this lane, first: C3 storage contract (landed in Jini 02edbb68), untangle R3 (user-management), R9 (cms), R11 (db,
integrations), R-BARRELS for the Tovu feature barrels; audit2 sheets A07 (before U1/U2) and A08 (serial with S2b, S7);
existing `move-workspace`, `move-entry-refs`; coordinator step **P-DEP** (OD-2). Hard designs that may edit the same files and
therefore run BEFORE the sheet that moves them: lost-updates (`identity/repo.ts`, `members/repo.ts`, `settings/repo.ts`,
`entries/repo.ts`), error-system (`jini-outbox-adapter.ts`, members write-service/types/tool-registrations), env-schema
(settings defaults), publish-engine (outbox/change-set callers).
1. S0, alone. Cloud run: green, and every listed mutation red.
2. move-workspace (calibrates T-SQLREPO). If it does not land clean, fix the template before any fan-out.
3. Three package chains, parallel with each other, serial inside (each run adds an export to the SAME `package.json`, and
   an export entry must build in the commit that introduces it):
   - cms: S1a -> S1b -> S1c -> S2a -> S2b -> S4a -> S4b -> S7a -> S7b -> S8a -> S8b -> S6c
   - db: S5a -> S5b -> S5c -> S6a
   - user-management: S3a -> S3b -> U3a -> U3b -> U1a -> U1b -> U2a -> U2b   (U1 also waits for S4b on the cms chain)
   - integrations: S6b (alone)
4. Tovu-side file-disjointness: sheets in different chains touch disjoint Tovu source files EXCEPT three hot files, which are
   text-guarded (OLD text must occur once) and never edited by two running jobs: `features/identity/wiring.ts`
   (S3a, S3b, U3a, U3b), `server/runtime/composition/deps.ts` (S3b, and any binding repoint), and
   `development/scripts/write-path-inventory.baseline.json` (every sheet with a baseline row: the coordinator applies the
   baseline edits of parallel sheets in one commit per wave).

## 5. Owner decisions
| # | Decision | Recommendation |
|---|---|---|
| OD-1 | Where the SQL adapter of a port declared in `@jini-ai/core` lives (settings, gated-mutation tokens, verified origin, change sets, outbox) | `@jini-ai/db/<name>`, beside `db/secrets-vault/repo.sql.ts`. Domain ports keep `<pkg>/<domain>/sql`. Overrides CLASSIFY's `http-kit/verified-origin` and `cms/core/sql`. |
| OD-2 (P-DEP) | `kysely` as a declared optional peer of `@jini-ai/user-management` and `@jini-ai/integrations` (coordinator adds it + lockfile) | YES; without it S3, U1, U3a, S6b cannot run (new-dependency STOP rule) |
| OD-3 | Members SQL repos move to `user-management/members/sql` (A07 listed them as staying) | YES, after A07 |
| OD-4 | API keys enter `@jini-ai/user-management` (the library documents them as out of scope); scheme prefix stays a Tovu value | YES; stored hash format frozen, no migration needed |
| OD-5 | How a Jini SQL adapter gets dialect helpers (`jsonScalarEquals`, `jsonSortKey`, `listColumns`, `tableExists`) | inject as a small port per package (option C stays clean). Alternative: allow `*/sql` subpaths to import `@jini-ai/db/kernel` (one such import already exists in `cms/forms/sql`) |
| OD-6 | One outbox port shape (core contract) or two — already posed in `move-events.md` | (a) core-contract shape; unblocks S6a, S8c and move-events |
| OD-7 | Delete `members/consent-service.ts` (labelled DELETE; a privacy record writer) | only after a reachability proof; else keep |

## 6. Lock keys carried by these lanes (S0-P1 pins each; found by `rg "lockKey\("`, 23 call sites)
`identity:<ws>` · `taxonomy:<ws>` (2) · `workspace:roster` · `setting_revisions` · `origin_settings:<ws>` ·
`gated_mutation_tokens:<token>` · `outbox_events:claim` (2) · `webhook_deliveries:claim` (2) ·
`["form-delivery-plan",ws,submission]` · `["form-receiver-pull",ws,receiver]` · `asset_blobs:<ws>:<sha>` · `slugLockKey(ws)` (5) ·
`trash:<entityType>:<ws>:<id>` (table adapter) = `trash:member:<ws>:<id>` (members repo x2, password-auth) ·
`trash:user:<ws>:<principal>` (trash user adapter) · trash `SWEEP_LOCK_KEY` · `members:magic-tokens:<ws>`.
Also seen, out of scope: `secrets_vault:<ws>`, `footer_page_links_2026_10_04`, entries repair `LOCK_KEY`.

## 7. Not written (numbered; the PARTIAL list)
1. **S4c** trash adapters for other domains (9 files, 882 lines): each needs its domain's port read.
2. **S2c** `entries/trash-aware-memory-repo.ts` (209): behaviour diff against the Jini memory repo first.
3. **S8c** `memory-bus.ts` (161): blocked on OD-6.
4. **U2c** `members/write-service.ts` (677): needs an Opus design (dependency graph, challenge-store state owner, origin gates).
5. **U3c** grant-clamp dedupe (Tovu's re-implementation vs Jini's unexported one): behaviour diff, then one small sheet.
6. Identity files outside the SQL/API-key scope with labels but no sheet: audit row A26 (`repo.memory.ts` 42,
   `user-purge-types.ts` 84, `tool-registrations.ts`, `owner-reset-env.ts`) and CLASSIFY row 55 (`builtin-role-grants`,
   `delete-user-service`, `permission-grants`, `permission-list-tool`, `wiring`). Not planned here.
7. `features/members/index.ts` (134-line barrel, 60 importers): R-BARRELS owns it.
8. Exact `wiring` texts (old -> new lines) and `table_types` column lists: the sheets name the source and the shape;
   the executor copies them from the tree at execution. A stricter pass would paste them (about 15k tokens per sheet).

## 8. What was verified, and what was not
Verified against the code: every line count, blob, importer list, table name, lock-key call site, exported name and
baseline hit in the facts files (generated by `scripts/`; import graph over 8,156 files, relative and `#src/` specifiers).
Verified by reading: `authenticateApiKey` and the API-key file headers; `createIdentityTransactions`; `mfa.repo.ts`;
taxonomy repo header and its sqlite binding; the Jini `comments/sql` precedent; the `StorageKernel` contract; Jini export maps
and which packages declare `kysely`; that no Jini class name collides with a moved name.
NOT verified: the bodies of the other repos (each sheet lists this); method-by-method compatibility between each Jini port
and its Tovu class (made a guarded step 0, not a claim); per-function size/complexity inside the proposed Jini files;
dynamic `import()`/string-built paths and non-TS consumers beyond the four baseline JSON files; tests importing through
barrels (counted against the barrel, not the repo); nothing was compiled or run. The generator's "npm imports" column has
regex false positives from comments (noted in S4). The sandbox clock was unreliable, so no wall-clock figures are given.

## Revision 2 - prerequisites aligned with the revised xpkg sheets (`plan/xpkg-lane-sheets-2026-11-16`, revision 2)
- Base: the same paired state as xpkg COMMON (both repos contain merge-a **and** merge-b; Tovu merge-b alone does not typecheck against Jini merge-a). Round 1 read Tovu merge-b and Jini `refactor/terra`: every guard and facts file must be regenerated on the pair.
- Names: xpkg `R11` is now `R11a`, `R11b-1..3`, `R11c`. S5's "R11 (db)" has no remaining edge (nothing to wait for); S6b waits for `R11b-3` (integrations); S6c waits for `R6-R9`; user-management sheets wait for `C9c` + `R3b` (xpkg R3a was deleted: option C keeps `@jini-ai/ui-kit/react`).
- Rule: a Jini package imports only itself + core + protocol. xpkg `R6-R9` §2 removes the one existing `cms/forms/sql → @jini-ai/db/kernel` import by injecting a `ColumnCatalogPort`, so **OD-5 here has one answer left: inject the dialect helpers as a small port per package**; the alternative ("allow `*/sql` subpaths to import `@jini-ai/db/kernel`") contradicts the owner rule and is withdrawn.
- Node bindings: any S/U adapter that needs a Node fs/lock/process binding takes the port and the host passes `@jini-ai/node-adapters` (xpkg N1, owner decision of 2026-11-16); nothing moves to the server preset.
- Decision ids: this file's OD-1..OD-7 are local to lanes S/U (its OD-3 is the members-SQL destination, not the xpkg OD-3 about `@jini-ai/node-adapters`).
- No coordinator-applied edits: `write-path-inventory.baseline.json` rows and the P-DEP `kysely` peer + lockfile belong to the commit that needs them, serialized by chain order (to be written into T-SQLREPO; finding 13).

## Revision 2 - judge response
Verified on Tovu merge-a `e801e9ae` (paths under `apps/website/src/`) and Jini merge-a `dde69a6d` + merge-b `9c982fd9`. **16 accepted, 0 rebutted. Fixed in this revision: 16 (counts) and the prerequisite names; the other 15 are accepted and put on HOLD by banner, redesign not written (PARTIAL items R2-1..R2-15 below).**

| # | Severity | Verdict | What changed (file) | Evidence |
|---|---|---|---|---|
| 1 | Blocker | ACCEPT, not yet redesigned | HOLD banner `S/S2`; PARTIAL R2-1 | `features/media/access-evidence.ts:35` takes `{ owner: object }`; `features/entries/repo.ts:129-130,223` invalidate in `finally` |
| 2 | Blocker | ACCEPT, not yet redesigned | HOLD banner `U/U2`; R2-2 (same work as round-1 item 4, U2c) | `features/members/password-auth.ts:7-9` imports 5 helpers from `./write-service.js` |
| 3 | Blocker | ACCEPT, not yet redesigned | HOLD banner `U/U2`; R2-3 | `features/members/access-resolver.ts:16` imports `node:crypto` |
| 4 | Blocker | ACCEPT, not yet redesigned | HOLD banner `S/S4`; R2-4 | `features/trash/registry.ts:164` `buildTrashRegistry(): TrashRegistry` (no input) |
| 5 | Major | ACCEPT, not yet redesigned | HOLD banner `U/U1`; R2-5 | judge's lines; not re-read beyond the banner facts |
| 6 | Major | ACCEPT, not yet redesigned | HOLD banner `S/S2`; R2-6 | judge's lines (`content-types/repo.rows.ts:10,31,51-53`); not re-read |
| 7 | Major | ACCEPT, not yet redesigned | HOLD banner `S/S6` (S6c); R2-7 | owner rule (cms may not import db); judge's lines not re-read |
| 8 | Major | ACCEPT, not yet redesigned | HOLD banners `S/S0`, `S/S3`; R2-8 | judge's lines; not re-read |
| 9 | Major | ACCEPT, not yet redesigned | HOLD banner `U/U2`; R2-9 | `access-resolver.ts` has `createHash` only; no `timingSafeEqual` in the file |
| 10 | Major | ACCEPT, not yet redesigned | HOLD banner `S/S5`; R2-10 | `rg -c expectedRevision features/settings/repo.ts` → 0 |
| 11 | Major | ACCEPT, not yet redesigned | HOLD banner `U/U3`; R2-11 | logic of the test (equal denial does not prove the call) |
| 12 | Major | ACCEPT, not yet redesigned | HOLD banners `S/S1`, `U/U3`; R2-12 | `features/taxonomy/repo.ts` 555 lines; `api-key-service.ts:193,222,277` |
| 13 | Major | ACCEPT, not yet redesigned | HOLD banners `T-SQLREPO`, `S/S0`; R2-13 | Tovu root `package.json:37` `typecheck:tests` (`tsconfig.tests.json`) |
| 14 | Major | ACCEPT, not yet redesigned | HOLD banners `T-SQLREPO`, `S/S0`; R2-14 | judge's lines; not re-read |
| 15 | Major | ACCEPT, not yet redesigned | HOLD banner `U/U3`; R2-15 | Jini `packages/user-management/src/server/grant-service.ts:174` `export async function assertGrantClamp` |
| 16 | Minor | ACCEPT, counts fixed | INDEX §2 recount (60 / 40 / 51); the two contradictory "unused binding" lines are named in the `S/S1`, `S/S2` banners | `coverage.tsv` (awk above) |

### PARTIAL: not yet addressed (numbered)
R2-1 S2 owner-preserving invalidation callback incl. transaction completion and failure; test real linked-cache invalidation. R2-2 design the shared owner of the five password helpers (token generation, fallback hasher, dummy-hash cache) before U2b. R2-3 split universal member contracts from a Node auth entry (manifest lines, importer updates). R2-4 land registry contracts with or before S4a; fixed registry stays in Tovu; drop the invented validator. R2-5 U1a/U1b exact intermediate file, bindings, `withoutId` owner, successor guards. R2-6 S2 declared-owner lookup + diagnostics contract, `EntryPublishReadPort` and query contract destinations (`offset`). R2-7 S6c mapper port inside the caller's transaction. R2-8 re-trace each stored credential to its producer; mutation per pin; outer anti-replay transaction; MFA clear deletes passkeys. R2-9 replace U2 rows 27-28 with the real resolver/sign-in chain. R2-10 S5 against lost-updates (prerequisite) or today's behaviour. R2-11 U3 positive control, session precedence, machine-credential restrictions. R2-12 partitions for taxonomy repo and `issueApiKey`; full U3 declaration map. R2-13 T-SQLREPO adopts the xpkg COMMON verification table (per-commit commands incl. `typecheck:tests`, STOP protocol, no coordinator edits). R2-14 schedule `repo-transactions.sqlite.test.ts` across S3/S5/S6/S7; regenerate importer inventories after S0. R2-15 U3b grant-clamp comparison and reuse (removes U3c).
Round-1 items 1-8 (§7) are all still open; the judge's reading of them is accepted: item 4 (U2c) is a prerequisite of U2b (= R2-2); item 5 (U3c) folds into U3b (= R2-15); item 8 (exact wiring texts, table types) is acceptance-critical content of the existing sheets, not a later feature; item 1 needs per-file ownership; item 3 stays blocked on OD-6; item 7's importer edits must enter the execution graph; items 2 and 6 unchanged.
