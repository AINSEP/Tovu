# Website coverage gap-fill handoff

The owner prohibited local test, coverage, build, install, typecheck, and mutation execution. The mutations below were reviewed against the actual assertions, not applied or run. Paths in this file are relative to `apps/website/src/features/` unless otherwise stated.

## Tests and their source mutations

- `forms/__tests__/submission-ip-expiry-sweep.test.ts`: an unavailable package remains disabled even if reporting the reason throws → in `submission-ip-expiry-sweep.ts`, let the unavailable-package `onError` call throw instead of containing it.
- `fs-files/__tests__/open-for-read.test.ts`: guarded stream rejects growth after length is advertised, even below the caller's cap → in `fs-files.ts`, replace the guarded stream with a buffered read that checks only `maxBytes`; the read incorrectly accepts the fifth byte instead of rejecting drift.
- `fs-files/__tests__/open-for-read.test.ts`: an abort during a guarded stream reaches the consumer as the original abort reason → omit the second argument to `withGuardedBinaryStream` in `fs-files.ts`.
- `fs-files/__tests__/site-file-request.unit.test.ts`: an absolute selection of the picked directory itself lists its root, not an empty path → remove the `|| '.'` fallback from the absolute custom path conversion in `site-file-request.ts`.
- `fs-files/__tests__/tool-registrations.test.ts`: direct picked-folder resolution follows a live workspace selection and refuses a cleared choice → stop forwarding the injected `resolveRoots` port in `tool-registrations.ts`.

- `routines/__tests__/routine-run-handler.unit.test.ts`: an accepted run whose settlement cannot be read completes with the safe failure message → replace the catch's fixed message with the raw watch error in `routine-run-handler.ts`.
- `routines/__tests__/routine-run-handler.unit.test.ts`: a canceled assistant run settles as canceled and retains its partial summary → map the canceled status to failed in `routine-run-handler.ts`.
- `routines/__tests__/routine-host.unit.test.ts`: a sidecar close failure after failed migration preserves degraded availability and diagnoses both failures → let handle.close() throw in the failure branch of `routine-host.ts`.
- `routines/__tests__/routine-host.unit.test.ts`: the default beacon filesystem writes a readable beacon and removes its temp file on a failed replacement → replace the default rm adapter in `routine-host.ts` with a no-op.
- `routines/__tests__/classify-routine-approval.unit.test.ts`: routine approval projection refuses each independently mismatched trusted identity → drop the messageId equality in `classify-routine-approval.ts`.
- `routines/__tests__/classify-routine-approval.unit.test.ts`: malformed receipts cannot change a routine's approval state → accept an answered receipt regardless of its confirmed type in `classify-routine-approval.ts`.
- `routines/__tests__/classify-routine-approval.unit.test.ts`: answers and closed exchanges settle the matching approval without implying a tool result → always return approved for answered receipts in `classify-routine-approval.ts`.

- `presentation/__tests__/set-active-theme.unit.test.ts`: a service theme change records its new id once, without emitting on a retry or opt-out → remove the previous-theme comparison or ignore `capture: false` in `set-active-theme.ts`.
- `presentation/__tests__/set-active-theme.unit.test.ts`: a throwing tracker cannot undo a valid theme, and an invalid theme never reaches it → let the tracker exception escape `set-active-theme.ts` after the write commits.
- `plugin-runtime/__tests__/unit/host-binding.unit.test.ts`: loading admits a trusted built-in or an unverified site tier, not a site claiming a verified tier → remove the tier requirement for site imports in `host-binding.ts`.

- `routines/__tests__/routine-commands.unit.test.ts`: non-ready availability refuses with the stable reason and plain sentence (added starting case) → map starting to the general unavailable reason in `routine-commands.ts`.
- `routines/__tests__/routine-tool-registrations.unit.test.ts`: unsigned routine list requests fail before disclosing state → remove the signed-in principal check in `routine-tool-registrations.ts`.
- `routines/__tests__/routine-tool-registrations.unit.test.ts`: missing write coordinates are refused before reading a row or opening a card → accept non-number revisions in `readTarget`.
- `routines/__tests__/routine-tool-registrations.unit.test.ts`: create confirms the actual schedule, prompt, agent and model → render weekly schedules as daily in `describeSchedule`.
- `routines/__tests__/routine-tool-registrations.unit.test.ts`: pause, resume and delete show distinct actions for the reviewed row → give resume the Pause title in `setEnabledHandler`.
- `routines/__tests__/routine-tool-registrations.unit.test.ts`: unexpected confirmation and storage errors reach the caller instead of becoming routine refusals → treat all confirmation errors as missing-channel in `noChannelAnswer` or all store errors as stale in `writeFailure`.

- `routines/__tests__/routine-approval.integration.test.ts`: the replay cursor advances over all events but only bound approval receipts update the stored row → in `routine-approval-observer.ts`, fail to forward the replay cursor, drop the event batch read, or count only valid receipts when returning the cursor.
- `project-keys/__tests__/attached-vault.unit.test.ts`: a failed grant inventory hides existing keys and reports only the fixed recovery diagnostic → remove or replace the list diagnostic in `vault-policy.ts`.

- `plugin-runtime/__tests__/unit/install-tool.unit.test.ts`: a missing local ZIP is refused with the requested path before installer preview → in `host-install-source.ts`, remove the source path from `noReadableZip`.
- `plugin-runtime/__tests__/unit/install-tool.unit.test.ts`: the contributor supplies the owner-scoped attachment reader to its registered installer → in `install-tool.ts`, omit the required reader spread in the contributor's build callback.
- `project-keys/__tests__/host-bindings.unit.test.ts`: saved key authority follows the owning credential domain, with unknown kinds refused → send all vendor keys to deployment authorization in `host-bindings.ts` or grant a generic API-connection row instead of refusing it.

- `pages/__tests__/theme-colour-contract.test.ts`: the starter fragment provides the advertised unique, editable regions without site chrome → remove `data-agent-element="page-cta"` from `skeleton.ts`.
- `plugin-runtime/__tests__/unit/host-binding.unit.test.ts`: declarative packages may include nested data and images but not SVG → add SVG to the declarative allowlist in `host-binding.ts`.
- `publish-content/__tests__/backstop-policy.boundary.test.ts`: private-setting detection recognizes persisted secret flag encodings without blocking ordinary values → drop the string-encoded `"1"` check in `backstop-policy.ts`.
- `publish-content/__tests__/backstop-gaps-tool.test.ts`: the tool contributor reads the mounted workspace's audit through the injected projection → omit the `makePublishContentDeps` override in `tool-registrations.ts`.

- `mail-status/__tests__/provider-tools.unit.test.ts`: mail discovery lists disabled mail plugins in the mounted workspace without requiring a description → omit the discovery port when layout is present, or drop the empty string description fallback in `provider-tool-registrations.ts`.
- `media-generation/__tests__/media-provider-registry.test.ts`: a credential diagnostic for an unlisted vendor retains the vendor id and invents no environment key → fall back to OpenAI's label or environment keys in `host-media-providers.ts`.

- `publish-content/__tests__/backstop-service.binding.test.ts`: the audit ledger shows pending during work, then distinguishes a preview from a sent run → replace the audited function exported by `backstop-service.ts` with a direct call to `work()`; work would run before a pending audit row exists.
- `plugin-runtime/__tests__/unit/install-tool.unit.test.ts`: when no environment port is supplied, a hosted install reads the process opt-in for each call → replace the `process.env` fallback with `{}` in `install-tool-binding.ts`.

- `routines/__tests__/routine-approval.integration.test.ts`: a foreign registration cannot displace the local waiting run from a full observer → remove the workspace comparison in `track` in `routine-approval-observer.ts`.
- `routines/__tests__/routine-approval.integration.test.ts`: evicting the oldest tracked run expires its pending approval and ignores a subsequent open → delete the oldest entry directly instead of calling `untrack` in `routine-approval-observer.ts`.

## File-by-file triage

This is static source-and-test evidence, not a fresh coverage measurement. For reported branch/function gaps with no counter locations, a listed existing witness establishes the described path, not a claim that every compiler-reported counter will be green. Test paths below are relative to the corresponding feature unless a feature or app prefix is given.

### Added

| Source | New tests | Existing or new suite |
|---|---:|---|
| forms/submission-ip-expiry-sweep.ts | 1 | submission-ip-expiry-sweep.test.ts |
| fs-files/fs-files.ts | 2 | open-for-read.test.ts |
| fs-files/site-file-request.ts | 1 | site-file-request.unit.test.ts |
| fs-files/tool-registrations.ts | 1 | tool-registrations.test.ts |
| mail-status/provider-tool-registrations.ts | 1 | provider-tools.unit.test.ts |
| media-generation/host-media-providers.ts | 1 | media-provider-registry.test.ts |
| pages/skeleton.ts | 1 | theme-colour-contract.test.ts |
| plugin-runtime/host-binding.ts | 2 | unit/host-binding.unit.test.ts |
| plugin-runtime/host-install-source.ts | 1 | unit/install-tool.unit.test.ts |
| plugin-runtime/install-tool-binding.ts | 1 | unit/install-tool.unit.test.ts |
| plugin-runtime/install-tool.ts | 1 | unit/install-tool.unit.test.ts |
| presentation/set-active-theme.ts | 2 | **new** set-active-theme.unit.test.ts |
| project-keys/host-bindings.ts | 1 | **new** host-bindings.unit.test.ts |
| project-keys/vault-policy.ts | 1 | attached-vault.unit.test.ts |
| publish-content/backstop-policy.ts | 1 | backstop-policy.boundary.test.ts |
| publish-content/backstop-service.ts | 1 | backstop-service.binding.test.ts |
| publish-content/tool-registrations.ts | 1 | backstop-gaps-tool.test.ts |
| routines/classify-routine-approval.ts | 3 | **new** classify-routine-approval.unit.test.ts |
| routines/routine-approval-observer.ts | 3 | routine-approval.integration.test.ts |
| routines/routine-commands.ts | 0 + 1 case | routine-commands.unit.test.ts |
| routines/routine-host.ts | 2 | routine-host.unit.test.ts |
| routines/routine-run-handler.ts | 2 | routine-run-handler.unit.test.ts |
| routines/routine-tool-registrations.ts | 5 | routine-tool-registrations.unit.test.ts |

For existing behavior adjacent to these patches, the 'without onError' sweep test already asserts both warning formats. The 'isDeniedFsPathSegment matches secrets case-insensitively' test covers fs-files.ts:172–173, and media-import's 'The composed local import stores the original before staged conversion' already checks the real descriptor-backed upload and exact bytes.

### SKIPPED-ALREADY-COVERED

| Source | Existing witness |
|---|---|
| forms/tool-registrations.ts | tool-contract.characterization.test.ts, '(e) one success call per tool returns the model-facing view'. Lines 1–8 are a comment. |
| fs-files/layout.ts | layout.test.ts, 'resolveFsRoots resolves repo and site exactly as before custom existed' and 'reflects a custom root the moment it is set'. |
| identity/api-key-binding.ts | Website lane-su-pins/p3-p4-api-key-format.test.ts checks mint and frozen-literal parse. Identity repo.contract.test.ts checks authenticate after committed create. Website admin-mcp-ui-tool-calls-route.test.ts issues through the bound service. |
| identity/boot-session-token-binding.ts | boot-session-token-binding.test.ts, 'the binding’s mint and redeem share one armed, single-use store'. |
| identity/default-credential-exposure.ts | default-credential-exposure.test.ts, 'the complete scanner detects a planted credential in the shipped Login path' and the credential checker CLI test. Lines 1–35 are the rationale comment. |
| identity/first-owner-password.ts | first-owner-password.test.ts, 'a server site with a set password seeds that password' plus server unset, blank, starter, length and local/desktop cases. |
| identity/repo.sqlite.ts | repo.sqlite-kernel.test.ts, 'persist a session and both direct and role authority in that database'; repo.session-revocation.test.ts for the host CASE adapter. Recovery code, MFA and passkey dialect suites open the respective host factories. No uncovered function IDs supplied. |
| identity/wiring.ts | wiring.test.ts pins active owner, read-only bypass, ISO-clock adapter, transactional writes and grant suppression; wiring.seed-failure.test.ts pins both rejected promises. No uncovered function IDs supplied. |
| mail-status/provider-operations.ts | provider-operations.unit.test.ts, 'save creates the key without activating' and 'save rotates: a new token keeps the stored username'. |
| mail/index.ts | webhook-secret-labels.unit.test.ts asserts exact persisted current and previous labels. |
| media-generation/provider-card-host.ts | providers-tools.test.ts, 't10 media form masks the key and submits through a bound exchange', 'raw save errors containing the key never reach the model or outcome surface', 'non-Error media persistence failures use fixed safe outcomes' and 'media token policy failures return the allowlisted message'. |
| media-generation/tool-registrations.ts | tool-registrations.test.ts, 'production credential environment is used when the optional environment port is omitted', 'a plugin-contributed image model is in the published model enum', and 'construction over metadata-only deps (no registry) publishes the built-in enum'. |
| media-import/fetch-image.ts | fetch-image.test.ts, 'validateImageBytes’ third argument is the BYTE half’s verdict', plus exact byte round-trip, accepted harness origin and redirect provenance cases. Lines 1–63 are comments. |
| media/chat-attachment-reader-host.ts | read-chat-attachment.test.ts, 'the recorded owner gets the exact bytes on disk' and the injected open/no-follow defenses. Line 5 is the tested declaration. |
| media/import-video-conversion.ts | media-import/import-video-conversion-wiring.test.ts, 'The composed local import stores the original before staged conversion' exercises the actual host staged uploader, link and failure paths. |
| media/tool-registrations.ts | convert-video-registration.test.ts, 'media_convert_video is offered only when the host injects a video converter' and 'saves a web copy, keeps the original and links the copy back to it'; tool-registrations.test.ts tests upload instrumentation and routing. |
| member-login/bindings.ts | providers.test.ts, 'bundled preset admits the active, unchanged installed contribution' and both manifest namespaces; credentials.test.ts, 'client card resolves username/client ID and sealed token/client secret'; ready-providers.test.ts, 'a second host readiness call re-admits the installed provider'. |
| members/mail-transport.ts | Website platform/mail purpose-scoped-mailer-call-sites.integration.test.ts and members password-auth.test.ts exercise member challenge mail. Lines 1–3 are a comment. |
| members/repo.sqlite.ts | repo.session-revocation.dialects.test.ts, 'a save of the same session after it was revoked does not restore it', exercises the host keepStoredRevocation callback. |
| newsletter/delivery/tool-registrations.ts | delivery-tools.test.ts, 'real send still respects the existing launch gate' and 'L299 resend hides … failures and logs only its fixed diagnostic'. |
| newsletter/deps-builders.ts | deps-builders.characterization.test.ts, 'admin toSendPipelineDeps: unsubscribe deps present, real sleep, launch gate always false' and 'tool toNewsletterSendPipelineDeps: no unsubscribe, no sleep, launch gate follows newsletterSendingEnabled'. |
| newsletter/repo.sqlite.ts | repo.dialects.test.ts, 'list queries never select revision bodies, and a corrupt latest body does not break detail', exercises the log binding. |
| observability/test-error-message.ts | Website assistant tool-registrations.contracts.test.ts, 'observability_send_test_error publishes the host’s own test-error message, byte-identical', and composition deps-observability-wiring.integration.test.ts pins the emitted error. Lines 1–4 are a comment. |
| origin/configured-origin.ts | configured-origin.test.ts exercises acceptance, exact refusal and boot fallback. Lines 1–10 are comments. |
| pages/permissions.ts | edit-html-permission.test.ts, admin on both new and pre-theme.edit workspaces and editor remains refused; the reported ranges are mostly rationale and grant declarations. |
| plugin-runtime/agent-plugin-tool-binding.ts | unit/plugins-tool-registrations.unit.test.ts, 'injected Agent Plugin owners are used in place of the host capability, scoped to this workspace’s root and layout'. |
| plugin-runtime/built-ins/content-analyzer/index.ts | Its unit/index.unit.test.ts, 'importModule never runs tier-2 plugin code in the server process' invokes the sole runtime callback. |
| plugin-runtime/built-ins/content-analyzer/plugin.ts | Its unit/plugin.unit.test.ts, 'setup attaches exactly one content.entry.beforeSave filter' and 'the filter returns the 6-field patch'. Lines 1–9 are commentary. |
| plugin-runtime/built-ins/word-count/index.ts | Its unit/word-count.unit.test.ts, 'the runtime source imports the plugin whose beforeSave filter stores the entry’s word count'. |
| plugin-runtime/capability-tool-registrations.ts | unit/capability-tool-registrations.unit.test.ts, 'post reads use the injected port after permission and preserve its error identity'. Listed line is TypeScript type imports. |
| plugin-runtime/declarative-content-types.ts | unit/declarative-content-types.unit.test.ts, 'a valid declaration fills required/queryable defaults' and integration/install-declarative.integration.test.ts. |
| plugin-runtime/install-archive.ts | unit/install-archive.unit.test.ts drives the real yauzl default and the injected reader, including exact bytes and malformed input. |
| plugin-runtime/install.ts | integration/source-runtime.integration.test.ts explicitly exercises sitePluginLocalInstallEnabled against hosted and desktop signals. |
| plugin-runtime/invocation-core-deps.ts | unit/invocation-core-deps.unit.test.ts, 'the captured filter sees the entry through content.read and returns its own patch'. Lines 1–15 are comments. |
| plugin-runtime/plugin-host-copy.ts | unit/install-tool.unit.test.ts asserts exact install summary and warning; unit/plugins-tool-registrations.unit.test.ts exercises the separate management copy. |
| plugin-runtime/provider-status-tool.ts | Website composition provider-settings-chat-card.unit.test.ts, 'provider_status reports presence only: configured, missing, store, never a value' plus its unknown-plugin rejection. |
| plugin-runtime/tool-registrations.ts | unit/plugins-tool-registrations.unit.test.ts, 'the contributor builds through the injected host factory only when the deps carry no host'. |
| post/post-tool-view-deps.ts | tool-registrations.published-where.test.ts asserts hosted/local copy and tool-registrations.public-url.test.ts asserts resolved URLs. |
| post/repo.memory.ts | repo.save-if-version.test.ts, in-memory guarded save and autosave preservation. |
| post/search-host-config.ts | search-index.postgres.test.ts searches real stored text, search-index.reindex.test.ts pins retained projection behavior. Lines 3–7 are a rationale comment. |
| post/search-scratch-host.ts | search-index.memory.test.ts, 'renaming a row removes its old FTS match through the real scratch adapter'. |
| publish-content/backstop-sqlite-binding.ts | raw-row-contributor.test.ts, 'selected plugin row packs all columns' and 'FK violations roll back the entire batch'; backstop-batch.apply-loop.test.ts covers nested transaction behavior. |
| publish-content/destination-credential.ts | destination-credential.test.ts exercises unknown peer, connected session, workspace mismatch and sealed-key branches. |
| publish-content/peers.ts | peers.test.ts, 'a created peer’s summary carries masked + hasCredential and NOTHING sealed', and peers.sealed-at-rest.pin.test.ts existing-envelope scoped reopen. |
| publish-content/publish-readiness-copy.ts | publish-agent-tools.test.ts, one-destination and multi-destination summaries, not connected, never deployed and nothing publishable. |
| publish-content/publish-tool.ts | publish-tool.test.ts, 'publishes pending content without a UI card and returns live slug URLs'; its fake peer asserts the bearer resolved from the bound credential port. |
| publish-content/raw-file-contributor.ts | media/library-publish-transport.test.ts covers library hash refusal and ordinary retained blobs with the media bag, raw-file-contributor.test.ts tests fail-closed behavior absent media. |
| publish-content/ui/host-binding.ts | ui/index.test.ts, 'the host binding injects Tovu’s policy: drift wording, type aliases, query cap and capability id'; ui/report-rows.test.ts drives friendly reasons. |
| publish-content/ui/index.ts | ui/index.test.ts, 'the ui barrel exports exactly its owning modules’ runtime bindings' and criteria round-trip. |
| publish-content/ui/policy.ts | ui/criteria.test.ts tests aliases and ui/report-rows.test.ts tests friendly policy, refusals and row states. Lines 1–8 are comments. |
| publish-content/ui/sections.ts | ui/sections.test.ts, 'every registered publish-content contributor sits in exactly one section' and 'publishEntityTypePluralLabel names each type in the plural and falls back to the raw id'. |
| publish-trust/candidate-policy.ts | frozen-values.pins.test.ts, 'the deploy-config key that names a site’s public address'. |
| publish-trust/host-settings.ts | frozen-values.pins.test.ts pins the environment variable, provisioning.node-io.test.ts exercises pinned root, unset/empty fallback and process default. |
| recovery/gated-hooks.ts | unit/gated-hooks.unit.test.ts, 'plan for an existing restore point hashes only the chosen id' and exercises restore ledger and live gate. |
| routines/routine-wake-receiver.ts | routine-wake-receiver.unit.test.ts, 'accepts exactly … and nothing else', 'a rejected or throwing reconcile is logged, never thrown', and disposal. |
| seo/index.ts | index.unit.test.ts, 'createSeoPostPort: every port method calls through the host repo with its receiver intact', sitemap-agent-hold.test.ts, and cover-image-head.test.ts. Lines 1–5 are commentary. |
| settings/index.ts | principal-lookup.unit.test.ts exercises active, disabled, missing, foreign and wrong-id principals. Listed ranges are comments. |
| settings/settings-write-policies.ts | Website admin-http comments-provider-protection.test.ts invokes the legacy reset alias, with denied and allowed calls; visitor-tools-write.unit.test.ts exercises the dedicated visitor policy. |

### EXCEPTION

- EXCEPTION `media/index.ts:1–8` — barrel header only, the rest of the file only re-exports other owners.
- EXCEPTION `pages/index.ts:1–15` — barrel rationale only, the runtime exports are owned by skeleton and permissions.
- EXCEPTION `presentation/index.ts:1–8` — barrel rationale only, no independent behavior.
- EXCEPTION `plugin-runtime/service-ports.ts:1–8` — imports and exports are type-only.
- EXCEPTION `publish-content/tool-deps.ts:1–end` — type-only imports, aliases and interfaces.
- EXCEPTION `publish-content/tovu-publish-ports.ts:1–end` — host port types only.
- EXCEPTION `publish-content/raw-row-contributor.ts:3` — type-only import; contributor pack and undo behavior already exercised by raw-row-contributor.test.ts.
- EXCEPTION `recovery/capability-card.ts:1` — this line is only a comment, not a missed branch in the guide data.

### Left for coverage-counter evidence

- `plugin-runtime/host-tool-binding.ts` — the branch-only report does not identify a location. Existing tests exercise normal and linked/Soon refusals and both lifecycle families. No duplicate added.
- Residual branch/function-only gaps in partially covered bindings require the full shard set or per-counter LCOV to confirm. Several listed counters map to comments, declaration lines or nonbehavioral default-option arms in the checked-out source. No 100% claim is made.

### BUG

None proven by this patch. No production code or coverage settings changed.
