# Y5 API round 2 coordinator commit plan (do not commit this file)

Scope: Tovu only; working tree only; no desktop edits or subagents. No tests, builds, installs, typechecks or linters run. Dispatch G0 is satisfied. This checkout is 31aae1b038 over 48f6802924; coordinator states the final merge report changed no code. Jini pinned at origin/codex/y5-api-2j (650b82af88900aa6e255939b3cb9920f5efe4cd5).

The approved sheets govern the binding pattern. Mandatory local architecture chapters/project memory and the requested pre-existing y5-api-keeps.md are absent. Preserve existing y5-api-g3-keeps.md and create the requested additive companion ledger.

Tests first: repoint existing named Tovu characterization tests before production edits. The named NEW suites belong to Jini, outside this dispatch's writable scope; do not duplicate them in Tovu. Coordinator/Opus must execute unmutated contracts and mutations.

Named mutations:
- A-remove-choice-revision-recheck: remove the after-answer preference revision check; stale consent must fail before preference/transcript commitment.
- W-skip-invalid-first-source: continue past invalid first material; invalid-first/valid-second test must fail.
- H-release-upload-only-on-success: remove close-triggered release; interrupted upload must block the next authorized upload and fail its test.

ADR checklist: Jini owns sequencing; host owns literal policy/effect translation. No new abstractions, forwarding shells, branches in G3 files, inbound writer imports, theme edits, implicit dependencies or changed operation/step/log literals. Preserve deferred reads and host hooks. Retain exactly the supported APIs; stop unsupported individual steps.

## Coordinator commit order

1. W — site-key writer cutover: characterization test repoints first, then composition binding, caller repoints, old writer deletion and path-ledger cleanup.
2. H — preview pure binding: existing parity tests retained, then configured renderer and G3 keep.
3. Additive keep ledger and exact residual blocker inventory.

## Static review / cleanup

Pending. No completion, green-test, mutation or counter claim yet.

## Completed coordinator units (final order)

1. A — independent run/return-type repoints and controller-resolver test repoint. Files: assistant/__tests__/automatic-agent-plugins.integration.test.ts; server/runtime/composition/modules/{assistant-agent-plugin-guidance-rpc.ts,assistant-tool-exec.ts,__tests__/assistant-agent-plugin-preflight.integration.test.ts}. All paths under apps/website/src/. No A original is newly deleted.
2. W — writer cutover, named test/fixture repoints first, pure decision/fingerprint imports from Jini, new site-key-write-bindings.ts and deletion of features/webhooks/site-key-ensure.ts. Required dependent-data callbacks remain supplied per call. Live fs namespace keeps existing syncBuiltinESMExports test seams; storage-secret keeps its lazy writer import. Original readSourceMaterial ?.raw already matched the supplied type repair; no alternative repair added.
3. H — moved ExternalMcpOAuthRouteDeps and its why-comment verbatim to the existing deps.ts; repointed named test and composition importer first. Registrar cutover remains stopped.
4. Add plans/count-1125/y5-api-keeps.md; the requested existing file was absent. Existing y5-api-g3-keeps.md is unchanged.

## Stopped individual steps / exact evidence

| Original | State | Reason |
| --- | --- | --- |
| apps/website/src/features/agent-plugins/automatic-agent-plugins.ts | left | A1: resolver timing; Jini deps.resolve is fixed before the per-entry layout read. |
| apps/website/src/features/agent-plugins/connect-tool.ts | deleted | Round 1: connect-bindings.ts. |
| apps/website/src/features/agent-plugins/exports/source.ts | deleted | Round 1: exports/bindings.ts. |
| apps/website/src/features/agent-plugins/install-tool.ts | left | A2: coupled to the unsupported upload lifecycle reader ABI. |
| apps/website/src/features/agent-plugins/install-upload.ts | left | A2: Jini archive entries require openReadStream({}); the host lifecycle reader calls openReadStream(). |
| apps/website/src/features/agent-plugins/memory.ts | left | A2: sheet requires upload/install/memory to cut over as one unit. |
| apps/website/src/features/agent-plugins/set-enabled.ts | left | A3: activation-effects -> provider-plugin-link -> activation-effects eagerly reads agentPluginActivations. |
| apps/website/src/features/webhooks/keyring.env.ts | left | W1: prescribed bindSiteKeyrings export is absent from pinned ordered-keyring.ts. |
| apps/website/src/features/webhooks/seal-aad-invariant.ts | deleted | Round 1: development/scripts/check-seal-aad.ts. |
| apps/website/src/features/webhooks/secret-scan-guard.ts | deleted | Round 1: development/scripts/check-secret-scan.ts. |
| apps/website/src/features/webhooks/site-key-ensure.ts | deleted | Round 2: server/runtime/composition/site-key-write-bindings.ts; required per-call scan hook retained. |
| apps/website/src/features/webhooks/site-key-sources.ts | deleted | Round 1: site-key-read-bindings.ts. |
| apps/website/src/server/inbound/admin-http/owner-passkey-routes.ts | left | H1: prescribed dev-auth.ts destination already has 723 lines; no permitted split is named. |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts | left | H2: requestDeps needs callback/session request facts, while the host mount requires complete initial spec deps. |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts | deleted | Round 1: composition/modules/external-mcp.ts. |
| apps/website/src/server/inbound/admin-http/routes/plugins/install.ts | left | H2: ZIP requestDeps needs req/res, while mountAdminRawRoute requires initial readZipUpload; throwing placeholders are forbidden. |
| apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts | left | H3: Jini requires Promise<NonNullable<pageHtmlEmbeds>>; host resolver returns undefined for doc posts. Attempted binding restored. |
| apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts | left | H2: overwrite-session requestDeps cannot satisfy initial mount deps without a forbidden placeholder. |
| apps/website/src/server/inbound/admin-http/routes/publish-content/route-helpers.ts | left | H4: Jini requires method/route/discloseDetails; existing mapper and its tests allow these fields to be absent. |
| apps/website/src/server/inbound/admin-http/routes/settings/events.ts | deleted | Round 1: composition/modules/settings.ts. |
| apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts | deleted | Round 1: composition/modules/system-credentials.ts. |
| apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts | left | H5: destinations registrar creates spec/deps per request; existing mount takes a registration-time spec. |
| apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts | deleted | Round 1: composition/http-app/mount-admin-system.ts. |
| apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts | deleted | Round 1: composition/modules/system-site-shares.ts. |

Upstream evidence is from Jini 650b82af88900aa6e255939b3cb9920f5efe4cd5:
- A1: site/automatic-agent-plugins.ts:19 binds resolve, :141 installs deps.resolve. Tovu creates the bound resolver inside createEntry after readiness/preferences and after checking reuse. G3 forbids the extra bind factory per resolve call; no timing change introduced.
- A2: site/install-upload.ts:129-149 uses the owner lifecycle type and reader; Tovu lifecycle.ts:61-68 defines zero-argument host streams and :104-111 ownerReader performs the conversion by iteration. New loop/adapter in install-bindings would fail G3. Required layout/reader/lifecycle effects still live in the optional upload argument; the requested bound upload entry is also absent.
- A3: provider-plugin-link.ts:1 imports activation-effects and :13 eagerly constructs providerFaceLifecycle; activation-effects must import provider links/error for the proposed binding. Avoiding the initialization cycle needs an unlisted change/accessor or extraction.
- W1: platform root-key/ordered-keyring.ts exports only createOrderedSiteKeyring, isNoSiteKeyError, createExclusiveSiteKeyGenerator. The required three constructors and bindSiteKeyrings are absent.
- H1: dev-auth.ts is 723 lines before edits. A named split is not provided and deleting unrelated comments/source would break the smallest-diff rule.
- H2: cms OAuth registrar :135-155 / plugin installer :139-160 / peer registrar :300-312 supply requestDeps. Tovu mountAdminRawRoute :59-61 and mountAdminJsonRoute require the complete initial Deps used by the spec. No placeholder, Object.create(app), new wrapper or weakened type assertion added.
- H3: cms template-preview-render.ts:183 requires Promise<NonNullable<RenderBareEntryDocumentRequired["pageHtmlEmbeds"]>>. Host widgets.ts:91-92 explicitly returns Promise<ResolveHtmlPageEmbedsResult | undefined> and undefined for doc posts. No fallback or false non-null assertion introduced.
- H4: cms route-helpers.ts:22-26 requires HTTP facts; existing mapper options and unexpected-route-errors tests intentionally omit them. No defaults introduced.
- H5: cms publish-site/destinations.ts:37-59 returns a fresh spec/deps from request(facts); mountAdminJsonRoute takes its spec before request handling. No registration proxy or extra abstraction introduced.

## Cleanup / deletions after diff review

- Deleted the sheet-named old writer, site-key-ensure.ts (458 lines), after repointing all real importers. Retired its error-gate-debt.json entry; write-path-inventory.baseline.json and check-site-key-names.md contained no ensure entry.
- Removed the attempted preview binding and its attempted G3 row/rule from the working diff, restoring both to HEAD after discovering H3. No unsafe cast or fallback remains.
- Removed the moved OAuth dependency type, service type import and why-comment from the old owner, with no re-export shell; the exact type/comment now lives in deps.ts.
- No other speculative helpers, types, comments or files added.

## Verification and handoff

- Counter: planner=874 true=86 rules=799; available keep set only, since y5-pub-g3-keeps.md is absent. This is -1 this round and -11 against the supplied original 97, not the requested -24. Output: /tmp/y5-api-round2-counter/.
- Static original-path inventory: 11 deleted, all absent; 13 left. Counter graph found zero imports naming deleted originals outside the deliberate writer-boundary scanner fixture. G3 keep file unchanged, so no unsupported new keep.
- Tests first: named existing tests/fixtures repointed before corresponding production edits. Writer boundary fixture now checks composition writer and Jini ensure/reconcile/files entries. No behavior test case added or weakened. Named new suites/mutation implementations are Jini-owned; all three named mutations require Opus execution.
- Architecture audit: WARNING for incomplete extraction (13 originals left); completed writer is in composition and inbound code receives it via existing callback. Imports/ports/static policy remain explicit; no new domain logic.
- Self-validation/coverage/runtime status: NOT RUN per explicit dispatch prohibition. No green contract or red mutation claim.
- Function assessment: writer expression adapters delegate sequencing to createSiteKeyEnsurer; no new branches/loops, per-call dependent-data hook retained. Complexity is one factory binding plus the existing owner operation, with no additional retention or recurring work.
- Scope: Tovu only; no desktop, Jini, .git, commits, pushes, installs, builds, tests, typechecks or lint.

## Exact file inventory by completed unit

1. A independent importer repoints

- apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts
- apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts
- apps/website/src/server/runtime/composition/modules/assistant-agent-plugin-guidance-rpc.ts
- apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts

2. W writer cutover

- apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts
- apps/website/src/cli/commands/serve.ts
- apps/website/src/features/webhooks/__tests__/fixtures/site-key-ensure-child.ts
- apps/website/src/features/webhooks/__tests__/site-key-ensure.pins.unit.test.ts
- apps/website/src/features/webhooks/__tests__/site-key-ensure.sources-boundary.unit.test.ts
- apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts
- apps/website/src/features/webhooks/site-key-ensure.ts
- apps/website/src/index.ts
- apps/website/src/platform/db/key-dependent-data.ts
- apps/website/src/platform/site-dir/__tests__/integration/duplicate-site.integration.test.ts
- apps/website/src/platform/site-dir/__tests__/integration/key-only-site-meta.integration.test.ts
- apps/website/src/server/inbound/__tests__/no-site-key-ensure-import.boundary.test.ts
- apps/website/src/server/runtime/composition/__tests__/site-key-recovery.unit.test.ts
- apps/website/src/server/runtime/composition/http-app/mount-admin-system.ts
- apps/website/src/server/runtime/composition/pending-agent-plugin-tokens.ts
- apps/website/src/server/runtime/composition/project-store.ts
- apps/website/src/server/runtime/composition/site-key-recovery.ts
- apps/website/src/server/runtime/composition/site-key-write-bindings.ts
- apps/website/src/server/runtime/composition/storage-secret.ts
- development/scripts/error-gate-debt.json

3. H host dependency type move

- apps/website/src/server/inbound/admin-http/routes/external-mcp/__tests__/oauth-error-mapping.test.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/deps.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts
- apps/website/src/server/runtime/composition/modules/external-mcp.ts

4. Handoff ledgers (COMMIT-PLAN.md stays uncommitted)

- COMMIT-PLAN.md
- plans/count-1125/y5-api-keeps.md

Final diff cleanup: corrected the serve test module stub to the new relative .ts URL (its helper resolves new URL(relative, import.meta.url)); no alias string is passed to that URL helper. git diff --check passes.
