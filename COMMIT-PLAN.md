# w3b-ext-crp round 2 — Tovu

Working tree only; `.git` remains read-only. No tests, builds, installs, typechecks, or linters will run. Witnesses precede their implementation; mutations are recorded for Opus, not executed.

## Prerequisites / stopped sheets

- CRP-13.T STOP: Jini `readVisitorConsent` spreads `facts({})` in the banner-off branch. Its facts DTO requires `cookieHeader`, whereas the original banner-off branch calls only `requestPrivacy` and never reads the cookie. The mandated same-branch/deferred-read order cannot be retained with the built port without changing upstream or adding a workaround. No consent source or test changed.
- CRP-15.T LEFT: Jini report stops 15.J because the required CRP-11 `featuredImageView` projection is absent.
- CRP-16.T LEFT: 16.J not built (depends on 15).
- CRP-18.T LEFT: 18.J not built (depends on 15/16).
- CRP-19.T LEFT: 19.J not built (depends on 18).
- CRP-20.T LEFT: 20.J not built (depends on 19).
- CRP-24.T LEFT: 24.J partial; raw HTTP specs not built because the required helpers introduce Node dependencies into the universal leaf.

- CRP-21.T LEFT: depends on unbuilt CRP-19.T's virtual-page sender. Both halves are one sheet; no partial storefront binding.
- CRP-22.T STOP: the built `completeMemberOidcCallback` destructures scalar `userAgent`/`ip` at entry. Original Tovu reads them only after the callback cookie, query parser and awaited `completeOidcLogin`. The verify leg has the same issue before `openLoginEmailContinuation`. Preserving the explicit deferred-header-read order needs an upstream port change. Removed the provisional witness and binding edits on this sheet; files restored byte-for-byte to HEAD. Named witness/mutation remain pending: `a lost session during unlink produces no replacement cookie and a wrong proof keeps the retry cookie` / `emit-session-cookie-before-transaction-result`.
- CRP-25.T STOP: Jini `admitPurchase` requires `checkLimit` to return `{ allowed: boolean; retryAfterSeconds: number }`; existing core `RateLimitResult` returns `{ allowed: true }` with no retry field. Binding the existing limiter needs an unlisted default/cast or upstream contract correction. No commerce source/test changed; witness/mutation pending: `invalid pay stays a body refusal while a valid blocked buy never activates` / `check-buyer-before-order-dto`.

## Completed design commits (sheet order)

### CRP-14.T — Bind the doc/widget hosts and authored byline
- Changed `apps/website/src/server/inbound/public-http/http/site/render/{content-html,page-body}.ts` and `http/site/__tests__/render-html-embed-attributes.test.ts`.
- Witness first: `a media marker changes only its own occurrence through the bound renderer`; mutation `mutate-shared-widget-ir` mutates the resolved IR props during occurrence rendering, violating the shared-object assertion.
- Bound the per-render marker function, Tovu hosts, taxonomy attributes and byline. Existing caller shapes retained.
- Deleted duplicate dispatch and marker helpers only; their existing why-comments are in the Jini implementations. No unrelated cleanup.


### CRP-17.T — Bind request cookies, CSP, HTML hooks and wire ordering
- Changed `apps/website/src/server/inbound/public-http/routes/site/pages/response.ts`, `pages/__tests__/pre-consent-vary.route.test.ts`, and `site/__tests__/pages.response-matrix.characterization.test.ts`.
- Witnesses first: `a later JSON listing type does not erase the cache decision or an existing Vary value` (mutation `overwrite-vary-on-consent` replaces Vary, losing Accept-Encoding); `static export skips form-token registration and member script` (mutation: remove the static-export short circuit).
- Deleted duplicated visitor/cache/finalization decisions. Bound request cookies, host config ID, report-only CSP, plugin/form/member hooks and token registration. HTML headers still precede finalization and JSON overrides through req.res.

### CRP-23.T — Retain the live Express router and auth middleware
- Changed `apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts` and `routes/__tests__/integration/plugin-contributions.auth.integration.test.ts`.
- Witness first: `disabled and retired routes refuse before parser work or after a pending handler respectively`; mutation `parse-plugin-body-before-activation` changes the malformed disabled request from 404 to 400; retiring the snapshot while awaited must suppress the result.
- Deleted duplicate activation/generation/principal/result decisions. Kept the per-request router, pre-body durable gate, existing auth, parsers, reporter and error middleware. No new files.

### CRP-26.T — Keep independent limiter, browser and error boundaries
- Changed `apps/website/src/server/inbound/admin-http/routes/external-mcp/{oauth,probe}.ts` and `__tests__/external-mcp-route-failures.unit.test.ts`.
- Witness first: `browser limit and session gates precede workspace while shared list has no limiter and authorizes first`; mutation `apply-one-gate-order-to-all-oauth-routes` moves a shared early gate/limiter onto all routes and violates the call order/status assertions.
- Kept dedicated limiter wrappers outside the mounts, browser headers/session first, shared GET unlimited, request-scoped throwing session ports after direct integration grant, callback/cookie entropy and host error classification. Removed local transport parsing and provider projection now owned by Jini.

### CRP-27.T — Bind local install and deferred ZIP parsing
- Changed `apps/website/src/server/inbound/admin-http/routes/plugins/install.ts` and `plugins/__tests__/unit/install-route.unit.test.ts`.
- Witness first: `unauthorized and digest-invalid ZIP requests never consume the archive stream`; mutation `mount-zip-parser-before-auth` turns the early 403/400 into an oversized-stream 413/wait.
- Deleted duplicate options/digest/folder parsing and error status table. Kept lazy application/zip raw parsing with the exact cap/inflate policy; added only the sheet-required Buffer boundary check. Four registrations, local installer, apply telemetry and typed/redacted failure writer remain bound.

### CRP-28.T — Bind live-site refusal, actor, peer secrets and failure shape
- Changed `apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts` and `__tests__/peer-transport.routes.pins.test.ts`.
- Witness first: `live restriction wins over workspace mismatch and credential opening follows all push admission`; mutation `workspace-before-live-refusal` changes the foreign-workspace live response to 404.
- Deleted duplicate push parsers/decisions/guards; mounted plan, confirm, execute in original order. Live-site preflight precedes workspace/grant, session overwrite is request-bound, credential opening stays lazy, and real transport wrappers/error copy remain host-owned.

### CRP-29.T — Preserve early SSE head, admission and host preview channel
- Changed `apps/website/src/server/inbound/admin-http/routes/settings/events.ts` and `settings/__tests__/events-head-rejection.unit.test.ts`.
- Witness first: `the HTTP head precedes a rejected ledger read and no timer is left behind`; mutation `read-head-before-write-head` makes headersAtRead false.
- Deleted duplicate cursor/timer/poll/reauthorization decisions. Kept admission, HTTP/2 headers, per-request timer defaults, per-connection namespace cache, lazy preview construction immediately before the first timer (after the successful head read), both close listeners and phase-specific reporting.

### CRP-30.T — Bind the shared publish slot and request-scoped peer grant
- Changed `apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts`, `system/__tests__/publish-site.tw4.pins.test.ts`, and `server/__tests__/routes/publish-site-route.test.ts`.
- Witnesses first: `auth denial writes once and records one blocked event, and a granted destination read still omits peers without peer capability` / mutation `use-system-read-to-list-peers`; `chosen credential reaches the start unchanged and busy or consent refusal starts nothing` / mutation removes selected credential forwarding or starts before refusal.
- Deleted duplicated trigger/destination decisions and auth helper. Bound one registry read plus plan, exact domain copy, missing-consent refusal, shared synchronous snapshot/start, one blocked event, DB-first credential source, and lazy request-trust peer authorization. Credential route and registrar order untouched.

## Review / cleanup

Static source/diff review complete; runtime and type evidence remain for Opus. Architecture: keep product bindings and Express writes in Tovu; consume only named Jini exports. Scope: named sheet files and callers only. Priming: supplied design and existing round-1 mount bindings govern the implementation; no additional seed approval requested under explicit dispatch authorization.


### Final review evidence
- `git diff --check`: clean. No execution checks ran, and no mutation was applied. No test-pass or typecheck claim is made.
- Opened the named retained importers for all eight built sheets; they still use actual bound host exports. No public path was deleted and no re-export shell was introduced.
- Reviewed the added lines against each sheet. Removed the provisional CRP-22 witness and binding edits after its deferred-read mismatch was identified; no other out-of-sheet additions remain. Deleted duplicate decision helpers/imports only as listed per sheet. Removed the old ZIP comment claiming a Buffer check was unnecessary because CRP-27.T explicitly requires that check.
- Existing why-comments moved with the shared logic are present in the Jini source. Product/host comments stay with the host wiring. No new source comments were added.
- Per-request optional OAuth operation getters preserve live service lookup after the session gate. SSE reads Last-Event-ID directly from headers, retaining existing direct-test request shapes.
- Architecture audit: static scope/boundary review PASS for the eight built sheets; execution confidence INCONCLUSIVE until Opus runs witnesses, mutations and package gates. No Jini or theme changes; publish-credentials untouched. All production binders remain below 500 lines; oversized pre-existing test files were not split because the sheets name no new test modules.
- Function assessment: render bindings / response ports / plugin invocation / OAuth-probe gates / install parsing / peer push / SSE binding / publish trigger-destinations: INCONCLUSIVE (tests and typechecks prohibited). Static review found no remaining out-of-spec logic; no measured complexity or coverage claim. The witnesses directly exercise occurrence isolation, header/effect order, retirement, stream refusal and capability admission.
- Reuse: all eight sheets call the exact named owners on Jini `codex/r2-ext-crpj` (`79a9ca0be`); no generic decision engine was recreated in Tovu.
- Pre-completion: requirements and changed scope re-read, existing tests retained, only new named cases added, no .git mutation/commit/push, remaining sheets listed above. Self-validation not run under the explicit dispatch prohibition. Next: Opus runs and mutates the ten added witnesses after package integration, then reviews the stopped upstream contracts.

### Complete changed-file list
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/external-mcp/__tests__/external-mcp-route-failures.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts`
- `apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts`
- `apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/install-route.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/plugins/install.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts`
- `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/events-head-rejection.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/settings/events.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/publish-site.tw4.pins.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/render-html-embed-attributes.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/render/content-html.ts`
- `apps/website/src/server/inbound/public-http/http/site/render/page-body.ts`
- `apps/website/src/server/inbound/public-http/routes/__tests__/integration/plugin-contributions.auth.integration.test.ts`
- `apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/__tests__/pre-consent-vary.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/pages/response.ts`
- Created `COMMIT-PLAN.md` (this file; coordinator must not commit it).
