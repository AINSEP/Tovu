# Left-out areas: plan index — revision 2 (2026-11-17, planning only)

STATUS: revision 2 complete for the judgment (18 findings: 18 accepted, 0 rebutted; two accepted with corrected evidence). One finding is only PARTLY closed: finding 17's area coverage (share export, static download, recovery, admin screens are still not sheeted: owner scope decision). Nothing was executed: no test, build or install was run by this plan.
**Code verified against:** Tovu `integ/merge-a-2026-11-16` e801e9ae, cross-checked with `integ/merge-b-2026-11-16` 450ac748 (`integ/merge-final-2026-11-16` does not exist for Tovu; merge-a and merge-b are parallel children of 80b00f5b, the commit the judge read). Jini `integ/merge-final-2026-11-16` af33fcdb (it exists for Jini).
Personas: software-architect (lead), refactor, programmer, tdd, security, database. Skills: implementation-guardrails, feature-slice-design, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns, test-design, security-review.
Files: `COMMON-LO.md` (the one execution contract), `sheets/*.md` (five area files), `sheets/<id>.files.tsv` + `<id>.importers.tsv` (guards and importer sites, regenerated on merge-a), `sheets/JINI.blobs.txt` (merge-final), `inventory/*.tsv` + `*.decls.tsv` (regenerated on merge-a), `scripts/` (how they were made), `CODEX-JUDGE.md` (the judgment answered here).

## Revision 2 — judge response
| # | sev | verdict | What changed | Evidence (T: = `apps/website/src/`, J: = Jini `packages/`) |
|---|---|---|---|---|
| 1 | blocker | ACCEPT | BK-0 no longer demands an N-1 upgrade. BK-0a pins today's contract: a different manifest identity is refused with advice, the same identity with an older column shape is accepted only through the worker's default table. The named mutation ("bypass the migrate call in `import-database.ts`") is deleted: no such call exists. N-1 upgrade is its own design item BK-N1 with decision D-BK4 | T:`features/site-backup/archive-manifest.ts:162-166`; `__tests__/integration/import-schema-version.integration.test.ts:55-62`; `import-database.ts:55-110`; `share-database/repo.sqlite.ts:101-114`; `platform/site-dir/schema-guard.ts:49-65` |
| 2 | blocker | ACCEPT | The restore contract is rewritten from the code: import always creates a NEW site; the only replacement is of theme trees seeded seconds earlier in that new site, and it is a recursive permanent delete today. New sheet BK-R (scheduled in wave 1, not a decision) parks those trees and tests failures after parking, at database placement, at partial file placement and at saved-key restoration. Round 1's test of "restore over an existing site" is replaced by BK-0b item 1 (import never touches an existing site) | T:`features/site-backup/import-restore.ts:52-75` (`:63` delete, `:66` exclusive copy); `import-backend.ts:97-123`; `platform/site-dir/init-site.ts:116-147,324-361`; `platform/site-dir/site-registry.ts:206-222,250-255` |
| 3 | major | ACCEPT | New `COMMON-LO.md` replaces the inherited COMMON for every sheet: setup, baseline on the unmodified tree, V2 after every commit, RED proof (V3/V4), a named verifier stage W that replays every reported SHA against its declared Jini SHA before a dependent wave is released, and a STOP matrix with one command per condition. Tests that are red today are never committed alone (kind TESTS = green on parent; kind HARDEN = test and fix in one commit) | `COMMON-LO.md`; commands checked on T `package.json` scripts and J `pnpm guard` |
| 4 | major | ACCEPT | SC-3 "types READY" withdrawn. Full member-by-member ABI matrix written. Finding goes further than the judge: the shipped GitHub plugin implements the Tovu positional ABI, and no module implements Jini's object ABI. The runtime map gets an owner (Tovu, SC-3a); inline backup entries and `sleep` are kept; provider ABI (new `plugin-abi` subpath, SC-3b) is separated from orchestration ports | T:`features/source-control/provider-module.ts:22,118-134,160-175,194-210`; J:`devops/src/source-control/contracts.ts:21,33-41,50-62`; J:`agent-plugins/github/source-control/github.mjs:70-75,87`, `backup-push.mjs:200-205`, `write-files.mjs:161` |
| 5 | major | ACCEPT | Security trace rewritten: native `fetch` vs guarded client per call site; installed vs bundled loader; the account probe; the route's workspace and permission gates. New tests-only sheet SC-0 attaches a removal-sensitive test to each real gate and to the production kit binding. One unguarded credentialed call is recorded as SC-H1 / D-SC4 | T:`features/source-control/provider-kit.ts:16-18,33,42`; `provider-registry.ts:90-112,120-152`; `server/inbound/admin-http/routes/system/source-control-credentials.ts:106-112`; J:`agent-plugins/github/source-control/commit-site.mjs:88-89`, `github.mjs:70-75`, `write-files.mjs:186` |
| 6 | major | ACCEPT | SI-1 split into SI-1a (tests of the real behaviour) and SI-1b (move with an injected `checkPathname` policy and a Tovu wrapper that keeps the reserved-surface sentence). "Validate before opening the socket" and the double-encoded deny case are removed (production opens first; one decode by design). `/admin` and `/api` cases added that fail when the host binding is removed. `page-body.ts` moved to its own sheet SI-2 so D-SI1 gates only that | T:`features/site-inspection/published-page.ts:143-173,250-278,319,489-503` |
| 7 | major | ACCEPT | ML-1b step M2a gives the two runtime constants and the port types a neutral owner in Tovu first and updates BOTH consumers in that commit; the declaration disposition is tied to `inventory/mail.decls.tsv` | T:`features/mail-status/activity.ts:17-19,132-133`; `features/mail/activity.repo.ts:21,25-28` |
| 8 | major | ACCEPT | ML-1a adds: non-owner with the manage permission refused; absent owner identity refuses; masked vs full field sets; recipient filter and detail refused for the masked tier; revocation between plan and run. `ownerPrincipalId` is in the ported deps | T:`features/mail-status/suppressions.ts:21-24,74-79`; `activity.ts:147-161,186,219` |
| 9 | major | ACCEPT | ML-2 is ON HOLD, not READY. The dependency prerequisite is a named sheet ML-2p with decision D-ML1; the SQL worksheet fields it must fill are listed; lane S's template is itself on HOLD | J:`platform/package.json` (no `kysely`); J:`cms/package.json:128-143,463-490` (the pattern); T:`features/mail/retention.ts:3` |
| 10 | major | ACCEPT | The invented principal foreign key and the optional principal-table input are removed. DB-2 asserts there is NO foreign key and that deleting a principal keeps the redirect's attribution | T:`platform/db/schema.sqlite.ts:167-176,650-672` |
| 11 | major | ACCEPT | `describeSchema` (DB-1a) now covers CHECK expressions, collations, generated / identity semantics, table options; mutation self-tests per property on SQLite and PGlite; DB-1b asserts the properties are visible on real Tovu tables | T:`platform/db/schema.sqlite.ts:231,687`; `DB-table-setup.md` DB-1a/DB-1b |
| 12 | major | ACCEPT | The history is a typed FACTORY closing over validated host table names; step ids, checksum rule and ledger default are specified; D-DB2 and D-DB3 are closed with stated defaults (proof host = the Tovu parity test) | J:`core/src/contracts/storage/migration.ts:21-29`; J:`db/src/migrate/runner.ts:217`; J:`cms/src/redirects/sql/repo.ts:25-27` |
| 13 | major | ACCEPT (one sub-claim corrected) | "No effect after cancel" is removed. BK-0b item 5 characterizes the six points that exist; BK-2's constraints say hardening is a separate sheet after extraction. Correction: an abort DURING repository inspection yields zero uploads today (the worker loop re-checks the signal before taking the first index), so that case is pinned as safe; the `file.load()` case is as the judge says | T:`features/site-backup/push-engine.ts:138-150,161-170`; `backup-service.ts:681-705` |
| 14 | major | ACCEPT | BK-4 is withdrawn: the archive reader wrapper is a security preflight and stays; the saved-keys port is not used for environment input; the worker's child environment is already an explicit allow-list owned by the env-schema plan | T:`features/site-backup/import-archive-reader.ts:21-57,64-84`; `saved-keys-port.ts:7-14`; `import-database.ts:77-81` |
| 15 | major | ACCEPT | TH-R1 now says: one LIVE watcher, replacement opens allowed; the existing restart / site-switch / stale-stop tests are carried; the replacement owner is named as the design question with a recommendation | T:`features/theme/theme-watcher.ts:45-97`; `__tests__/theme-watcher.test.ts:127-148` |
| 16 | major | ACCEPT | TH-R3 reclassified from READY to design queue; a table of nine behaviour owners with state lifetime, ports and the tests a design must specify | T:`features/theme/visitor-publication.ts:12,61,85-89,107-117,128-154`; `active-theme.ts:71-82,106,157-184,216-222`; `verify-active-theme.ts:44-69` |
| 17 | major | ACCEPT, PARTLY CLOSED | Granularity: every dispatchable sheet is one run (BK-0 -> BK-0a/BK-0b; SC-2 -> a/b; SC-3 -> a/b; SI-1 -> a/b + SI-2; ML-1 -> a/b; DB-1 -> a/b; BK-1 -> a/b); nothing over 170k; multi-run items are in the design queue and not called sheets. Signatures: `describeSchema(required, optional)`, the injection guard `(required, optional)`. Barrel: `theme/index.ts` is lane T's file; no sheet here adds to it. NOT closed: share export, static download, recovery, admin screens and 17 deployments files remain unsheeted (D-BK2, D-BK3, "What remains") | `sheets/*.md`; `COMMON-LO.md` rules 3 and 5 |
| 18 | minor | ACCEPT (evidence updated) | (a) `formatByteSize` DOES exist in `@jini-ai/core/text` on Jini merge-final (added after the judge's ref), but its strings differ from the backup formatter, so the DEDUPE claim is still wrong and is removed. (b) The T-TH-07 "fs move helper" handoff is removed. (c) The touch ledger below now includes other lanes' test and import-line edits | J:`core/src/text/format-byte-size.ts` (commit 6f8dc8c2); T:`features/site-backup/sources.ts:580-591`; lane T `T/T-TH-07.fnsize.tsv` |

## Size now per area (verified on merge-a, `wc -l` style, tests excluded; `inventory/*.tsv`)
| Area | Folders | Source now | Tests | Already owned by Jini |
|---|---|---|---|---|
| Backups | website `features/site-backup` | 42 files, 6,962 | 71 files, 12,574 | the destination operations (in the provider plugin ABI) |
| Source control | website `features/source-control` (+ admin 12 files, 1,825) | 14 files, 2,760 | 19 files, 4,786 | registry generics, commit orchestration, path / target rules (`devops/source-control`), GitHub plugin |
| Deploy config | `deployments/deploy-config.ts` + `deploy-config-registry.ts` (folder: 39 files, 7,158; admin 29 files, 7,633) | 548 | 60 files, 14,300 (folder) | contract + descriptors (`devops/deploy`), fly/render/railway plugins |
| Site inspection | `features/site-inspection` + `features/site-evidence` | 14 files, 3,202 | 18 files, 4,287 | `diagnostics/web-evidence` |
| Mail activity | `features/mail-status` + `features/mail` | 25 files, 2,431 | 13 files, 2,186 | `platform/mail`, `core/contracts/mail` |
| Table setup | `platform/db/migrations` 50 `.ts` files, 2,737 + `migration/manifest.ts` 843 (whole `platform/db` + database screens: 151 files, 18,838) | 3,580 | 184 files, 26,570 (whole) | runner + step contract; cms SQL adapters with no DDL |
| Theme, rest | 11 files lane T marked STAY | 1,595 (of 15,918) | not split per file | - |
Measured next to them, not in any sheet: website `features/recovery` 5 files 629; admin `features/recovery` 13 files 2,848; admin `features/import-export` 12 files 752.

## Sheets (each row = ONE Sonnet run; assemble with `cat COMMON-LO.md <sheet section>`)
| id | kind | what | prerequisites (enforced by the sheet's `precondition:` command) | est tokens |
|---|---|---|---|---|
| SC-0 | TESTS | source-control gate tests on the real gates | - | 120k |
| SC-1 | HARDEN (Jini) | five gaps in commit orchestration; Opus review | - | 110k |
| SC-2a | TESTS | characterize `commit-site.ts` | - | 110k |
| SC-2b | SEAM | `commit-site.ts` becomes a binding | SC-1, SC-2a | 150k |
| SC-3a | SEAM | `provider-module.ts` types only (runtime map to its own file) | - | 40k |
| SC-3b | SEAM+MOVE | plugin ABI v1 types to `devops/source-control/plugin-abi` | SC-3a, SC-2b | 150k |
| BK-0a | TESTS | round trip + schema-identity characterization | - | 140k |
| BK-0b | TESTS | new-site import, rollback, cancellation points, limits, secrets | - | 150k |
| BK-R | HARDEN | import parks the theme trees it replaces | BK-0b | 110k |
| BK-1a | SEAM+MOVE | plan store -> `devops/backup` (new subpath) | - | 130k |
| BK-1b | SEAM+MOVE | push-job registry -> `devops/backup` | BK-1a | 120k |
| DC-1 | SEAM+MOVE | deploy-config injection guard -> `devops/deploy` | - | 90k |
| SI-1a | TESTS | path guard, bounded body, cookie shapes as they are | - | 100k |
| SI-1b | SEAM+MOVE | generic guard with injected policy -> `diagnostics/web-evidence` | SI-1a | 140k |
| SI-2 | SEAM+MOVE | `page-body.ts` | D-SI1 | 80k |
| ML-1a | TESTS | mail activity and suppression security acceptance | - | 120k |
| ML-1b | SEAM+MOVE | mail activity + suppression domain -> `platform/mail` | ML-1a | 160k |
| ML-2p | JINI-ADD (manifest) | `kysely` optional peer in `platform` | D-ML1; serial with xpkg N1 | 40k |
| DB-1a | JINI-ADD | `describeSchema` with CHECK / collation / identity + mutation self-tests | - | 170k |
| DB-1b | TESTS | Tovu parity harness + guard | DB-1a | 130k |
| DB-2 | JINI-ADD + TESTS | redirects history factory + parity | DB-1b, D-DB1 | 170k |
| DB-3..5 | as DB-2 | comments, widgets, forms | DB-2 | about 500k |
Dispatchable with no owner decision: 18 sheets, 2.24M tokens. Decision-gated: SI-2, ML-2p, DB-2, DB-3..5 = 0.79M.
Design queue (NOT sheets; each needs an Opus pass that outputs one-run sheets): SC-3d registry split (60k Opus + about 150k), SC-4 credential store (150k + 360k), SC-5 tools (220k), BK-N1 older archives (120k + 260k, D-BK4), BK-2 backup engine (180k + 420k), BK-3 sources (100k + 250k), ML-2 mail SQL (60k + 240k, on HOLD with lane S), TH-R1 (80k + 200k), TH-R2 (60k + 220k), TH-R3 (70k + 200k), DB-6..14 nine more domains after their SQL lanes (about 1.5M).
**New estimate: about 7.0M Sonnet + 0.88M Opus** (round 1: 5.7M + 0.57M). The increase is the tests-only sheets split out as own runs, BK-R, BK-N1, SC-0, and three theme items moved from "ready" to design.

## Order and file-disjointness
Wave 0 (parallel; each adds or edits only its own test files or one Jini folder): SC-0, SC-1, SC-2a, BK-0a, BK-0b, SI-1a, ML-1a, DB-1a. Then verifier stage W.
Wave 1 (parallel unless listed below): SC-2b, SC-3a, BK-R, BK-1a, DC-1, SI-1b, ML-1b, DB-1b. Then W.
Wave 2: SC-3b, BK-1b, and the decision-gated SI-2, ML-2p, DB-2. Then W. Wave 3: DB-3..5.
Serial pairs (same file): BK-1a -> BK-1b -> SC-3b (`packages/devops/package.json` and the `devops` README); BK-1a and BK-1b (`backup-service.ts`, composition root); SC-2b before SC-3b (`commit-site.ts` imports the types); SC-3a and SC-2b do not share a file (`tool-registrations.ts:38` vs `commit-site.ts`); BK-R and BK-0b (one assertion in BK-0b's test file is edited by BK-R); ML-2p and xpkg N1 (0b) (`packages/platform/package.json`); DB-1a and any xpkg R11 row on `packages/db/package.json`; anything touching `theme/index.ts` with a T-TH sheet (none dispatchable here).
Tovu installs `@jini-ai/*` from the registry; a sheet's Tovu commit is verified against the linked Jini clone at the SHA in its body (`COMMON-LO.md` V), and the coordinated publish happens outside the sheets.

## Files two plans both claim or edit (refreshed against the REVISED plans)
Heads read: lanes K/T `plan/lanes-k-t-2026-11-16` cafebcaa (revision 2); lanes S/U `plan/lanes-s-u-2026-11-16` e20e2955 (revision 2 PARTIAL: every sheet on HOLD by banner); xpkg `plan/xpkg-lane-sheets-2026-11-16` f8c38a69 (revision 2). Method: every path of the seven areas and of the Jini folders these sheets touch was searched in the three plan directories (`git grep -oE` with the path patterns; counts in the commit message of this revision).
| File | Other plan | This plan | Resolution |
|---|---|---|---|
| T:`features/theme/theme-trash.ts` | lane T T-TH-07 (design queue): STAY; `createThemeTrashAdapter` 75 lines; in lane T's `BLOB-DRIFT.tsv` | TH-R2 (design queue) | TH-R2 waits for the T-TH-07 design; TH-R2 carries the function split |
| T:`features/theme/asset-operations.ts` | T-TH-05 edits its import of `./theme-files.js` (:3) and DELETES its re-export line (:9); T-TH-07 edits :4; T-TH-08 deletes its `THEME_WRITE_PERMISSION` re-export (:8) | TH-R2 | lane T first; regenerate `TH-R2.files.tsv` after |
| T:`features/theme/theme-file-import.ts` | T-TH-05 edits :28; T-TH-07 edits :27 | TH-R2 | same |
| T:`features/theme/page-publication.ts`, `public-theme-resources.ts` | lane T (T-TH-07; STAY) | not claimed | none |
| T:`features/theme/index.ts` | lane T (owner of the barrel) | no edit | none |
| T:`features/theme/{visitor-publication,active-theme,verify-active-theme,theme-watcher,theme-roster-sync,preview-*}.ts` | lane T inventory rows only (STAY, no sheet); audit2 B15 label on `verify-active-theme.ts` | TH-R1, TH-R3 (design queue) | this plan |
| T:`features/site-backup/archive-extensions.ts` | T-TH-05 edits its import line :2 (barrel repoint) | stays, no edit | none (BK-4 withdrawn) |
| T:`features/site-backup/import-keep-off.ts` | K-02b edits import line :7 | stays, no edit (BK-R edits `import-restore.ts` and `import-restore-placement.ts` only) | none |
| T:`features/site-backup/static-download-landing.ts` | T-PO-01 edits import line :2 | not sheeted | none |
| T:`features/site-backup/share-database/repo.sqlite.ts` | T-PO-04 edits import line :14 | not sheeted; BK-0a reads `ADDITIVE_COLUMN_DEFAULTS` in a test | none |
| T:`features/redirects/repo.sqlite.ts` | lanes S and K cite it as the binding pattern (no edit) | DB-2 reads the table names (no edit) | none |
| J:`cms/src/redirects/sql/repo.ts` | lanes S and K cite it as the pattern (no edit) | DB-2 adds the sibling `schema/` folder and leaf exports in the `redirects/sql` entry | none on `repo.ts`; serial with any K redirects sheet that edits the same entry file |
| J:`platform/package.json` | xpkg N1 (0b) deletes two `./runtime-ports/*` exports | ML-2p adds `kysely` | serial, N1 first |
| J:`db/package.json` | xpkg R11 (db rows; S5 waits on it) | DB-1a adds `./testing/schema-shape` | serial |
| J:`devops/src/deploy/node.ts` | xpkg R11c | DC-1 adds `deploy/config-injection.ts` and one export line in `deploy/index.ts` (the `./deploy` entry; `node.ts` is the separate `./deploy/node` entry) | different files: none |
| J:`devops/package.json` | no other plan | BK-1a, SC-3b | serial inside this plan |
| T: env reads in `site-backup/backup-service.ts`, `import-database.ts`, `deployments/static-publish/credentials.ts` | env-schema plan | no edit | none |
| T:`deployments/deploy-config.ts` | audit2 A19 (label, no sheet) | DC-1 | DC-1 is the server slice |
| T:`mail-status/provider-tool-registrations.ts`, `mail/retention.ts` | lost-updates SITES rows; audit2 A27 | ML-2 (on HOLD) | none now |
No file of `source-control`, `site-inspection`, `site-evidence`, `mail`, `mail-status`, `recovery` or `platform/db/migrations` is named by lanes K/T, S/U or xpkg (zero hits).
Shared test files: lane T's T-TH-05 repoints one site-backup test import; lanes K/T list their test edits in their own `*.importers.tsv`. No test file created by a sheet here exists today (all are new files or named existing files in the sheet's own folder), so the only shared test edit is BK-R's one assertion in BK-0b's file.
### Blob drift between the two Tovu integration merges (sidecars carry merge-a blobs; regenerate with `scripts/` on the final merge before any run)
`source-control/commit-site.ts` and `repository-target.ts` (deleted on merge-a), `site-backup/{archive-extensions,archive-paths,bundled-export-file-policy,credential-warnings,import-backend,import-keep-off,import-plugin-state,import-restore-placement,share-backend}.ts`, `site-inspection/{live-url,page-body}.ts`, `deployments/deploy-config-registry.ts`, `theme/theme-trash.ts`, `recovery/capability-card.ts`. Sheets whose guards are affected: SC-2a/b, BK-0b, BK-R, SI-2, DC-1 (registry file only read), TH-R2.

## Owner decisions (remaining)
- D-BK1 (narrowed): BK-R is scheduled without a decision. Question left: an uncommitted site that fails creation is removed whole by `initSite`'s cleanup, and the private import stage is removed after a failure. Are those "permanent deletes" under the rule, or cleanup of this operation's own unpublished writes? Recommendation: the second; if the first, a follow-up sheet in `platform/site-dir` parks failed creations.
- D-BK2: plan share export (11 files, 1,690 lines) and static-download layout (6 files, 787) now, or wait for a second user.
- D-BK3: add `recovery` (website 629 + admin 2,848; `recovery-i18n.tsx` is over the file limit) to scope.
- D-BK4: should an archive from an older install be upgraded on import (BK-N1), or is refusal with advice the product rule? Today's tests assert refusal.
- D-SC1 (no longer blocking): later move of the plugin ABI types to `@jini-ai/core`; needs `CommitFile.data` to stop naming `Buffer`.
- D-SC2: descriptor file names with the product name inside Jini's bundled plugins are saved-install names. Recommendation: keep; the host passes the name.
- D-SC3: Jini's object-style provider ABI has no implementing module. Retire it, or schedule a plugin ABI v2 with an adapter and a migration for installed plugins.
- D-SC4: the account-label probe is a credentialed call outside the egress guard and without the redirect guard (SC-H1). Approve a HARDEN sheet.
- D-SI1: add `parse5` to `@jini-ai/diagnostics` (recommended; gates SI-2 only).
- D-ML1: add `kysely` to `@jini-ai/platform` as an optional peer, the way `cms` declares it (gates ML-2p and ML-2).
- D-DB1: approve "domain exports a history factory, the host runs it, Tovu never runs it" (gates DB-2 onward).

## Could not verify
- Nothing was executed. Every behaviour statement comes from reading the code at the refs above; files read line by line are named in each sheet's own "Could not verify".
- Tovu has no final integration merge yet: every Tovu blob guard is from merge-a and must be regenerated on the final merge (commands in `scripts/`).
- Per-test move/keep classification for the areas not sheeted. The admin screens (measured only; any move needs a Chrome check).

## What remains (numbered)
1. Opus designs for the queue: SC-3d, SC-4, SC-5, BK-N1, BK-2, BK-3, ML-2, TH-R1, TH-R2, TH-R3.
2. Not sheeted, pending D-BK2 / D-BK3: share export, static-download layout, recovery, and 17 files (about 1,700 lines) of `features/deployments` beyond deploy config.
3. Admin screens of every area (source-control 1,825; deployment 7,633; recovery 2,848; import-export 752; database 2,788).
4. DB-6..14 after lanes S/U leave HOLD.
5. Regenerate every sidecar on Tovu's final integration merge.
6. A second Codex judgment of this revision.
