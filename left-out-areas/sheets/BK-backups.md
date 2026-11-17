# BK: backups (`features/site-backup`)

Measured on Tovu merge-b dd70b057. Inventory `../inventory/backups.tsv`; guards `BK-*.files.tsv`; importer sites `BK-*.importers.tsv`.

## Size now (verified, `wc -l`, tests excluded)
`features/site-backup`: 42 files, 7,017 lines (11-05 survey said 6,741); tests 71 files, 12,573 lines. Four jobs live in the one folder:
| Job | Files | Lines | Verdict |
|---|---|---|---|
| A. Backup to a repository (plan, upload, commit) | `backup-service` 788, `sources` 722, `tool-registrations` 250, `push-engine` 191, `plan-store` 138, `push-jobs` 121, `credential-warnings` 51 | 2,261 | MOVE PART (BK-1..BK-3) |
| B. Archive import and restore | 18 files (`BK-4.files.tsv`) | 2,244 | STAY this round, seams + tests only (BK-0, BK-4) |
| C. Share export (zip, sanitised database copy, hosted link) | 11 `share-*` files incl. `share-database/repo.sqlite.ts` 445 | 1,725 | NOT PLANNED here (labels exist in CLASSIFY-files for 6 files); listed in INDEX "what remains" |
| D. Static download layout | `static-download-layout` 319, `static-copy` 171, `static-download-landing` 108, `static-export-selection` 77, `package-file-inventory` 70, `bundled-export-file-policy` 42 | 787 | NOT PLANNED here; `static-copy`, `static-download-layout`, `static-download-landing`, `share-zip`, `share-policy` are imported by `source-control/commit-site.ts` (SC-2 keeps those imports) |
Adjacent, measured, not in scope: website `features/recovery` 5 files 629 lines (database recovery tools; `buildRecoveryRegistrations` is one 217-line function), admin `features/recovery` 11 files 2,744 lines (`recovery-i18n.tsx` alone is 1,400: over the 500-line file limit), admin `features/import-export` 10 files 694 lines.
Entry points (verified from importer dirs): admin routes `server/inbound/admin-http/routes/system`, public route for the share link (`public-http/routes`), `cli/commands` (import, saved keys), `server/routes`, `server/runtime/composition`, `assistant` (tools `site_backup_plan`, `site_backup_push`; permission `site-backup.push`).
Other plans touching these files (import lines only, no claim): K-02b repoints `import-keep-off.ts:7`, T-PO-01 repoints `static-download-landing.ts:2`, T-TH-05 repoints one test. env-schema lists the `process.env` reads (`backup-service.ts:270-271`, `import-database.ts:77`). audit A09 labels `plan-store.ts` DEDUPE (no sheet existed; BK-1 is it).

## Contract and split
`@jini-ai/core/contracts/backup` (NEW, types only):
```ts
export interface BackupPlannedFile { readonly path: string; readonly bytes: number; readonly sha256?: string }
export interface BackupContentSource {            // one per scope the host offers
  readonly id: string;
  plan(required: { include: Readonly<Record<string, boolean>> }, optional?: { signal?: AbortSignal }): Promise<readonly BackupPlannedFile[]>;
  read(required: { file: BackupPlannedFile }, optional?: { signal?: AbortSignal }): Promise<Uint8Array>;
}
export interface BackupDestination {              // provider plugin implements this; one default
  inspect(required: { folder: string }, optional?: { branch?: string }): Promise<BackupDestinationState | BackupRefusal>;
  uploadBlob(required: { path: string; content: Uint8Array }): Promise<BackupUploadedBlob | BackupRefusal>;
  commit(required: { message: string; blobs: readonly BackupUploadedBlob[]; state: BackupDestinationState }): Promise<BackupCommitted | BackupRefusal>;
  readonly limits: { readonly maxFileBytes?: number; readonly reservedPaths?: readonly string[] };
}
```
- Mechanism `@jini-ai/devops/backup` (NEW node subpath): plan store, job registry, upload engine with bounded concurrency, limit checks, manifest assembly from a host-supplied descriptor.
- Default provider: the existing source-control provider. Its three operations `inspectBackupRepository`, `uploadBackupBlob`, `commitBackupTree` are already in the Jini contract; `BackupDestination` is a thin adapter over them inside `devops` (same package, allowed). No second GitHub code path.
- Stays in Tovu: scopes (`database`, `media`, `themes`, `plugins`, `settings`), manifest file name and layout (`sources.ts:71-72`), limits values, site-key inspection (`backup-service.ts:270-271` reads `process.env` and `homedir()`; the NAME stays in Tovu), credential warnings wording, tool wording, permission id, archive format, restore policy.

## BK-0 (Tovu, tests only, FIRST): round trip + N-1
Read before writing: `__tests__/integration/{archive-v2,import-schema-version,saved-keys-round-trip,import-sanitization-history,archive-sanitization}.integration.test.ts` and `__tests__/fixtures/fake-github.ts`. Extend, do not duplicate. Add what is missing from this list (report which already existed, with test names):
1. Round trip A: seed a site (posts, media file, theme file, plugin state, settings, one saved key) -> plan -> push to the fake provider -> rebuild a site only from the pushed blobs -> compare: row counts per table, media bytes sha256, theme file bytes, manifest fields. Fails if any scope is silently dropped (mutation: remove one scope from `SITE_BACKUP_SCOPES`).
2. Round trip B: export archive -> import into an empty site -> same comparison + the import report.
3. N-1 archive: a builder that writes an archive at the previous manifest version and previous database schema step (build it by running the migration chain up to head-1, never by hand-editing a database); import must migrate automatically and the content comparison must pass. Fails if automatic migration is skipped (mutation: bypass the migrate call in `import-database.ts`).
4. N+1 archive is refused with the version sentence and changes nothing on disk (directory snapshot before/after).
5. Restore never permanently deletes: after a restore over an existing site, the previous files and database are recoverable from the trash location (assert the paths exist). If today's code removes them outright, the test is written RED and the sheet reports it: do not change behaviour in a test-only commit.
6. Push cancel: cancel mid-upload -> no commit call, `CANCELLED` result, job state terminal, no timer left (fake clock; assert no pending timers).
7. Limits at the edge: `maxFiles` and `maxTotalBytes` at limit-1, limit, limit+1; oversized file skipped and reported.
8. Secrets: a file matching the share-secret policy is refused by `requireShareSecretFree`; a credential string placed in a theme file produces a credential warning and is not uploaded unless confirmed (pin current behaviour, whatever it is).
STOP: any test needs a live network or a real provider account. Estimate: 230k tokens (two runs: 1-4, 5-8).

## BK-1 (both repos): plan store and job registry
`plan-store.ts` (138; 4 prod / 13 test importers; module-level singleton `siteBackupPlanStore` at :138 = state cell) and `push-jobs.ts` (121; `SiteBackupPushJobs<T>`, `FINISHED_JOB_TTL_MS`).
- DEDUPE claim to verify before any edit: Jini `@jini-ai/core` `InMemoryTokenStore` (`packages/core/src/gated-mutations/token.ts:92`, 123 lines). Diff behaviour, not names: single use, TTL (10 min), per-key cap (2), total cap (8), eviction order, what `take` returns after expiry, clock source. Check one real caller (`backup-service.ts:planSiteBackup` 538 and `pushSiteBackup` 766). If any of the five behaviours differs: MOVE the Tovu class to `@jini-ai/devops/backup` instead and say so; do not bend callers to the core store.
- `push-jobs.ts`: CLASSIFY says `core/primitives`; it holds timers and state, and rule 21 forbids timers and state in core. Target `@jini-ai/devops/backup` (or `devops/agent-jobs`, which already has `jobs.ts` 112: diff first).
- The singleton does not move: the Jini class is constructed at Tovu's composition root and passed in (`backup-service.ts:37` default import becomes an injected dep; trace every reader: 4 prod importers in `BK-1.importers.tsv`).
Characterization first (fake clock): TTL edge (ttl-1, ttl, ttl+1), caps at cap and cap+1, finished-job retention, a second `take` of the same plan returns nothing.
Estimate: 150k tokens.

## BK-2 (design needed, Opus): engine out of `backup-service.ts` (788) and `push-engine.ts` (191)
`backup-service.ts` mixes: input parsing, permission check (`requireToolPermission`, `PUSH_PERMISSION`), provider selection, credential resolution, repository inspection, plan building, site-key inspection, push with wait (`PUSH_WAIT_MS`), result wording. `secret_word_hits` 195 in one file. It needs a dependency-graph partition (calls, state reads, the late-bound plan store and jobs) before any sheet: no size design exists for it. Constraints for that design:
- security chain to keep in this order: authorize -> validate target (`validateRepositoryTarget`, `validateBranch`, `normalizeWriteFilePath` from `custom-credentials/write-files-validation`) -> resolve credential -> inspect repository (private-only, push permission, folder is not a file, reserved paths) -> plan -> explicit confirmation by plan id -> upload -> commit. A test per gate that fails when the gate is removed; the private-repository refusal and the reserved-path refusal are deny tests written first.
- the token reaches only `buildAuthorizationHeader` (`@jini-ai/integrations/credentialed-http`): under option C `devops` may not import `integrations`; the header value is built by the host and passed in as `authorization` (the Jini `CredentialedRepositoryTarget` already carries `authorization`, not the token).
- upload concurrency (`SITE_BACKUP_UPLOAD_CONCURRENCY = 4`) and cancellation are part of the contract (no effect after cancel).
Estimate: design 180k Opus; execution 2 runs, 400k.

## BK-3 (design needed): `sources.ts` (722, 25 export statements, 11 prod / 12 test importers)
Generic: file walking with limits, oversize skipping, byte formatting (`formatByteSize` already exists in `@jini-ai/core/text`: DEDUPE, verify output strings match for 0, 1023, 1024, 1.5 MiB), planned-file reading with hash, manifest assembly. Tovu: scopes, paths, `captureDatabaseSnapshot` (uses the Tovu `DbOpsPort`), manifest name. Split in Tovu first (SPLIT kind), then MOVE the generic half. Estimate: 100k Opus + 250k.

## BK-4 (seams only): import and restore stay in Tovu
18 files, 2,244 lines. They encode Tovu's archive layout, the frozen database chain and the restore policy, and `import-database.ts` starts a child process with a reduced environment (`:77`). No second user exists. Plan: BK-0 tests, then only two changes: (a) `import-archive-reader.ts` (85, CLASSIFY MOVE -> agent-plugins zip reader): DEDUPE against the Jini reader it wraps; (b) inject `process.env`/`homedir()` reads through the existing `saved-keys-port.ts`. Estimate: 120k.

## Could not verify
- Whether restore permanently removes replaced files (`import-restore-placement.ts`, `import-restore.ts` not read line by line): BK-0 test 5 decides it.
- Which of BK-0's eight tests already exist. That `InMemoryTokenStore` matches the plan store. The admin screens.
