# Coverage gap fill mutation plan

Static author review only. No test, build, install, coverage, typecheck, or mutation command was run.

- assistant/site/__tests__/public-errors.test.ts: an operator incident keeps the redacted stack and falls back to the code for a blank first line → Remove the diagnostic fallback to the incident code.
- assistant/site/__tests__/tools.test.ts: caps nested document text at 4000 characters including the separators → Allow the inserted separator to extend the returned document text beyond 4000 characters. The present implementation already has that bug, so this test is expected to be red.
- assistant/site/__tests__/tools.test.ts: does not read the document placeholder when an HTML entry has no HTML → Fall through to extractText for HTML entries with a null bodyHtml.
- assistant/site/__tests__/visitor-ag-ui-resume.unit.test.ts: malformed resume envelopes never attach or consume the parked approval → Allow a resume to reuse its parent's run ID.
- assistant/site/__tests__/visitor-ag-ui-resume.unit.test.ts: a bound exchange that already ended cleans up the attached segment without denying twice → Remove cleanup when confirm returns false.
- assistant/site/__tests__/visitor-ag-ui-resume.unit.test.ts: a failed shutdown denial is reported while the parked execution is still cleaned up → Drop the reportError call in denyAndEnd.
- assistant/site/__tests__/visitor-frontend-control.unit.test.ts: browser delivery requires a run ID and an object argument record → Remove the empty runId check.
- assistant/site/__tests__/visitor-executor.unit.test.ts: a call whose arguments cannot be detached is refused before policy, audit or handler work → Pass the original input rather than structuredClone(input).
- assistant/site/__tests__/visitor-confirmation-gate.unit.test.ts: an explicitly Off tool denies confirmation without emitting a prompt → Treat Off as Ask before evaluating confirmation mode.
- assistant/site/__tests__/visitor-turn-dedupe.unit.test.ts: an expired later entry is swept at capacity without evicting an older live turn → Remove the expiry sweep and immediately evict the oldest entry.
- cli/__tests__/unit/agent-plugin-tokens-command.unit.test.ts: malformed token JSON is refused without quoting the input → Re-throw the JSON parser's error instead of the fixed ValidationError.
- cli/__tests__/unit/agent-plugin-tokens-command.unit.test.ts: a failed seal reports only plugin IDs and does not report success or retry → Write the saved line in the failure path.
- cli/__tests__/unit/init-l149.unit.test.ts: init refuses conflicting credential inputs before reading stdin or creating the site → Change the credential-mode OR to AND.
- cli/__tests__/unit/init-l149.unit.test.ts: init rejects malformed or non-object credential envelopes before creating the site → Remove the array rejection.
- cli/commands/__tests__/stdin-input.unit.test.ts: stdin returns the complete text without trimming whitespace or breaking split UTF-8 characters → Trim the stream result in readStdinOrRefuse.
- contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts: form notification and attachment cleanup get the same bounded delivery backoff → Drop either event from the delivery policy table.
- contracts/core/events/__tests__/outbox-trace-parent.test.ts: transport metadata is removed entirely when the trace parent was its only member → Return the original event from withoutOutboxTraceParent.
- assistant/__tests__/surface-routes.wire-pins.test.ts: a streamed surface answer keeps its NDJSON status and body; an unhandled answer leaves the response for the caller → Drop the bridge write for non-JSON responses or leave the close handler registered on fallback.
- assistant/__tests__/surface-routes.wire-pins.test.ts: the shared surface host fails closed when a route opts into same-origin checking → Replace the default origin refusal with true.
- contracts/core/__tests__/unit/approval-i18n.unit.test.ts: the routine availability notice is translated in every supported locale without losing the product name → Remove the Spanish entry and let it fall back to English.
- contracts/core/__tests__/unit/approval-i18n.unit.test.ts: other approval copy still uses the shared locale dictionary → Return the key instead of calling coreApprovalText for non-routine labels.
- assistant/site/__tests__/visitor-slug-navigation.unit.test.ts: a still-resolvable navigation target cannot act from a page removed from the live list → Remove the live publication path check.
- features/settings/__tests__/visitor-tools-write.unit.test.ts: visitor policy fails closed on a storage outage and reads the saved choice again after recovery → Return an empty upgrade policy instead of null in the catch branch.
- contracts/site-assistant/__tests__/visitor-tools.unit.test.ts: newer stricter or equally strict navigation grants still keep both lower quotas → Always take the legacy mode instead of comparing the two modes.
- contracts/site-assistant/__tests__/visitor-tools.unit.test.ts: an unmigrated policy still honors a legacy grant for its renamed capability → Remove the explicit legacy grant lookup in resolveVisitorToolChoice.
- assistant/__tests__/tool-catalog-principal-scope.test.ts: a bearer whose tracked run ended no longer has a discovery principal → Use the principal ID on the caller record instead of looking it up in the live run map.
- assistant/__tests__/automatic-agent-plugins.integration.test.ts: access approval denies a missing person or an active agent but accepts the active human in this workspace → Remove the principal.kind check.
- features/agent-plugins/__tests__/unit/bundled-catalog.pointer.unit.test.ts: a skill-only pointer leaves the supporting file unspecified → Default file to SKILL.md when constructing the explicit pointer.
- cli/commands/__tests__/storage-report.test.ts: an outside database with an unreadable sidecar keeps its size unknown in the report → Return zero for any stat error instead of just ENOENT.
- features/agent-plugins/__tests__/unit/bundled-id-upgrade.unit.test.ts: startup seeding receives the blocked legacy ID and reason inside the workspace lock → Pass an empty rename map to seedWithBundledIdUpgrade.
- assistant/__tests__/subagent-settings.unit.test.ts: the permissions source distinguishes a saved snapshot, a saved legacy grant and a default → Drop the forwarded onSource port when falling back to the legacy Boolean.
- cli/__tests__/integration/serve-export-teardown.integration.test.ts: serve: a dir argument logs that all three legacy DB paths are ignored (strengthened existing test) → Remove the TOVU_CHAT_DB warning.
- cli/commands/__tests__/storage-maintenance.test.ts: a compact refusal distinguishes a busy site from an invalid recovery decision → Return exit 1 for every refused recovery.
- cli/commands/__tests__/storage-maintenance.test.ts: compact maps a partial result to exit 2 and keeps private failure details out of the output → Treat partial as success, or print the raw caught message.
- cli/__tests__/unit/owner-store-mapping.unit.test.ts: a legacy GitHub key cannot import when the bundled provider is absent → Remove the missing-provider guard.
- assistant/__tests__/surface-routes.wire-pins.test.ts: leaving while a surface answer is pending aborts the producer → Remove gone.abort() from the close handler.
- cli/__tests__/integration/help-and-unknown-command.integration.test.ts: import-local dispatches stdin to its own validator and emits no success reply for malformed input → Make the import-local action a no-op.
- features/agent-plugins/__tests__/unit/access-token-tool.unit.test.ts: the token target adapters reject a repointed row before saving and preserve its contents → In requireTargetRow, return a direct repo read instead of invoking the bound target check.
- features/agent-plugins/__tests__/unit/access-token-tool.unit.test.ts: the standalone token save keeps a configured row unchanged on abort, then seals a later valid save → Stop forwarding the cancellation options to saveWithPorts.
- cli/commands/__tests__/storage-maintenance.test.ts: Commander clean defaults to preview, and --dry-run overrides --apply → Drop the explicit dry-run override from the Commander action.
- features/agent-plugins/__tests__/unit/activation-effects.unit.test.ts: the token and tool entry gate follows saved activation changes and fails closed on an unreadable ledger → Return true for any verdict other than "inactive", allowing an unreadable ledger.
- contracts/core/__tests__/unit/unindexed-ref-warning.unit.test.ts: unindexed reference warnings identify the page operators need to review → Drop the sourceEntryId argument to console.warn.
- cli/__tests__/unit/reset-owner.unit.test.ts: reset forwards the explicitly selected username with the environment-supplied password → Omit the username argument when constructing the reset request.
- assistant/__tests__/tool-search-keywords.test.ts: metadata without search terms keeps the host vocabulary while explicit registration terms take precedence → Remove the native keyword fallback from the metadata path.
- features/consent/__tests__/service.test.ts: deployment accepts valid local evidence while incomplete and unavailable policies retain actionable refusals (strengthened existing test) → Point the publish-without-banner choice at the ordinary overview, or omit its enforcement warning.
- features/agent-plugins/__tests__/unit/bundled-id-upgrade.unit.test.ts: the rename map covers every bundled package 0.7.2 shipped as tovu/<id> (strengthened existing test) → Add an unrelated local id to the rename list.
- features/pages/__tests__/agent-tools.embed-types.test.ts: the page writer's legacy Gallery example still validates with layout and accessible image text intact → Remove alt from the legacy example or change its columns to an out-of-range value.
- cli/__tests__/unit/site-rename-command.unit.test.ts: with no output port a committed rename writes one JSON line to stdout → Replace the default stdout writer with a no-op.

## Static triage of unchanged targets

SKIPPED-ALREADY-COVERED means the named existing test exercises the behavior relevant to the supplied gap. This is a source-read conclusion, not a fresh measurement. Five shards do not prove 100% coverage, particularly where the input had no branch or function locations.

| Source under apps/website/src | Existing evidence |
|---|---|
| assistant/site/visitor-frontend-control.ts | visitor-frontend-control.unit.test.ts — "F3c real site-chat GET stream shape resolves its visitor owner without Origin" and "a disconnected page cannot begin or settle its old invocation". |
| assistant/site/visitor-tool-presentation.ts | server/runtime/composition/__tests__/visitor-tools-management.unit.test.ts — "the production catalog is the reviewed CMS reads and seven page capabilities"; checks display labels and descriptions on the consumer catalog. |
| assistant/tool-approval-policy.ts | tool-approval-policy.tw3.test.ts — dynamic rules, inherited ids, and precedence; tool-approval-policy.test.ts — approval gating, failure and cancellation behavior. |
| assistant/tool-audit-preset.ts | tool-catalog-audit.test.ts — "a describe_tool call records the requested id and whether it resolved", "without an onSinkError hook a throwing sink is reported once per append"; tool-executor-audit.test.ts — forwarded call and result auditing. |
| assistant/tool-catalog-query.ts | tool-catalog-query.entries.test.ts — "listToolCatalogEntries: reads the registry on every call, so a tool registered later is included". |
| assistant/tool-gaps-tool.ts | tool-gaps-tool.unit.test.ts — owner/other admin, missing audit storage, bypassed policy handler. |
| assistant/tool-recovery-preset.ts | tool-failure-redaction.test.ts — "standalone withRedactedToolFailures still redacts and stamps an id"; delegated-tool-error-disclosure.test.ts — non-Error/blank/missing report behavior and matching incident ids. |
| cli/commands/adopt.ts | adopt-command.unit.test.ts — markerless write and preview, idempotent complete pair, partial marker refusal, key-only completion and preview, named candidates, no candidates, non-refusal propagation. |
| cli/commands/deploy-config.ts | deploy-config-command.unit.test.ts — generator output, missing/unknown target, refused generator, unresolved site and invalid site IDs; deploy-config-target-help.unit.test.ts — help for one, two, and many generators. |
| cli/commands/export.ts | export-command-boot-work.unit.test.ts — dropped-reference warnings, incomplete route and asset reports, asset-only failure, and blocked recovery before crawling. |
| cli/commands/import-local.ts | import-local.integration.test.ts — real archive import, no injected password, cancellation on stdin close, request exactly at cap and over cap. |
| cli/commands/introspect.ts | introspect-command.unit.test.ts — "an unknown --format is refused without printing" plus Commander and MCP projections. |
| cli/commands/owner-store-import.ts | owner-store-import.unit.test.ts — dry run, transactional apply, rollback refusal, key and label conflicts, unsupported types, pending site copies and empty import. |
| cli/commands/owner-store.ts | owner-store.integration.test.ts — stdin dispatch, list/put/delete, legacy status/import, OAuth disconnect and stale approval. |
| cli/commands/plugin/install.ts | plugin-command.unit.test.ts — noninteractive terminal refusal and built-in collision; plugin-install-real-site.unit.test.ts — default and explicit site roots. No claim of complete TTY/installation coverage without a refreshed branch map. |
| cli/commands/serve-listen.ts | serve-command-wiring.unit.test.ts — SIGTERM/SIGINT shutdown and instrumented startup announcement; serve-export-teardown.integration.test.ts — real port collision and non-EADDRINUSE error. Unmapped lifecycle edges remain below. |
| cli/help.ts, cli/main.ts | help-and-unknown-command.integration.test.ts — bare exit 0, help exit 0, unknown exit 2; help-streams.unit.test.ts — exact stderr/stdout treatment. |
| cli/introspect.ts | introspect.unit.test.ts — "introspectProgram: reads real commands/arguments/options off the live Command tree" and MCP projection over nested commands. |
| contracts/core/agent-permission-mode.ts | agent-permission-mode.unit.test.ts — "locally an explicit override wins in either direction" and production/host restrictions. |
| contracts/core/assistant-run-events.ts | assistant-run-events.activity.unit.test.ts — terminal notices, SSE split frames, daemon-only prefixes, save projection and split echo filtering. |
| contracts/core/chat-delete-grant.ts | chat-delete-grant.unit.test.ts — no grant reader, fresh revocation, principal forwarding, admin destination/no destination. |
| contracts/core/credential-token.ts | credential-token.test.ts — ordinary fields remain usable and secret shapes are refused; tool-failure-recovery.test.ts exercises the binding in credential setup. |
| contracts/core/gated-mutations/composition.ts | composition.unit.test.ts — confirm-only hooks reject computePlan and executeMutation, and pass scope metadata. |
| contracts/core/gated-mutations/gateway.ts | gateway.unit.test.ts — ordered checks, exactly-once redemption, fresh permission, re-derived plan handed to mutation, instance/workspace scope. |
| contracts/core/gated-mutations/token.ts | token.unit.test.ts — TTL boundary, expiry, concurrent redemption and missing atomic expiry. |
| contracts/core/human-confirm.ts | human-confirm.lifecycle.test.ts — abort/headless/expiry, grant revoked during prompt, remembered approval, execution completion, batch and alternate choice. |
| contracts/core/plugin-credential-card.ts | plugin-credential-cards.unit.test.ts — domain forms keep required fields, and optional, absent or mismatched declarations preserve the base form. |
| contracts/core/publish-trust-wire.ts | handshake-client-keyless.unit.test.ts — "openPublishSession signs the challenge and returns the minted session" verifies the version prefix in the signed bytes; "a null identity response is reported as a non-Tovu destination" checks the failure code. |
| contracts/core/rate-limit/rate-limit.ts | rate-limit.test.ts — "every rate-limit profile is pinned by value", configured profile limits/burst, window expiry and proxy selection. |
| contracts/core/runtime-mode.ts | runtime-mode.unit.test.ts — dedicated runtime signal or default; server/runtime/composition/__tests__/agent-plugin-connections.unit.test.ts — exact Electron node-mode signal vs hosted defaults. |
| contracts/core/settings-vocabulary.ts | publish-content.round-trip.test.ts — "only allowlisted, non-secret workspace values pack", including exact published Site title label; destination rejects unlisted settings. |
| contracts/core/theme-ids.ts | theme-ids.unit.test.ts — current and retired IDs prefer the current theme; unrelated IDs are unchanged. |
| contracts/core/tool-failure-diagnostics.ts | tool-failure-recovery.test.ts — eligible diagnostic remains typed; credential-shaped or token fields are refused. |
| contracts/core/tool-metadata/{agent-pause,content-read,index,storage,theme}.ts | tool-metadata-projections.test.ts — exact projected search, approval and callback baseline, plus live production registrations; tool-catalog-query.entries.test.ts checks content-read guidance and targets. |
| contracts/headless/assistant-permanent-deletes-policy.ts | chat-delete-grant.unit.test.ts — enable switch, explicit grants, and screen/no-screen refusal; tool-metadata-projections.test.ts — all 13 opt-in IDs and forbidden operations. |
| contracts/headless/assistant-tool-approval-policy.ts | assistant-tool-approval-policy.unit.test.ts — missing or malformed handles, all reviewed handles, undeclared capabilities and direct/non-direct capabilities. |
| contracts/headless/secret-form-cards.ts | mcp-ui-secret-form-cards.test.ts — "every secret card requires an exchange" and all production forms map to the definitions; tool-metadata-projections.test.ts checks projected fields/IDs. |
| features/agent-plugins/admin-surfaces/surfaces.ts | admin-surfaces/__tests__/unit/surfaces.unit.test.ts — contained reads, declared files only, failed actions never expose collected sign-ins, missing collectors preserve outcome. |
| features/agent-plugins/apply-connect-defaults.ts | apply-connect-defaults.unit.test.ts — actual activation storage and explicit Off; declined-access.unit.test.ts — saved decline preserves refusal. |
| features/agent-plugins/apply-tool-renames.ts | apply-tool-renames.unit.test.ts — saved tool grants follow renames, idempotent read-back, default listing and failure handling. |
| features/agent-plugins/automatic-agent-plugins.ts | automatic-agent-plugins.integration.test.ts — real off-plugin guidance, scoped preflight, preference changes and retry; automatic-agent-plugins.errors.unit.test.ts — redacted warning and still-usable run. |
| features/agent-plugins/bundled-contribution-sources.ts | host-signals.unit.test.ts — "real synchronous bundled selection reads manifests, excludes retired/non-packages, needs no activation". |

## Exceptions

- EXCEPTION assistant/site/visitor-execution-ports.ts:1–28 — type-only imports and interface.
- EXCEPTION assistant/tool-contribution-registry.ts:1–end — type-only host contract, no runtime registry defined.
- EXCEPTION contracts/core/gated-mutations/ports.ts:1–end — type-only gateway ports.
- EXCEPTION contracts/headless/index.ts:1–4 — pure re-exports; consumers exercise the underlying values.
- EXCEPTION cli/commands/theme/migrate.ts:54–57 — exhaustive never branch for the typed migration outcome. Existing tests exercise the documented result union.

## Remaining validation

- No new coverage totals. Re-run all eight website shards in the cloud, including subprocess coverage, before concluding any file has 100%.
- In particular, this pass did not close every CLI action/wiring edge in serve-listen, program, storage-program, or the interactive plugin install path. Recheck pending startup error/idle shutdown, serve argv token forwarding, the bound storage report action, and valid terminal consent.
- Direct default-installed-resolver behavior and remaining port/default branches in access-token-tool, visitor frontend binding, and storage maintenance were not exhaustively re-enumerated. Compare full branch/function lcov with the existing integration suites before adding more cases.
- BUG assistant/site/tools.ts:168 — document extraction budgets node text, but the later join inserts unbudgeted spaces. The regression fixture yields 4,001 characters instead of the documented cap of 4,000. A final slice after join/trim would enforce the public cap without removing the traversal budget.
