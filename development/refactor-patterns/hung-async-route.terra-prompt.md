# Terra job: wrap hanging async Express handlers with asyncRoute

READY (2026-11-13). This prompt is self-contained; `development/refactor-patterns/hung-async-route.md` in the repo is background only.

Repo: the Tovu clone you are given (Tovu only; do not touch Jini or `apps/desktop`).

## Why
The website runs Express 4, which ignores the promise an async route returns. An `await` that fails outside the handler's own `try` leaves the request open until the browser times out. `asyncRoute` (already in the repo: `apps/website/src/server/inbound/shared/async-route.ts`) forwards that rejection to `next(error)`, so the app's existing error path answers (admin API: plain-words 500 with incident details; public: Express's 500 page; an SSE stream that already sent headers is closed). Its signature: `asyncRoute({ handler }: { handler: AsyncRouteHandler }): RequestHandler & { readonly handler: AsyncRouteHandler }`.

## What to do, per row
Open the file, find the registration call at the listed line (if it moved, find the same route string in the same file), and wrap ONLY the async function argument, using the row's variant:

| Variant | Before | After |
|---|---|---|
| H1 inline | `app.get(P, async (req, res) => { BODY });` | `app.get(P, asyncRoute({ handler: async (req, res) => { BODY } }));` |
| H1 with route middleware before it | `app.put(P, mw({...}), async (req, res) => { BODY });` | `app.put(P, mw({...}), asyncRoute({ handler: async (req, res) => { BODY } }));` |
| H1 typed params | `async (req: Request, res: Response) => {` | unchanged inside `asyncRoute({ handler: ... })` |
| H2 named handler | `app.get("/x", page);` | `app.get("/x", asyncRoute({ handler: page }));` — wrap at EVERY registration of that name; do not edit `page` itself |
| H3 middleware (use) | `app.use(async (req, res, next) => { BODY });` | `app.use(asyncRoute({ handler: async (req, res, next) => { BODY } }));` |
| H4 stream (SSE) | as H1 | as H1; nothing else (no custom error frame, do not swallow the error) |

The closing `});` of the handler becomes `} }));`. Add the import once per file, relative path with `.js` like the file's other imports, counting folders up to `server/inbound/`, e.g. from `server/inbound/admin-http/routes/system/x.ts`: `import { asyncRoute } from "../../../shared/async-route.js";`. From `apps/website/src/assistant/x.ts` use `import { asyncRoute } from "#src/server/inbound/shared/async-route";`.

Two already-done examples to copy: `apps/website/src/server/inbound/admin-http/dev-auth.ts` (`GET /api/admin/v1/auth/me`) and `apps/website/src/server/inbound/admin-http/routes/settings/events.ts` (SSE).

## Do NOT
- Do not move awaits into the existing `try`, add `try/catch`, or change any response text, status or comment. One wrap per registration, nothing else.
- Do not wrap sync handlers or ones already passed through another wrapper.
- No `eslint-disable`, `as any`, non-null `!`; never delete or move a comment (a comment above the handler stays above it).
- Tests: do not change tests, except one case: a test that reads a wrapped route straight out of Express's router (`route.stack[...].handle`) instead of through `extractRouteHandler`/`lastRouteHandler` must pass that function through `unwrapRouteHandle` from `#src/server/__tests__/helpers/unwrap-route-handle` (see `public-http/routes/site/__tests__/pages.route.test.ts`). The two helpers already unwrap.
- Run NO test suites. You may run single files: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <one file>`. Leave nothing running.

## Done check
`node development/scripts/bug-class-audit.mjs --repo tovu=$PWD --out /tmp/terra-hung` then `/tmp/terra-hung/hung-express-handler.tsv` must have no `tovu` rows. Report any row still present with the reason. `rg -c "asyncRoute\(\{ handler" <file>` gives one hit per fixed registration. Run `npx eslint <changed files>` (no new errors).

Commit once: `git add -- <paths> && git commit -F msg -- <paths>`, message "fix(website): forward async route rejections to the error handler (asyncRoute)". Never push.

## Sites (48; all Tovu)
| # | file:line (the route argument to wrap) | route | variant |
|---|---|---|---|
| 1 | `apps/website/src/assistant/mcp-ui-tool-calls-route.ts:319` | POST MCP_UI_TOOL_CALLS_PATH | H1 inline |
| 2 | `apps/website/src/server/inbound/admin-http/dev-auth.ts:837` | GET /api/admin/v1/auth/me/password-status | H1 inline |
| 3 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:131` | POST /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth/connect | H1 inline |
| 4 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:156` | GET EXTERNAL_MCP_SIGN_IN_PATH | H1 inline |
| 5 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:190` | POST /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth/device/poll | H1 inline |
| 6 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:240` | DELETE route | H1 inline |
| 7 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:250` | POST route | H1 inline |
| 8 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts:76` | POST /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/probe | H1 inline |
| 9 | `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts:78` | GET BASE_PATH | H1 inline |
| 10 | `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts:87` | PUT BASE_PATH | H1 inline |
| 11 | `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts:108` | DELETE BASE_PATH | H1 inline |
| 12 | `apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts:52` | GET BASE_PATH | H1 inline |
| 13 | `apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts:55` | POST BASE_PATH | H1 inline |
| 14 | `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts:145` | PUT path | H1 inline |
| 15 | `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts:180` | GET path | H1 inline |
| 16 | `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts:196` | DELETE path | H1 inline |
| 17 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:158` | GET BASE_PATH | H1 inline |
| 18 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:181` | POST BASE_PATH | H1 inline |
| 19 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:201` | PUT `${BASE_PATH}/:id` | H1 inline |
| 20 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:216` | DELETE `${BASE_PATH}/:id` | H1 inline |
| 21 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:267` | GET BASE_PATH | H1 inline |
| 22 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:284` | POST BASE_PATH | H1 inline |
| 23 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:311` | PUT `${BASE_PATH}/:id` | H1 inline |
| 24 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:333` | POST `${BASE_PATH}/:id/verify` | H1 inline |
| 25 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:353` | DELETE `${BASE_PATH}/:id` | H1 inline |
| 26 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:263` | GET BASE_PATH | H1 inline |
| 27 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:279` | POST `${BASE_PATH}/reveal` | H1 inline |
| 28 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:288` | POST `${BASE_PATH}/generate` | H1 inline |
| 29 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:307` | POST `${BASE_PATH}/import` | H1 inline |
| 30 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:312` | GET `${BASE_PATH}/start-fresh` | H1 inline |
| 31 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:317` | POST `${BASE_PATH}/start-fresh` | H1 inline |
| 32 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:130` | GET PROVIDERS_PATH | H1 inline |
| 33 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:149` | GET BASE_PATH | H1 inline |
| 34 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:159` | POST BASE_PATH | H1 inline |
| 35 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:180` | PUT `${BASE_PATH}/:id` | H1 inline |
| 36 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:197` | DELETE `${BASE_PATH}/:id` | H1 inline |
| 37 | `apps/website/src/server/inbound/admin-http/routes/users/create.ts:76` | POST /api/admin/v1/workspaces/:workspaceId/users | H1 inline |
| 38 | `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:413` | USE <middleware> | H3 middleware (use) |
| 39 | `apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts:90` | POST /api/admin/v1/workspaces/:workspaceId/themes/preview-reload | H1 inline |
| 40 | `apps/website/src/server/inbound/public-http/routes/api-connections/oauth-callback.ts:101` | GET API_CONNECTION_OAUTH_CALLBACK_PATH | H1 inline |
| 41 | `apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts:190` | GET /commerce/return | H2 named handler |
| 42 | `apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts:191` | GET /commerce/cancel | H2 named handler |
| 43 | `apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts:131` | GET `${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/:serverId` | H1 inline |
| 44 | `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:660` | GET /m/:assetId/:transformSpec/:filename | H1 inline |
| 45 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts:18` | GET /newsletter/confirm | H1 inline |
| 46 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts:41` | GET /newsletter/unsubscribe | H2 named handler |
| 47 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts:42` | POST /newsletter/unsubscribe | H2 named handler |
| 48 | `apps/website/src/server/inbound/public-http/routes/site/pages.ts:3029` | GET /:slug | H1 inline |
