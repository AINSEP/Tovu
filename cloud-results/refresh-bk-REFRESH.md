# BK-0a / BK-0b refresh and execution record

Status: **both TESTS sections implemented in the working tree; cloud verification pending.**
All prior substantive mismatches are resolved by the binding rerun decisions.
No new unresolved substantive mismatch was found. No production file changed.
The earlier STOP disposition is superseded by the owner's explicit instructions
and this execution record; no test is claimed GREEN without execution.

## Checkout and contract

- Tovu: `2d82735a6767fb8572e6a10bf3be6ee2eb07b8f4`, branch `codex/refresh-bk`.
- Read-only sibling Jini: `../m3-jini`,
  `d37821a4627733522a903d78456093516fcb3a3b`.
- Both read-only ancestry checks returned 0: Tovu `232764af5`, Jini `65d73b0d5`.
- Initial changes were only the previous untracked `REFRESH.md` and `COMMIT-PLAN.md`.
- The dispatcher-supplied COMMON-LO, BK sections and sidecars are the spec.
  The local `left-out-areas/` copies and `AI-Dev-Shop/` are absent as expected.
  The two explicitly requested external programmer/guardrail files were read first,
  followed by coding-foundations. No bootstrap approval was inferred.
- Explicit owner machine rules override COMMON-LO's installs, execution, commit
  and push commands: **not run: local** for V0, V1, V2, V3, V4 and S-LIM.
  No tests, builds, installs, typechecks, linters, mutations or Git write commands.
- No graph tool, repository-wide search, subagent or external network operation.
  Reads/searches stayed in named files and the relevant specific directories.

## Mismatches and corrected facts

| Mismatch | Class | Correction / disposition |
| --- | --- | --- |
| COMMON-LO requires sibling directory literally named `Jini` | BENIGN | Use dispatcher's read-only `../m3-jini`, same integration ancestry. Neither section edits Jini. |
| Local COMMON-LO / BK sheet / sidecars absent | BENIGN | Use the complete copies supplied in the dispatch. |
| `backup-service.ts` supplied blob differs | BENIGN | Exactly two import-source changes, described below; plan/upload/cancellation bodies unchanged. |
| Four importer line numbers drifted | BENIGN | Corrected locations below; paths and contracts unchanged. Reused the prior 105-row reconciliation as requested. |
| BK-0a requires enumerating private `ADDITIVE_COLUMN_DEFAULTS` | SUBSTANTIVE, owner-resolved | No export/seam. Public ZIP → isolated worker → new-site round trip drops the historical Library/source/ownership columns in a migrated source copy and asserts defaults. |
| BK-0b item 7 specifies secret refusal, but policy returns true with warnings | SUBSTANTIVE, owner-resolved | Explicitly characterize current inclusion with location-only warnings, including actual fake-provider upload bytes. No refusal behavior added. |
| BK-0b item 2 assumes a nonfallback template-seeded tree | SUBSTANTIVE, owner-resolved | Creation seeds only `tovu-starter`. Capture that actual tree before restore; assert it remains byte-identical and the differing archived tree is preserved in quarantine. No synthetic seed. |
| Saved-key round-trip wording implies preserving a source key | SUBSTANTIVE, owner-resolved by the prior rerun correction | Current capture is retired and import inherits no saved-key authority. Seed the source vault row and assert exclusion. Historical restore callbacks still exercise the existing port. |
| Limits extension filename unspecified; `sources.unit.test.ts` already 783 lines | BENIGN | Extend existing limits suite `share-zip.unit.test.ts`, now 383 lines, within the named existing-limits write set. |
| Non-raster share row counts differ from repository projection | BENIGN fixture clarification | Share adds exactly one original rendition; repository projection retains zero source renditions. Assert this explicit count difference, with other portable table counts equal to source. |
| Share settings omit host config but retain schema provenance | BENIGN fixture clarification | Compare regenerated settings to `{ name: 'Portable', template: { schemaVersion: head.index } }`; repository keeps source config bytes. |

The saved-key correction was already recorded in the previous refresh and
explicitly carried into this rerun by the instruction to use its corrected facts.
New fake saved-key failures return notices at the adapter boundary; generic
non-abort exceptions are not incorrectly injected into an orchestration port
whose existing contract already converts them to notices.

### Corrected blob guards

All paths relative to `apps/website/src/features/site-backup/`. All nine hashes
were freshly recomputed before editing and again after the test additions;
production bytes remain identical to these corrected guards.

| Section | File | Lines | Corrected blob |
| --- | --- | ---: | --- |
| BK-0a | `archive-manifest.ts` | 177 | `5237bc05ed4ec3146ca7575294eaa6ab2b45ea08` |
| BK-0a | `import-database.ts` | 139 | `f0b9ff4d21118bb04261ed29f83f65ebe7d8d7cf` |
| BK-0a | `import-verifier.ts` | 69 | `8424497753f25488307d964339fb7b9bd3665da7` |
| BK-0a | `sources.ts` | 722 | `0f15dd128d24e972b296659ed39fcb47376398eb` |
| BK-0b | `import-restore.ts` | 104 | `fa904c4500fdb19280364385840badebfff8b364` |
| BK-0b | `import-backend.ts` | 215 | `1d2a06ec3c70278f29a8cb499f55c16015c5ef93` |
| BK-0b | `push-engine.ts` | 191 | `10b38dc49bc9b72ada4be9b5239b5c90875875d8` |
| BK-0b | `backup-service.ts` | 788 | `98e3d125690b5a52e0e5f858ab80f285e1164b1c` |
| BK-0b | `push-jobs.ts` | 121 | `982ea190f0fd45b59db2a3d4934e2cf1bdbe280d` |

The supplied backup-service guard was
`74936160b41d614c0b6dc0422654b0d9a03cf543`. Read-only base comparison shows:
`ObservabilityPort` moved from `@jini-ai/diagnostics/observability` to
`@jini-ai/core/contracts/observability`; credential resolution moved from
`../source-control/store.js` to `../source-control/index.js`. Nothing else differs.

### Corrected importer locations

Paths relative to `apps/website/src/`. Other 101 supplied importer rows retain
previously verified locations; no move/importer rewrite is part of these TESTS sections.

| File | Specifier | Sheet line | Corrected line |
| --- | --- | ---: | ---: |
| `server/routes/types.ts` | `#src/features/site-backup/sources` | 23 | 17 |
| `server/runtime/composition/deps.ts` | `#src/features/site-backup/sources` | 127 | 130 |
| `server/routes/types.ts` | `#src/features/site-backup/import-backend` | 1545 | 1304 |
| `server/runtime/composition/site-import-backend.ts` | `#src/features/site-backup/import-backend` | 4 | 5 |

## Current contracts re-grounded

- `SITE_BACKUP_SCOPES` still lists database/media/themes/plugins/settings;
  the fake GitHub records uploads and reconstructs the committed tree. Its fixture
  was read before other backup fixtures. No request leaves its HTTP port.
- `archive-manifest.ts:162–166` distinguishes a different bundled identity
  from unknown identities before sanitizing; the head+1 unknown tag follows
  the unknown branch. There is no import-database migration call to mutate.
- `share-database/repo.sqlite.ts` privately owns additive defaults for media
  kind/original filename/source metadata and blob document ownership. Other
  missing columns still refuse with version advice through the isolated worker.
- `import-backend.ts:112` passes `collisionSafe: true`; real site creation chooses
  the suffix under locks. Restore runs after theme seeding and before the marker.
- `seed-site-themes.ts:71` seeds only `tovu-starter`, with its reset catalog;
  `readTemplate` selects it as fallback. `import-restore.ts:58–62` preserves the
  fallback and sets aside a differing archived copy. Eligible nonfallback trees
  still follow today's deletion loop; BK-R is outside this run.
- Exclusive placement collisions propagate. Init removes the uncommitted site;
  the import backend removes its stage and records the fixed failed sentence.
  A saved-key adapter notice is retained in the successful import report.
- `runBounded` checks abort before taking indexes. An in-flight upload completes;
  a taken file still uploads after cancellation during its load. There is no
  signal check between load and upload. The service checks abort before commit.
  Engine cancellation is `CANCELLED`; service cancellation becomes `abandoned`.
- Job wait removes terminal jobs and clears its budget timer. Tests use the
  existing fake timers plus timer-handle observations, and collect late results.
- File/total caps are strict `>` comparisons; oversized disk files are skipped
  and reported. Secret content is retained with location-only warnings.

## Existing coverage reused (test names read, not executed)

- `v2 tree, one public media copy per item, no secrets and full content round-trip`
  (`integration/archive-v2.integration.test.ts`, protected and unchanged).
- `A production preparation → public download → B import preserves content: inSite`
  and its `appData` variant (`share-round-trip.integration.test.ts`).
- `exports and imports contain no saved keys or inherited grants (inSite)` and
  its `appData` variant (`integration/saved-keys-round-trip.integration.test.ts`).
- `importing a ZIP with missing column returns version advice through the isolated worker`,
  and the extra-column/missing-table variants. The missing `posts.autosave_json`
  case supplies BK-0a's OTHER-column refusal without duplicating it.
- `importing a ZIP with a different manifest schema index returns version advice`
  and its `tag` variant: both original verifier assertions remain; both gain
  backend-level assertions and recursive sites-home listing/size/SHA-256 checks.
- `a static theme of supported assets is placed live and replaces the existing tree`,
  `restore refuses to overwrite an existing database file`, and
  `restore refuses to overwrite an existing site file` (`import-restore.unit.test.ts`).
- `lookup requires the original plan, principal and workspace`,
  `an uncollected outcome expires strictly after the TTL, leaving a running job alone`,
  `a wait budget returns a progress snapshot and leaves the same upload collectable`,
  `an already stopped caller aborts and forgets the pending upload` (`push-jobs.unit.test.ts`).
- `stopping the run while the push waits abandons the upload: no further file, no tree, no commit`
  and `stopping the backup as the manifest upload completes prevents the commit`
  (`tool-registrations.unit.test.ts`).
- `a disk file over the host's per-file limit is left out and named in skipped with its size; exactly the limit stays`
  and `too many files, or too many bytes in total, is refused with the cap named`
  (`sources.unit.test.ts`).
- `credential-looking files stay included and warnings contain only locations and match kinds`
  and `export keeps database values and complete plugin packages; download requires a durable acknowledgement`
  (`credential-warnings.integration.test.ts`).

## Added/extended tests and proposed V3 mutations

**25 new expanded cases; 2 existing identity cases strengthened.** These are
source counts, not execution results. Mutations below have NOT been applied/run.
Paths below are under `features/site-backup/__tests__/`.

| Case (file) | Mutation that must make it RED |
| --- | --- |
| Repository plan/push round trip (`integration/archive-round-trip.integration.test.ts`) | Remove any one scope from `SITE_BACKUP_SCOPES`; exact manifest scope comparison fails. Rejecting warning-bearing theme content also fails the upload-byte assertions. |
| Share/new-site round trip (same file) | Skip restoring an upload in `restoreStagedImport`; destination hash/file assertion fails. |
| Same-identity older Library shape (`integration/saved-keys-round-trip.integration.test.ts`) | Delete either map entry in `ADDITIVE_COLUMN_DEFAULTS`; worker refuses instead of successful import/default assertions. |
| Bundled historical index and differing recipient tag (2 extended cases, `integration/import-schema-version.integration.test.ts`) | Accept a different bundled identity; the no-sanitize fake/refusal assertion fails. Any sites-home write fails the recursive snapshot. |
| Unknown identity and unknown head+1 identity (2 new cases, same file) | Remove unknown-identity refusal; exact `INVALID_ARCHIVE` / unknown sentence fails. |
| Same-name new site (`integration/import-creates-new-site.integration.test.ts`) | Pass `collisionSafe: false` in `createImportedSite`; second import cannot create the expected suffix. |
| Real fallback preservation (same file) | Remove fallback exclusion in `restoreStagedImport`; live tree no longer equals its actual seeded bytes. |
| Saved-key abort rollback (same file) | Skip `savedKeys.restore`; expected exact abort and failed/absent site-stage assertions fail. |
| Exclusive placement rollback (same file) | Change placement `flag: 'wx'` to `'w'`; expected `EEXIST`/rollback fails and later saved-key call becomes visible. |
| Saved-key failure notice (same file) | Discard notices in `restoreOptionalSavedKeys`; ready report lacks the notice. |
| Pre-index abort (`push-cancellation.unit.test.ts`) | Remove the worker's pre-index signal gate; upload count becomes nonzero. |
| In-flight upload at concurrency 1 (same file) | Remove the worker-loop abort gate; it takes/upload the second file. |
| Abort during `file.load()` (same file) | Add a signal-aborted return immediately after load; THAT file no longer uploads. The descriptor's `absPath` getter aborts inside load, without mocking package internals. |
| Abort during repository inspection (same file) | Remove pre-index abort gate; inspection cancellation is followed by uploads. |
| Abort after last manifest upload (same file) | Delete the service's `run.signal.aborted` check after `uploadPlannedContent`; a tree/commit is written. |
| Terminal completion / terminal abort (2 cases, same file) | Remove `jobs.delete` in wait, or `clearTimeout` in finally; job lookup / exact cleared-budget-handle assertion fails. |
| File count limit-1 / limit / limit+1 (3 cases, `share-zip.unit.test.ts`) | Lower the comparison threshold by 2 / change `>` to `>=` / remove file-count refusal, respectively. |
| Total bytes limit-1 / limit / limit+1 (3 cases, same file) | Lower threshold by 2 / change `>` to `>=` / remove total-byte refusal, respectively. Inputs contain two files, covering combined totals. |
| Oversized file skipped/reported (same file) | Change either strict boundary or omit skipped report; retained 9/10-byte files or the exact 11-byte report differ. |
| Current secret inclusion (`credential-warnings.integration.test.ts`) | Refuse/return false on warnings, or suppress provider-shape warnings; inclusion/classification assertions fail. |

## Verification and scope record

- S-BLOB: 9 corrected guards match before and after additions; both ancestry checks exit 0.
- S-PRE: neither section has a prerequisite. No green replay is asserted.
- Protected archive-v2: base-to-working-tree path diff prints nothing.
- Read-only added-line scans include all 3 untracked new test files and the
  tracked diff. S-SUPPRESS, S-MOCK, S-FORWARD, S-DELETE, S-CRED, S-BOOT,
  S-NET: **0 matches each**. Scans were adapted to working-tree additions
  because Git writes/commits are prohibited; `git show HEAD` cannot inspect them.
- S-SCHEMA: touched files are only the seven test paths and the two required
  root reports. No schema, migration, generated-file, manifest, dependency or Jini edit.
- Git diff whitespace check: exit 0. Relative imports of new files were
  reconciled to existing paths by read-only checks.
- No existing assertion was deleted or weakened; original version-refusal
  verifier assertions remain alongside new backend/snapshot assertions.
- V0–V4, baseline tails, test pass/fail counts, runtime validation, coverage,
  mutation RED proof, eslint/S-LIM and size/complexity ratchets: **not run: local**.
  No test process was started. Cloud execution is the remaining verification.
- New files: archive round trip 171 lines; new-site import 146;
  cancellation 193. Edited files: schema-version 162; saved-keys 213;
  limits 383; credential warnings 129. Every file is below 500 lines;
  new helper/test callbacks are below 50 lines by source review. Numeric
  complexity/ratchet compliance is not claimed without the prohibited checks.
- Architecture self-review: PASS for the authored tests-only scope: existing
  ports, real composition owners, in-memory credentials/provider HTTP fake,
  no new production seam/export, no internal-package mock, no live network.
  Snapshot/inventory helpers bound work to throwaway fixtures. Cancellation
  reuses importFixture's resource ownership and cleanup instead of adding a
  new filesystem deletion path. No new production recurring work.
- Function-quality review: small fixture/assertion helpers and bounded test
  callbacks reviewed for contract, branch observability and names; no known
  unresolved source-review finding. Skepticism pass caught/corrected the
  non-raster rendition count and schema-provenance expectations. Runtime
  correctness remains unverified. Existing over-limit test helpers were not edited.
- Reuse: import/restore/schema behavior uses `importFixture`, real worker and
  composition ports; repository and cancellation use `FakeGitHub`, the real
  provider loader and existing plan/job stores. Discovery inspected the sheet's
  owners and named fixtures; no parallel behavior implementation was added.

No commits or pushes were made; `.git` remains read-only. See COMMIT-PLAN.md
for the two proposed logical commits and their exact file lists.
