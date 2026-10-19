Programmer(Direct) + Software Architect: both canonical personas loaded; chosen for TypeScript implementation and the explicitly assigned Jini/Tovu ownership contracts.

Inputs: PEER_DISPATCH; TRIAGE.md rows s4-07, s4-08, s1-35, s1-45, s4-57, s4-59; matching original todo text; architecture chapters 13/14; ADR-027 §§5–6; governance ADR index and GOV-ADR-001; Jini START-HERE/extraction-plan and capability catalog; the repository-owned round-1 media/platform handoffs. Todo line numbers are dispatch identifiers: the current todo text has moved. development/todos.md was read and not edited.

DONE below means implemented in source with tests written. No tests, typechecks, builds, browser sessions, benchmarks or runtime checks were run. No runtime or deployment success is claimed.

ITEM 1270 (where-used protection): DONE

- Jini media/ports.ts adds required MediaReferenceCheckPort; media-service.ts's purgeMedia awaits it after the Trash prerequisite and before rendition removal, asset removal or blob tombstoning. References raise the existing MediaStillReferencedError. Missing/throwing checkers cannot permit removal.
- Tovu media/purge-media.ts supplies the existing findMediaWhereUsed implementation. Its key set now includes canonical id, current slug AND retired slugs from the existing listRetiredSlugs repository contract. Current post bodies supplement entry_refs because ordinary post saves do not maintain that index. Workspace predicates are retained.
- All three existing deletion callers use that adapter: media/delete.ts, the confirmed assistant effect in permanent-delete-deps.ts, and the production Trash adapter's purgeAsset in composition/deps.ts. media.delete.force retains its permission meaning and does not bypass references. Existing confirmation and blob-GC lifecycles remain the owners.
- Tests written: Jini active/unreferenced cases retained, referenced trashed rows preserve media/renditions/blob state, lookup/absent-checker refusal; Tovu retired-slug/current-body protection and successful removal after reference removal; HTTP 409/reference disclosure and opaque lookup failure; assistant rechecks references after confirmation and leaves zero deletion effects on refusal. Existing workspace-isolation tests remain.
- This is a current-reference check before deletion. It does not introduce a cross-store transaction that locks concurrent content writes, nor complete the separately triaged GC snapshot/scheduler work.

ITEM 1270 (shared media ingress): NOT DONE (the full invariant exceeds ~M; Coordinator must split the dependent slices).

- ADR-027-media-assets-subsystem.md:144 requires ONE MediaIngressPolicy across every byte entry point, including lazy-transform input. The existing Jini upload service checks declared MIME and byte length. Tovu upload-content-type.ts sniffs bytes; media/import/fetch-image.ts owns fetched-byte validation; the guarded HTTP client already owns peer pinning, redirects and network resource caps. These are owners to extend, not replace with a second Tovu validator.
- Replacement (routes/media/replace.ts:36) stages bytes and atomically switches the existing source; generation and lazy transforms also need the shared pre-decode bound. Publish import explicitly bypasses uploadMedia to preserve source asset IDs (features/media/import-media-entity.ts:15–31). Routing it through uploadMedia would break post references.
- Jini image-transformer.sharp.ts:135 documents Sharp's existing aggregate input-pixel bound; it does not establish a common pre-persistence ingress contract. Completing that contract, the inspection seam, and every dependent byte path is a coordinated migration larger than the permitted M-sized item. No partial validator or dependency was added.
- Coordinator next: land the common Jini byte policy and injected Sharp metadata inspection first; then wire upload/import/replacement/publish import/generation/lazy transforms while preserving their different identity contracts. Required cases include forged MIME, malformed images, byte bounds, excessive dimensions and aggregate animation frames, and zero writes on refusal.

ITEM 87: NOT DONE (fresh-page implementation delivered; signed-in/open-tab integration still needs an owner decision).

- Jini web-evidence now accepts explicit collectPerformance=true and returns numeric PagePerformanceEvidence. The existing Playwright adapter, origin/egress checks, time budget and context teardown are reused; there is no second browser lifecycle or automatic capture.
- Reports approximate Chromium heap counters or null, attached light-DOM nodes capped at 100,000 with truncation, hidden/collapsed panels, hidden pre element/text-character totals, iframe count, and up to 200 buffered long tasks plus a 100ms sample. Unsupported long-task APIs are explicit. Numeric facts produce short suspect descriptions; hidden text, heap objects and iframe documents are not returned.
- Tovu adds the boolean argument to site_collect_page_evidence and forwards it through its disclosure/redaction adapter. Ordinary calls leave the option absent. Tests written cover script counts/privacy/caps/unsupported APIs/observer release, Playwright opt-in and teardown, argument validation, forwarding and host disclosure.
- The browser owner intentionally creates a fresh anonymous context and discards credentials/storageState (Jini render-page.ts:138–144). The canonical public origin also need not be the local admin origin. This cannot inspect the operator's existing signed-in admin tab or restored chat; /admin may show sign-in. Tool description, result.context and diagnostics documentation say so.
- Coordinator next: choose the host seam for an explicitly selected authenticated tab (existing DevTools preset/host browser connection, with permission and tab identity). Do not silently copy an admin session into the anonymous web-evidence collector. The existing DevTools recipe remains available for the actual tab.

ITEM 112: DONE

- Jini devops/deploy/reachability.ts retains the first protected result, continues trying candidates within the same deadline, prefers any ready result, and returns protected after the sweep when none is ready. Existing deadline/guard/transport owners are retained.
- Paired protected→200 and protected→503 tests assert the later candidate was actually visited and assert the winning URL/status/message. Existing single-candidate behavior is retained; its test name was corrected.

ITEM 1502: DONE

- Jini core/feature-flags.ts supplies a small pure boolean evaluator. Precedence is environment → runtime → persisted workspace → declared default (off unless the host explicitly declares otherwise). Only 'true'/'1' enable the environment layer; explicitly malformed layers disable instead of falling through. Results include the winning source. No percentages, provider SDK or second storage system.
- Tovu settings/feature-flags.ts exports ensureFeatureFlag and readFeatureFlag through the settings barrel. Definitions use core.feature-flags, boolean schema and workspace scope. Existing ensureSettingDefinitions/getEffective/set remain the registration, storage, authorization, auditing and effective-value owners. Environment is injected, workspace values are read at call time, and environment/runtime overrides avoid storage I/O. Flags do not grant permissions.
- A host declares {key, environmentKey, defaultEnabled?}, calls ensureFeatureFlag during its normal settings registration, and reads with {settingsRepo, workspaceId, flag, env} plus optional {runtime}. Existing settings endpoints/tools can write the registered workspace boolean. This adds the requested facility; it does not invent an unrelated product feature to gate.
- Tests written cover defaults, explicit false, precedence, malformed input, workspace isolation, ledger revisions, current reads after changes, registration preserving stored values, kill switches during storage failure and propagated storage errors without enabling.

ITEM 1514: DONE (the explicitly requested one-family pilot; wider migration remains).

- Jini protocol/errors.ts exports decodeApiError for legacy string errors and canonical nested envelopes, preserving code/message/details/retryable/requestId without coercing malformed objects to '[object Object]'. The admin's shared api.ts transport calls it for errors and session invalidation, preserving the original body and existing proxy/reconnect behavior. 401 + UNAUTHENTICATED invalidates sessions; vendor UNAUTHORIZED does not.
- Tovu error-mapping/respond.ts calls Jini createApiError/sendApiError/statusForError and reuses res.locals.requestId. The single analytics recent-hits route migrates its 404/403/500 envelopes while retaining success, workspace-before-authorize ordering, permissions, refusal reason and reviewed permission details. Raw exceptions remain opaque.
- Tests written/updated for decoder compatibility and malformed input, admin transport compatibility and session behavior, route status/authorization/success/opacity, async authorization failures, and canonical serializer→decoder correlation. INFO.md records the pilot and remaining inventory.
- Remaining admin families: agent-plugins, api-keys, assistant, change-sets, comments, commerce, content, content-types, database, database-recovery, deployments, entries, external-mcp, forms, fs-files, integrations, media, members, menus, newsletter, pages, plugins, posts, presentation, publish-content, recovery, redirects, seo, settings, site, sites, skills, system, taxonomy, themes, trash, users, widgets, workspace. Remaining public families: content, external-mcp, members, oauth, ops, publish-trust, site. Also shared auth/authorization, serving/recovery gates, body-parser errors, fallback 404/500 and plugin routes. Protocol-owned OAuth/MCP and streamed/SSE formats require their own contract review; this inventory does not claim every surface uses a legacy JSON envelope.

Reuse/discovery: queried available local codebase-memory indexes for Jini/Tovu and inspected the Jini Graphify/understand summaries; confirmed important paths against current files. MCP graph tools were not exposed in this host, so the bundled local CLI was used. The requested Tovu absolute-path index was absent; its Tovu project key resolved. Graph results included stale pre-migration paths, so current source and literal rg searches were the final evidence. No index installation, update or network command was used. Round-1 notes outside the two allowed repositories were not read; repository-owned handoffs supplied the relevant context.

Architecture: the dispatch supplies the bounded requirements and explicitly assigns generic owners to Jini. New public functions follow the two-object boundary convention; dependencies stay injected and logic stays in .ts services. GOV-ADR-001's confirmation owner is retained; no new mutation gateway, table, dependency or provider coupling was introduced. The boot settings helper is called through its existing owner. Existing why comments were preserved or updated when the disclosed limitation changed. No new generic implementation was left in Tovu; ingress was deferred rather than duplicated.

Verification: scoped diffs were reviewed and whitespace checked. A trailing blank line and the existing evidence-schema key assertion were corrected during that review. No tests/typechecks/builds/runtime checks were executed, so behavioral verification and coverage remain INCONCLUSIVE. Current branches were left untouched. No commits/pushes, gh/flyctl, dev servers or benchmarks. Existing unrelated edits, including the unrelated composition/deps.ts comment, were preserved. Protected paths and development/todos.md were not edited.

CHANGED FILES:

Tovu:

- `apps/admin/src/lib/api.ts`
- `apps/admin/src/lib/__tests__/api-request-onok-and-null-body.unit.test.ts`
- `apps/website/src/features/media/index.ts`
- `apps/website/src/features/media/purge-media.ts`
- `apps/website/src/features/media/where-used.ts`
- `apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts`
- `apps/website/src/features/permanent-delete/__tests__/deps.test.ts`
- `apps/website/src/features/settings/index.ts`
- `apps/website/src/features/settings/feature-flags.ts`
- `apps/website/src/features/settings/__tests__/feature-flags.unit.test.ts`
- `apps/website/src/features/site-evidence/agent-tools.ts`
- `apps/website/src/features/site-evidence/collect-page-evidence.ts`
- `apps/website/src/features/site-evidence/tool-registrations.ts`
- `apps/website/src/features/site-evidence/__tests__/unit/collect-page-evidence.unit.test.ts`
- `apps/website/src/features/site-evidence/__tests__/unit/tool-registrations.unit.test.ts`
- `apps/website/src/server/error-mapping/INFO.md`
- `apps/website/src/server/error-mapping/respond.ts`
- `apps/website/src/server/error-mapping/__tests__/respond.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts`
- `apps/website/src/server/inbound/admin-http/routes/media/delete.ts`
- `apps/website/src/server/runtime/composition/deps.ts`
- `apps/website/src/server/runtime/composition/permanent-delete-deps.ts`
- `apps/website/src/server/__tests__/admin-media-routes.test.ts`
- `apps/website/src/server/__tests__/route-async-guards.test.ts`
- `apps/website/src/server/__tests__/routes/analytics-recent-hits.test.ts`

Jini (/Users/la/Programming/Jini):

- `packages/cms/src/media/media-service.ts`
- `packages/cms/src/media/ports.ts`
- `packages/cms/src/media/index.ts`
- `packages/cms/src/media/__tests__/media-service.test.ts`
- `packages/core/src/feature-flags.ts`
- `packages/core/src/index.ts`
- `packages/core/src/__tests__/feature-flags.test.ts`
- `packages/devops/src/deploy/reachability.ts`
- `packages/devops/src/deploy/__tests__/reachability-ports.test.ts`
- `packages/devops/src/deploy/__tests__/reachability.test.ts`
- `packages/diagnostics/src/web-evidence/page-performance-script.ts`
- `packages/diagnostics/src/web-evidence/browser-port.ts`
- `packages/diagnostics/src/web-evidence/collect-page-evidence.ts`
- `packages/diagnostics/src/web-evidence/index.ts`
- `packages/diagnostics/src/web-evidence/playwright-browser.ts`
- `packages/diagnostics/src/__tests__/page-performance.test.ts`
- `packages/diagnostics/src/__tests__/web-evidence-playwright.test.ts`
- `packages/diagnostics/docs/ui-performance-check.md`
- `packages/protocol/src/errors.ts`
- `packages/protocol/src/__tests__/errors.test.ts`

- This handoff report.

NOT DONE:

- Shared ingress (1270): full cross-entry-point migration exceeds ~M; dependent owner slices are listed above.
- Authenticated/open-tab diagnostics (87): fresh-page evidence is implemented; actual signed-in tab access remains an explicit host integration decision.
- All tests, typechecks, builds and runtime verification remain unrun by instruction. Jini package build/publication and Tovu artifact adoption are still required before new package exports can run against registry/dist artifacts; manifests, lockfiles and dist were not changed here.
- Wider API-family migration remains intentionally outside the requested pilot.

Suggested next assignee: Coordinator for ingress slicing and authenticated-tab ownership; an authorized TestRunner for the named suites and package compatibility; the normal Jini release/adoption owner for publishing the source changes. Do not mark the two NOT DONE triage rows complete from this partial handoff.
