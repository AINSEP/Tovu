Programmer(Execution): Programmer + Security personas loaded — implement the review fixes and check guest/tab, origin, quota and confirmation boundaries.

Round 1 patches are uncommitted in both `merge-1029` worktrees. Runtime verification remains with Coordinator. No tests, builds, servers, installs, commits or pushes were run. The committed desktop-switch fix and every `local-site-process.ts` were left untouched.

Inputs: the full `REVIEW-visitor.md`, `out-visitor/visitor-page-tools-build.md`, the existing local build handoff, SPEC-046/ADR-054, the governing bootstrap/personas, architecture chapters 13/14, project memory and Jini's capability/extraction guidance. The clones lack the referenced architecture chapters/project-memory file; their canonical Tovu copies were consulted. Graph MCP tools and CLI are unavailable in these clones; discovery used the cited current source and focused `rg` fallback.

Paths below are repo-relative. **T** = prov2-tovu; **J** = prov2-jini.

| Requested item | Patch and files |
| --- | --- |
| 1. Guest/tab credential crossover | **J** `packages/daemon/src/http/frontend-guest-scope.ts`: signed `kind: guest` / `kind: tab`; cookie readers require guest kind, owner resolution requires tab kind. `http/__tests__/frontend-guest-scope.test.ts` covers both cross-presentations and a tab token failing to preserve a guest identity during minting. |
| 2. Anonymous budgets, session fairness, origin | **T** `apps/website/src/assistant/site/visitor-frontend-control.ts`: existing `createRateLimiter`/trusted `resolveClientIp`, shared 30/minute limits per IP and authenticated guest on credentials/stream; real Origin or Referer origin checked against request scheme/Host or canonical origin. Fetch metadata supplies no authorization shortcut. **J** `frontend-session-registry.ts`: host-supplied quota keys, max three sessions per guest/IP, existing 256-session overall bound; detach releases capacity. `http/frontend-control.ts` forwards options; `http/frontend-sessions.ts` reserves before SSE headers and returns quiet HTTP 429 for capacity. Setup failure detaches its reservation. **T** composition passes the clock; confirmation route also rejects forged same-origin metadata. |
| 3. Dotted catalog identities; preserve grants | **T** `apps/website/src/features/settings/visitor-tools-service.ts`: accepts dots using the same character class as the policy parser. Existing conservative migration and quota identities are retained. Existing three management tests and Off/Ask migration tests are left intact. |
| 4. Ask without frontend owner/publication | **T** `apps/website/src/server/runtime/composition/modules/site-assistant.ts`: always supplies the existing human confirmation channel; gate/store retain the IP/run binding and add an authenticated owner when present. `server/__tests__/site-assistant-routes.test.ts`: both Allow/Decline cases now exercise both scoped and unscoped visitors. Abort hooks are registered before server teardown so held frontend SSE cannot deadlock cleanup. |
| 5. Duplicate publication reads | **T** `server/runtime/composition/visitor-page-targets.ts`: one authoritative published-post list is supplied to the existing anonymous-membership filter and reused for occupied slugs. `server/inbound/public-http/middleware/published-webmcp.ts`: defer target lookup until successful rendered HTML contains the widget, skip exports. `composition/app.ts`: skip publication lookup when assistant/rollback switch is off. Navigation still rechecks current publication state; no stale cross-request content cache was added. |
| 6. Concurrent document publication | **T** `features/theme/visitor-publication.ts`: each document gets an independent revision; remove path supersession. Bounded snapshots retain TTL/workspace checks. Concurrent variants at the same path no longer invalidate each other. The JSON script now appears before `</body>`. |
| 7. Revert theme UI changes | **T** both `content/themes/static/{tovu-starter,tovu-theme}/render/partials/nav.html` restore `variant: tree`; remove the added Jini-menu CSS block from both `css/theme.css` (these CSS files now match HEAD). Keep the publication annotations and existing mobile-menu behavior. |
| 8. Human labels; external WebMCP boundary | **T** Tovu Theme `nav.html`: Home/Pricing/Docs/Blog/etc. replace file-name descriptions. **J** `packages/agentic/src/core/annotated-actions-script.ts`: read/menu/accordion visitor marks never register as external tools, including after attribute changes. Existing site WebMCP setting remains the script-delivery gate; visitor publication can work independently when external tools are disabled. **T** `features/webmcp/generated/{annotated-actions-script.ts,provenance.json}` refreshed together from canonical Jini source, including its already-existing late-form opt-out support. |
| 9. Restore rationale beside code | **T** restore SYSTEM_PREAMBLE rationale and the warning to keep model instructions in runtime strings in `composition/modules/site-assistant.ts`; preserve anonymous publication/trash/prompt-injection rationale at its current owner `assistant/site/visitor-page-tools.ts`; preserve synchronous persistence/reload-loop rationale at `site-chat/src/visitor-page-control.ts`; clarify separate human/model channels in `assistant/site/capability-registry.ts` and `assistant/index.ts`; correct the visitor-credentials comment in transport. No live-code rationale is stored only in ignored artifacts. |

The named failing tests were addressed as follows. These are authored assertions, **not execution results**.

| Failure | Files and assertion |
| --- | --- |
| Agentic region containing password | **J** `packages/agentic/src/core/dom/publication-filter.ts`: only an actual field gets the field-refusal check. `publishedText` still strips nested fields. Existing `dom/__tests__/visitor-publication.test.ts` retains the panel/public-text assertions and secret-field refusal. |
| Cancellation during observation | **J** `dom/__tests__/visitor-publication.test.ts`: abort in `describeState`, the observation actually preceding click. Assert the observation ran, signal aborted and click/effect did not run. A preceding uncancelled call proves the same target can produce the effect. |
| CSS loader hook | **T** `apps/site-chat/src/__tests__/entries.test.ts`: supply source bytes for CommonJS file URLs before delegation; Node validates each nested `nextLoad` result before returning it. CSS remains an empty module. |
| Loader queued expectations | **T** `apps/site-chat/src/{loader-host.ts,__tests__/loader-host.test.ts}`: remove dead preload plumbing and stale queue expectations; assert widget precedence, restored/explicit open intent, absence of preload and actual asset selection. |
| Effective site-guide tool names | **T** `assistant/site/__tests__/visitor-tools.integration.test.ts`: assert exactly `search_published_entries`, `get_published_entry`, `site_guide` when categories are Off and no page publication exists. |
| Invalid/trashed navigation | **T** `server/__tests__/site-assistant-routes.test.ts`: real scoped `page.navigate` calls with trashed, draft and absent IDs. Assert capability offered, three model-facing errors, continued stream, no client directive or target leakage. |
| Cwd-dependent reads | **T** `assistant/site/__tests__/visitor-page-contract.unit.test.ts`, `features/theme/__tests__/visitor-handles.unit.test.ts`: URLs relative to `import.meta.url`; resolved targets were checked to exist. Theme assertions additionally retain tree rendering and reject the introduced CSS behavior. |

Additional review items addressed:

- **J** `packages/chat/src/embed-widget/browser/frontend-session-bridge.ts` imports the canonical `ChatPaneAgent*` types from `react/features/chat-pane/types.ts`; removes duplicates. Fetch reconnect uses exponential backoff capped at 30 seconds, resets after a delivered frame and stops on 429/401/403/404. `browser/__tests__/frontend-session-bridge.test.ts` adds backoff/429 assertions.
- **T** `apps/site-chat/src/visitor-page-control.ts` now owns its headers per instance. `tool-confirmation.ts`, `SiteAssistantWidget.tsx` and `vanilla-host.ts` inject that instance's live headers into human replies; remove the new module-global `visitor-session.ts`. `__tests__/tool-confirmation.test.ts` asserts independent and rotated headers.
- **J** `packages/chat/dbpkg-chat/host-callers.json` removes the deleted `page-actions` callers. **T** assistant export/transport comments no longer describe removed page-action types or claim requests carry no credentials.
- SPEC-046 approval/status wording was not changed in this round; Coordinator remains responsible for confirming the earlier wording.

Focused additional regression sources:

- **T** `assistant/site/__tests__/visitor-frontend-control.unit.test.ts`: Origin/Host vs forged hint; missing origin evidence; fresh-cookie IP-cap bypass; guest cap across IPs; independent clients; both endpoint rate limits; credential minting guest budget across IPs. SSE cleanup precedes server close.
- **J** `daemon/src/__tests__/frontend-visitor-scope.test.ts`: guest/IP caps, independent scopes, released capacity and stale detach; `http/__tests__/frontend-sessions.test.ts`: capacity returns HTTP 429 before SSE, with no internal-error report.
- **T** `assistant/site/__tests__/visitor-page-policy.unit.test.ts`: concurrent same-path documents remain independently readable and manifest script stays inside body.
- **T** `server/runtime/composition/__tests__/visitor-page-targets.unit.test.ts`: one post-repository list, public inclusion and member exclusion; middleware `__tests__/published-webmcp.test.ts`: lazy once-per-eligible-response lookup, export skip and independent external-tool opt-out.
- **J** `agentic/src/core/dom/__tests__/annotated-actions.test.ts`: visitor-only marks do not register externally while an ordinary annotated action still does.

Reuse decisions:

- Credentials/admission: inspected guest-scope, frontend-control, HTTP routes and registry lifecycle in Jini plus Tovu's rate-limit contract/public origin helpers. Extend those owners; no Tovu session counter/lifecycle or new rate-limit implementation.
- Publication/visibility: inspected public-content, post/members owners, theme target composition and DOM filter. Inject the existing authoritative list into the existing filter; preserve fresh server-side checks instead of adding a second visibility rule or an invalidation-free cache.
- Confirmation: inspected gate, exchanges, frontend bindings and both widget hosts. Reuse the existing challenge channel/store; inject live credentials per instance. No second executor, approval path or persisted action queue.
- External tools: change canonical Jini annotation behavior and refresh its captured Tovu source/hash together. Retain the existing site setting and native controls.

Static validation only:

- TypeScript parser: 37 focused source/test files, zero syntax errors. This does not establish type compatibility or runtime behavior.
- Installed ESLint core `complexity` rule at maximum 10: no violations in 13 focused production files covering guest scope, session registry/HTTP/control, DOM publication filter, stream reconnect, Tovu frontend control/publication/target lookup/middleware, widget page control/confirmation and loader. Two initial 11s in stream admission/error handling were reduced by extracting the registry reservation and response-error helpers. Existing large composition/widget functions outside that focused measurement are not claimed to satisfy a whole-repo ceiling.
- `git diff --check`: clean in both repos. Both branches remain `merge-1029`.
- Canonical Jini annotation source equals the Tovu captured snapshot byte-for-byte after its provenance header; SHA-256 matches. Both cwd-independent filesystem targets and canonical shared type path exist.
- Raw static result: `/private/tmp/visitor-round1-static.json`.

Architecture/source review: existing Jini registry, executor and DOM owners remain authoritative; Tovu retains CMS policy/composition. Generic capacity/reconnect/credential fixes live in Jini. No provider dependencies, schema migration, persisted approval format or new platform module was added. Security behavior and regression results require Coordinator execution before release; static source review is not runtime approval.

Function-quality review: admission/credentials, document revisions, visibility filtering, confirmation wiring, target lookup and reconnect helpers have no remaining locally observed required finding after the listed fixes. Skepticism checks covered misleading variable names, shared ownership, simultaneous admission, stale detach, error logging, expiry, duplicate reads and module-global credential state. Quota keys are host-supplied; admission is synchronous with registry attach; release uses the existing detach path. Published-target reads intentionally remain fresh per operation. Remaining risk is unexecuted integration/packed-consumer/browser validation.

Self-validation status: **PARTIAL — execution explicitly delegated to Coordinator**. No test-pass count, coverage claim, build result or browser result is asserted. Preserve existing Off/Ask migration tests and run all named failing suites after rebuilding shared packages, then both widget bundles and the four theme/widget journeys. Suggested next assignee: Coordinator/TestRunner.

Jini packages to rebuild: **`@jini-ai/agentic`, `@jini-ai/daemon`, `@jini-ai/chat`**. No changes to `@jini-ai/http-kit`.
