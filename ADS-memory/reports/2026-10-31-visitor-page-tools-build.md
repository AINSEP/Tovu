Programmer(Execution): Programmer + TDD — shared implementation ownership, visitor isolation, and regression contracts.

Visitor page tools — build handoff, 2026-10-31

Implemented plan steps 1–6 in the working trees on `merge-1029`. No commits, pushes, tests, package rebuilds, installs, or server starts were performed. Tests were authored alongside the ordered steps; RED/GREEN results are deliberately unclaimed because the dispatch prohibited test execution.

Inputs and ownership

- Approved plan: `/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex-2026-10-31-nav2/out-plan/visitor-page-tools.md` (read in full).
- Active SPEC-046 v3 amendment: `ADS-memory/specs/046-site-assistant-page-actions/spec.md`; SHA-256 `1e879c625c3e35e1e0bbe3f3e7bf3fd5b9affcf4478959f77c180007c40a661c`.
- ADR-054: `ADS-memory/reports/architecture/ADR-054-public-visitor-assistant.md`.
- Bootstrap/personas: repository `AI-Dev-Shop/AGENTS.md`; canonical Programmer and TDD skills; Jini `AGENTS.md`; architecture chapters 13/14 and accumulated project memory in the canonical workspace where clone copies were unavailable.
- Codebase graph tools were unavailable. Direct source tracing followed the existing publication/member/routing owners, visitor executor, Jini frontend-control façade, shared page executor/driver, and both widget lifecycles.
- Reuse decision: Jini owns generic guest/session authentication, delegated frontend execution, page vocabulary, DOM filtering, and transport. Tovu owns public CMS eligibility, publication projection, grants, and the thin widget adapter. Existing `parse5`, HMAC/crypto, SSE decoder, anonymous publication reads, redirect resolver, confirmation gate, quota store, menu renderer, and page driver were reused. No new dependency or alternate execution owner.
- Jini's requested helper delegation was attempted; the host rejected spawning with `invalid thread-store request: no rollout found`. Work continued sequentially, with no helper output incorporated.

Step 1 — publication and approval contracts (Tovu)

Amended SPEC-046 and ADR-054 with four short v3 contracts: server publication plus live filtering; one scoped single-use approval; conservative grant/quota migration; terminal navigation. The amendment explicitly supersedes the earlier directive/proposal/queue execution design.

Evidence: SPEC-046:318; ADR-054:150.

Test added: `visitor-page-contract.unit.test.ts` — the spec contains the publication, approval, migration, and terminal-navigation contracts.

Step 2 — scoped visitor frontend binding (Jini, composed in Tovu)

Extended the existing private registry/façade with workspace/guest/tab ownership and request-lifetime binding. Added a generic signed HttpOnly guest cookie plus separately minted in-memory tab credential. Attach, bind, replies, and approval scope use the same owner; replies also require the current rotated binding token. Visitor endpoints use authenticated fetch streaming and claim only the explicit page capability set. Session capacity and TTL are bounded. Cancellation, reconnect, detach, and release use the existing registry lifecycle.

Tovu mounts a separate visitor façade at `/api/site-assistant/frontend-sessions`; it never reaches the admin daemon. The publication revision joins the document scope. Unbound/stale attachments retain ordinary content tools but receive no page registrations. All public session routes remain gated by enabled state and same-origin authorization.

Evidence: Jini `frontend-control.ts:108,149,212`; `frontend-guest-scope.ts:9`; Tovu `visitor-frontend-control.ts:8`.

Tests added:

- `frontend-visitor-scope.test.ts` — workspace/guest/tab token swaps fail; replies need matching owner and current token; replay/cancellation/detach/reconnect behave safely; bounded capacity is released.
- `frontend-guest-scope.test.ts` — independent guest/tab credentials, signature/origin checks, cross-guest rejection, expiry.
- `frontend-session-bridge.test.ts` — explicit claims, endpoint/header support, live rotated token, effect/persistence/acknowledgement ordering, replay suppression, error clears token; oversized output becomes valid refusal JSON and cannot trigger an accepted terminal effect.

Step 3 — shared DOM publication filter (Jini)

The existing DOM driver intersects every enumeration, lookup, state read, and action with an immutable publication and the live scoped DOM. Duplicate or replaced controls, changed targets/revisions, private/hidden/inert/personalized text, closed native UI, credential/payment fields, and stale controls fail closed. Field values cannot leak through ancestor text. Links require validated navigation. Reviewed menu/tab/accordion/carousel/media clicks remain automatic only when policy permits; published submitters additionally require an exact reviewed form target. Native submission can defer its effect until acknowledgement and terminal transcript persistence, then rechecks the same node/target. Existing admin callers omit publication and retain their contract.

Evidence: Jini `publication-filter.ts:6,24,31`; `dom-page-driver.ts:390`; `page-publication.ts:15`; `page-executor.ts` cancellation adapter.

Test added: `visitor-publication.test.ts` — unpublished/duplicate/private/hidden/credential exclusion; stale identity/action/revision refusal; link/changed-form refusal; cancellation between observation and effect; native submit acknowledgement before effect with a later target recheck; credential/payment form refusal and payment SELECT autocomplete protection.

Step 4 — public resolver, publication, registrations, migration (Tovu)

The existing public HTML response transform projects reviewed authored annotations into a bounded manifest, cached by workspace/path/revision. Explicit public theme scopes are required; unmarked themes publish zero DOM handles. Derived mobile identities obey the same collision refusal as authored entries. Navigation resolves public published page/entity IDs through the existing anonymous membership/publication owners and active-theme routing; reserved/encoded paths, arbitrary URLs/query state, and redirects are refused. Current page publication is rechecked immediately before delegation.

All seven `page.*` registrations use the existing visitor executor and Jini delegated handlers, preserving four-attempt budgets, IP/site limits, audit, cancellation, policy freshness, and output bounds. Legacy navigate/scroll/highlight settings migrate to dotted IDs. Explicit Off/Ask and both lower limits win mixed-version collisions; counter keys retain legacy identities, including already consumed allowances. New capability grants remain Off by the existing frozen-upgrade rule.

Evidence: `visitor-page-tools.ts:20,46,56`; `visitor-publication.ts:46,76`; `visitor-page-targets.ts:12`; policy and budget files in the inventory below.

Tests added:

- `visitor-page-resolver.unit.test.ts` — published public IDs only; encoded reserved routes, queries, unsupported entities, and unpublished targets refuse.
- `visitor-page-policy.unit.test.ts` — Off/Ask/limits migration and quota identity; only reviewed/public annotations; duplicate and derived/mobile collision refusal; stricter mixed-version settings; workspace isolation cannot revoke another site's valid snapshot.
- `visitor-tool-budgets.unit.test.ts` new case — a consumed legacy allowance remains consumed after renaming.
- Existing registry, visitor integration, management, and route suites were updated for the seven page capabilities and the removal of legacy callers. A scoped route fixture obtains real guest/tab credentials and attachment tokens.

Step 5 — one confirmation lifecycle and directive removal (Tovu + Jini chat)

Fill/select and published submission force the existing Jini confirmation gate even for an Auto grant; Ask uses that same gate. A challenge binds guest/tab/run/execution, immutable arguments, publication target/revision, and policy value-row revision; decline, expiry, cancellation, mutation, or replay cannot authorize an effect. The challenge channel is injected only for a verified visitor scope. Confirmation copy omits machine arguments and field values.

Both Tovu widgets use one thin host over the framework-free Jini bridge and shared page executor. Machine invocations never become transcript events or tool rows. Plain prose and human confirmation remain visible. Navigation and native submission require accepted frontend response plus terminal chat frame; final transcript is saved before the browser effect. Destination documents attach afresh, with no replay or automatic continuation.

Deleted the old producers/schemas/types, extraction/proposal execution, title matching/highlight implementation and CSS, shared page-action exports, and queued-action persistence/draining. Retained ordinary transcript storage and reused the human confirmation strip. The old React bridge path re-exports the moved implementation for existing admin imports. Retired rationale/comments were moved into each repository's `ADS-memory/.local-artifacts/visitor-page-tools/` instead of being lost.

Evidence: `visitor-confirmation-gate.ts`; `visitor-confirmations.ts`; Jini `tool-executor.ts` strengthened confirmation option; new shared bridge; Tovu `visitor-page-control.ts`, transport, both widget hosts, and terminal handling in `modules/site-assistant.ts`.

Tests added:

- `forced-confirmation.test.ts` — the host can require confirmation without weakening descriptor policy; denied approval prevents execution.
- `visitor-page-confirmation.unit.test.ts` — Auto fill/select/submit require confirmation while menus do not; decline/expiry/policy change/cancellation have no effect; guest/tab and immutable-input binding; one-time consumption; assistant approval cannot satisfy a prompt; missing human channel refuses.
- `visitor-page-path.unit.test.ts` — normalized same-site public paths only, rejecting encoded traversal, reserved/admin/API routes, offsite URLs and query/hash state.
- Existing widget/transcript/storage/transport tests retain ordinary behavior, ignore retired machine directives, and remove obsolete positive queue/action expectations.
- Package manifest fixture/contract test now requires the new browser bridge entry and absence of `./browser/page-actions`.

Step 6 — themes and browser contracts (Tovu)

Both themes now publish explicitly scoped public content, desktop and mobile menu controls, projected menu links/inert labels, dynamically created submenu controls, FAQ/details, and docs disclosures where present. Header menu rendering reuses Jini's existing dropdown lifecycle. Distinct server-projected mobile/submenu identities are applied by the existing theme script. Personalized member navigation, auth pages, and widget chrome are excluded. Added the approved theme-authoring guide sentence.

Tests added:

- `visitor-handles.unit.test.ts` — both themes' authored scope/action convention, independent mobile/submenu handles, FAQ publication, and zero DOM handles for an unmarked theme.
- `visitor-page-tools.journey.ts` — four combinations of both themes and both real built widgets; mobile menu/dynamic submenu, FAQ, hidden/private text, pending fill with no effect then approval, submission decline/approval, terminal native submit and navigation, transcript reload without replay, fresh document credentials, and absence of tool UI. The local HTTP fixture is test code only and was not started.
- Existing journey and bundle-mount source tests retain persistence/limits/no-replay checks and remove the retired action executor scenarios. Bundle smoke checks now assert that an old queued action has no effect.

Validation and release handoff

- NO tests ran. NO package artifacts or widget bundles were rebuilt. Packed-package consumer and browser checks remain for Coordinator. This is an implementation handoff, not a runtime verification claim.
- `tsc --noEmit` passed for changed Jini daemon/agentic source and chat using a temporary source alias configuration. The widget (including its tests) type-checks against Jini source. The newly added website suites type-check against source with ES2024 libs.
- Tovu's production source check reports only the untouched duplicate `AgentNavigationScreen` import at `apps/website/src/features/site-inspection/admin-screens.generated.ts:12,14`. Its working-tree diff is empty; left unchanged. A broader website test type-check also reports errors in unrelated existing test files (Ajv value imports, missing fixture ports, missing jsdom declarations, etc.); the temporary broad overlay additionally used ES2023 and therefore reported Promise.withResolvers lib mismatches. No clean full-tree test type-check is claimed.
- Changed production functions were checked with ESLint complexity maximum 10. The new browser fixture was split after lint found complexity 19; its final lint passes. Targeted new/changed test and transport files also pass that rule. Both repositories pass `git diff --check`.
- Existing coordinator changes under `features/sites`, the site restart route test and development restart test remain intact and are excluded from the implementation inventory below. No git state was mutated.

Deliberately not built

- No dependency, admin-daemon proxy, public admin registry, browser automation service, second page executor, whole-document browser scanning service, parallel directive executor, persisted action queue, cross-page agent continuation, or runtime-specific page adapter.
- No CLI execution for public visitors. Existing delegated tool adapters remain the single route for any separately authorized runtime; public mode restrictions stay in force.
- No new tab/carousel/media widgets were invented where the shipped themes have none; the shared action classes support reviewed controls if authored later.
- Forms containing guarded credential/payment/hidden fields and externally associated `form=` submitters are conservatively unavailable. No credential/payment workflow or new form backend was added.
- No package version/lockfile edits, build output, generated admin source repair, or unrelated coordinator fix.

Open questions: no unresolved product/ownership decision. Runtime conformance and packed-consumer verification are outstanding for Coordinator; failures there may require follow-up fixes.

Jini packages to rebuild/install in dependency order: `@jini-ai/agentic`, `@jini-ai/daemon`, `@jini-ai/chat`. Chat adds `@jini-ai/chat/browser/frontend-session-bridge` and removes `@jini-ai/chat/browser/page-actions`. Then rebuild both Tovu widget bundles and run the authored suites, browser matrix, bundle smoke checks, and packed-package consumer checks. `@jini-ai/core`, `@jini-ai/http-kit`, and `@jini-ai/cms` were reused without package changes.

Suggested next assignee: Coordinator for rebuilds, test execution, review, and integration. The source and tests are left uncommitted as requested.

Exact implementation file inventory by repository and plan step follows. Paths removed from the tree are marked DELETE. Supporting updates to an existing suite are grouped with its owning runtime step; new assertion coverage is described above.

Tovu — step 1

- `ADS-memory/reports/architecture/ADR-054-public-visitor-assistant.md`
- `ADS-memory/specs/046-site-assistant-page-actions/spec.md`
- `apps/website/src/assistant/site/__tests__/visitor-page-contract.unit.test.ts`

Tovu — step 4

- `apps/website/src/assistant/index.ts`
- `apps/website/src/assistant/site/__tests__/capability-registry.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-page-policy.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-page-resolver.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-tool-budgets.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-tools.integration.test.ts`
- `apps/website/src/assistant/site/capability-card.ts`
- `apps/website/src/assistant/site/capability-registry.ts`
- `apps/website/src/assistant/site/visitor-execution-ports.ts`
- `apps/website/src/assistant/site/visitor-executor.ts`
- `apps/website/src/assistant/site/visitor-frontend-control.ts`
- `apps/website/src/assistant/site/visitor-page-tools.ts`
- `apps/website/src/assistant/site/visitor-tool-budgets.ts`
- `apps/website/src/assistant/site/visitor-tool-presentation.ts`
- `apps/website/src/contracts/site-assistant/visitor-tools.ts`
- `apps/website/src/features/theme/visitor-publication.ts`
- `apps/website/src/server/__tests__/site-assistant-routes.test.ts`
- `apps/website/src/server/__tests__/visitor-assistant-safety.integration.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts`
- `apps/website/src/server/inbound/public-http/routes/site-assistant-confirm.ts`
- `apps/website/src/server/runtime/composition/__tests__/visitor-tools-management.unit.test.ts`
- `apps/website/src/server/runtime/composition/app.ts`
- `apps/website/src/server/runtime/composition/modules/site-assistant.ts`
- `apps/website/src/server/runtime/composition/public-site-guide.ts`
- `apps/website/src/server/runtime/composition/visitor-page-targets.ts`
- `apps/website/src/server/runtime/composition/visitor-tools-management.ts`

Tovu — step 5

- `apps/site-chat/scripts/check-bundle-mounts.mjs`
- `apps/site-chat/src/SiteAssistantWidget.tsx`
- DELETE `apps/site-chat/src/__tests__/SiteAssistantWidget.directives.test.ts`
- `apps/site-chat/src/__tests__/check-bundle-mounts.test.ts`
- DELETE `apps/site-chat/src/__tests__/client-directives.test.ts`
- `apps/site-chat/src/__tests__/entries.test.ts`
- DELETE `apps/site-chat/src/__tests__/highlight.test.ts`
- `apps/site-chat/src/__tests__/loader-host.test.ts`
- `apps/site-chat/src/__tests__/session-store.test.ts`
- `apps/site-chat/src/__tests__/site-assistant-transport.test.ts`
- `apps/site-chat/src/__tests__/site-chat-comparison.test.ts`
- DELETE `apps/site-chat/src/__tests__/site-page-actions.test.ts`
- `apps/site-chat/src/__tests__/vanilla-host.adapters.test.ts`
- `apps/site-chat/src/__tests__/vanilla-host.confirmation.test.ts`
- `apps/site-chat/src/__tests__/vanilla-host.test.ts`
- `apps/site-chat/src/__tests__/visitor-page-path.unit.test.ts`
- DELETE `apps/site-chat/src/client-directives.ts`
- DELETE `apps/site-chat/src/highlight.ts`
- `apps/site-chat/src/loader-host.ts`
- `apps/site-chat/src/main.tsx`
- DELETE `apps/site-chat/src/page-actions.css`
- `apps/site-chat/src/session-store.ts`
- `apps/site-chat/src/site-assistant-transport.ts`
- DELETE `apps/site-chat/src/site-page-actions.ts`
- `apps/site-chat/src/tool-confirmation.ts`
- `apps/site-chat/src/vanilla-entry.ts`
- `apps/site-chat/src/vanilla-host.ts`
- `apps/site-chat/src/vanilla-tool-confirmation.ts`
- `apps/site-chat/src/visitor-page-control.ts`
- `apps/site-chat/src/visitor-session.ts`
- `apps/site-chat/src/visitor-site-path.ts`
- `apps/site-chat/src/widget.css`
- DELETE `apps/website/src/assistant/site/__tests__/client-directives.test.ts`
- `apps/website/src/assistant/site/__tests__/tools.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-confirmation-gate.unit.test.ts`
- `apps/website/src/assistant/site/__tests__/visitor-page-confirmation.unit.test.ts`
- `apps/website/src/assistant/site/client-directives.ts`
- `apps/website/src/assistant/site/tools.ts`
- `apps/website/src/assistant/site/visitor-confirmation-gate.ts`
- `apps/website/src/assistant/site/visitor-confirmations.ts`

Tovu — step 6

- `apps/website/src/features/navigation/render-entry.ts`
- `apps/website/src/features/theme/__tests__/visitor-handles.unit.test.ts`
- `apps/website/src/features/theme/static-render.ts`
- `apps/website/src/features/theme/validation/webmcp-markup.ts`
- `content/themes/static/tovu-starter/css/theme.css`
- `content/themes/static/tovu-starter/render/pages/index.html`
- `content/themes/static/tovu-starter/render/pages/listing-default.html`
- `content/themes/static/tovu-starter/render/pages/pages-default.html`
- `content/themes/static/tovu-starter/render/pages/posts-default.html`
- `content/themes/static/tovu-starter/render/pages/posts-sidebar.html`
- `content/themes/static/tovu-starter/render/partials/nav.html`
- `content/themes/static/tovu-starter/scripts/main.js`
- `content/themes/static/tovu-theme/css/theme.css`
- `content/themes/static/tovu-theme/render/pages/about.html`
- `content/themes/static/tovu-theme/render/pages/changelog.html`
- `content/themes/static/tovu-theme/render/pages/docs.html`
- `content/themes/static/tovu-theme/render/pages/download.html`
- `content/themes/static/tovu-theme/render/pages/index.html`
- `content/themes/static/tovu-theme/render/pages/listing-default.html`
- `content/themes/static/tovu-theme/render/pages/pages-default.html`
- `content/themes/static/tovu-theme/render/pages/posts-default.html`
- `content/themes/static/tovu-theme/render/pages/posts-sidebar.html`
- `content/themes/static/tovu-theme/render/pages/pricing.html`
- `content/themes/static/tovu-theme/render/partials/nav.html`
- `content/themes/static/tovu-theme/scripts/main.js`
- `development/docs/themes/theme-authoring-guide-v2.md`
- `development/e2e/journeys/site-chat.pins.journey.ts`
- `development/e2e/journeys/visitor-page-tools.journey.ts`
- `development/e2e/site-assistant-fixtures.ts`

Jini — step 2

- `packages/daemon/src/__tests__/frontend-visitor-scope.test.ts`
- `packages/daemon/src/frontend-session-registry.ts`
- `packages/daemon/src/http/__tests__/frontend-guest-scope.test.ts`
- `packages/daemon/src/http/frontend-control.ts`
- `packages/daemon/src/http/frontend-guest-scope.ts`
- `packages/daemon/src/http/frontend-sessions.ts`
- `packages/daemon/src/http/index.ts`

Jini — step 3

- `packages/agentic/src/core/dom/__tests__/visitor-publication.test.ts`
- `packages/agentic/src/core/dom/dom-page-driver.ts`
- `packages/agentic/src/core/dom/publication-filter.ts`
- `packages/agentic/src/core/index.ts`
- `packages/agentic/src/core/page-executor.ts`
- `packages/agentic/src/core/page-publication.ts`

Jini — step 5

- `CAPABILITIES.md`
- `packages/chat/README.md`
- `packages/chat/package.json`
- `packages/chat/src/__tests__/dbpkg-chat-manifest.test.ts`
- `packages/chat/src/__tests__/fixtures/chat-subpaths.json`
- DELETE `packages/chat/src/core/browser/__tests__/page-actions.guards.test.ts`
- DELETE `packages/chat/src/core/browser/page-actions.ts`
- DELETE `packages/chat/src/embed-widget/browser/__tests__/directives.test.ts`
- `packages/chat/src/embed-widget/browser/__tests__/frontend-session-bridge.test.ts`
- DELETE `packages/chat/src/embed-widget/browser/__tests__/page-actions.test.ts`
- `packages/chat/src/embed-widget/browser/__tests__/session-store.test.ts`
- `packages/chat/src/embed-widget/browser/frontend-session-bridge.ts`
- DELETE `packages/chat/src/embed-widget/browser/page-actions.ts`
- `packages/chat/src/embed-widget/browser/session-store.ts`
- `packages/chat/src/embed-widget/react/__tests__/embed.test.tsx`
- `packages/chat/src/embed-widget/react/embed.tsx`
- `packages/chat/src/embed-widget/vanilla/__tests__/state.edges.test.ts`
- `packages/chat/src/embed-widget/vanilla/__tests__/state.test.ts`
- `packages/chat/src/embed-widget/vanilla/__tests__/widget.test.ts`
- `packages/chat/src/embed-widget/vanilla/index.ts`
- `packages/chat/src/embed-widget/vanilla/state.ts`
- `packages/chat/src/embed-widget/vanilla/style.css`
- `packages/chat/src/react/agent-bridge/frontend-session-bridge.ts`
- `packages/daemon/src/__tests__/forced-confirmation.test.ts`
- `packages/daemon/src/tool-executor.ts`
