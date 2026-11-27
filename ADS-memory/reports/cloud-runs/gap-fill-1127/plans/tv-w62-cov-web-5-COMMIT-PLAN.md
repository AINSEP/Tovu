# Coverage gap fill

Each entry names the source mutation expected to break the test. The Author Checklist was applied by inspection. No mutations or tests were run for this dispatch.

- `apps/website/src/features/site-backup/__tests__/bundled-export-file-policy.unit.test.ts` — the default reader compares archive bytes against the installed file on disk → Supply a no-op reader in place of the default options in `bundled-export-file-policy.ts`; identical installed bytes now scan.

- `apps/website/src/features/site-backup/__tests__/share-expiry.unit.test.ts` — direct expiry validation uses the requested copy and rejects unconfirmed hosting → Ignore the supplied copy in `share-expiry.ts` or accept a foreign provider based only on binding in `share-own-folder.ts`.

- `apps/website/src/features/site-backup/__tests__/share-expiry.unit.test.ts` — expiry choice detection does not coerce form strings or treat Never as a day count → Coerce `required.days` with `Number` before the `isShareExpiryChoice` host call.

- `apps/website/src/features/site-export/__tests__/export-preflight.unit.test.ts` — exactly five third-party script hosts are shown without an overflow marker → Change the overflow condition from `>` to `>=` in `export-preflight-copy.ts`.

- `apps/website/src/features/site-evidence/__tests__/unit/collect-page-evidence.unit.test.ts` — host disclosure redacts application keys in observed strings without dropping structural evidence → Return unredacted cookie/request/accessibility/performance arrays, or stop replacing short credential header values in `collect-page-evidence.ts`.
- `apps/website/src/features/site-evidence/__tests__/unit/collect-page-evidence.unit.test.ts` — a browser launch failure retains actionable text without its application key → Return the raw message in the observation policy's `redactMessage`.

- `apps/website/src/features/site-update/__tests__/read-status.test.ts` — a failed journal read is reported without hiding a healthy update check → Rethrow the journal I/O error instead of returning undefined in `readSafeLastAttempt`.
- `apps/website/src/features/site-update/__tests__/read-status.test.ts` — journal cancellation rejects even when the feed is healthy and is not logged as a failure → Remove the journal catch's aborted-signal guard.
- `apps/website/src/features/site-update/__tests__/github-release-feed.test.ts` — a release tag is trimmed, optional notes are normalized, and the request keeps the caller signal → Skip trimming the configured URL, stop forwarding the signal, or pass a null note through.
- `apps/website/src/features/site-update/__tests__/github-release-feed.test.ts` — an all-whitespace tag never advertises an update, even with valid notes → Check `tag === ""` rather than the trimmed tag.
- `apps/website/src/features/site-update/__tests__/candidate-readiness.test.ts` — if the exact target is not staged, rehearsal never makes a disposable copy → Copy the snapshot ahead of the missing-candidate guard.
- `apps/website/src/features/site-update/__tests__/candidate-readiness.test.ts` — failed migration still disposes the snapshot copy before rejecting → Move disposal to the success-only path.

- `apps/website/src/features/storage/__tests__/tool-registrations.test.ts` — storage report rejects a non-owner without measuring and returns the read-only measurement to the owner → Drop `authorizeOwner` or substitute cleanup's dry run for measurement in `site_storage_report`.
- `apps/website/src/features/storage/__tests__/tool-registrations.test.ts` — cleanup rejects malformed arguments before measuring and accepts a dry run with safe class spellings → Delete the boolean/type/content guard or flip the explicit dry-run branch.
- `apps/website/src/features/storage/__tests__/compact-site.test.ts` — linked and non-file database paths are deferred without conversion or changing their bytes → Drop either the link-count or the plain-file guard in `compact-site.ts`.
- `apps/website/src/features/storage/__tests__/compact-site.test.ts` — clearing a content marker persists across reopened stores without removing the chat marker → Make `clear` a no-op, or have the delete clear both journal entries in `compaction-marker.ts`.

- `apps/website/src/features/storage/__tests__/compaction-recovery.test.ts` — when hard links are unavailable a verified separate copy preserves the old database before publication → Return success from `preserveOldMain` without taking a fallback copy.
- `apps/website/src/features/storage/__tests__/compaction-recovery.test.ts` — a corrupt fallback copy is removed and never replaces the live database → Skip fallback hash verification, or skip deleting the rejected fallback copy.
- `apps/website/src/features/storage/__tests__/compaction-recovery.test.ts` — resume after a crash during staging clears only the partial file and unfinished journal → Skip the `staging` recovery arm or leave its partial file behind.
- `apps/website/src/features/storage/__tests__/compaction-recovery.test.ts` — recovery filesystem distinguishes an absent path from an unreadable path and never replaces an occupied alias → Translate all lstat errors to `missing` or all link errors to `unsupported` instead of rethrowing.

- `apps/website/src/features/sites/__tests__/warm-switch.unit.test.ts` — a full warm pool or failed retirement never restarts a busy site or persists a new selection → Remove either capacity code from the special refusal in `warm-switch.ts`.
- `apps/website/src/features/sites/__tests__/site-admin-tools.unit.test.ts` — sites_create_site never calls the create port for a cancelled request → Delete the signal check immediately before the create in `sites/tool-registrations.ts`.
- `apps/website/src/features/site-evidence/__tests__/unit/tool-registrations.unit.test.ts` — an unexpected origin registry failure is not reclassified as unverified origin → Catch all origin errors as unverified.
- `apps/website/src/features/site-evidence/__tests__/unit/tool-registrations.unit.test.ts` — the contributor keeps a missing browser reportable with or without a guarded renderer client → Drop the contributor's HTTP client wiring or replace the guarded launch settings with the legacy settings.

- `apps/website/src/features/theme/__tests__/code-tier-asset-normalizer.test.ts` — a secondary stylesheet's exact href relocates without altering its attributes or similarly named assets → Skip the CSS href rewrite or interpolate an unescaped filename in the matching regex.
- `apps/website/src/features/theme/__tests__/code-tier-asset-normalizer.test.ts` — rewriting a relocated script changes src but preserves data-src on the same element → Match `src=` without checking the full attribute name. The source currently does this at `code-tier-asset-normalizer.ts:201`, so this regression test is expected red.

- `apps/website/src/features/site-backup/__tests__/import-database.unit.test.ts` — the default import stages under a marked, locked root and removes it after refusal → Remove the supplied host `tempRoot` in `import-database.ts`; the fallback root has no provenance marker.
- `apps/website/src/features/site-backup/__tests__/import-database.unit.test.ts` — an explicitly owned import root takes precedence over the host default → Spread optional fields before assigning `tempRoot`, discarding the caller's root.
- `apps/website/src/features/settings/__tests__/site-title.test.ts` — the host preservation summary reports distinct outcome counts without workspace identifiers → Replace the host-bound summary reporter with a no-op.
- `apps/website/src/features/site-guide/__tests__/plugin-contributions.test.ts` — the built-in Jini guide points to live capabilities behind the same assistant permission → Point at a different tool or drop its permission from `site-guide/capability-card.ts`.

- `apps/website/src/features/site-inspection/__tests__/deps.unit.test.ts` — capabilities reports a failed host content read without losing the admin screens → Remove `reportSectionFailure` from the capabilities adapter or wire its list to an empty screen set.
- `apps/website/src/features/site-inspection/__tests__/fetch-live-url.test.ts` — the live inspection contributor logs only the origin and response metadata → Drop the contributor's `observeFetch` callback or attach the requested URL instead of its origin.

- `apps/website/src/features/site-backup/__tests__/share-file-policy.unit.test.ts` — the bundled inventory defaults to the host's composed source root, not the site install tree → Stop using the host's bundled source root when `sourceRoot` is omitted in `package-file-inventory.ts`.
- `apps/website/src/features/site-update/__tests__/self-hosted-binding.test.ts` — a stale backup id blocks readiness before the candidate receives any artifact → Bypass the missing restore-point guard or use the backup id as the artifact reference in `restore-point-backup.ts`.
- `apps/website/src/features/theme/__tests__/build-conformance.test.ts` — an unreadable generated tree is not reported as an empty valid inventory → Swallow unexpected filesystem errors instead of rethrowing them in `checkArtifactHashes`.

- `apps/website/src/features/site-evidence/__tests__/unit/tool-registrations.unit.test.ts` — the default evidence browser routes third-party assets through the guarded client and keeps own-site cookies local → Omit the router factory, the verified-origin allowlist, or `preserveOwnSiteCookies` from the default browser binding.

- `apps/website/src/features/sites/__tests__/site-admin.unit.test.ts` — a synchronous analytics failure cannot undo site creation or relabel the actor and source → Let the capture fault escape or omit the system actor/service defaults in `trackCreatedSite`.
- `apps/website/src/features/storage/__tests__/cleanup-gate.test.ts` — a plan status change invalidates approval even when neither pass has policy rows → Omit status from `storageCleanupPlanHash` or allow a grant whose scope differs.
- `apps/website/src/features/site-backup/__tests__/share-refusals.integration.test.ts` — share caps reject one extra file or byte at the first violated limit → Change strict over-cap comparisons to `>=`, or trust only one total in `checkShareLimits`.
- `apps/website/src/features/source-control/__tests__/propose-credential-tool.test.ts` — a credential save failure logs only fixed exchange metadata and leaves no persisted row → Remove the host `reportCredentialFailure` logger or log the thrown error instead of safe metadata.

- `apps/website/src/features/site-update/__tests__/approved-handoff.integration.test.ts` — after submit starts the durable supervisor accepts without inheriting the caller signal → Forward the cancelled caller's signal to `submitPrepared` instead of detaching it in `approved-handoff.ts`.
- `apps/website/src/features/storage/__tests__/compaction-recovery.test.ts` — native link limitations are reported as unsupported so recovery can retain a verified copy → Remove `EXDEV` from the native unsupported set in `compaction-recovery-ports.ts`.

- `apps/website/src/features/skills/__tests__/unit/install-service.unit.test.ts` — the host warns which malformed skill folder was skipped and still serves the valid skill → Turn `reportSkippedFolder` into a no-op in `skills/site-host.ts`.
- `apps/website/src/features/skills/__tests__/unit/validation.unit.test.ts` — the host YAML adapter preserves digit-only names and boolean-looking prose as strings → Remove the failsafe schema from `install-adapters.ts`; ordinary YAML scalar coercion makes those frontmatter fields nonstrings.

- `apps/website/src/features/storage/__tests__/compact-site.test.ts` — a plain file behind a linked parent remains unmanaged even with a single link → Remove the real-path equality check in `compact-site.ts`; the other two admission checks both pass.

- `apps/website/src/features/site-update/__tests__/apply-tool.test.ts` — the shared update lock is released on preparation failure so the same site can retry → Release only on the successful return path instead of in `finally` in `operation-update-lock.ts`.

- `apps/website/src/features/storage/__tests__/compaction-recovery.test.ts` — SQLite admission preserves an open failure rather than calling a missing database busy → Treat every SQLite open error as “busy” in `compaction-recovery-ports.ts`.

## Per-source handoff

Paths below are relative to `apps/website/src/features` unless stated otherwise. Counts are new test cases, not measured coverage. One expiry case exercises both Tovu's expiry wrapper and the own-folder predicate. The cloud runner needs to verify exact branch counts.

| Source | Status and test evidence |
| --- | --- |
| settings/site-title-legacy.ts | Added 1 in `site-title.test.ts` for preservation summary counts. The existing log-safety case already checks the failure reporter with and without an error class. |
| settings/tool-registrations.ts | SKIPPED-ALREADY-COVERED — `settings-write-tools.test.ts`, “a host's extra denied namespace is refused” and “normal setting runs directly”; the cases cover injected/default writer and present/absent denial list. |
| site-backup/archive-paths.ts | SKIPPED-ALREADY-COVERED — `import-restore.unit.test.ts`, “custom code that lands switched off gets one warning per unit” covers generic and overrides copy. |
| site-backup/backup-service.ts | SKIPPED-ALREADY-COVERED — `tool-registrations.unit.test.ts`, “the default plan store and job registry,” “the default failure logger,” “a push without site sources,” “an ACTIVE per-site key file,” and the repository upload contract. |
| site-backup/bundled-export-file-policy.ts | Added 1 in `bundled-export-file-policy.unit.test.ts` for default disk reads. |
| site-backup/import-backend.ts | SKIPPED-ALREADY-COVERED — `import-download-limit.unit.test.ts`, 239999/240000 ms boundaries; `import-backend.unit.test.ts`, replay of failed share download; `import-failures.integration.test.ts`, custom setup base and owner completion. |
| site-backup/import-database.ts | Added 2 in new `import-database.unit.test.ts` for real temp-root ownership/cleanup and explicit root precedence without starting a worker. |
| site-backup/import-plugin-state.ts | SKIPPED-ALREADY-COVERED — `integration/archive-v2.integration.test.ts`, “a different build carries the plugin's enabled=[false/true] choice onto local code,” “an enabled plugin absent from this build stays quarantined.” |
| site-backup/import-restore-placement.ts | SKIPPED-ALREADY-COVERED — `import-restore.unit.test.ts`, “staging refuses an unsafe file path” (real host policy) and “the containment guard refuses a path that escapes the root” (injected policy). |
| site-backup/import-restore.ts | SKIPPED-ALREADY-COVERED — `import-restore.unit.test.ts`, “custom code that lands switched off gets one warning per unit.” EXCEPTION line 47, invariant sentinel described below. |
| site-backup/import-verifier-projection.ts | SKIPPED-ALREADY-COVERED — `import-verifier-refusals.unit.test.ts`, “the document admission port receives the original filename and the verified bytes” and “a document refused with a non-Error value.” |
| site-backup/package-file-inventory.ts | Added 1 in `share-file-policy.unit.test.ts` for the host-composed default root. Existing injected-root and installed-catalog cases remain. |
| site-backup/push-manifest.ts | SKIPPED-ALREADY-COVERED — `tool-registrations.unit.test.ts`, “the push re-checks the repository” and default plan/job test, with persisted manifest checks. |
| site-backup/share-expiry.ts | Added 2 in `share-expiry.unit.test.ts` for custom/default copy and strict expiry choice admission. |
| site-backup/share-own-folder.ts | Exercised by the shared `share-expiry.unit.test.ts` case, which accepts a moved absolute local root and refuses a remote provider with the same root and a local provider without one. |
| site-backup/share-policy.ts | Added 1 in `share-refusals.integration.test.ts` for the exact file/expanded caps and independent total sources. EXCEPTION line 45 belongs to an erased interface. |
| site-backup/share-zip.ts | SKIPPED-ALREADY-COVERED — `static-copy.unit.test.ts`, “static-only ZIP and top folder use the display name” and “selected themes share media by URL.” |
| site-backup/sources.ts | SKIPPED-ALREADY-COVERED — `sources.unit.test.ts`, “the manifest names the format, Tovu version, schema, timestamp, scopes, database watermark and every file with its sha256,” and no-database manifest. |
| site-backup/static-download-host.ts | SKIPPED-ALREADY-COVERED — `static-copy.unit.test.ts`, “a thrown render retains partial files and deletes its temporary render folder.” |
| site-backup/static-export-selection.ts | SKIPPED-ALREADY-COVERED — `static-export-selection.unit.test.ts`, “folder allocation strips branding, avoids case/Unicode aliases and stays stable across roster order.” |
| site-backup/tool-registrations.ts | SKIPPED-ALREADY-COVERED — `tool-registrations.unit.test.ts`, “the contributor exposes the backup registrations and their independent risk classification.” |
| site-evidence/collect-page-evidence.ts | Added 2 in `collect-page-evidence.unit.test.ts` for structured redaction and a browser failure reason. |
| site-evidence/tool-registrations.ts | Added 3 in `tool-registrations.unit.test.ts` for unexpected origin errors, default browser launch modes and real request routing over injected browser/transport. |
| site-export/export-failure-summary.ts | SKIPPED-ALREADY-COVERED — `export-failure-summary.test.ts`, “route precedence reports the route collection count” also covers asset-only and healthy reports. |
| site-export/export-preflight-copy.ts | Added 1 in `export-preflight.unit.test.ts` for exactly five hosts. |
| site-export/index.ts | EXCEPTION lines 1–6, pure re-export barrel. Existing `index.test.ts` already checks export identity. |
| site-export/media-url-bindings.ts | SKIPPED-ALREADY-COVERED — `media-original-urls.test.ts`, “export upgrades legacy originals” and “export URL upgrades keep private documents, missing assets, trashed assets and unrelated URL suffixes unchanged.” |
| site-export/site-exporter.ts | SKIPPED-ALREADY-COVERED — `site-exporter.test.ts`, “writes the expected file tree for the seeded demo workspace” and “every succeeded route/asset carries its own bytes and content-type.” |
| site-export/theme-preview-manifest.ts | SKIPPED-ALREADY-COVERED — `theme-preview-manifest.test.ts`, no settings store, disabled switcher and opt-out; `theme/__tests__/preview-switcher.integration.test.ts`, “static manifest and real export include themed pages/assets.” |
| site-export/theme-preview-report.ts | SKIPPED-ALREADY-COVERED — `theme-preview-report.test.ts`, “size multiplier counts normal HTML/CSS/shared media once and includes variant bytes,” both with and without a base path. |
| site-guide/capability-card.ts | Added 1 in `plugin-contributions.test.ts` for the live capabilities pointer and permission. |
| site-guide/contracts.ts | EXCEPTION lines 1–20, type-only module. |
| site-guide/facts.ts | SKIPPED-ALREADY-COVERED — `facts.test.ts`, profile/registry authorization order, each registry failure, truncation and absent/unknown topics; `facts-profile.test.ts`, safe DTOs and absent sections. |
| site-inspection/admin-screens.generated.ts | SKIPPED-ALREADY-COVERED — `site-capabilities.unit.test.ts`, panel description, route, entity and query contract. Actual reported lines 1–10 are the generated-file header. |
| site-inspection/deps.ts | Added 1 in `deps.unit.test.ts` for report failure plus unaffected screens. |
| site-inspection/index.ts | EXCEPTION lines 1–26, pure re-export barrel. |
| site-inspection/tool-registrations.ts | Added 1 in `fetch-live-url.test.ts` for origin-only observability via the contributor. |
| site-search/cms-search-rules.ts | SKIPPED-ALREADY-COVERED — `cms-search.test.ts`, “a live post is a plain-text public document at its public URL,” scheduled publish, and “a members-gated post is restricted to its audiences.” |
| site-update/approved-handoff.ts | Added 1 in `approved-handoff.integration.test.ts` to pin supervisor/caller cancellation isolation. |
| site-update/candidate-readiness.ts | Added 2 in `candidate-readiness.test.ts` for missing candidate and cleanup on failure. |
| site-update/configured-runtime.ts | SKIPPED-ALREADY-COVERED — `configured-runtime.test.ts`, configured feed, blank/missing feed, unsupported host. |
| site-update/github-release-feed.ts | Added 2 in `github-release-feed.test.ts` for trim, default notes, signal and blank tag. |
| site-update/host-runtime.ts | SKIPPED-ALREADY-COVERED — `host-runtime.test.ts`, desktop and self-hosted adapter handoffs and “no host kind, or one this build does not know.” |
| site-update/operation-update-lock.ts | Added 1 in `apply-tool.test.ts` for release after rejected work. |
| site-update/read-status.ts | Added 2 in `read-status.test.ts` for failed and cancelled journal reads. |
| site-update/restore-point-backup.ts | Added 1 in `self-hosted-binding.test.ts` for missing backup at readiness. |
| site-update/self-hosted-host.ts | SKIPPED-ALREADY-COVERED — `self-hosted-binding.test.ts`, “opted in” and “without a feed URL there is no runtime and no URL is tried.” |
| site-update/tools.ts | SKIPPED-ALREADY-COVERED — `check-tool.test.ts` and `apply-tool.test.ts` (including check-only mode and approval-version pin). Reported lines are the file header. |
| sites/agent-tools.ts | SKIPPED-ALREADY-COVERED — `tool-registrations.unit.test.ts`, “the catalog wires in full, with a published schema and a cross-checked risk class”; read schema invoked by `tool-registrations.site-card.test.ts`. |
| sites/deps.ts | SKIPPED-ALREADY-COVERED — `served-site-binding.unit.test.ts`, “site dependency resolution defaults to the shared site-dir implementations” and injected duplicate test; `tool-registrations.unit.test.ts` injects listing and duplicate. |
| sites/index.ts | EXCEPTION lines 1–42, pure re-export barrel. |
| sites/list-tool.ts | EXCEPTION lines 1–4, pure re-export barrel. Existing `tool-registrations.site-card.test.ts` executes its exported builder. |
| sites/site-admin.ts | Added 1 in `site-admin.unit.test.ts` for analytics defaults and failure isolation. Existing tests cover token storage failure and TOVU_SITE_DIR restart suppression. |
| sites/site-preview/playwright-site-preview-capture.ts | SKIPPED-ALREADY-COVERED — `playwright-site-preview-capture.unit.test.ts`, “a host with no desktop render bridge configured captures through headless Chromium” and “a native capture with no injected resize stores a 640px JPEG via Sharp.” |
| sites/site-preview/site-preview-service.ts | SKIPPED-ALREADY-COVERED — `site-preview-service.unit.test.ts`, “default options: the drain runs off the request path” plus deferred capture, retry and deduplication cases. |
| sites/site-preview/site-preview-store.ts | SKIPPED-ALREADY-COVERED — `site-preview-store.unit.test.ts`, “write then read and version round-trip through an atomic rename” and injected failed write. |
| sites/tool-registrations.ts | Added 1 in `site-admin-tools.unit.test.ts` for cancelled creation. Existing tests cover refusal, duplicate, switch and list/get wiring. EXCEPTION line 301, invariant sentinel described below. |
| sites/warm-switch.ts | Added 1 in `warm-switch.unit.test.ts` for both capacity refusal codes. |
| skills/install-adapters.ts | Added 1 in `validation.unit.test.ts` for failsafe scalar preservation. |
| skills/site-host.ts | Added 1 in `install-service.unit.test.ts` for malformed-folder warning and continued valid discovery. |
| source-control/commit-site.ts | SKIPPED-ALREADY-COVERED — `commit-site.characterization.unit.test.ts`, target/credential/export/write refusals and adapter args; `commit-site.unit.test.ts`, explicit and omitted branch, errors and diverged-paths fallback. |
| source-control/credential-setup.ts | Added 1 in `propose-credential-tool.test.ts` for safe failure logging and no row. |
| source-control/index.ts | EXCEPTION lines 1–11, pure re-export barrel. |
| source-control/provider-kit-host.ts | SKIPPED-ALREADY-COVERED — `provider-kit.observability.unit.test.ts`, traced and untraced calls and caller-safe transport error projection. |
| source-control/provider-registry.ts | SKIPPED-ALREADY-COVERED — `provider-registry.unit.test.ts`, malformed descriptors, module validation, reserved/workflow paths, default/injected package loading, picker; `bundled-github-providers-boot.integration.test.ts`, pre-rename refusal. EXCEPTION line 119, rejected descriptor sentinel before execution. |
| source-control/repo.memory.ts | SKIPPED-ALREADY-COVERED — `project-scope.unit.test.ts`, local precedence and “no project store (Fly)” cases. |
| source-control/store.ts | SKIPPED-ALREADY-COVERED — `project-scope.unit.test.ts`, “update and delete change a project row where it lives” and create-only conflict; `store.unit.test.ts`, label-preserves-secret and rotation cases. |
| source-control/tool-registrations.ts | SKIPPED-ALREADY-COVERED — `tool-registrations.unit.test.ts`, “buildSourceControlRegistrations wires all tools” and the end-to-end capabilities/commit calls. |
| source-control/write-port.ts | SKIPPED-ALREADY-COVERED — `write-port.unit.test.ts`, “one build, target rules before planning, same provider and exact plan to commit” and lazy getter binding. |
| storage/agent-tools.ts | SKIPPED-ALREADY-COVERED — `tool-registrations.test.ts`, “cleanup defaults to dryRun” and approval/owner cases. Reported lines are the file header. |
| storage/cleanup-gate.ts | Added 1 in `cleanup-gate.test.ts` for a changed plan status without policy rows. |
| storage/compact-site.ts | Added 2 in `compact-site.test.ts` for non-file, hardlink and directory-link deferrals. |
| storage/compaction-marker.ts | Added 1 in `compact-site.test.ts` for persistent, per-database clear. |
| storage/compaction-recovery-ports.ts | Added 3 in `compaction-recovery.test.ts` for native missing/error classification, unsupported hardlink and SQLite admission errors. |
| storage/compaction-recovery.ts | Added 3 in `compaction-recovery.test.ts` for copy fallback, corruption refusal and interrupted staging recovery. |
| storage/compaction-recovery.types.ts | EXCEPTION entire file, types only. |
| storage/measure.ts | SKIPPED-ALREADY-COVERED — `measure.test.ts`, category totals, WAL and unreadable-path behavior. Reported lines are the file header. |
| storage/tool-registrations.ts | Added 2 in `tool-registrations.test.ts` for the owner report and malformed cleanup requests. |
| taxonomy/gated-hooks.ts | SKIPPED-ALREADY-COVERED — `gated-hooks.test.ts`, “merge recomputes overlap and persists deprecation, an advanced version and a complete audit record.” |
| theme/active-theme.ts | SKIPPED-ALREADY-COVERED for the reported line — `duplicate-theme.test.ts`, “structure-only Starter copies preserve wiring, discard appearance and remain previewable until styled” calls the writable list and passes a requested id before and after styling. |
| theme/asset-operations.ts | SKIPPED-ALREADY-COVERED for known runtime paths — `tool-registrations.edge-refusals.test.ts`, compiled release and path refusals; `theme-file-safety.test.ts`, readback, refusal, and live reload after replacement. |
| theme/asset-path-rewrites.ts | SKIPPED-ALREADY-COVERED — `duplicate-theme.test.ts`, “duplication rewrites only the source theme's absolute asset prefix”; `migration/__tests__/migrate-theme.test.ts`, “rewrites a moved page's own hardcoded … reference.” |
| theme/build-conformance.ts | Added 1 in `build-conformance.test.ts` for filesystem failure. Existing file/link limits, total bytes and partial-island cases cover the listed paths. |
| theme/capability-card.ts | SKIPPED-ALREADY-COVERED — `post/__tests__/tool-registrations.header-navigation.test.ts`, “the create description and the Themes guide topic say navigation changes through the menu tools.” |
| theme/code-tier-asset-normalizer.ts | Added 2 in `code-tier-asset-normalizer.test.ts` for exact secondary href and unintended data-src rewrite. Existing tests cover disk relocation, CSS sources, maps, rejection and discarded framework artifacts. |
| theme/duplicate-theme-tool.ts | SKIPPED-ALREADY-COVERED — `apps/website/src/assistant/__tests__/tool-registrations.theme-duplicate.test.ts`, structure-only activation conflict / unknown mode, copy, and activation behavior. |
| theme/duplicate-theme.ts | SKIPPED-ALREADY-COVERED — `duplicate-theme.test.ts`, “duplicateDiscoveredTheme rescans: the copy is in the live themes array and loads valid” and both unknown source cases. |
| theme/entry-list-markup.ts | SKIPPED-ALREADY-COVERED — `entry-list-render.test.ts`, single injected style and scoped grid on a mixed page; `entry-list-render-layouts.test.ts`, scoped carousel and accordion declarations. No synthetic CSS execution to count concatenated literals. |
| theme/file-identity-lock.ts | SKIPPED-ALREADY-COVERED — `file-identity-lock.canonical-path.test.ts`, empty/dot/parent/backslash cases and canonical lock outcomes. |
| theme/file-mutation-tools.ts | SKIPPED-ALREADY-COVERED — `theme-edit-batch-same-file.test.ts`, actual committed successor, byte-identical fallback and foreign-write refusal. |

### Narrow exception candidates

- `site-backup/import-restore.ts:47` is a deliberate invariant failure for collaborators never used by staging/warning reads. A test would have to change the private wiring to invoke it.
- `sites/tool-registrations.ts:301` is unreachable through the public builder, which assigns the sibling list handler unconditionally before defining get.
- `source-control/provider-registry.ts:119` is a sentinel callback on the deliberately rejected pre-rename contribution; existing tests assert the refusal, not synthetic invocation of dead load code.
- `theme/code-tier-asset-normalizer.ts:286,301` are defensive assertions: the sticky zero-or-more whitespace match always succeeds at a valid offset, and the quote list is dense. No module mocks to manufacture an impossible scanner state.
- Type-only and barrel exceptions are named in the table. No coverage settings, ignore directives or exclusions were changed.

### Bug and verification handoff

- BUG `theme/code-tier-asset-normalizer.ts:201` — attribute matching is anchored on the value but not the full attribute name. A legitimate `src="main.js"` moves as intended, but so does `data-src="main.js"` on the same node, corrupting unrelated metadata. Match complete attributes in the relevant tags, ideally by parsing or using source-location-aware edits, and leave all other attributes unchanged. The regression test is expected red on the current source.
- No tests, tests-tsconfig checks, builds, installs, coverage or mutation commands were executed per dispatch. Confirm the precise branch/function totals across all eight shards in cloud; a partial LCOV report without branch IDs cannot prove 100%. Files designated already covered refer to observable behavior in existing tests, not executed coverage.
