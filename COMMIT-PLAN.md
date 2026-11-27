# Y5 content round 2 — coordinator commit plan (do not commit this file)

Scope: Tovu only; Jini origin/codex/y5-content-2j a2c15bc876b3935e7b0cc3fcdcc8e1183d7f9ede read-only. G0 satisfied. Desktop and themes excluded. No git mutations. No tests, mutation executions, installs, builds, typechecks or linters run (dispatch override).

The explicit sheet binding examples are the approved pattern. Architecture chapters 13/14 read from /Users/la/Programming/Tovu/ADS-memory because this clone omits ADS-memory. Required package contracts and inherited tests are inspected before edits. No new abstractions or runtime behaviors authorized.

## Named tests / mutations

- Desktop: partial/failed reads, zero, Windows private bytes, mixed grouping; drop-partial-fallback. STOP: explicit apps/desktop exclusion.
- Taxonomy: packages/cms/src/taxonomy/__tests__/{agent-tools,tool-registrations}.test.ts; widen-assigned-content-type-schema (read schema differs from assignment schema).
- Vendor credentials: vault-adapter.bindings.test.ts; drop-owner-scope-check. Prior round retained.
- Trash: kernel-user-trash-store.test.ts and y5-trash-bindings.test.ts; remove-user-status-cas and purge-active-user. Prior round retained.
- Site export: site-exporter.bindings.test.ts; allow-protocol-relative-script. Prior round retained.
- Source control: tool-bindings.test.ts; commit-on-dry-run (dry run must never call commit or confirm). Inspected before binding.
- Entries: publish-content.test.ts; validate-terms-after-import. Prior round retained.
- Media: publish-content.test.ts; admit-library-document. Prior round retained.
- Media generation: tool-bindings.test.ts; env-before-saved. Prior round retained.
- Media import: bindings.test.ts; emit-full-egress-refusal. Pending upstream port check.
- Recovery: tool-bindings.test.ts; confirm-as-agent (assert human/user confirmation, then agent execution with human delegation and shared lock). Inspected before binding.
- Post: y5-post-bindings.test.ts, y5-post-repo.test.ts, retained Tovu two-connection append test; skip-post-revision-fence. Pending kernel contract check.

Mutation-red proofs are deferred to Opus by the explicit prohibition on running tests; no red/green claim is made.

## Completed logical commits (working tree only)

1. Taxonomy: delete features/taxonomy/agent-tools.ts; bind catalog in features/taxonomy/tool-registrations.ts; repoint assistant/__tests__/tool-registrations.{contracts,taxonomy}.test.ts. Named mutation above. Paths relative to apps/website/src.
2. Source control: reduce features/source-control/tool-registrations.ts to bindSourceControlTools with existing host policy and current call shapes. Named mutation above. No caller API changes.

3. Recovery: features/recovery/tool-registrations.ts now binds required gateway, hook, confirmation, authorization and operation-lock ports. features/recovery/__tests__/unit/tool-registrations.deep-link-validation-status.unit.test.ts supplies explicit surface factory. Existing contributor composition supplies surfaces; no production default remains. Mutation confirm-as-agent awaits Opus.

4. Post independent steps: delete features/post/repo.rows.ts and the read-model.ts re-export shell; point server/runtime/composition/modules/site-search.ts directly at Jini with the named row input. Change features/post/repo.ts codec calls to named inputs and inject exact-text SHA-256; this permits deletion while its factory step is blocked. features/post/repo.sqlite.ts now extends Jini SqlPostRepo with same-kernel search, erased schema and runtime ports; its public constructor stays unchanged. Existing repo.rows/L156 tests and search-scratch-host already use Jini and named inputs in HEAD.

## Stopped / dependent steps

- Desktop: do not edit apps/desktop/** overrides deletion sheet. File remains; no keep entry.
- Media import: packages/cms/src/media/site-import/bindings.ts fixes its public videoImport type to Jini VideoImportOptions (requires linkDerivedMedia). Tovu features/media/import-video-conversion.ts exports Omit<Options, "linkDerivedMedia"> and constructs the linker inside createConvertingUploader. Existing composition line 609 and import-video-conversion-wiring fixture pass the host type. No binder type parameter or injected option adaptation exists. Replacing the file would break those callers; adding a new wrapper/type API is forbidden. File remains unchanged; no keep entry. Smallest upstream repair: binder accepts injected uploader's host video-option shape, or moves the existing linker binding behind a named required port.
- Post repo factory: packages/cms/src/posts/sql/repo.ts bindPostRepoFor only accepts runtime ports plus searchHost. Its returned function requires StorageKernel<Kysely<unknown>, unknown>; it has no schemaErasedKernel/kernelFor injection input. Tovu callers pass ContentKernel (KyselyKernel<ContentDatabase>). The prescribed factory binding cannot retain those call shapes while erasing at the binding without an unlisted wrapper/cast. Leave repo.ts class and factory, no keep entry; named-object factory caller conversion and two-connection test repoint remain dependent. SQLite class migration and row-codec deletion completed independently. Smallest upstream repair: required schema-erasure injection into bindPostRepoFor.

- Post codec consumer completion: features/site-search/__tests__/cms-search.test.ts also repoints directly to Jini and supplies the named row input. No read-model forwarding shell remains.
5. Keep ledger: append source-control/tool-registrations.ts and recovery/tool-registrations.ts only after final file review. Preserve all ten prior entries. Deleted files get no rule; media-import and post/repo get none.

## Final review / cleanup

Re-read every changed diff and the two final bound files. Deleted only superseded code required by this migration: features/taxonomy/agent-tools.ts, features/post/repo.rows.ts, and the features/post/read-model.ts forwarding shell. Removed Recovery's local handlers/default surface creation and Source Control's local forwarding builders in favor of the named Jini binders. Removed their now-unused imports, local risk/catalog index and helper declarations. No unrelated cleanup, added comments, helper APIs or new test scaffolding. No certified test cases deleted or weakened. The optional vendor-credential allowlist-row removal was not triggered: no tests ran and its inspected test does not require allowlisted calls to remain in production files.

Round-1 completed sheets retained: Vendor credentials, Trash (including STAYS-HOST permissions), Site export, Entries, Media, Media generation, and Post policy/preview/memory/thinning. Their current bindings were re-read. No conditional repair was made without a visible source mismatch.

## Evidence / handoff

- Static diff check: git diff --check PASS.
- Required recount (script has KEEPDIR_OR_FILE arguments, no literal keep mode): OUT=/tmp/y5-content-2-recount bash cloud-results/count-25/count-files-left.sh "$PWD" /Users/la/Programming/Jini plans/count-1125/{k0-keeps,x4-keeps,merge25-g3-keeps,y5-content-keeps}.md
- Raw recount: planner=877 true=608 rules=301. Artifacts: /tmp/y5-content-2-recount/. Its graph has no import targeting any of the five deleted migration modules (entries/publish-content, post/revision-thinning, post/repo.rows, post/read-model, taxonomy/agent-tools).
- Recount confirms the three unfinished MOVE files: apps/desktop/src/desktop-memory-sampler.ts, apps/website/src/features/media-import/tool-registrations.ts, apps/website/src/features/post/repo.ts.
- Desktop/theme diff is empty. No package manifest, dependency, lockfile or Jini edits. All git operations read-only; coordinator owns commits. COMMIT-PLAN.md is uncommitted and must stay out of commits.
- Round-2 tracked changes: 14 paths (13 under apps/website/src plus keep ledger), including 3 deletions; COMMIT-PLAN.md is the only new file. No new Tovu test cases: upstream named characterization tests already exist and were inspected before relevant bindings; only existing import/call/fixture wiring changes here.
- Test/build/install/typecheck/lint and mutation execution: NOT RUN by dispatch. No runtime, green-baseline, coverage or mutation-red claim. Opus must run the listed tests and mutation proofs after package intake. Two-connection Postgres test is retained and awaits factory migration before it exercises the Jini class.
- Architecture audit: WARNING/PARTIAL: newly completed bindings are imports, host data and single-expression dependency adapters; no package edges or new generic implementation. Post factory and Media import remain at the explicit upstream contract gaps above; desktop excluded. The Post SQLite constructor uses the same kernel and preserves scripts/forms-maintenance.ts's public constructor.
- Function-quality review: source-control/recovery bindings — no new logic-bearing function; single-expression adapters preserve host effects. Post codec consumers — object-input conversion only; SHA-256 still hashes exact persisted JSON text. SQLite constructor — existing factory selection plus required runtime dependency injection. No new loops, branches, queries or retention. Named existing tests cover each changed seam; execution evidence deferred.
- Totals over 18 MOVE files: 4 deleted + 11 pure bindings + 3 left = 18. STAYS-HOST trash/permissions is bound separately. Keep ledger: 12 rules, all prior lines preserved. Migration reduction this round: four additional MOVE files finished (taxonomy, rows, source-control, recovery), plus read-model shell deletion outside the 18-file inventory.
