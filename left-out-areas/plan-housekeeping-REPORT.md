# plan-housekeeping REPORT - left-out areas (2026-11-17, unattended plan-edit run)

Branch `plan/left-out-areas-2026-11-16`. Base for every fact: `origin/refactor/terra` = `integ/merge-final-2026-11-16` (Tovu 232764af5, Jini 65d73b0d5). No product code edited. The DB lane was NOT un-held (D-DB0 pending).

## Done (revision 3 item 7)
- BK-1a rewritten: ONE `OwnedPlanStore<T>` in `@jini-ai/core` existing `./gated-mutations` entry (`(required: { now, newId, ttlMs, maxTotal }, optional: { maxPerOwner? } = {})`, universal, no `node:`); Jini db `DatabaseTransferPlanStore` keeps its API and composes it (db tests unedited); Tovu keeps `createSiteBackupPlanStore` + the default `siteBackupPlanStore` and `?? DEFAULT_PLAN_STORE` reads, so `tool-registrations.unit.test.ts:1331` stays valid; 5 constructor calls / 4 test files and 23 type lines in 6 files counted on terra; repoint proof commands (with `-w`, tested: 33 hits today, 0 false hits on `createSiteBackupPlanStore`).
- BK-1b rewritten: adds `devops/backup` itself (precondition = BK-1a's core export, by command); `DEFAULT_PUSH_JOBS` kept; `share-backend.ts:268`.
- DB-1a rewritten to EXTEND `readSchemaShape` (`db/src/kernel/schema-shape.ts:34`) with opt-in `columnDetail` (Postgres identity / generated / collation are the only gaps; default output byte-identical; no new `db/package.json` entry). DB-1b precondition and parity calls follow. HOLD banner on the DB file and every DB row; DB removed from the totals (16 dispatchable sheets, 1.93M).
- Collisions: new C1-C7 table + SC collision table (command run: 0 hits in K/T, S/U, xpkg, tool-call-fixes). BK-0a vs T-TH-05 resolved (BK-0a writes a new test file; T-TH-05 has no sheet). Forms SQL vs xpkg R6-R9 (C2) and BK-1a core README / `jini-ai__core.json` vs xpkg G-TESTS, R6-R9, R10 (C3) recorded as serial.
- BK-0b guard drift: all `BK-0b.files.tsv` blobs (import-backend 1d2a06ec, import-restore fa904c45) match terra.
- N1 in sheets: SC table `\|` cells rewritten in words; the `rg` command moved to fenced check SC-T1; its pass condition was WRONG (backup-push.mjs has no `httpClient` text; it calls `git.postJson`, which reaches `kit.httpClient.send` at `write-files.mjs:186`): rewritten as 4 commands and run.
- N5/N6/N7/N9: Verified lines in BK, TH, SC, DC-SI-ML, DB re-pinned; line numbers refreshed (`import-backend.ts:108-134`, `:129-131`); TH-R2 split step VOID (`createThemeTrashAdapter` 28 lines on terra); stage P in Order; devops chain SC-1 -> DC-1 -> BK-1b -> SC-3b; BK-R retention paragraph.
- COMMON-LO clones line pinned to refactor/terra with ancestor checks.
- Wave-1 status recorded (not merged into terra): ML-1a, SC-0, SC-2a, SI-1a DONE on `wave1/lo-*`.

## SHAs
- f2bebbcd plan(left-out areas) revision 3 complete ... ; the next commit holds the COMMON-LO re-pin and this report.

## Commands run
| command | result |
|---|---|
| blob check of every `sheets/*.files.tsv` on Tovu terra (`git hash-object`) | all match |
| blob check of every `JINI.blobs.txt` row on Jini 65d73b0d5 | all 23 match |
| `python3 scripts/sidecars.py <copy>` from the Tovu terra root, `diff -rq` against `sheets/` | byte-identical |
| SC-T1 commands 1-4 on Jini 65d73b0d5 | 1: `:185,209,219`; 2: empty; 3: `:186`; 4: empty |
| SC collision command (INDEX) | 0 / 0 / 0 / 0 |
| `git grep -n -w -e SiteBackupPlanStore -e TakeSiteBackupPlanResult -e SiteBackupPlan -- apps` on terra | 33 lines (none contain `assert`) |
| `git merge-base --is-ancestor` 232764af5 / 65d73b0d5 vs refactor/terra | both exit 0 |
| area re-count on terra (site-backup, deployments) | 42 / 7,019 and 39 / 7,161 (match N5) |

## Left
- D-DB0 (owner) still gates the whole DB lane. Other owner decisions unchanged (D-BK1..4, D-SC2..4, D-SI1, D-ML1, D-DB1).
- COMMON-LO V1 "red baseline = STOP" and S-LIM "repo ratchets exit 0" will fire on refactor/terra: Tovu check:size / check:complexity / check:architecture / check:errors are red on the unmodified base (lanes K/T wave-1 reports; SI-1a's report says the same). Owner decision, same as lanes K/T: repair the baselines first, or gate on "no new line vs base".
- "What remains" 1-4, 6, 8 unchanged.

## Next step
Codex judgment of revision 3 (What remains 6), then dispatch wave 0 remainder (SC-1, BK-0a, BK-0b) once the baseline-red decision is made.
