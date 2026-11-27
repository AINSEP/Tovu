# Website coverage gap fill

Tests and source mutations to check in the cloud. No test, build, typecheck, coverage, or mutation command was run locally. The paths below are relative to `apps/website/src/features`.

- `agent-plugins/__tests__/unit/tool-registrations.unit.test.ts`: installed guidance is classified as read-only by registered tool id → in `tool-registrations.ts`, pass an empty sources array to `hostAgentPluginToolDerivedRisk`.
- `agent-plugins/__tests__/unit/provider-plugin-link.unit.test.ts`: a non-Error provider failure is still readable in the retry warning → in `provider-plugin-link.ts`, replace `String(error)` with `"Unknown error"`.
- `agent-plugins/__tests__/unit/mcp-projection-seam.distinct-ports.unit.test.ts`: adding legacy projection ports does not read a lazy adapter or lose its receiver → in `mcp-host-bindings.ts`, replace the descriptor-preserving return expression with `{ ...target, ...overrides }`.
- `api-connections/__tests__/byo-client.unit.test.ts`: a saved BYO secret without a username names the missing client ID → in `byo-client.ts`, replace the no-client-ID problem with the unreadable problem text.
- `custom-credentials/__tests__/plugin-credential-card.unit.test.ts`: a missing declared account uses the same validation error as the credential store → in `plugin-credential-card.ts`, replace `new CustomCredentialValidationError(message)` with `new Error(message)`.
- `custom-credentials/__tests__/plugin-credential-card.unit.test.ts`: the card rejects a Tovu-shaped secret pasted in the public account field → in `plugin-credential-card.ts`, replace the supplied `assertFreeField` with `() => {}`.
- `deployments/static-publish/__tests__/verify.unit.test.ts`: submitted publish credentials project the declared token field to the checker and do not expose undeclared fields → in `static-publish/verify.ts`, call `submittedWithPorts` with `connection: { providerId: required.connection.providerId }` instead of the submitted connection.
- `external-mcp/__tests__/external-mcp-store.test.ts`: access-token normalization trims edges and applies the hosted character rule only to hosted transports → in `external-mcp-store.ts`, forward `transport: "stdio"` unconditionally.
- `forms/__tests__/form-file-renditions.test.ts`: an unbound ownership reader keeps the stored bytes because it cannot prove there are no owners → in `form-file-purge.ts`, return `false` instead of `true` when no kernel is supplied.
- `agent-plugins/__tests__/unit/host-overlays-dir.unit.test.ts`: the no-argument overlay binding reads the current process override on every call → in `host-overlays-dir.ts`, replace the process-env fallback with an empty object.
- `external-mcp/__tests__/h2b/connection-gate-seam.test.ts`: an enabled plugin missing an approval gets the Tovu access-review instruction → in `external-mcp-oauth.ts`, always use the “connection was turned off” reason.
- `agent-plugins/__tests__/unit/grant-signed-in-defaults.unit.test.ts`: boot honors an empty supplied plugin inventory even if a signed-in active plugin is on disk → in `grant-signed-in-defaults.ts`, always call `listInstalledAgentPluginServers(deps)` instead of preferring `deps.listPlugins`.
- `agent-plugins/__tests__/integration/layout-b-memory.integration.test.ts`: a failed sibling migration logs its workspace, redacts the cause and continues with healthy siblings → in `memory.ts`, replace `formatErrorForLog(...)` in the sibling warning with `String(error)`.
- `image-transform/__tests__/tool.test.ts`: a missing or trashed Library source refuses before reading its stored bytes → in `asset-sources.ts`, remove `|| media.status !== "active"` from the original-reader guard.
- `api-connections/__tests__/shared-owner.integration.test.ts`: shared OAuth owner storage refuses a site-scoped vault with an actionable message → in `shared-owner.ts`, change `ownerWorkspaceId` from `"project"` to `"workspace-local"`.
- `api-connections/__tests__/shared-owner.integration.test.ts`: the shared-key inventory does not pretend a disconnected credential still names an account → in `shared-owner.ts`, replace the “No connected account” fallback with “Unknown”.
- `api-connections/__tests__/shared-api.unit.test.ts`: the surface binding preserves absent shared status and an accountless shared connection → in `surface-connection-bindings.ts`, return `null` for every status without an account rather than preserving the reconnect requirement.

## Tests added by production file

- `agent-plugins/grant-signed-in-defaults.ts` — 1 — supplied boot inventory takes precedence over disk.
- `agent-plugins/host-overlays-dir.ts` — 1 — implicit env is live and explicit env stays isolated.
- `agent-plugins/mcp-host-bindings.ts` — 1 — descriptor-preserving legacy projection binding.
- `agent-plugins/memory.ts` — 1 — failed sibling migration is reported safely and does not stop healthy siblings.
- `agent-plugins/provider-plugin-link.ts` — 1 — warning preserves a non-Error failure reason.
- `agent-plugins/tool-registrations.ts` — 1 — risk is read-only and keyed by each registered tool id.
- `api-connections/byo-client.ts` — 1 — saved key without a client id produces the precise recovery reason.
- `api-connections/shared-owner.ts` — 2 — wrong owner boundary and accountless inventory label.
- `api-connections/surface-connection-bindings.ts` — 1 — absent status remains null, while a bound accountless record retains its reconnect-required status.
- `asset-transfer/asset-sources.ts` — 1 — both missing and trashed media refuse before blob access.
- `custom-credentials/plugin-credential-card.ts` — 2 — host error identity and Tovu-specific public-field redaction check.
- `deployments/static-publish/verify.ts` — 1 — submitted credential projection and incomplete-submission refusal.
- `external-mcp/external-mcp-oauth.ts` — 1 — an active plugin's unapproved tool receives access-review wording rather than disabled wording.
- `external-mcp/external-mcp-store.ts` — 1 — static-token normalization and hosted-vs-stdio credential policy.
- `forms/form-file-purge.ts` — 1 — no ownership kernel means keep the bytes. The existing exact-key, tombstone and lock tests take the other listed paths.

## SKIPPED-ALREADY-COVERED

- `agent-plugins/card-host-bindings.ts` — `a10-card-seam.unit.test.ts` — Tovu card identity resolves to the exact pre-seam bytes.
- `agent-plugins/connect-card-ui.ts` — `assistant/__tests__/moved-tools.golden.test.ts` — moved tools, cards, approvals and counters match the golden recorded before any move. It serializes the actual Tovu token outcome.
- `agent-plugins/connect-destination.ts` — `connect-destination.unit.test.ts` — shared destination comes only from a principal-bound human answer and cannot be replayed.
- `agent-plugins/connect-sign-in-wait.ts` — `connect-skip.unit.test.ts` — Skip on an OAuth sign-in card lets the assistant continue without stopping the run. The configured connect host calls this waiter and exercises its skip callback.
- `agent-plugins/customize-tool.ts` — `bundled-customization.integration.test.ts` — H1: owner customizes bundled tovu-theme through chat into a saved site copy, preserving bundled bytes and trust.
- `agent-plugins/enable-access.ts` — `enable-access.regression.test.ts` — the owner card predicts the same exact access that the existing grant owner applies, before sign-in. `mcp-ports.error-identity.unit.test.ts` tests injected validator/classifier.
- `agent-plugins/executable-tools/approval.ts` — `approval.unit.test.ts` — a call with a connectionRef gets an Account row first, then one Affects row per resource. Also tests not-connected and withdrawn outcomes.
- `agent-plugins/federate-mcp.ts` — `federate-mcp.unit.test.ts` — reviewed read names for the exact endpoint, and enabling a plugin creates a real, disabled row.
- `agent-plugins/identity-read-policy.ts` — `identity-warning-dedupe.unit.test.ts` — identity deprecations warn once per package across repeated indexes and host bindings.
- `agent-plugins/import-access-token.ts` — `import-access-token.unit.test.ts` — without an injected listing, env import reads the workspace's installed plugins (none here) and copies nothing. The env-import suite also exercises injected listings.
- `agent-plugins/install-tool.ts` — `install-tool.unit.test.ts` — the install contribution wires the host's attachment reader into the tool it builds. `install-tool-update.unit.test.ts` exercises publication, snapshots and missing MCP dependencies. `install-tool-sources.unit.test.ts` exercises folder, bundled and ambiguous activation cases.
- `agent-plugins/install-upload.ts` — `install-upload-update.unit.test.ts` — retired package cleanup failure keeps the published update and redacts its diagnostic.
- `agent-plugins/layout.ts` — `layout.unit.test.ts` — absolute override, invalid workspace/plugin/data id, learned/notes kind refusal, and process-env default.
- `agent-plugins/memory-tools.ts` — `memory-tools.unit.test.ts` — L025b memory pairs pin scoped read/write schemas, validation and revocation.
- `agent-plugins/new-site-agent-plugin-tokens.ts` — `new-site-agent-plugin-tokens.unit.test.ts` — the new-site sign-in list reads the given bundled root, and missing supplied root does not fall back.
- `agent-plugins/switch-on-saved-token.ts` — `switch-on-saved-token.unit.test.ts` — describeSavedTokenSwitch names the screen that turns each kind of off back on.
- `agent-plugins/token-sign-in.ts` — `token-sign-in.unit.test.ts` — accepted token issues one GET to the declared probe URL. The same test file covers unsupported configurations and vendor refusals.
- `agent-plugins/uninstall-confirmation-ui.ts` — `uninstall-confirmation-ui.unit.test.ts` — versionless dialog, all declared versions, and operator locale each have separate cases.
- `agent-plugins/write-note-tool.ts` — `write-note-tool.unit.test.ts` — ordinary note save runs directly, preserves bytes and opens no exchange.
- `agent-plugins/lifecycle.ts` — `layout-b-memory.integration.test.ts` — notes autoload in pinned skill guidance and learned memory rejects out-of-scope paths, through containAgentPluginStatePath. Other listed ranges (69–72, 104–105, 325–326) are type declarations.
- `analytics/salt-context.ts` — `salt-context.test.ts` — the injected host salt context derives the pre-extraction daily salt byte-for-byte.
- `analytics/warn.ts` — `warn.test.ts` — both forwarding warning and dropped-delivery reporting are exercised and asserted exactly.
- `api-connections/browser-binding.ts` — `external-mcp/__tests__/h2c/sign-in-link-binding.test.ts` — hosted sign-in link uses the supplied workspace and server id on the callback origin. `browser-binding.unit.test.ts` exercises malformed, missing and duplicate cookies.
- `api-connections/connect.ts` — `connect.unit.test.ts` — hosted card gets only the sign-in hop path while the redirect URI stays absolute, plus desktop listener lifecycle and failure cases.
- `api-connections/contribution.ts` — `contribution.unit.test.ts` and `contribution.fault.unit.test.ts` — malformed declarations and a thrown non-Error descriptor read exercise the bound loader.
- `api-connections/oauth-bindings.ts` — `surface-adapters.security.test.ts` — callback fields: only the declared ones are kept, only the owner plugin can take them, and only once.
- `api-connections/plugin-state-bindings.ts` — `plugin-state-format.pin.unit.test.ts` — A3 pin: real state store preserves the format, vault scope, row id and label.
- `api-connections/surface-connections.ts` — `surface-adapters.security.test.ts` — undeclared id, another plugin/workspace and no admin get the same refusal. The same suite exercises issued links.
- `api-connections/vault-store-binding.ts` — `site-backup/__tests__/saved-keys-api.test.ts` — API transport re-derives workspace keys and retains matched durable record/token only.
- `comments/index.ts` — `index.test.ts` — one composed module reads ledger changes live and submissions honor a changed per-IP budget without resetting the hour. The listed 1–12 are the header.
- `consent/privacy-defaults-reporter.ts` — `adapters.test.ts` — privacy bootstrap failure is reported without blocking consent and retries on next open.
- `content-duplication/copy-naming-policy.ts` — `copy-naming-policy.test.ts` — suffixed copies advance on collision and keep the exact exhaustion wording.
- `content-types/write-service.ts` — `reserved-keys.test.ts` — direct and assistant writes refuse reserved host routes without persistence. An unreserved prefix-sharing key persists.
- `custom-credentials/repository-target.ts` — `write-files-validation.unit.test.ts` — both injected GitHub validator and generic no-validator default accept valid and refuse malformed targets.
- `custom-credentials/tool-registrations.copy.ts` — `credential-save-probe.test.ts` exercises both refusal and unavailability text (create and rotation), and `form-save-errors.model-facing.test.ts` asserts allowlisted and generic save messages.
- `custom-credentials/tovu-credential-card-identity.ts` — `extract-s8-c2p2-host-inputs.test.ts` — Tovu binds namespace tovu and the exact app names its cards always reported.
- `custom-credentials/tovu-credential-sets.ts` — `extract-s8-g-cred.integration.test.ts` exercises real vault ownership and context. `project-scope.unit.test.ts` exercises project conflict classification and shared grants.
- `custom-credentials/types.ts` — `credentialed-request.unit.test.ts` — an additionalHosts origin is accepted with that credential; an origin outside the saved set is refused. Apart from the origins helper, listed ranges are documentation/type declarations.
- `database-transfer/copy-engine.ts` — `exclusions.unit.test.ts` — partial exclusion counts skip settings tables absent from an older snapshot.
- `database-transfer/destination-store-host.ts` — `destination-store.authorize.unit.test.ts` — site-wide Tovu database-destination context allowed; `destination-store.sqlite.test.ts` exercises the sealed address against storage.
- `database-transfer/destination-ui.ts` — `destination-ui.unit.test.ts` renders success and failure outcomes for the supplied exchange.
- `database-transfer/exclusions.ts` — `exclusions.unit.test.ts` — every core table with a secret-shaped column is excluded from the copy. The listed 1–10 are documentation.
- `database-transfer/table-catalog.ts` — `table-catalog.unit.test.ts` — chat snapshot order places the three owned tables first and sorts other tables by name.
- `database-transfer/tool-registrations.ts` — `tool-registrations.faults.unit.test.ts` — default failure logger reports snapshot failures without leaking addresses; contributor binds supplied adapters and risks.
- `database/gated-hooks.ts` — `migrate-forward-hooks.unit.test.ts` — executeMutation persists the actual artifact reference, cost class and restore-point kind.
- `deployments/capability-card.ts` — `diagnose-static-export.unit.test.ts` ties the capability card to the real diagnostics tool. The listed 1 is a comment.
- `deployments/deploy-config-registry.ts` — `deploy-config-registry.unit.test.ts` — workflow declarations use the installed active contribution gate and preserve all choices.
- `deployments/deploy-config.ts` — `deploy-config.unit.test.ts` — buildDeploymentDescriptor derives every field from the Dockerfile, package.json and health handler, and refuses format drift.
- `deployments/deploy-ops/run-ops.ts` — `deploy-ops/__tests__/secrets.test.ts` — the default site-key reader resolves this site's sources; no bound site means no key to copy. `deploy.test.ts` exercises runDeploy using the real shim.
- `deployments/deploy-ops/secrets.ts` — `deploy-ops/__tests__/secrets.test.ts` calls list, set and unset through the bound runtime, including the typed secret card and held removal.
- `deployments/deploy-ops/typed-secret-card.ts` — `typed-secret-card.test.ts` — without surfaces the card refuses headless collection; vendor failure after submit returns fixed storage copy.
- `deployments/deploy-targets/host-kit-binding.ts` — `host-kit.unit.test.ts` exercises default and injected fetch. `host-kit.observability.unit.test.ts` exercises tracing and unobserved sends.
- `deployments/export-run-binding.ts` — `export-run.test.ts` — both an Error and a thrown string appear in the errored snapshot and a later run clears the error.
- `deployments/publish-credentials/store.ts` — `publish-credentials/__tests__/store.unit.test.ts` — compatibility invalidation drops only hosts affected by creation or deletion.
- `deployments/static-publish/adapter.ts` — `adapter.security-headers.unit.test.ts` exercises the direct host adapter; provider-error and observability suites also call it.
- `deployments/static-publish/domain-publish-tool.ts` — `domain-publish-tool.unit.test.ts` — domain exchange cancel/confirm/stale and approved domain publish reporting settlement.
- `deployments/static-publish/publish-run.ts` — `domain-publish-tool.unit.test.ts` reads real job snapshots; `publish-run.unit.test.ts` calls startPublishRun and reads the running/completed host slot.
- `entries/unreadable-owner-entries-repair.ts` — `unreadable-owner-entries-repair.dialects.test.ts` — exact removals (registered trash purge and unregistered hard delete), idempotent marker, default options, and rollback. The concurrent boots test also passes the real logger.
- `external-mcp/external-mcp-host-copy.ts` — `external-mcp-admissions.observability.unit.test.ts` exercises the host admissions reader and exact safe diagnostic; reported 1–10 are documentation.
- `external-mcp/external-mcp-vault.ts` — `external-mcp-vault.unit.test.ts` — own identity round trip, wrong identity/kind refusal, staged envelope persistence, and idempotent replay.
- `external-mcp/tool-registrations.ts` — `tool-registrations.oauth-origin.unit.test.ts` — malformed configured URL tests both invalid scheme and unparseable URL with real safe errors.
- `form-destinations/key-store.ts` — `key-store.unit.test.ts` — pull destinations list saved keys, optionally scoped, with the saved published address.
- `forms/form-file-maintenance.ts` — `form-file-maintenance.test.ts` — proven terminal orphan goes private through existing Trash and durable cleanup; multiple ownership checks preserve live references.
- `forms/index.ts` — `common-field-tools.test.ts` runs submitForm. `server/inbound/public-http/routes/site/__tests__/forms-timing.route.test.ts` exercises host issuance/submit binding and verifies exactly one stored row on retry.

## EXCEPTION

- `custom-credentials/extract-s8-c2p1-ports.type-pin.ts` — 1–50 — compile-time equality assertions and type-only exports, no runtime behavior.
- `custom-credentials/index.ts` — 1–53 — pure re-export barrel, including 1–4 documentation. The underlying store and runtime functions retain their own tests.
- `deployments/index.ts` — 1–45 — pure re-export barrel, with no behavior in the listed comment ranges.
- `deployments/publish-tool-deps.ts` — 1–6 — host specialization of imported types only, erased at runtime.
- `external-mcp/contracts.ts` — 1–12 — type aliases and type-only imports, erased at runtime.

## Files with remaining or unlocalized gaps

- `agent-plugins/executable-tools/host-bindings.ts` — Existing `admin-action-tools.test.ts` checks changed declarations and deactivation after confirmation. The remaining branch is not identifiable from the supplied file-only count; no additional case for the missing-caller/lookup guard was added.
- `agent-plugins/host-tool-ports.ts` — Listed 1–6 are documentation. The `tool-registrations.unit.test.ts` and `memory-tools.unit.test.ts` exercise the real host ports, but not every callback could be assigned to an existing assertion from the summary.
- `api-connections/host-bindings.ts` — Shared desktop factory covered by `shared-api.unit.test.ts`. Its unconfigured throw is not reachable via the normal Jini host path, which does not call the factory unless shared storage was supplied. No direct inconsistent-configuration-only call added.
- `consent/host-bindings.ts` — Existing host log tests and `tools.test.ts` cover the reporter, reserved-path refusal and invalid banner copy. Exact functions behind the reported deficit were not identified.
- `custom-credentials/tool-registrations.ts` — Existing model-facing errors and real host operations tests exercise the binder. The aggregate branch deficit is not localized by the supplied report.
- `deployments/publish-agent-tools.ts` — Catalog, registrations, secure save and confirmation are exercised by neighboring suites, but the aggregate function deficit was not localized.

## BUG

No production bug established by the new cases. Coverage and mutation results are unverified pending the cloud run.

