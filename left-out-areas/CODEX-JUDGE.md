Software Architect + Security(Review): **Verdict: needs rework.**

Reviewed INDEX, every sheet, inventories and sidecars against Tovu `80b00f5b`, Jini `02edbb68`, and plan `71eacdff`. Read-only; no tests executed.

References below use `T:` for `apps/website/src/`, `J:` for Jini’s `packages/`, and sheet filenames for `left-out-areas/sheets/`.

1. **[blocker] BK-0 requires an N-1 upgrade that the current import contract explicitly refuses.**

   **Evidence:** `BK-backups.md:41` calls this characterization, requires automatic migration, and names a mutation bypassing migration in `import-database.ts`. But `T:features/site-backup/archive-manifest.ts:162–165` rejects every different schema identity, including recognized historical identities. Existing tests explicitly assert that refusal (`__tests__/integration/import-schema-version.integration.test.ts:57–62`). `import-database.ts:68–80` launches an isolated worker; it contains no migration call matching the proposed mutation.

   **Fix:** Add a separate, approved compatibility implementation sheet before the N-1 success test becomes a green prerequisite. Specify supported archive formats and schema identities, trusted historical-schema validation, upgrade execution, and preservation of hostile-schema refusals. A tests-only sheet cannot deliver this requirement.

2. **[blocker] Recoverable restore replacement is deferred even though permanent deletion is visible in the source.**

   **Evidence:** `BK-backups.md:43` leaves the test RED if restore deletes files; INDEX:75 sends the implementation to a future owner decision. `T:features/site-backup/import-restore.ts:63` already recursively removes live theme directories. Database placement uses `COPYFILE_EXCL` at line 66: this is initialization into an unoccupied database path, not the proposed “restore over an existing site” contract.

   **Fix:** Define the actual replacement boundary and schedule recoverable parking, rollback, and failure reporting before dependent backup sheets. Cover failures after parking, database placement, partial file placement, and saved-key restoration. Do not leave the required no-permanent-delete behavior as an unscheduled decision.

3. **[major] The inherited execution rules do not establish the required green intermediate states.**

   **Evidence:** INDEX:36 assembles every job with COMMON. That file prohibits tests, typechecks, builds and installs (`COMMON.md:9`), tolerates unresolved new Jini imports (`:42`), and delegates RED/GREEN proof to a later batch (`:29`). INDEX:62–67 schedules waves without a verification step replaying each intermediate SHA. BK-0 additionally permits a known failing test-only commit.

   **Fix:** Provide one precedence-resolved execution contract and a named verifier stage. Verify every intermediate SHA against its declared Jini version before releasing dependent work. Keep failing requirement tests with their implementation commit, or explicitly outside the green characterization prerequisite.

4. **[major] SC-3’s “types READY” classification conceals known runtime and ABI differences.**

   **Evidence:** `SC-source-control.md:70` delegates differing members to STOP. Those differences already exist:
   
   - `T:features/source-control/provider-module.ts:22` exports a runtime saved-key binding map.
   - Lines 118–134 define inline backup entries and `entries`; Jini `source-control/contracts.ts:21` instead requires `blobs`.
   - Tovu operations use positional token/upload arguments and separate write plans (`:160–174`); Jini uses different object contracts (`contracts.ts:33–40`).
   - The kits differ in fetch, HTTP-client, redirect and sleep contracts.

   **Fix:** Complete the ABI matrix now. Assign the runtime map an owner, preserve inline backup behavior, and specify adapters and all caller updates. Separate provider ABI contracts from orchestration contracts before the core move; copying Jini’s contract wholesale also retains references to devops implementation types.

5. **[major] The source-control security trace describes protections that do not apply to the named paths.**

   **Evidence:** `SC-source-control.md:27–28` says outbound calls pass through guarded `HttpClientPort` and identifies the bundled loader as activation/digest gated. In reality:
   
   - `T:features/source-control/provider-kit.ts:30–38` supplies native fetch separately from the guarded client and selects caller-controlled redirect policy.
   - GitHub’s account probe uses that fetch (`J:agent-plugins/github/source-control/github.mjs:70–75`).
   - `T:features/source-control/provider-registry.ts:109–110,133–135` loads bundled sources through the source loader, whose documentation explicitly distinguishes it from installed activation/digest checks.
   - Credential CRUD also has workspace and permission gates absent from the trace (`T:server/inbound/admin-http/routes/system/source-control-credentials.ts:106–110`).

   **Fix:** Trace installed and bundled loading separately, and distinguish native fetch from guarded HTTP. Inventory account probes, commits, custom writes and backups separately; attach removal-sensitive tests to the actual gate and production binding.

6. **[major] SI-1 has an unresolved host-policy dependency and prescribes behavior-changing characterization tests.**

   **Evidence:** `DC-SI-ML-small-areas.md:28,34` moves `resolveSameOriginPath` into diagnostics while leaving Tovu routing policy behind. The function calls `assertNoDisallowedDecodedForm`, which invokes Tovu’s `checkSitePathname` (`T:features/site-inspection/published-page.ts:275–277,319–323`). No policy port or remaining host wrapper is specified.

   The same sheet requires validation before opening the socket, whereas production opens the server first (`:496–501`). Its deny list also includes double-encoded traversal without reconciling the source’s explicit one-decode contract (`:143–149,158–173`).

   **Fix:** Define the injected policy and wrapper boundaries. Characterize actual ordering and decoding first; approve any stricter behavior separately. Add reserved `/admin` and `/api` cases that fail when the host policy binding disappears.

7. **[major] ML-1’s claimed type-only dependencies omit runtime constants, breaking its intermediate move.**

   **Evidence:** `DC-SI-ML-small-areas.md:39–41` says the domain imports repo port TYPES and moves those types first. But `T:features/mail-status/activity.ts:17–19,132–133` imports and uses runtime `MAIL_ACTIVITY_OUTCOMES` and `MAIL_ACTIVITY_USES`. Their owner remains the unmoved SQL file (`T:features/mail/activity.repo.ts:25–28`) until ML-2.

   **Fix:** Assign these values a neutral owner in ML-1 and update both consumers in that commit. Provide complete declaration dispositions and bindings instead of leaving the executor to discover another dependency.

8. **[major] ML-1’s security acceptance tests omit independent owner and disclosure gates.**

   **Evidence:** The proposed tests (`DC-SI-ML-small-areas.md:42`) cover permission denial but omit the separate owner check in `T:features/mail-status/suppressions.ts:77–78`. The proposed host inputs also omit `ownerPrincipalId`.

   Activity access has two permitted tiers, not simply read-or-deny (`activity.ts:147–155`). Masked projection removes IDs, provider diagnostics and other fields (`:158–161`), while recipient filtering and detail lookup require full access (`:186,219`). Testing `maskRecipient` alone cannot protect those boundaries.

   **Fix:** Specify the owner-identity port and test a non-owner who possesses manage permission. Add full-versus-masked response assertions, recipient-filter refusal, detail refusal, and authorization revocation between planning and execution.

9. **[major] ML-2 necessarily stops on a dependency prerequisite that the plan never schedules.**

   **Evidence:** `DC-SI-ML-small-areas.md:46` requires STOP unless platform already declares Kysely. It does not: `J:platform/package.json:229–259` lists dependencies, development dependencies and peers without Kysely. The source uses runtime `sql`, not merely erased types (`T:features/mail/activity.repo.ts:21`; `mail/retention.ts:3,15–26`).

   ML-2 also does not fill the SQL template’s required table types, table bindings, lock keys, test dispositions, baseline edits or commit wiring (`T-SQLREPO.md:18–36`).

   **Fix:** Schedule the package dependency decision and manifest/lockfile prerequisite, then supply the completed SQL worksheet. Reclassify ML-2 until those inputs exist.

10. **[major] DB-2 invents a principal foreign key and cites a comment saying the opposite.**

    **Evidence:** `DB-table-setup.md:27` claims redirects reference principals and proposes optionally reproducing that constraint. `T:platform/db/schema.sqlite.ts:168–176` explicitly says attribution references are unenforced so they survive principal deletion. Redirect tables at `:650–712` contain no such foreign key.

    **Fix:** Remove the invented constraint and optional principal-table input. Derive the baseline from the executed migration head and test that deleting a principal preserves redirect attribution.

11. **[major] The schema-parity proof cannot detect several schema properties the plan promises to preserve.**

    **Evidence:** `DB-table-setup.md:21` inventories columns, indexes and foreign keys, but omits CHECK expressions, collations and generated-value/identity semantics. Line 29 nevertheless requires collation parity. Existing schemas contain CHECK constraints (`T:platform/db/schema.sqlite.ts:231,1576,1894–1905`) and autoincrement revision identifiers (`:687`).

    **Fix:** Extend the schema-description contract and mutation self-tests to those properties. Prove that removing a CHECK, changing collation, or changing revision-ID generation fails parity on the applicable dialect.

12. **[major] The domain-history API does not explain how host table names reach migration steps.**

    **Evidence:** `DB-table-setup.md:14` specifies a constant `readonly MigrationStep[]` while saying step bodies take the repository’s table-name object. The actual contract supplies only `(kernel, context)` (`J:core/src/contracts/storage/migration.ts:21–28`).

    **Fix:** Specify a typed history factory closing over validated host names, with exact step IDs, checksum rules and ledger configuration. Also resolve D-DB2/D-DB3 before calling DB-2 READY; its proof host remains an alternative at line 28.

13. **[major] Backup cancellation is described as stronger than the existing implementation and proposed ports support.**

    **Evidence:** `BK-backups.md:61` requires “no effect after cancel.” Current cancellation stops taking another worker index (`T:features/site-backup/push-engine.ts:138–150`), but a cancellation during `file.load()` does not prevent the following upload (`:167–169`). Abort during repository inspection likewise precedes a later upload call (`backup-service.ts:686–696`). The proposed destination operations (`BK-backups.md:26–30`) expose no cancellation contract.

    **Fix:** Define cancellation linearization points, treatment of in-flight requests, and when terminal completion is observable. Add tests cancelling during inspection and deferred file reads, not only during upload. Schedule hardening separately from parity-preserving extraction.

14. **[major] BK-4 labels a security-policy wrapper as a deduplication candidate without accounting for its additional protections.**

    **Evidence:** `BK-backups.md:68` proposes deduplicating `import-archive-reader.ts` against its wrapped Jini reader. Tovu adds local/central header agreement, extra-field validation, unsupported-feature refusal and strict filenames (`T:features/site-backup/import-archive-reader.ts:21–56,64–74`). Jini’s reader intentionally projects entries without those policies (`J:agent-plugins/src/lifecycle/yauzl-archive-reader.ts:73–93,107–121`).

    The same sheet proposes using `saved-keys-port.ts` for process environment/home injection, although that interface only defines capture, reveal and restore operations (`T:features/site-backup/saved-keys-port.ts:7–14`).

    **Fix:** Preserve the wrapper or design an explicit policy-capable extension with adversarial parity tests. Define a separate child-environment input at the worker boundary; do not overload the saved-key service.

15. **[major] TH-R1’s watcher characterization contradicts replacement semantics already tested in the repository.**

    **Evidence:** `TH-theme-rest.md:19` requires “start twice = one underlying watch.” Production synchronously stops the prior watcher and opens a replacement (`T:features/theme/theme-watcher.ts:57,84–95`). The existing test explicitly verifies restarts, site switches and stale-stop isolation (`__tests__/theme-watcher.test.ts:127–148`).

    **Fix:** Preserve one *live* watcher while allowing replacement opens. Carry the existing site-switch, stale-callback, roster-identity and discovery-before-notification tests into the design. Specify which object owns replacement across factory instances.

16. **[major] TH-R3 is not READY: its security state and write behavior are absent from the proposed seam.**

    **Evidence:** `TH-theme-rest.md:29–30` describes routing/storage ports and theme-resolution snapshots. Actual visitor publication owns a process-local snapshot map, random document revisions, workspace matching, expiry and bounded eviction (`T:features/theme/visitor-publication.ts:12,61–63,85–89,107–117`), plus submit-target validation (`:128–154`).

    `active-theme.ts` additionally owns deliberate “none,” fallback warnings and the styling write allowlist (`:106,157–184,216–222`). `verify-active-theme.ts:54–58` performs a compensating settings write and refresh notification. None is protected by the proposed resolution/header tests.

    **Fix:** Design these as separate behavior owners with explicit state lifetime, clock/randomness/reporting ports and compensation contracts. Add security and mutation tests before assigning executable extraction steps.

17. **[major] The deliverable remains incomplete and violates its advertised run granularity.**

    **Evidence:** INDEX:88–92 leaves several designs, outlines, twelve domain sheets, share export and static-download layout unfinished. The last two alone are 2,512 production lines (`BK-backups.md:11–12`). BK-0 explicitly spans two runs; BK-2 execution is also two runs; SC-4 estimates 300–450k against COMMON’s hard 300k context ceiling. These are not individually bounded executable sheets.

    Target rules also remain unresolved: `TH-theme-rest.md:13` explicitly retains the theme barrel (`T:features/theme/index.ts:1–74`), and new contracts such as `describeSchema(kernel, tableNames)` and the proposed injection guard omit the required two-object signature.

    **Fix:** Produce one worksheet per run with explicit cut points and independently valid commits. Complete the requested area coverage or obtain a scope reduction. Resolve barrel/signature exceptions before estimating execution cost.

18. **[minor] Some reuse and reconciliation claims are factually wrong.**

    **Evidence:** `BK-backups.md:65` says `formatByteSize` already exists in core/text. It is absent from that entry (`J:core/src/text/index.ts:1–16`). The similarly named admin formatter uses different labels and rounding (`J:admin/src/media/rules.ts:125–131`) from backup (`T:features/site-backup/sources.ts:587–591`).

    INDEX:23 says T-TH-07 moves theme-trash’s filesystem helper, but `T/T-TH-theme.md:37–38` says that file stays and schedules no such extraction. The touch ledger also omits shared test edits recorded by S5 and T-TH-05.

    **Fix:** Correct the owner search and record the formatting differences. Remove the fictitious T-TH-07 handoff and include shared tests in the serialization ledger.

The required ten-file ownership sample covered `commit-site.ts`, `provider-module.ts`, `plan-store.ts`, `import-keep-off.ts`, `published-page.ts`, `deploy-config.ts`, mail activity domain/repository, `visitor-publication.ts`, and `theme-trash.ts` across the four specified plan refs. I found no additional primary extraction collision in that sample. That does **not** establish complete touch-list coverage: importer, test and composition edits also need reconciliation.

I spot-checked more than fifteen inventory/classification rows against source, including those ten plus `provider-kit.ts`, `provider-registry.ts`, `credential-form.ts`, `push-jobs.ts`, `push-engine.ts`, `sources.ts`, `import-restore.ts`, `page-body.ts`, `suppressions.ts`, `theme-watcher.ts`, `active-theme.ts`, and the migration index. Findings above distinguish incorrect classification from baseline drift already disclosed by INDEX.

Lessons 27–31 could not be verified: the local lessons file and the inspected supplied-ref copies end at 26. No verdict against those missing lessons is asserted.

## Recurring mistake classes

No additional class asserted: without lessons 27–31, novelty against the complete lessons file could not be established.
