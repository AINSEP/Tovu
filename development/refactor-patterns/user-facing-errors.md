# User-facing errors: the rule, one mechanism per surface, and the site list

Status 2026-11-13: mechanism + 4 example sites landed on branch w3-dc (commits ee495812f, 8963c150c,
bfce1ebd6, ac7112b3c; Jini 501da27d4). E Part 1 was reverted (bcc5b013f) for a redo on this pattern.
2026-11-13 later: D regressions fixed (321fe38d3), admin fallback versions (9b37e33cc), Terra prompt
READY: `user-facing-errors.terra-prompt.md`. Section 7 lists what is left.

## 1. The rule
Every error a user sees = (1) plain words: what failed + what to do; (2) a "Copy details" block
(error ID, failed step, redacted cause, app + Jini version, time). The server logs the same incident
redacted under the same error ID. Never log secrets, tokens, cookies or request bodies. Never a
catch-all ("Error", "Could not open the link.") that drops the cause.

Not an incident (plain specific text only, no Copy details, no incident log):
- invalid user/model input: JSON.parse / new URL / schema of input the caller sent (CLI flags, stdin,
  tool input, form fields). Do NOT attach the parse error as cause: it quotes the input (may be a secret).
- expected refusals: not found, permission, a refused link (`javascript:`/non-https from a plugin),
  a browser clipboard refusal (`isClipboardRefusal`), rate limits, a webhook with a bad signature.
- local-owner sign-in "why not enabled" reasons (local-owner-signin.ts) — reason codes, not failures.

## 2. Mechanism per surface (exact signatures)
| Surface | Use | Lives in |
|---|---|---|
| Admin UI, failure of an API request | nothing extra: `lib/api.ts request()` already publishes 0/5xx with Copy details. Inline text: `describeApiError(error, t("<specific fallback>"))`. NEVER publish again. | apps/admin/src/lib/api.ts |
| Admin UI, local failure (browser API, local code) | `publishLocalAdminFailure({ message, action, step, cause }, { generation })` — capture `adminFailureChannel.getGeneration()` before the await | apps/admin/src/lib/admin-failure-channel.ts |
| Admin route (server) | `sendAdminFailure({ res, error }, { operation, message?, failure? })` (474 uses) | apps/website/src/server/inbound/shared/admin-failure.ts |
| Public/visitor route (server) | `const { errorId } = reportServerFailure({ error, operation: "<area>:<step>" }, { tracker: res.locals.adminFailureTracker })`, reply keeps visitor text + `errorId` only (JSON field; HTML `<p>Reference: ${errorId}</p>`; JS comment) | same file |
| Assistant tool | model-fixable input -> `throw new ToolInputError({ message: "<CODE>: what is wrong + how to fix" })`. Server fault -> `throw new Error("<what failed>", { cause: err })`: the tool transport (Jini daemon tool-recovery) mints the ID, logs redacted, user gets Copy details. Never ToolInputError for a server fault. | Jini core/daemon |
| Log-only (best-effort catch, nobody sees an error) | `console.warn("[area] <what failed>; <what continues>", formatErrorForLog({ error: err }, TOVU_ERROR_REDACTION_OPTIONS))` — redacted message + stack. If the try block touches secret material (credentials, vault, sealer, provider SDK with keys, DB rows with secret params — the existing why-comment says so), use `describeErrorForLog` (class + code only) instead. | `@jini-ai/core` + `@tovu/contracts/secret-redaction` |

`describeErrorForLog` never throws (Jini 501da27d4; website wrapper 8963c150c). Call it directly. In
apps/website import `#src/contracts/core/model-facing-tool-errors` and call `describeErrorForLog(err)`;
in admin/desktop import `@jini-ai/core/model-facing-tool-errors` and call `describeErrorForLog({ err })`.
`formatErrorForLog` (Jini core, never throws) keeps message + stack and redacts.
Generic parts already in Jini: formatUserFacingError, formatErrorForLog, describeErrorForLog,
describeRequestFailure, createFailureChannel, ErrorNotice. No new Jini API needed.

## 3. Decision table (before -> after)
| Variant | Before | After |
|---|---|---|
| L log-only | `catch { log("fixed text") }` | `catch (err) { log("<specific text>", formatErrorForLog({ error: err }, TOVU_ERROR_REDACTION_OPTIONS)) }` (secret path: `describeErrorForLog`). Port takes one string: append ``. Cause: ${...}`` |
| R rethrow | `catch { throw new X("fixed") }` | `catch (err) { throw new X("<same/specific>", { cause: err }) }` |
| V validation | `catch { return/throw "specific input message" }` | NO CHANGE (not an incident) |
| S split catch-all | one catch maps every failure to a 4xx/ToolInputError | `if (err instanceof <DomainValidationError>) <4xx/ToolInputError>; else` incident path for the surface |
| RES result | `catch { return { ok:false, reason: "fixed" } }` | keep the result text; add one L log line with the cause before returning |
| P public route | `catch { res.status(5xx).send(visitor text) }` | `catch (error) { const { errorId } = reportServerFailure(...); reply visitor text + errorId }` |
| A admin route | `catch { res.status(5xx).json({ error: "fixed" }) }` | `catch (error) { sendAdminFailure({ res, error }, { operation, message: "<specific>" }); }` |
| T tool server fault | `catch { throw new ToolInputError(...) }` for a fault | `catch (err) { throw new Error("<what failed>", { cause: err }) }` |
| U admin local | `catch { setStatus(t("Could not ...")) }` | API call: `setStatus(describeApiError(error, t("...")))`; local: inline + `publishLocalAdminFailure`; refusal: inline only |

Do NOT: paste a try/catch around a logger; paste formatUserFacingError/adminFailureChannel blocks;
log or show bare "Error"/class only where the old line had the message; replace a message log with a
class-only log; attach a parse error of untrusted input as cause; publish an admin incident for an
API failure (already published) or for an expected refusal; add new i18n keys without all locales.

Verify a site: one test file, red first (node --test --test-concurrency=1 <file> or vitest
--maxWorkers=2 <file>), assert the text, the cause/stack in the log, the error ID match, and that
secrets are redacted; mutate (drop the cause) and see red.

## 4. Examples landed (read these before editing a site)
- U: apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts copyHtmlEmbed (+ html-embed.unit.test.tsx)
- P: apps/website/src/server/inbound/public-http/routes/mail-feedback.ts (+ mail-feedback.unit.test.ts)
- T: apps/website/src/server/runtime/composition/peer-site-reads.ts isCurrentSite (+ peer-site-reads.registry-failure.unit.test.ts)
- L: apps/desktop/src/nested-sites-migration.ts (+ nested-sites-migration.test.ts)

## 5. Site list (E Part 1; line = clone HEAD after revert; variant chosen)
V (no change): AssistantDock.hooks.tsx:1832/1834 (refused link; reword to "This link is not a valid https:// address, so it was not opened." — no publish), use-post-url-dialog:37, SharedKeys.tsx:144, byok-meta-tool-result:94, credential-chat-intake:7, agent-plugin-tokens:51, import-local:133, import-site:32,51, init:146, analytics-provider-registry:65, consent/config:80, consent/readiness:16, consent/request:25, media-provider-registry:126, newsletter/unsubscribe:80, backstop-service:115, peer-url:98, publish-trust/session:147, import-backend-steps:57, live-url:33,93, theme/tool-registrations:140, web-screenshot:139, durable-run-routes:19, assistant-byok:425, assistant-chats:244, local-owner-signin:68,80,89.
U: use-menu-editor:353 (DONE), use-taxonomy-html-embed:16 (same as menu), use-agent-plugin-memory:74 (describeApiError).
L (formatErrorForLog): site-backend:162, nested-sites-migration:80 (DONE), owner-store-ipc:194, product-telemetry:26, project-ipc:552,778,1089, shared-sites:174,218, site-folders:141, automatic-agent-plugins:163, consent/region-plugins:55,73, consent/service:166, deploy-ops/registry:96 (RES), forms/protect-existing-files:32, playwright-site-preview-capture:133, database-journal-repo:329, agent-daemon-core-client:80, agent-daemon-scope:1064, site-cookie-consent:41,411, site-key-boot-notice:90, commerce:79,232,326,332, assistant-byok:670, assistant-run-finalizer:768, assistant-tool-exec:171, plugin-credential-cards:52, external-mcp-admissions:37.
L (describeErrorForLog, secret path per existing why-comment): forwarding:94, static-publish/adapter:594, publish-run:181, newsletter/delivery/tool-registrations:181, send-pipeline:388, newsletter/tool-registrations:329, attached-vault:20,47, peer-transport:661, provider-config-source:164.
R: site-directory-identity:38, smoke-packaged-chat-gate:273, smoke-packaged-chat:98, share-service:111,123.
RES (+L log): consent/service:133,191, backstop-preview:40, import-backend-steps:155, commit-site:500 (describeErrorForLog), source-control/provider-registry:124, dev-restart:76,83, commerce:271,294.
S: admin-http/routes/agent-plugins/memory.ts:40, assistant-byok:465, tool-access-lowering-route:27 (A), static-publish/inspection:74 (log describeErrorForLog then keep ToolInputError).
P: site-cookie-consent:98,313,346, products.ts:90,123, commerce-http:54, mail-feedback (DONE).
A (admin-gated, use sendAdminFailure): theme-page-preview:254, theme-preview-refresh:108, warm-site-control:46.
T: peer-site-reads:347 (DONE).

## 6. D-shard error-handling fix items (from REVIEW.md)
1. local-site-process.ts:225 cancelRetirement throws on non-204 and masks the original error at local-site-supervisor.ts:142,162 -> keep it non-throwing, record via diagnostics.record({ level: "error" }) like tryRetire.
2. "no site key" matched by message at publish-trust-auth.ts:228,258 and handshake.ts:131 -> export `isNoSiteKeyError(error)` (or a named class) next to the throw in features/webhooks/keyring.env.ts:149; use at all 3.
3. use-theme-canvas-styling.hooks.ts:313 404 by message; use-site-workspace.hooks.ts:575 by full sentence -> match a status/code field (or an exported constant from the thrower).
4. use-resources.hooks.ts:67, product-memory-telemetry.ts:78 log every poll -> log once per failure streak.
5. DONE 321fe38d3 (handshake.ts `answered`, site-window.ts x2, desktop-agent.ts x3, consent/settings.ts; tests red/green/mutation). Log regressions (old line had message/stack, D made it class-only) -> `formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)`: handshake.ts:168, site-window.ts:464, desktop-agent.ts:412, consent/settings.ts:37. Tests already assert the regression and must be changed first (red): consent/__tests__/adapters.test.ts:224, main/windows/site-window.test.ts:283, desktop-agent.test.ts:256,355.

## 7. Remaining (handoff)
- Run `user-facing-errors.terra-prompt.md` (READY: 73 lines in 52 files + section 6 items 1-4) on Codex
  Terra; review its diff (one reviewer), then commit. Deviations from section 5 written into the prompt:
  site-key-boot-notice:90 -> LS (it inspects site key material); theme-page-preview:254 -> plain-text
  reply + reportServerFailure (the JSON envelope would land in the preview frame); backstop-preview:40
  and commit-site:500 RES logs use describeErrorForLog; memory.ts:40 split = fs error (`code` string)
  is the incident; assistant-byok:465 split = new `AttachmentUnavailableError`.
- Server Copy details carry no app/Jini version (no server version source). How: add
  `apps/website/src/server/runtime/app-version.ts` exporting `SERVER_VERSIONS = { appVersion, jiniVersion }`
  read once at module load: Jini = `version` of `@jini-ai/core/package.json` (not in its `exports`, so
  resolve `require.resolve("@jini-ai/core")`, walk up to the folder whose package.json `name` is
  `@jini-ai/core`, read it with fs; on any failure "unknown"); app = `process.env.TOVU_APP_VERSION`
  (desktop passes `app.getVersion()` when it spawns the server; a plain `npm start` falls back to the
  root package.json version). Then spread them into the metadata of `unexpectedAdminBody`
  (shared/admin-failure.ts, the `formatUserFacingError(..., { ...context.metadata, ... })` call) and add them
  to the `reportServerFailure` log line. Test: site-share-errors unit test asserts both fields.
  Admin fallback (`publishAdminFailure` without approved server wording) now carries both (9b37e33cc).
- Jini 501da27d4 must be released before Tovu admin/desktop rely on the Jini `describeErrorForLog` being total.
- Admin tsc not run (heavy); every single test file touched passes.
