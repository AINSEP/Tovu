# ledger web-10
- step1: listed 16 test files; typecheck + run started
- typecheck: 0 errors in the 16 test files (source has many pre-existing TS2307 from stale Jini link). tsconfig needs typeRoots=/home/user/tovu-web10/node_modules/@types.
- run1: 47 tests, 35 pass, 12 fail. 11 files fail at IMPORT with ERR_PACKAGE_PATH_NOT_EXPORTED: linked /home/user/Jini is detached at 2c2961d5 (2026-11-25), missing subpaths (platform secrets/root-key/ordered-keyring, cms pages/html-reverter, cms public-http/http/site/render-site, user-management member-login/oidc-request, analytics site/visitor-analytics, cookie-consent site/revisions.repo, user-management admin-http/owner/passkey-routes). Jini origin/main (131a68bd) lacks them too. ENV BLOCKER -> coordinator. Not fixable inside worktree.
- runnable: worker-sandbox, published-webmcp, forms-admission, admin-failure.unit, dev-cors
- 5 runnable files all their NEW tests pass (worker-sandbox's failing test is the pre-existing compiled-JS test, env: cms subpath render/blocks). Mutations red+reverted: webmcp catch->true, forms next(error)->next(), dev-cors no trim, request-admissions clear #sets, worker-sandbox no rmSync in catch. Sources clean.
- next: static review of 11 blocked files
- scratch harness (deleted, never committed): new tests of site-chat-markup(2), render-context site-title(1), observability(1), theme-preview-refresh(1) copied verbatim with minimal imports -> 5/5 pass. Mutations red: site-title drop siteTimeZoneDep, theme-static-assets next(new Error), site-chat cache 16->15.
- coverage (runnable subset only) in /tmp/claude-0/web10-1.lcov
- DONE as far as env allows. No file changes -> no commit. BLOCKED: 7 new-test files (member-oidc-auth, seo-artifact-origin, render-products, site-consent, member-auth-errors, member-proof-bodies, comments-submit) need a Jini build matching integ/merge-28-2026-11-26; rerun after relink.
- ROUND2 start: env fixed (jini-m28). running all 16.
- r2 run1: 248 tests 246 pass; red: site-consent:189 'save failure is reported', theme-preview-refresh:391 'failure is logged'
- FIXED both reds: tests asserted legacy console sink; product reports via failureReporter (composed reporter). Bound recordingComposedReporter + assertReporterDiagnostics. theme-preview red was PRE-EXISTING (same on origin/main). both pass now.
- tsc: 1 error site-chat-markup Map key type -> fixed (Map<string,Set<string>>); tsc clean. WIP committed.
- mutations (7 files): append->set RED; consentConfigProblems off RED; opt-out untranslated RED; comments entryId->comment.id RED; signIn redirectPath removed RED; consent:save op RED (my fix); oidc-start:48 reasonClass SURVIVED -> investigating
- re-mutated: oidc-callback:58 reasonClass RED, oidc-start:47 method RED (earlier survivor was wrong file — oidc-start onFailed is begin-failure path). next: coverage
- r2 full rerun after fixes: 248/248 pass. scoped cov (16 files only) in /tmp/claude-0/web10-r2-cov1.txt. next: add sibling tests for site-cookie-consent/worker-sandbox/deps/oidc-callback/theme-static-assets, then gap fill
- cov2 (16 + 15 sibling files) in /tmp/claude-0/web10-r2-cov2.txt: 417 tests, 2 PRE-EXISTING reds in unchanged siblings (site-cookie-consent.errors.unit:69 legacy console 'consent:save'; unexpected-admin-escape-paths.unit:54 expects UNAVAILABLE id) - out of scope, report. Remaining uncovered 'lines' are tsx type/comment artifacts.
- added 2 tests: member-oidc-auth 'OIDC start the provider cannot serve' (oidc-start onFailed path), member-auth-errors 'sign-out cookie' (clearedMemberSessionCookie). pass 67/67; mutations red (reasonClass@start:48, clear path, onFailed suppressed -> timeout/cancel). refuseMemberRequest covered by existing member-request-limits.unit.test.ts.
- COMMITTED 38dce71a. DONE.
- ROUND3 start. helper /tmp/claude-0/web10r3/cov.sh (NODEFLAGS=--enable-source-maps gives TS line numbers).
- r3 measured: render-site 100/88.89/100 (gap ?? undefined null branch) -> added render-site-static-fallback.unit.test.ts -> B 100. entry-lists 100/100/100 with existing tests (entry-list-render + render-components-branches). site-chat-markup 100/94.44/100 gap = unreachable oldest.done (EXCEPTION). deps 100/92.11/100 -> 3 new tests in member-request-limits.unit -> B100. oidc-callback F90: writeHeaders/observe/check lambdas dead (binding.preflight never passed; memberOidcGetApp duplicates) -> EXCEPTION/finding. Mutations red+reverted: trim/lower, <empty>, ?? undefined.
- next: theme-static-assets (94 themes??[], 134 inherited template) with inherited-template-source.integration, then FILES list.
- WIP 76d2a540 committed (deps + render-site tests). theme-static-assets 100/100/100 with admin inherited-template/explore tests (no new test).
- batch6 measured (source maps): health 100/100/100 (readiness-routes.test); complete-sign-in 100; oidc-verify-email/unlink-identity/bare-page/callback-page/forms-multipart/newsletter-deps: B100 F100, only comment/signature/import line artifacts. oidc-start F90 = boundPerRequest placeholder (EXCEPTION). PRE-EXISTING reds (unchanged files): newsletter-public-routes.test.ts (UNSUBSCRIBE 500 copy), composed-reporter-bound-sites / newsletter redaction (4 total) - report.
- site-assistant-confirm: +3 tests (ownerless, enabled failure, escaped failure writer) -> 95.56/100/100 (4,6 import artifacts). mutations red.
- json-body-parsers: +1 test (/api/p) -> 100/100/100; mutation red.
- batch10 pages measured: member-pages/home/slug-routes/static-tier/content-marker/member-access/static-menus/response/pre-consent-cache B100 (remaining = import/comment artifacts or uncalled lambdas). request-policy B75 (resolveRequestedSlug reject path 117-122) -> new request-policy.unit.test.ts (13 tests) -> covered; mutation (admin guard) red.
- PRE-EXISTING reds (unchanged by branch): newsletter-public-routes.test.ts:230,:364; h4-newsletter.unit.test.ts:34.
- COMMITTED 76d2a540, 85f5063d, 871e7eaa (local, not pushed). ROUND3 DONE. Left: listing-batch B23 commentCursor, response.ts:104/106 plugin partial lambdas, slug-routes/home uncalled lambdas, member-pages:70 sendFault, oidc-callback dead preflight lambdas (finding).
- ROUND4 start. listing-batch: new pages/__tests__/listing-batch.unit.test.ts (7 tests) -> 100/100/100 (was B88.89). tsc clean. mutations red: declaredScripts append dropped, commentCursor typeof !== undefined. Round4 tsconfig /tmp/claude-0/web10r4/tsconfig.json. next: response.ts:104/106
- response.ts: new pages/__tests__/response-widget-partials.route.test.ts (3 tests) covers 104/106 (readNames/expand). mutations red: partials:{} , validateHtml identity. tsc clean. next: slug-routes/home lambdas, member-pages:70
- slug-routes:54 covered by new test in pages.member-access.route.test.ts (gated post, static theme themed 404); mutation red. @68 covered by pages.route/edge-paths set (r4c). home.ts: union of run-10 + r4c sets = F100 (listingFailure covered by r4c). member-pages:70 = closing '}));' source-map artifact (B100 F100) EXCEPTION. committed. next: unmeasured FILES
- r4e: http/site batch (all 54 http/site tests) measured: form-feedback-policy, form-wire-policy, handlebars-render, liquid-render, render/blocks, registry, content-html, document-shell, page-body, post-body, site-assistant-mount, template-render-data = all real lines/branches covered; residual uF X@1 / anonymous@decl-line / uB lastline = tsx CJS export-getter artifacts. handlebars-worker 27-30 + liquid-worker 21 = worker_thread entry (coverage not collected in worker isolate) EXCEPTION. PRE-EXISTING reds (unchanged files): render-form-layout.test (3 browser stylesheet), render.golden.characterization (drift), tiptap-render-contract (drift guard), worker-import-graph (root barrel via cms dist).
- r4f: middleware render-theme-override / theme-content-security-headers / theme-preview-static = 100/100/100 with existing tests (declared-consent.unit, theme-preview-static.test) -> SKIPPED-ALREADY-COVERED.
- r4g: theme-preview-switcher 100/98.21/100 (theme-page-preview + preview-switcher integration/layout tests). Gap uB 55: `origin ? ... : undefined` falsy arm (no resolvable workspace origin; tests always resolve http://localhost:3000). LEFT (out of calls): needs a test with runtimeMode/originRegistry yielding no origin -> assert switcher state has no absolute origin. preview-switcher-layout.test 7 reds = ENV (Playwright chromium missing at /opt/pw-browsers).
- ROUND4 DONE (call cap). Commits 83f5bc8e, a5e0f6e5 (local). Left unmeasured: routes/* small files (export-files, purchase, get-by-slug, mail-feedback, members/analytics, sign-in, oidc-deps, plugin-contributions, site-share, analytics-ingest, chat-comparison-html, forms-submit, media-rendition, newsletter-confirm/unsubscribe, pages.ts, extra-head, listing/marketing/post/virtual-page handlers, render-context deps/media-metadata/post-previews/widgets, template-render, products, search, seo-documents), shared admin-route-mount-support, media-original-writer.
- ROUND5 start. switcher:55 covered by new integration test 'without a verified workspace origin...' -> 100/100/100; mutation (undefined->invalid origin) red, reverted. theme-page-preview.errors.unit:'templated preview failure...' red = PRE-EXISTING (file unchanged by branch).
- r5 batchA measured (see final). forms-submit: +1 test 'unavailable' (FormDefinitionNotFoundError). pre-existing reds (files unchanged): content-post-get-by-slug:153, forms-submit:915, mail-feedback.unit:82/:106, purchase.integration:85 + postgres settle, newsletter-public-routes x2, h4-newsletter x2.
- r5 batchB (pages/search/products/seo/sign-in/chat-comparison/admin ports, 33 files) measured. PRE-EXISTING reds (unchanged files): 'challenge CAS rejection is 401 but database outage surfaces as 500', 'product failures reference the same redacted server incident'.
- r5 new: forms-submit +2 (unavailable real 404, rate_limited in loop); shared/__tests__/admin-route-mount-support.unit (3), media-original-writer.unit (2). tsc clean. Mutations red+reverted: unavailable->internal, trashed no Cache-Control, array header arm, denyUnbound->true, switcher origin. WIP committed.
- next: listing.ts uB51 (/page/<non-number> falls through), then final report.
- r5 listing: new pages/__tests__/listing-rewrites.unit.test.ts (2) covers uB51 (non-numeric /page/<seg> falls through); mutation red. tsc clean.
- ROUND5 DONE. commits ce9f7ed628 + final (local). Left: media-rendition dead adapter getters (blobStore@41, hash no-bytes arm@42, readWidgetRows no-entryRepo@49, range/ifNoneMatch lambdas@72); oidc-deps sendMemberOidcError@97 no production caller + uB61; widgets.ts:44-46 assistant availability arm; template-render:108 documentAssets-absent arms; admin-route-mount-support:95-96 OAuth 429 lambdas; post.ts anon@57; boundPerRequest placeholders (get-by-slug@38, search@34, analytics-ingest@21) EXCEPTION; products:88 res.locals?. EXCEPTION.
- ROUND6 start 05:38
- r6 widgets.ts:44-46 COVERED by existing visitor-assistant-readiness.integration (11/11 pass). site-chat-selection.test.ts red PRE-EXISTING (unchanged file; InMemorySettingsRepo.transaction not reentrant)
- r6 template-render: new __tests__/routes/missing-template-document-assets.test.ts (1) -> B 80->92.31 (L/F 100); residual 108 ?.head nullish arm type-unreachable (documentAssets returns Promise<DocumentAssets>) EXCEPTION. mutations red: drop static:true, head->body. next: admin-route-mount-support:95-96
- r6 admin-route-mount-support:95-96: new inbound/shared/__tests__/oauth-admission.route.test.ts (2) covers retryAfter/json lambdas; tsc clean; mutations red (retryAfter no-op, json drops status). next: post.ts anon@57
- r6 post.ts anon@57: new pages/__tests__/generic-post-comment-scripts.unit.test.ts (1) -> covered; mutation (scripts no-op) red; tsc clean. next: media-rendition
- r6 media-rendition measured (4 route tests, 65/65): L100 B95.12 F92.68. Residual: get blobStore@41 FNDA0, hash bytes-present arm@42 (kit falls back to byte hash only when publicRenditionTag is null after a successful render = legacy rows without stored rendition evidence), readWidgetRows no-entryRepo arm@49 (createRouteDeps always wires entryRepo), writer.end@66 (kit 304/410 call res.end directly), range lambda@72 on rendition route (kit rendition path never reads range; only original route does). -> EXCEPTION/decision (port lambdas unread by kit contract), not faked.
- ROUND6 DONE (call cap). commits 104f8a9a3d, c1375506d2, 703ea53cf8 (local, not pushed). Left: media-rendition decision above; brief FILES unmeasured list from r4 still partly unmeasured (export-files, purchase, members/analytics, oidc-deps, plugin-contributions, site-share, newsletter-confirm/unsubscribe, extra-head, marketing/virtual-page handlers, render-context deps/media-metadata/post-previews, seo-documents).
- ROUND7 start 05:47. agg script /tmp/claude-0/web10r7/agg.mjs (best-per-file over all lcovs) -> /tmp/claude-0/web10r7/table1.txt. r7a measured unmeasured 6 + unions (seo-render-context, site-cookie-consent, theme-preview-refresh, observability, admin-route-mount-support, media-original-writer, admin-failure, site-title); 236/237, red = pre-existing consent errors test. render-context/deps.ts = type-only EXCEPTION.
- r7 admin-route-mount-support: +3 tests oauth-admission.route (noStore, session gate 403/200, no-hook identity) +1 unit (requireRouteErrors) -> union w/ admin-json-route-ports* L99.04 B100 F100 (uL86 sourcemap artifact). mutations red x3. tsc clean. committed.
- r7 worker-sandbox measured (5 worker tests 11/11): L95.68 B100 F100 (uL1-7 import artifacts). observability-middleware +2 tests -> L100 B97.62 F100; residual 109 req.baseUrl ?? '' nullish arm (Express always sets baseUrl) EXCEPTION. mutations red x2. committed. 05:51
- r7 site-cookie-consent: new site-cookie-consent.reporter-down.unit (3) asserts reporter-breach -> 503 + UNAVAILABLE_ERROR_ID, no raw console. mutation red. diagnosticFailure lambdas (116/130/145) + errorId-falsy arms (117/131/146) unreachable: reportServerFailure catches every reporter throw and returns UNAVAILABLE_ERROR_ID (admin-failure.ts:91-94) -> EXCEPTION. Union r7a+r7f B 95.39->? (not re-unioned). committed. 05:53
- r7 request-policy: +1 test redirectLookupPath (recorded /page/<n> -> own URL; plain -> path) -> B 90->100; mutation red; tsc clean; committed. r7g: site-consent (sourcemapped) L98.44 B95.83 F100 uB32 (catch arm: malformed host URL) left. 05:55

## ROUND7 FINAL per-file table (90 brief FILES; all measured except type-only render-context/deps.ts)
Caveat: 'after' runs use --enable-source-maps (TS line numbers), which counts comment/import/signature lines a different loader never executes; an L below 'before' with B/F 100 is that artifact, not lost coverage. Generator: /tmp/claude-0/web10r7/agg.mjs + final.py.
| file (apps/website/src/server/inbound/) | before L/B/F | after L/B/F | note |
|---|---|---|---|
| public-http/http/site/bare-page.ts | 92.31/66.67/33.33 | 92.31/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/http/site/form-feedback-policy.ts | 97.67/85.71/55.56 | 100/92.31/55.56 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/form-wire-policy.ts | 100.0/87.5/50.0 | 100/87.5/91.67 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/handlebars-render.ts | 100.0/100.0/70.0 | 100/94.12/70 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/handlebars-worker.ts | 90.32/25.0/0.0 | 87.1/33.33/0 | worker_thread entry, coverage not collected in worker isolate EXCEPTION |
| public-http/http/site/liquid-render.ts | 100.0/96.0/76.47 | 100/96.15/76.47 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/liquid-worker.ts | 100.0/33.33/0.0 | 100/50/0 | worker_thread entry EXCEPTION |
| public-http/http/site/render-site.ts | 94.44/66.67/77.78 | 100/100/100* | r3 render-site-static-fallback.unit -> B100 |
| public-http/http/site/render/blocks.ts | 96.43/90.0/66.67 | 100/90/88.89 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/render/components/entry-lists.ts | 94.44/85.71/62.5 | 100/100/100 | existing tests |
| public-http/http/site/render/components/registry.ts | 100.0/90.0/80.0 | 100/90/90 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/render/content-html.ts | 100.0/83.33/57.14 | 100/83.33/57.14 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/render/document-shell.ts | 100.0/90.0/66.67 | 100/90/66.67 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/render/page-body.ts | 88.89/80.0/75.0 | 100/80/75 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/render/post-body.ts | 100.0/80.0/60.0 | 94.44/80/60 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/render/site-assistant-mount.ts | 98.75/93.75/50.0 | 100/93.75/50 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/render/template-render-data.ts | 100.0/66.67/33.33 | 90.91/66.67/33.33 | r4e: real lines/branches covered; residual uB/uF at decl line and X@1 = tsx CJS export-getter artifacts EXCEPTION |
| public-http/http/site/seo-render-context.ts | 91.67/83.33/50.0 | 92.86/100/100 | r7 measured; uL9 signature artifact |
| public-http/http/site/site-chat-markup.ts | 89.74/89.47/71.43 | 100/94.74/100 | uB18 oldest.done unreachable EXCEPTION |
| public-http/http/site/worker-sandbox.ts | 93.15/76.92/100.0 | 95.68/100/100 | r7 measured (5 worker tests); uL1-7 import artifacts |
| public-http/middleware/published-webmcp.ts | 100.0/92.0/57.14 | 100/100/100 |  |
| public-http/middleware/render-theme-override.ts | 93.75/100.0/100.0 | 100/100/100 | existing tests |
| public-http/middleware/site-consent.ts | 100.0/71.43/45.45 | 98.44/100/100 | r8 malformed-Host scenario covers uB32; uL1 import artifact |
| public-http/middleware/site-cookie-consent.ts | 97.88/96.0/83.58 | 100/~97/94.93 | r7 reporter-down; r8 +2 tests cover 46 (no consentAdapters) + 139 (framing-less POST -> 400); 117/131/146 + diagnosticFailure lambdas EXCEPTION (admin-failure.ts:91-94 never throws); 52 (createParent=false arm, chosen inside cookie-consent lib) / 90 (browserPlugins arm) + 74/82/181 lambdas LEFT |
| public-http/middleware/theme-content-security-headers.ts | 95.0/80.0/50.0 | 100/100/100 | existing tests |
| public-http/middleware/theme-preview-refresh.ts | 100.0/96.77/78.57 | 99.03/100/100 | uL71 = signature line of registerThemePreviewRefresh (F100) sourcemap artifact EXCEPTION |
| public-http/middleware/theme-preview-static.ts | 100.0/60.0/100.0 | 100/100/100 | existing tests |
| public-http/middleware/theme-preview-switcher.ts | 100.0/98.33/85.71 | 100/100/100* | r5 no-origin test |
| public-http/middleware/theme-static-assets.ts | 99.36/82.86/81.82 | 100/100/100 | existing admin tests |
| public-http/routes/agent-plugin-surfaces/export-files.ts | 96.97/100.0/100.0 | 95.35/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/commerce/purchase.ts | 97.53/97.73/100.0 | 97.96/97.73/100 | uL1 import; uL83/uB52 SKIPPED r8 (sit on pre-existing red purchase.integration path) |
| public-http/routes/content/posts/get-by-slug.ts | 100.0/90.91/69.23 | 100/100/90 | boundPerRequest placeholder lambda EXCEPTION @38 |
| public-http/routes/mail-feedback.ts | 97.62/100.0/100.0 | 97.73/100/100 | uL39 LEFT (pre-existing reds mail-feedback.unit) |
| public-http/routes/members/analytics.ts | 96.67/100.0/100.0 | 96.97/100/100 | uL22 LEFT (likely artifact) |
| public-http/routes/members/complete-sign-in.ts | 88.89/100.0/66.67 | 100/100/100 |  |
| public-http/routes/members/deps.ts | 92.54/82.14/88.89 | 100/100/100* | r3 +3 tests -> B100 |
| public-http/routes/members/oidc-callback.ts | 96.61/100.0/55.17 | 100/100/90 | dead preflight lambdas 36-38 (binding.preflight never passed) EXCEPTION/finding |
| public-http/routes/members/oidc-deps.ts | 100.0/90.0/93.33 | 100/98.33/93.33 | sendMemberOidcError@97 has no production caller (finding); uB61 LEFT |
| public-http/routes/members/oidc-start.ts | 95.92/87.5/60.0 | 100/100/90.91 | boundPerRequest placeholder lambda EXCEPTION @9 |
| public-http/routes/members/oidc-verify-email.ts | 74.51/100.0/23.08 | 96.23/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/members/sign-in.ts | 97.67/100.0/100.0 | 100/100/100 |  |
| public-http/routes/members/unlink-identity.ts | 80.49/100.0/23.08 | 95.35/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/oauth/callback-page.ts | 70.18/100.0/100.0 | 70.69/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/ops/health.ts | 61.7/100.0/50.0 | 100/100/100 |  |
| public-http/routes/plugin-contributions.ts | 100.0/93.33/80.0 | 93.18/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site-assistant-confirm.ts | 84.38/90.91/90.0 | 95.56/100/100 | r3 +3 tests; uL4,6 imports |
| public-http/routes/site-share.ts | 100.0/71.43/100.0 | 96.3/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site/analytics-ingest.ts | 100.0/66.67/62.5 | 98.18/100/87.5 | boundPerRequest placeholder lambda EXCEPTION @21; uL28 LEFT |
| public-http/routes/site/chat-comparison-html.ts | 96.94/100.0/100.0 | 96.94/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site/comments-submit.ts | 100.0/92.31/91.67 | 100/100/100 | r8 status trash -> moderationState other (uB60 sourcemapped = old uB23) |
| public-http/routes/site/forms-admission.ts | 100.0/83.33/100.0 | 100/100/100 | r8 Accept-absent refusal -> JSON 429 (uB20) |
| public-http/routes/site/forms-multipart.ts | 66.67/100.0/100.0 | 69.23/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site/forms-submit.ts | 100.0/96.0/100.0 | 100/100/100 | r8 sourcemapped run: uB102 was compiled-line artifact; pre-existing red flash-cookie test untouched |
| public-http/routes/site/media-rendition.ts | 98.57/92.86/86.36 | 100/95.12/92.68 | r6: port lambdas the kit never reads (blobStore@41, @49, @66, @72) EXCEPTION/decision |
| public-http/routes/site/member-pages.ts | 98.53/92.31/78.57 | 98.57/100/100 | uL70 closing-line artifact |
| public-http/routes/site/newsletter-confirm.ts | 97.14/100.0/62.5 | 97.3/100/75 | uF@25/26 boundPerRequest placeholders (requestDeps always replaces) EXCEPTION; uL17 signature artifact |
| public-http/routes/site/newsletter-deps.ts | 56.67/100.0/100.0 | 78.95/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site/newsletter-unsubscribe.ts | 100.0/100.0/83.33 | 96.67/100/83.33 | uF@20 boundPerRequest placeholder EXCEPTION; uL16 signature artifact |
| public-http/routes/site/pages.ts | 100.0/75.0/50.0 | 88.24/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site/pages/extra-head.ts | 100.0/87.5/71.43 | 100/100/100 |  |
| public-http/routes/site/pages/handlers/home.ts | 98.04/91.18/93.75 | 100/100/100* | union run-10+r4c = F100 |
| public-http/routes/site/pages/handlers/listing.ts | 100.0/75.0/66.67 | 96.49/100/100* | r5 listing-rewrites.unit covers uB51; uL34,57 artifacts |
| public-http/routes/site/pages/handlers/marketing.ts | 100.0/91.67/76.92 | 100/100/100 |  |
| public-http/routes/site/pages/handlers/post.ts | 100.0/96.3/86.21 | 100/100/100* | r6 test covers @57 |
| public-http/routes/site/pages/handlers/slug-routes.ts | 98.55/97.56/92.86 | 100/100/100* | r4 tests: @54 + union @68 = F100 |
| public-http/routes/site/pages/handlers/virtual-page.ts | 100.0/100.0/80.95 | 100/100/100 |  |
| public-http/routes/site/pages/listing/listing-batch.ts | 96.15/88.89/60.0 | 100/100/100 | r4 listing-batch.unit |
| public-http/routes/site/pages/pre-consent-cache.ts | 97.78/85.71/57.14 | 80.85/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site/pages/render-context/content-marker-ports.ts | 97.3/91.67/60.0 | 100/100/100 |  |
| public-http/routes/site/pages/render-context/deps.ts | MISSING/MISSING/MISSING | n/a | type-only module, no runtime code EXCEPTION |
| public-http/routes/site/pages/render-context/media-metadata.ts | 100.0/93.33/76.47 | 100/100/100 |  |
| public-http/routes/site/pages/render-context/member-access.ts | 98.33/83.33/50.0 | 100/100/100 |  |
| public-http/routes/site/pages/render-context/post-previews.ts | 100.0/92.31/84.62 | 100/100/100 |  |
| public-http/routes/site/pages/render-context/site-title.ts | 98.25/84.62/50.0 | 100/100/100 | r7 measured |
| public-http/routes/site/pages/render-context/static-menus.ts | 98.63/91.18/87.5 | 96.46/100/100 | sig/import/comment-line artifact (B,F 100) |
| public-http/routes/site/pages/render-context/widgets.ts | 100.0/83.33/50.0 | 100/100/100* | r6: 44-46 covered by visitor-assistant-readiness.integration |
| public-http/routes/site/pages/request-policy.ts | 99.23/70.0/33.33 | 99.24/100/100* | r3 unit + r7 redirectLookupPath test -> B100 |
| public-http/routes/site/pages/response.ts | 98.18/96.43/82.76 | 98.23/100/100* | r4 widget-partials test covers 104/106; uL1,2 imports |
| public-http/routes/site/pages/static-tier.ts | 97.14/94.12/83.33 | 100/100/100 |  |
| public-http/routes/site/pages/template-render.ts | 100.0/75.0/84.62 | 100/92.31/100 | r6 test; uB108 ?.head nullish type-unreachable EXCEPTION |
| public-http/routes/site/products.ts | 97.62/94.87/94.12 | 97.83/97.37/100 | uB88 res.locals? EXCEPTION; uL58,92 LEFT |
| public-http/routes/site/search.ts | 100.0/100.0/60.0 | 98.21/100/80 | boundPerRequest placeholder lambda EXCEPTION @34; uL40 |
| public-http/routes/site/seo-documents.ts | 100.0/94.12/75.0 | 100/100/100 |  |
| shared/admin-failure.ts | 100.0/96.97/70.59 | 97.14/98.04/100 | r8 metadata.time test covers uB169; uB139 failure.errorId ?? errorId unreachable (formatUserFacingError always sets errorId when passed one) EXCEPTION; uL1-6 imports |
| shared/admin-route-mount-support.ts | 100.0/88.89/53.85 | 99.04/100/100 | r5+r6+r7 tests; uL86 sourcemap artifact |
| shared/dev-cors.ts | 66.04/60.0/50.0 | 100/100/100 |  |
| shared/json-body-parsers.ts | 98.48/92.0/36.84 | 100/100/100 | r3 /api/p test |
| shared/media-original-writer.ts | 96.3/100.0/50.0 | 55.17/100/100 | r5 test; uL = comment lines artifact |
| shared/observability-middleware.ts | 100.0/85.37/100.0 | 100/97.62/100 | r7 +2 tests; uB109 req.baseUrl ?? "" (Express always sets) EXCEPTION |
| shared/request-admissions.ts | 100.0/93.75/70.0 | 100/100/100 |  |

(* = after taken from the ledger's later round where the best surviving lcov predates the covering test)
- ROUND7 DONE 05:56. r7 commits 6b080d96ca, 0deb40eec1, cf094137bd, 919879841b (local, not pushed).
- r8 site-consent uB32: +1 scenario 'Host local host:4000' (malformed) -> configured origin; mutation (catch rethrows) red; reverted.
- r8 comments-submit uB60(was uB23 compiled): parametrized first test pending/trash -> moderationState other; mutation (other->status) red; reverted. newsletter-confirm uF25/26 + unsubscribe uF20 = boundPerRequest placeholder lambdas EXCEPTION (requestDeps always replaces them).
- r8 forms-admission uB20 (accept ?? "" arm): parametrized JSON refusal test over Accept json/absent; mutation (?? "text/html") red; reverted. forms-submit sourcemapped run = 100/100/100 (uB102 was compiled-line artifact); pre-existing red flash-cookie test untouched.
- r8 admin-failure uB169: +1 unit test (caller metadata.time/appVersion kept in reply + Copy details); mutation (always clock time) red; reverted. uB139 'failure.errorId ?? errorId' fallback unreachable: formatUserFacingError always sets errorId when one is passed (core user-facing-error.ts metadata.errorId = existingId ?? optionalArgs.errorId) and both formatApprovedFailure calls pass errorId -> EXCEPTION.
- r8 theme-preview-refresh uL71 = signature line of registerThemePreviewRefresh (F100, so it runs) -> sourcemap artifact EXCEPTION.

- r8 site-cookie-consent: +2 tests (siteConsentPlugins absent/wired; bodyless + framing-less receipt POST 415/400, nothing written); mutation (empty-body arm throws) red. tsc clean (tsconfig.r8.json). 5 touched files 82/82 pass.
- ROUND8 DONE 06:10.
