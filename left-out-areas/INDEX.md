# Left-out areas: plan index (2026-11-17, planning only) — STATUS: PARTIAL (see "What remains")

Unattended planning run, docs only. No source file edited, no test, build or install run.
**Code read from:** Tovu `integ/merge-b-2026-11-16` dd70b057 (newest integration branch at start, 00:58 UTC; `integ/merge-final-2026-11-16` did not exist), Jini `integ/merge-b-2026-11-16` 674a19ea. `integ/merge-a-2026-11-16` (f354cfbd) is a parallel branch, not an ancestor: it changes 13 source files in these areas (`source-control/{commit-site,repository-target}.ts`, `site-inspection/{live-url,page-body}.ts`, 9 `site-backup` files) plus 9 theme, 5 deployments and 5 `platform/db` files. **Every blob guard here is from merge-b: rerun `scripts/inv.py`, `scripts/decls.py`, `scripts/sidecars.py` on the merged tree before any run.**
Personas: software-architect (lead), refactor, programmer, tdd, security, database. Skills: implementation-guardrails, feature-slice-design, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns, test-design, security-review.

## Size now per area (verified, `wc -l`, tests excluded; `inventory/*.tsv`, one row per file with blob and importer counts)
| Area | Folders | Source now | Tests | 11-05 survey | Already owned by Jini |
|---|---|---|---|---|---|
| Backups | website `features/site-backup` | 42 files, 7,017 | 71 files, 12,573 | 6,741 | the destination operations (in the source-control contract) |
| Source control | website `features/source-control` (+ admin 10 files, 1,729) | 15 files, 2,774 | 19 files, 4,786 | 865 (two files) | contract, registry, commit orchestration (`devops/source-control`), GitHub plugin (`agent-plugins/github`, 1,262 lines `.mjs`) |
| Deploy config | `deployments/deploy-config.ts` + `deploy-config-registry.ts` (folder: 39 files, 7,162; admin 27 files, 7,420) | 549 | 2 unit + 1 CLI test | 449 | contract + descriptors (`devops/deploy`), fly/render/railway plugins |
| Site inspection | `features/site-inspection` + `features/site-evidence` | 14 files, 3,202 | 18 files, 4,287 | 642 (two files) | `diagnostics/web-evidence` (browser evidence, request guard) |
| Mail activity | `features/mail-status` + `features/mail` | 25 files, 2,431 | 13 files, 2,186 | 382 (two files) | `platform/mail`, `core/contracts/mail` |
| Table setup | `platform/db/migrations` 54 files, 2,737 + `migration/manifest.ts` 843 (whole `platform/db` + database screens: 146 files, 18,587) | 3,580 | 182 files, 26,462 (whole) | 3,062 + 257 | runner + step contract; 4 cms SQL adapters with no DDL |
| Theme, rest | 20 files lane T marked STAY | 2,978 (of 15,934) | not split per file | 5-6k | - |
Not in any area above but measured next to them: website `features/recovery` 629, admin `features/recovery` 2,744, admin `features/import-export` 694.

## Reconciliation (done first)
No lane, design or sheet on the eight plan branches claims any file of `source-control`, `site-backup`, `site-inspection`, `site-evidence`, `recovery`, or the migrations. Existing labels (CLASSIFY-files.tsv, audit rows) exist for many files but have no sheet. Files that two plans touch:
| File | Plan 1 | Plan 2 | Resolution |
|---|---|---|---|
| `theme/theme-trash.ts` | lane T T-TH-07 (in its files list, marked STAY) | 11-05 survey + TH-R2 here | T-TH-07 moves only the fs move helper; TH-R2 moves the paired-rollback workflow, after T-TH-07 |
| `theme/set-active-theme-tool.ts` | audit2 B15 | lane T T-TH-08 | two EXISTING plans; lane T is newer: follow T-TH-08, strike it from B15 |
| `theme/file-mutation-tools.ts` | audit2 B10 | lane T T-TH-08 (T-TH-07 says it "= B10") | same: follow lane T; fix B10's list |
| `theme/verify-active-theme.ts` | audit2 B15 (label) | lane T STAY; TH-R3 here | TH-R3 |
| `theme/visitor-publication.ts`, `theme-file-import.ts` | CLASSIFY rows (agentic, cms/media) | lane T "CLASSIFY owns them" (no sheet) | TH-R3, TH-R2 |
| `theme/publish-content.ts`, `active-theme-publish-content.ts` | lane T (listed, blocked) | publish framework (audit2 B02/B08) | not planned here |
| `deployments/deploy-config.ts` | audit2 A19 (label, SPLIT 650 with `dockerfile.ts`) | DC-1 here | DC-1 is the server slice; A19 keeps the admin source-editing slice |
| `site-backup/plan-store.ts` | audit A09 (label DEDUPE) | BK-1 here | BK-1 |
| `mail-status/provider-tool-registrations.ts`, `mail/retention.ts` | lost-updates SITES rows 36-38 (no change) | audit2 A27 / ML-2 | no conflict; ML-2 diffs `retention.ts` |
Import-line edits by other lanes inside these folders (not claims; run those lanes first or regenerate blobs): `site-backup/import-keep-off.ts:7` (K-02b), `site-backup/static-download-landing.ts:2` (T-PO-01), `deployments/static-publish/adapter.ts:18-19` and `deploy-targets/types.ts:1` (K-11), `deployments/deploy-targets/host-kit.ts:2` (xpkg R11), env reads listed by env-schema (`site-backup/backup-service.ts`, `import-database.ts`, `deployments/static-publish/credentials.ts`).
CLASSIFY targets this plan does NOT follow, with the reason: `site-backup/push-jobs.ts` -> `core/primitives` (holds timers and state; core may not); `site-backup/backup-service.ts` and `push-engine.ts` -> `devops/source-control` (they are the backup job; new `devops/backup`); `site-inspection/page-body.ts` -> `agentic` (HTML shaping, needs `parse5`); `source-control/store.ts` -> `integrations` (the credential-set owner is `platform/secrets/credential-sets`; undiffed).

## Sheets
Assemble a run: `cat <move-templates>/T-<KIND>.md <one sheet section> <move-templates>/COMMON.md` (COMMON.md and the T-*.md templates are on the inputs branch under `ADS-memory/.local-artifacts/terra-refactor-2026-11-13/move-templates/`; tool sheets add lane K's `K-TOOLS-PATTERN.md`, SQL sheets lane S's `T-SQLREPO.md`). Sidecars per sheet: `sheets/<id>.files.tsv` (full blobs), `sheets/<id>.importers.tsv` (resolved import sites), `sheets/JINI.blobs.txt`.
| id | what | Tovu lines | state | prerequisites | est tokens (Sonnet) |
|---|---|---|---|---|---|
| SC-1 | Jini: close 5 gaps in commit orchestration (token redaction, unknown code, staged errors, arranged files, missing-credential text), tests first | 0 (Jini 92+108) | READY, Opus review | - | 110k |
| SC-2 | Tovu adopts it; `commit-site.ts` twin shrinks to a binding | 541 | READY | SC-1 released | 170k |
| SC-3 | provider types DEDUPE + registry split | 724 | types READY; registry needs Opus pass | SC-2, D-SC1 | 160k + 60k Opus |
| SC-4 | credential store | 967 | DESIGN | Opus | 150k Opus + 300-450k |
| SC-5 | tools | 542 | outline | SC-2, SC-3 | 220k |
| BK-0 | backup round-trip + N-1 archive characterization (tests only) | 0 | READY | - | 230k (2 runs) |
| BK-1 | plan store + job registry | 259 | READY (diff first) | BK-0 | 150k |
| BK-2 | backup engine out of `backup-service.ts` | 1,229 | DESIGN | BK-0, BK-1, SC-3 | 180k Opus + 400k |
| BK-3 | `sources.ts` split + move | 722 | DESIGN | BK-0 | 100k Opus + 250k |
| BK-4 | import/restore seams (stays in Tovu) | 2,244 | READY after BK-0 | BK-0 | 120k |
| DC-1 | deploy-config injection guard -> `devops/deploy` | 549 (moves about 40) | READY | - | 90k |
| SI-1 | path guard, bounded body, cookie shapes, page body -> `diagnostics/web-evidence` | 830 | READY after D-SI1 | D-SI1 | 170k |
| ML-1 | mail activity + suppressions domain -> `platform/mail` | 424 | READY | - | 150k |
| ML-2 | mail SQL repos -> `platform/mail/sql` | 631 | READY (T-SQLREPO) | ML-1, lane S0 pins | 180k |
| DB-1 | schema parity + N-1 harness (tests only) | 0 | READY | D-DB1 | 200k |
| DB-2 | first domain schema history: redirects | 0 (Jini new) | READY | DB-1 | 180k |
| DB-3..n | twelve more domains, one run each | 0 | template | DB-2 + that domain's SQL lane | about 2.0M |
| TH-R1 | previews, watcher, roster | 521 | DESIGN | T-TH-05 | 80k Opus + 180k |
| TH-R2 | asset ops, file import, trash workflow | 658 | outline | T-TH-05, T-TH-07, K-07, K-08 | 220k |
| TH-R3 | visitor publication, active-theme resolution | 448 | READY after T-TH-06 | T-TH-06 | 150k |
**Total estimate: about 5.7M Sonnet + 0.57M Opus tokens** (source control 1.04M, backups 1.15M, three small areas 0.59M, table setup 2.38M, theme rest 0.55M). Runnable now with no decision and no design: SC-1, BK-0, BK-1, DC-1, ML-1 = 0.73M (DB-1 adds 0.2M once D-DB1 is confirmed).
"READY" = files, blobs, declarations, importers, ports, tests and STOP commands are specified; handler bodies are not pre-written. "DESIGN" = needs an Opus dependency-graph partition first. "outline" = files and risks only.

## Order and file-disjointness
1. Wave 0, tests only, parallel: BK-0, DB-1, and the T0 commits of SC-2, DC-1, SI-1, ML-1 (each adds test files in its own folder only).
2. Wave 1, parallel: SC-1 (Jini only), DC-1, ML-1, BK-1, SI-1. Tovu folders are disjoint. Jini: SC-1 edits `devops/src/source-control/*`, DC-1 `devops/src/deploy/*`, BK-1 adds the `./backup` entry to `devops/package.json`: SC-1 and DC-1 do not touch `package.json`; run BK-1 alone on that file. ML-1 and SI-1 are different packages.
3. Wave 2: SC-2 (after SC-1 is released: Tovu installs `@jini-ai/*` from the registry, so every Jini commit needs a release before the Tovu commit that uses it), DB-2, ML-2 (adds `./mail/sql` to `platform/package.json`).
4. Wave 3: SC-3 (serial with SC-1 on `contracts.ts`), then BK-2 (imports 4 source-control files: after SC-3), BK-3, BK-4, TH-R3, SC-4 design.
5. Wave 4: SC-5, TH-R1, TH-R2, DB-3..n as their SQL lanes land.
Never parallel: two sheets adding entries to the same `package.json`; anything touching `theme/index.ts` (33 outside importers) with a T-TH sheet; BK-2 with BK-3 (`backup-service.ts` imports 7 names from `sources.ts`).
STOP conditions every sheet inherits from COMMON.md (blob mismatch, missing Jini name, new dependency, decision not made) plus per sheet: a characterization test that cannot be made RED by its named mutation is rejected; no `vi.mock` of another package's internals (use fakes of the port interfaces); no `await import()` of a declared dependency; no re-export shell left behind (`rg -n "^export \* from|^export \{[^}]*\} from" <deleted-or-shrunk file>` must print only the names the sheet lists); why-comments move with the code (`git diff` of a moved block shows no deleted comment line that is not re-added in Jini or kept beside the Tovu binding); every count in the report is recomputed with the command given, not copied from this plan.

## Owner decisions
- D-SC1: move the source-control provider contract TYPES from `@jini-ai/devops/source-control/contracts.ts` to `@jini-ai/core/contracts/source-control` (rule: contracts in core; a provider plugin may import only core + protocol). Recommendation: yes, types only; mechanism stays in devops.
- D-SC2: the plugin descriptor file names `tovu-source-control.json`, `tovu-deploy-ops.json`, `tovu-deploy-targets.json` sit inside Jini's bundled plugins. They are a saved-install name. Recommendation: keep; the host passes the name (Jini's `ProviderCatalogPort.list` already takes `descriptorFileName`); a rename needs its own migration design.
- D-SI1: `parse5` for `page-body.ts`: add it to `@jini-ai/diagnostics`, or home the body shaper in `@jini-ai/cms` (already has it). Recommendation: cms has no reason to own diagnostics; add the dependency.
- D-BK1: restore must never delete permanently. If BK-0 test 5 shows it does today, approve a Trash adapter for restore as a behaviour change (own sheet).
- D-BK2: share export (1,725 lines) and static-download layout (787) are not planned. Plan them now, or wait for a second user?
- D-BK3: `recovery` (website 629 + admin 2,744, `recovery-i18n.tsx` 1,400 over the file limit) is outside the seven areas named. Add it?
- D-DB1..3: see `sheets/DB-table-setup.md` (Tovu never runs domain histories; ledger naming; which proof host).
- D-TH1: `theme-trash.ts` split between T-TH-07 and TH-R2 as resolved above.

## Could not verify
- Nothing was executed: every behaviour statement comes from reading code; the SC-1 gap table was read in both files, the other DEDUPE candidates are marked "diff first".
- Files read line by line: `commit-site.ts` (255-541), Jini `commit.ts`, `contracts.ts`, `deploy-config.ts`, parts of `published-page.ts`. All other verdicts come from imports, exports, declaration spans and measured signals (same basis lanes K/T used).
- Per-test move/keep classification (339 test files in the six feature inventories, 182 more under `platform/db` and the database screens) was not done.
- The admin screens (`source-control` 1,729, `deployment` 7,420, `recovery` 2,744, `import-export` 694, `database`) are measured only; any move needs a Chrome check.
- `owner-rules.md` is not on the inputs branch; rules taken from the task text and COMMON.md.

## What remains (numbered)
1. Opus designs: SC-4, BK-2, BK-3, TH-R1, and the SC-3 registry partition.
2. Outlines to full sheets after prerequisites: SC-5, TH-R2, DB-3..n.
3. Not planned (decision D-BK2, D-BK3): share export, static-download layout, recovery, the unlabelled 17 files (1,709 lines) of `features/deployments` beyond deploy config.
4. Admin screens for all areas.
5. Regenerate every sidecar on `integ/merge-final` (merge-a and merge-b disagree on 13 files here).
6. A Codex judgment of this plan has not happened yet.
