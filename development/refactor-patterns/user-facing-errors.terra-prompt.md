# Terra prompt: user-facing errors, remaining sites

STATUS: READY (2026-11-13). Self-contained: you get nothing else. Verified against branch `w3-dc`
at commit 9b37e33cc; every `path:line` below was read at that commit. If a line moved, find the
same statement in the same file (quoted text is given) and fix it there.

This is the Tovu repo. It has no `AI-Dev-Shop/` folder; that is expected, proceed. Do not read or
follow `CLAUDE.md`/`AGENTS.md` bootstrap steps.

## 0. Ground rules
- Smallest change per site. Do not refactor around it, rename, reformat or move code.
- Keep every existing comment, especially "why" comments; move one only if its line moves.
- Function args stay `(required, optional = {})`.
- No `eslint-disable`, no `as any`, no non-null `!` in code you add.
- Do not add i18n keys (admin `t("...")` strings) unless you add the key in every locale file.
- Tests: ONE file at a time, never a suite, never a full `tsc`. Leave no process running
  (no watch mode, no servers). Commands:
  - website (`apps/website`, `packages/*`), from repo root:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`
  - desktop main (`apps/desktop/src`, not renderer), from `apps/desktop`:
    `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - desktop renderer, from `apps/desktop`:
    `node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - admin, from `apps/admin`: `npx vitest run --maxWorkers=2 <file>`
- Per changed source file: add/adjust ONE test (the nearest existing test file for that module,
  else a new `<module>.errors.unit.test.ts` beside its other tests). Order: write the assertion,
  run it and SEE RED, make the fix, run GREEN, then mutate (drop the cause / drop the redaction
  options) and SEE RED, restore, GREEN again. Record red/green/mutation for each file in your report.
  A test asserts: the visible text, that the log carries the cause (message text + a stack frame
  such as the test file name), the error ID match where there is one, and that a secret in the
  thrown message is redacted (throw `new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET")`
  and assert `SECRETSECRETSECRETSECRET` is absent).
- Do not commit, push, stash, or `git add -A`/`git checkout`. Leave your changes in the working tree.
  The coordinator reviews and commits.

## 1. The rule
Every error a user sees = (1) plain words: what failed + what to do; (2) a "Copy details" block
(error ID, failed step, redacted cause, app + Jini version, time). The server logs the same incident,
redacted, under the same error ID. Never log secrets, tokens, cookies or request bodies. Never a
catch-all ("Error", "Could not open the link.") that drops the cause.

NOT an incident (plain specific text only, no Copy details, no incident log):
- invalid user/model input: `JSON.parse` / `new URL` / schema of input the caller sent (CLI flags,
  stdin, tool input, form fields). Do NOT attach the parse error as cause: it quotes the input,
  which may be a secret.
- expected refusals: not found, permission, a refused link (`javascript:`/non-https from a plugin),
  a browser clipboard refusal (`isClipboardRefusal`), rate limits, a webhook with a bad signature.
- local-owner sign-in "why not enabled" reasons (`local-owner-signin.ts`): reason codes, not failures.

## 2. Mechanism per surface (exact signatures; all already exist, add no new helper)
Imports:
- `import { formatErrorForLog } from "@jini-ai/core";` and
  `import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";`
  (website, desktop main, admin). `formatErrorForLog({ error }, options): string` never throws and
  returns the redacted message + stack.
- class-only (secret path): website `import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";`
  then `describeErrorForLog(err)`; admin/desktop `import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";`
  then `describeErrorForLog({ err })`. Never throws.
- server incident sink, website: `import { reportServerFailure, sendAdminFailure } from "#src/server/inbound/shared/admin-failure";`
  (the shared module; `admin-http/routes/system/site-share-errors.ts` no longer re-exports it).
  - `reportServerFailure({ error, operation: "<area>:<step>" }, { tracker: res.locals.adminFailureTracker }): { errorId: string }`
  - `sendAdminFailure({ res, error }, { operation: "<area>:<step>", message?: "<specific plain words>" }): void`
- admin local failure: `import { adminFailureChannel, isClipboardRefusal, publishLocalAdminFailure } from "@/lib/admin-failure-channel";`
  `publishLocalAdminFailure({ message, action, step, cause }, { generation })`, where
  `const failureGeneration = adminFailureChannel.getGeneration();` is captured BEFORE the await.
- admin API failure: `lib/api.ts request()` ALREADY publishes 0/5xx with Copy details. Inline text only:
  `describeApiError(error, t("<specific fallback>"))` (exported from `@/lib/api`). NEVER publish again.
- assistant tool: model-fixable input -> `throw new ToolInputError({ message: "<CODE>: what is wrong + how to fix" })`.
  Server fault -> `throw new Error("<what failed>", { cause: err })`; the tool transport mints the ID,
  logs redacted, the user gets Copy details. Never ToolInputError for a server fault.

## 3. Variants (before -> after)
- **L log-only**: `catch { log("fixed text") }` ->
  `catch (error) { log("<same text>", formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)) }`.
  If the logger/port takes ONE string, append: `` log(`<same text> Cause: ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`) ``.
  Keep any existing `Details: <CODE>` text.
- **LS log-only, secret path** (the try block touches credentials, vault, sealer, site key, provider
  SDK with keys, or DB rows with secret params): same as L but `describeErrorForLog` (class + code).
  If you open an L site below and its try block clearly reads key/credential material, use LS
  instead and say so in the report.
- **R rethrow**: `catch { throw new X("fixed") }` -> `catch (error) { throw new X("<same text>", { cause: error }) }`.
  If X's constructor cannot take a cause, widen its optional arg to `{ cause?: unknown } = {}` and
  pass `super(message, { cause })`; do not change its required arg.
- **RES result**: `catch { return { ok:false, reason:"fixed" } }` -> keep the result exactly; add one
  L log line (`console.warn("[area] <what failed>; <what continues>", formatErrorForLog(...))`) before returning.
- **S split catch-all**: one catch maps every failure to a 4xx/ToolInputError ->
  `if (<is the expected validation error>) { <the existing 4xx/ToolInputError> } else <incident path for the surface>`.
- **P public route**: `catch { res.status(5xx).send(visitor text) }` ->
  `catch (error) { const { errorId } = reportServerFailure({ error, operation }, { tracker: res.locals.adminFailureTracker }); <same visitor text + errorId> }`.
  JSON: add an `errorId` field. HTML: append `<p>Reference: ${errorId}</p>`. JS body: put it in the
  comment (`/* ... Reference: ${errorId} */`). Remove the old bare `console.error("[x] ... failed")` line
  (reportServerFailure logs it). Never put the cause in the visitor reply.
- **A admin-gated route**: `catch { res.status(5xx).json({ error: "fixed" }) }` ->
  `catch (error) { sendAdminFailure({ res, error }, { operation, message: "<specific plain words>" }); }`.
- **U admin local**: `catch { setStatus(t("Could not ...")) }` -> API call: `setStatus(describeApiError(error, t("Could not ...")))`;
  local (browser API, local code): keep the inline text, then `if (isClipboardRefusal(error)) return;`
  (clipboard only) and `publishLocalAdminFailure(...)`.

## 4. Worked examples already in the tree (read the matching one before a site of that variant)
- U: `apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts` `copyHtmlEmbed` (+ `apps/admin/src/features/menus/__tests__/html-embed.unit.test.tsx`)
- P: `apps/website/src/server/inbound/public-http/routes/mail-feedback.ts` (+ `mail-feedback.unit.test.ts` beside its tests)
- T: `apps/website/src/server/runtime/composition/peer-site-reads.ts` `isCurrentSite` (+ `peer-site-reads.registry-failure.unit.test.ts`)
- L: `apps/desktop/src/nested-sites-migration.ts` (+ `apps/desktop/src/nested-sites-migration.test.ts`)
- L (two-arg logger + one-string port): `apps/desktop/src/desktop-agent.ts` failed-start catch,
  `apps/desktop/src/main/windows/site-window.ts` logout/stop catches, and their tests.

## 5. DO NOT
- paste a try/catch around a logger; paste `formatUserFacingError` / `adminFailureChannel.publish` blocks;
- log or show bare "Error" / the class only where the old line had the message;
- replace a message log with a class-only log (except the LS secret path);
- attach a parse error of untrusted input as cause;
- publish an admin incident for an API failure (already published) or for an expected refusal;
- log secrets, tokens, cookies, request bodies or the raw error object (`console.error(x, err)`);
- use a generic message ("Error", "Something went wrong", "failed");
- drop the cause anywhere you touch.

## 6. Sites to change (73 lines in 52 files, plus 2 helper files for #47 and #61)
Format: `path:line` - variant - current text - note.

### U admin local (3)
1. `apps/admin/src/features/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts:16` - U clipboard - `setCopyFeedback(t("Could not copy embed"))` - exact copy of the menu example: capture the generation before the await, `catch (error)`, keep the text, `isClipboardRefusal` -> return, else `publishLocalAdminFailure({ message: "The taxonomy embed code could not be copied.", action: "Try Copy HTML embed again. If it keeps failing, copy details and report this problem.", step: "Copy taxonomy embed code", cause: error }, { generation })`. Test: `apps/admin/src/features/taxonomy/__tests__/use-taxonomy-html-embed.unit.test.tsx`.
2. `apps/admin/src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts:74` - U API - `t("Could not save note.")` - `write.mutate` is an API call: `catch (error) { ... message: describeApiError(error, t("Could not save note.")) }`. No publish.
3. `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:1832` and `:1834` - refusal reword only - both `throw new Error("Could not open the link.")` -> `throw new Error("This link is not a valid https:// address, so it was not opened.")`. A refused link is NOT an incident: no publish, no cause.

### L formatErrorForLog (30)
4. `apps/desktop/src/main/boot/site-backend.ts:162` - `ports.warn("tovu-desktop: desktop tools listener unavailable; retrying automatically.")` (one-string port: append `Cause:`)
5. `apps/desktop/src/owner-store-ipc.ts:194` - `log('tovu desktop: the older shared-key store could not be checked; it was left in place.')` - shared-key store: if the try reads key values use LS.
6. `apps/desktop/src/product-telemetry.ts:26` - `warn('[product-telemetry] native crash reporting is unavailable')`
7. `apps/desktop/src/project-ipc.ts:552` - "shared discovery is unavailable; showing local website cards."
8. `apps/desktop/src/project-ipc.ts:778` - "could not remember the created website folder; ..."
9. `apps/desktop/src/project-ipc.ts:1089` - "could not remove the erased website from the shared catalog."
10. `apps/desktop/src/shared-sites.ts:174` - `report("tovu desktop: shared catalog bookkeeping is unavailable; ...")`
11. `apps/desktop/src/shared-sites.ts:218` - "could not remember the opened website in the shared catalog."
12. `apps/desktop/src/site-folders.ts:141` - "legacy sites folder import could not complete; ..."
13. `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts:163` - "[agent-plugins] automatic tool guidance unavailable"
14. `apps/website/src/features/consent/region-plugins.ts:55` - "[consent] region readers could not be loaded; ..."
15. `apps/website/src/features/consent/region-plugins.ts:73` - "[consent] browser bridges could not be loaded"
16. `apps/website/src/features/consent/service.ts:166` - "Cookie preferences were published, but the public preview could not refresh. ..."
17. `apps/website/src/features/forms/protect-existing-files.ts:32` - `warn('... Details: FORMS_LEGACY_FILE_PROTECTION_INCOMPLETE.')` - keep the code, append `Cause:`.
18. `apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts:133` - `log('[site-preview] native capture failed')`
19. `apps/website/src/platform/db/sqlite/database-journal-repo.ts:329` - "[restore-points] Could not prune older restore points."
20. `apps/website/src/server/inbound/assistant/agent-daemon-core-client.ts:80` - "[agent-daemon] telemetry serialization failed"
21. `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:1064` - "[agent-plugins] automatic preflight unavailable"
22. `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:41` - "The cookie preferences client could not be loaded. ..."
23. `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:411` - "The cookie preferences extensions could not be loaded. ..."
24. `apps/website/src/server/runtime/boot/site-key-boot-notice.ts:90` - `safely(log, ["[site-key] could not determine ..."])` - the try inspects site key material: use LS. `safely` logs each array element as its own line, so append to the same string: `` `[site-key] could not determine whether this server has usable site key material. Cause: ${describeErrorForLog(error)}` ``; keep the why-comment.
25. `apps/website/src/server/runtime/composition/commerce.ts:79` - "Commerce activation cannot be confirmed. ..." (one-string `warn`: append `Cause:`)
26. `apps/website/src/server/runtime/composition/commerce.ts:232` - "Commerce is unavailable; the rest of the site remains online."
27. `apps/website/src/server/runtime/composition/commerce.ts:326` - "The catalog is unavailable; ..." (`return []` stays)
28. `apps/website/src/server/runtime/composition/commerce.ts:332` - "The catalog is unavailable; ..." (`return null` stays)
29. `apps/website/src/server/runtime/composition/modules/assistant-byok.ts:670` - "[agent-plugins] automatic BYOK preflight unavailable"
30. `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts:768` - "[assistant-run-finalizer] attempt resource cleanup unavailable"
31. `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts:171` - "[agent-plugins] automatic preflight unavailable" (`return pinnedPrefix` stays)
32. `apps/website/src/server/runtime/composition/plugin-credential-cards.ts:52` - "Optional manifest cards could not be loaded; ..."
33. `apps/website/src/server/runtime/services/external-mcp-admissions.ts:37` - "external-mcp server admissions read failed"

### LS describeErrorForLog, secret path (10) - the why-comment or the text already says secrets are involved
34. `apps/website/src/features/analytics/forwarding.ts:94` - "[analytics] vendor forwarding skipped: resolution failed"
35. `apps/website/src/features/deployments/static-publish/adapter.ts:594` - "[static-publish] the form receiver key could not be saved; ..."
36. `apps/website/src/features/deployments/static-publish/publish-run.ts:181` - "[static-publish] destination history write failed after publish"
37. `apps/website/src/features/newsletter/delivery/tool-registrations.ts:181` - "[newsletter] delivery fan-out failed after launch; ..."
38. `apps/website/src/features/newsletter/send-pipeline.ts:388` - "[newsletter] pending delivery requeue failed after resume; ..."
39. `apps/website/src/features/newsletter/tool-registrations.ts:329` - "[newsletter] confirmation request could not be processed; ..."
40. `apps/website/src/features/project-keys/attached-vault.ts:20` - "... Details: P25_SHARED_READ_FAILED; secret values omitted." - keep the text.
41. `apps/website/src/features/project-keys/attached-vault.ts:47` - "... Details: P25_SHARED_LABEL_READ_FAILED; ..." - keep the text.
42. `apps/website/src/features/publish-content/peer-transport.ts:661` - "[publish-content] destination history write failed after remote apply"
43. `apps/website/src/server/runtime/composition/provider-config-source.ts:164` - "... Details: P25_SHARED_PROVIDER_READ..." - keep the text.

### R rethrow with cause (5)
44. `apps/desktop/src/site-directory-identity.ts:38` - `throw new Error("This copied website could not start because Tovu could not give its folder a separate identity.")` - add `{ cause: error }` from the enclosing catch.
45. `apps/desktop/src/smoke-packaged-chat-gate.ts:273` - `throw new PackagedChatSmokeError("Packaged SQLite returned invalid evidence JSON.")` - dev smoke tool reading its own DB: add `{ cause: error }` (`PackagedChatSmokeError extends Error` takes it already).
46. `apps/desktop/src/smoke-packaged-chat.ts:98` - `throw new PackagedChatSmokeError("chat.db contains invalid event JSON.")` - same.
47. `apps/website/src/features/site-backup/share-service.ts:111` - `SiteShareRefusal({ code: "DELETE_FAILED", ... })` - widen `SiteShareRefusal` (`apps/website/src/features/site-backup/share-policy.ts:35`) optional arg to `{ cause?: unknown } = {}` and pass `{ cause: error }`.
48. `apps/website/src/features/site-backup/share-service.ts:123` - same, remote deletion/purge.

### RES keep the result, add one L log line (11)
49. `apps/website/src/features/deployments/deploy-ops/registry.ts:96` - `buildRegistry([], ["deploy ops were not loaded: ..."])`
50. `apps/website/src/features/consent/service.ts:133` - `blockingProblems.push({ code: 'RENDER_FAILED', ... })`
51. `apps/website/src/features/consent/service.ts:191` - `deploymentRefusal({ problems: [{ code: 'CONSENT_UNAVAILABLE', ... }] })`
52. `apps/website/src/features/publish-content/backstop-preview.ts:40` - `unavailableReason: "These values could not be inspected safely. ..."` - values may be secret: LS log.
53. `apps/website/src/features/site-backup/import-backend-steps.ts:155` - `{ ...required.row, error: "Site created with its owner. Start it from Sites to open admin." }`
54. `apps/website/src/features/source-control/commit-site.ts:500` - `{ ok: false, code: "PROVIDER_ERROR", ... }` - provider with credentials: LS log (`describeErrorForLog`).
55. `apps/website/src/features/source-control/provider-registry.ts:124` - `toRegistry([], ['bundled source-control provider sources could not be read'])`
56. `apps/website/src/platform/dev-supervisor/dev-restart.ts:76` - `resolve({ accepted: false, reason: "Could not confirm the restart with the dev supervisor." })`
57. `apps/website/src/platform/dev-supervisor/dev-restart.ts:83` - `reason: "Could not send the restart request to the dev supervisor."`
58. `apps/website/src/server/runtime/composition/commerce.ts:271` - `reason: 'Commerce configuration could not be read; ...'`
59. `apps/website/src/server/runtime/composition/commerce.ts:294` - same text.

### S split catch-all (4)
60. `apps/website/src/server/inbound/admin-http/routes/agent-plugins/memory.ts:40` - every `writeNote` failure -> 422 "note path, text or size is invalid". The thrower (Jini `createPluginMemory`) throws plain `Error`s for invalid path/text/size and lets filesystem errors through; a filesystem error has a string `code` (e.g. `EACCES`, `ENOSPC`). So: `catch (error) { if (isNodeSystemError(error)) { sendAdminFailure({ res, error }, { operation: "agent-plugins:write-note", message: "The note could not be saved." }); return false; } <existing 422>; return false; }` with a local 1-line predicate `typeof (error as { code?: unknown })?.code === "string"` written without `as any`/`!` (e.g. `error instanceof Error && "code" in error && typeof error.code === "string"`).
61. `apps/website/src/server/runtime/composition/modules/assistant-byok.ts:465` - every attachment failure -> 400. The expected refusal is thrown at `apps/website/src/server/inbound/assistant/byok-message-attachments.ts:16` (`throw new Error("Attachment is unavailable. Reattach it before sending.")`): export `class AttachmentUnavailableError extends Error` there, throw it, and in the route: `instanceof AttachmentUnavailableError` -> the existing 400; else `sendAdminFailure({ res, error }, { operation: "assistant-byok:attachments", message: "The attachment could not be prepared." })`.
62. `apps/website/src/server/inbound/assistant/tool-access-lowering-route.ts:27` - catch-all 503 "Couldn't stop affected answers after tool access changed." - variant A: `catch (error) { sendAdminFailure({ res, error }, { operation: "tool-access:lower", message: "Couldn't stop affected answers after tool access changed." }); }`. The 200/503 by `failedRunIds` above stays.
63. `apps/website/src/features/deployments/static-publish/inspection.ts:74` - `ToolInputError('CREDENTIAL_RESOLUTION_FAILED: ...')` - credential path: add `console.warn("[static-publish] saved connection could not be resolved for inspection", describeErrorForLog(error))` then keep the ToolInputError unchanged.

### P public/visitor route (6)
64. `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:98` - `console.error('[consent] save failed'); res.status(503)...json({ error: 'Your choice could not be saved. ...' })` - P JSON, operation `consent:save`.
65. `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:313` - `'[consent] public context unavailable'` + 503 JSON - P JSON, `consent:public-context`.
66. `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:346` - `'[consent] static loader unavailable'` + 503 JS - P JS comment, `consent:static-loader`.
67. `apps/website/src/server/inbound/public-http/routes/site/products.ts:90` - 500 HTML "The product catalog could not be loaded" - P HTML, `products:catalog`.
68. `apps/website/src/server/inbound/public-http/routes/site/products.ts:123` - 500 HTML "This product could not be loaded" - P HTML, `products:detail`.
69. `apps/website/src/server/runtime/composition/commerce-http.ts:54` - 503 HTML "The shop catalog is temporarily unavailable." - P HTML, `commerce:storefront`.

### A admin-gated route (3)
70. `apps/website/src/server/inbound/public-http/middleware/theme-page-preview.ts:254` - 500 plain text "preview render failed". This route answers plain text into a preview frame, so do NOT send the JSON envelope: `const { errorId } = reportServerFailure({ error, operation: "theme-preview:render" }, { tracker: res.locals.adminFailureTracker }); res.status(500).type(PLAIN_TEXT).send(\`The preview could not be rendered. Reload the preview; if it keeps failing, report error ${errorId}.\`)`.
71. `apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts:108` - 500 JSON "preview reload failed" - A: `sendAdminFailure({ res, error }, { operation: "theme-preview:refresh", message: "The preview could not be reloaded." })`.
72. `apps/website/src/server/inbound/admin-http/routes/sites/warm-site-control.ts:46` - `console.warn('tovu dev: warm site management host is unavailable.')` + 503 JSON - A: replace both lines with `sendAdminFailure({ res, error }, { operation: "warm-sites:control", message: "The dev site manager is unavailable. Return to the original dev server." })`.

## 7. Defect fixes (from the D-shard review)
D1. `apps/website/src/server/runtime/lifecycle/local-site-process.ts:225` `cancelRetirement()` throws on a non-204, which masks the original error at `apps/website/src/platform/site-dir/local-site-supervisor.ts:142` (inside a `catch (error)`) and `:162` (`catch (error) { await entry.child?.cancelRetirement?.(); throw error; }`). Make `cancelRetirement` non-throwing like `tryRetire` just above it: on a non-204 `diagnostics.record({ level: "error", message: \`Could not cancel site retirement: HTTP ${response.status}\` })`; wrap the request in `.catch` that records `Could not cancel site retirement: ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}`. Test: the supervisor rethrows the ORIGINAL error when cancel fails.
D2. "no site key" is matched by message text at `apps/website/src/server/inbound/admin-http/publish-trust-auth.ts:228`, `:258` and `apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts:133`. The prefixed throw is `apps/website/src/features/webhooks/keyring.env.ts:149` ("no site key: none of the configured sources resolved (...)"); the exact "no site key" message comes from a keyring outside this file. Export `isNoSiteKeyError(error: unknown): boolean` from `keyring.env.ts` next to that throw, holding the one copy of the existing two-shape check (`error instanceof Error && (error.message === "no site key" || error.message.startsWith("no site key: none of the configured sources resolved ("))`), and call it at all 3 sites. Do not change the thrown messages. Test: one unit test of `isNoSiteKeyError` (both shapes true, an unrelated Error false).
D3. Status matched by message: `apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts:314` compares `error.message === "the theme server responded with 404"`; the thrower is `apps/admin/src/features/pages/hooks/theme-canvas-dependencies.hooks.ts:15,20` (`throw new Error(\`the theme server responded with ${res.status}\`)`). Export `class ThemeServerResponseError extends Error { readonly status: number }` from `theme-canvas-dependencies.hooks.ts`, throw it there (same message), and test `error instanceof ThemeServerResponseError && error.status === 404`. `apps/admin/src/components/TemplateSource/template-source-dependencies.hooks.ts:17` throws the same text: leave it unless it is matched by message somewhere. `apps/desktop/src/renderer/use-site-workspace.hooks.ts:293` matches the full sentence "That project is not open. Open it first, then try again." thrown at `apps/desktop/src/project-ipc.ts:1252`: export that sentence as a constant from `project-ipc.ts` (`PROJECT_NOT_OPEN_MESSAGE`) and use it on both sides (IPC loses the class, so a message constant is the contract here). If the renderer cannot import from `project-ipc.ts` (main-process module), put the constant in `apps/desktop/src/contracts/` and import it from both.
D4. Logs on every poll: `apps/desktop/src/renderer/use-resources.hooks.ts:67` and `apps/desktop/src/product-memory-telemetry.ts:78` log on every failed poll. Log once per failure streak: a local `let failing = false;` set true when logging, reset on the next success; log only when it flips. Keep `describeErrorForLog` in the renderer file; in `product-memory-telemetry.ts` (main process) use `formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)`.
(D5, the four class-only log regressions, is DONE in commit 321fe38d3.)

## 8. Do not touch (no-change sites: input validation or expected refusals)
`apps/admin/src/features/posts/hooks/use-post-url-dialog.hooks.ts:37`, `apps/desktop/src/renderer/SharedKeys.tsx:144`,
`apps/website/src/assistant/byok-meta-tool-result.ts:94`, `apps/website/src/assistant/credential-chat-intake.ts:7`,
`apps/website/src/cli/commands/agent-plugin-tokens.ts:51`, `apps/website/src/cli/commands/import-local.ts:133`,
`apps/website/src/cli/commands/import-site.ts:32,51`, `apps/website/src/cli/commands/init.ts:146`,
`apps/website/src/features/agent-plugins/analytics-provider-registry.ts:65`, `apps/website/src/features/consent/config.ts:80`,
`apps/website/src/features/consent/readiness.ts:16`, `apps/website/src/features/consent/request.ts:25`,
`apps/website/src/features/media-generation/media-provider-registry.ts:126`, `apps/website/src/features/newsletter/unsubscribe.ts:80`,
`apps/website/src/features/publish-content/backstop-service.ts:115`, `apps/website/src/features/publish-content/peer-url.ts:98`,
`apps/website/src/features/publish-trust/session.ts:147`, `apps/website/src/features/site-backup/import-backend-steps.ts:57`,
`apps/website/src/features/site-inspection/live-url.ts:33,93`, `apps/website/src/features/theme/tool-registrations.ts:140`,
`apps/website/src/features/web-screenshot/web-screenshot.ts:139`, `apps/website/src/server/inbound/assistant/durable-run-routes.ts:19`,
`apps/website/src/server/runtime/composition/modules/assistant-byok.ts:425`, `apps/website/src/server/runtime/composition/modules/assistant-chats.ts:244`,
`apps/website/src/server/runtime/boot/local-owner-signin.ts:68,80,89`.
Also already done (do not redo): `use-menu-editor.hooks.ts` copyHtmlEmbed, `mail-feedback.ts`, `peer-site-reads.ts` isCurrentSite,
`nested-sites-migration.ts`, and the four D5 logs (`handshake.ts` `answered`, `site-window.ts`, `desktop-agent.ts`, `consent/settings.ts`).

## 9. Report (your final message)
Per site number: done / skipped (why) / variant changed (why). Per test file: red, green, mutation
red evidence (the assertion message). Files changed. Anything you could not do. No summary prose beyond that.
