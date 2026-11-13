# Terra job: wrap hanging async Express handlers with asyncRoute

NOT READY: dispatch only after "REMAINING WORK" steps 1-2 in `development/refactor-patterns/hung-async-route.md` are done.

Repo: the Tovu clone you are given. Read `development/refactor-patterns/hung-async-route.md` first; it is the whole spec.

For EVERY row below: open the file, find the registration call at that line, and apply the variant's before -> after shape from the decision table. Add the `asyncRoute` import once per file. Change nothing else. Line numbers are from 2026-11-13; if a line moved, find the same route string in the same file.

Rules: no `eslint-disable`, no `as any`, no `!`; never delete or move a comment out of place; do not touch tests except to fix imports; run NO test suites. When done, run `node development/scripts/bug-class-audit.mjs --repo tovu=$PWD --out /tmp/terra-hung` and confirm `/tmp/terra-hung/hung-express-handler.tsv` has no Tovu rows from this list; report any row still present with the reason.

Commit: `git add -- <paths> && git commit -F msg -- <paths>` once, message "fix(website): forward async route rejections to the error handler (asyncRoute)".

## Sites (50)
| # | file:line (the route argument to wrap) | route | variant |
|---|---|---|---|
| 1 | `apps/website/src/assistant/mcp-ui-tool-calls-route.ts:319` | POST MCP_UI_TOOL_CALLS_PATH | H1 inline |
| 2 | `apps/website/src/server/inbound/admin-http/dev-auth.ts:774` | GET /api/admin/v1/auth/me | H1 inline |
| 3 | `apps/website/src/server/inbound/admin-http/dev-auth.ts:836` | GET /api/admin/v1/auth/me/password-status | H1 inline |
| 4 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:131` | POST /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth/connect | H1 inline |
| 5 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:156` | GET EXTERNAL_MCP_SIGN_IN_PATH | H1 inline |
| 6 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:190` | POST /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/oauth/device/poll | H1 inline |
| 7 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:240` | DELETE route | H1 inline |
| 8 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts:250` | POST route | H1 inline |
| 9 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts:76` | POST /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId/probe | H1 inline |
| 10 | `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts:78` | GET BASE_PATH | H1 inline |
| 11 | `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts:87` | PUT BASE_PATH | H1 inline |
| 12 | `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts:108` | DELETE BASE_PATH | H1 inline |
| 13 | `apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts:52` | GET BASE_PATH | H1 inline |
| 14 | `apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts:55` | POST BASE_PATH | H1 inline |
| 15 | `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts:145` | PUT path | H1 inline |
| 16 | `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts:180` | GET path | H1 inline |
| 17 | `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts:196` | DELETE path | H1 inline |
| 18 | `apps/website/src/server/inbound/admin-http/routes/settings/events.ts:363` | GET /api/admin/v1/workspaces/:workspaceId/settings/events | H4 stream (SSE) |
| 19 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:158` | GET BASE_PATH | H1 inline |
| 20 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:181` | POST BASE_PATH | H1 inline |
| 21 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:201` | PUT `${BASE_PATH}/:id` | H1 inline |
| 22 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:216` | DELETE `${BASE_PATH}/:id` | H1 inline |
| 23 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:267` | GET BASE_PATH | H1 inline |
| 24 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:284` | POST BASE_PATH | H1 inline |
| 25 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:311` | PUT `${BASE_PATH}/:id` | H1 inline |
| 26 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:333` | POST `${BASE_PATH}/:id/verify` | H1 inline |
| 27 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts:353` | DELETE `${BASE_PATH}/:id` | H1 inline |
| 28 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:263` | GET BASE_PATH | H1 inline |
| 29 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:279` | POST `${BASE_PATH}/reveal` | H1 inline |
| 30 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:288` | POST `${BASE_PATH}/generate` | H1 inline |
| 31 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:307` | POST `${BASE_PATH}/import` | H1 inline |
| 32 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:312` | GET `${BASE_PATH}/start-fresh` | H1 inline |
| 33 | `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:317` | POST `${BASE_PATH}/start-fresh` | H1 inline |
| 34 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:130` | GET PROVIDERS_PATH | H1 inline |
| 35 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:149` | GET BASE_PATH | H1 inline |
| 36 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:159` | POST BASE_PATH | H1 inline |
| 37 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:180` | PUT `${BASE_PATH}/:id` | H1 inline |
| 38 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:197` | DELETE `${BASE_PATH}/:id` | H1 inline |
| 39 | `apps/website/src/server/inbound/admin-http/routes/users/create.ts:76` | POST /api/admin/v1/workspaces/:workspaceId/users | H1 inline |
| 40 | `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:413` | USE <middleware> | H3 middleware (use) |
| 41 | `apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts:90` | POST /api/admin/v1/workspaces/:workspaceId/themes/preview-reload | H1 inline |
| 42 | `apps/website/src/server/inbound/public-http/routes/api-connections/oauth-callback.ts:101` | GET API_CONNECTION_OAUTH_CALLBACK_PATH | H1 inline |
| 43 | `apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts:190` | GET /commerce/return | H2 named handler |
| 44 | `apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts:191` | GET /commerce/cancel | H2 named handler |
| 45 | `apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts:131` | GET `${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/:serverId` | H1 inline |
| 46 | `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:660` | GET /m/:assetId/:transformSpec/:filename | H1 inline |
| 47 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts:18` | GET /newsletter/confirm | H1 inline |
| 48 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts:41` | GET /newsletter/unsubscribe | H2 named handler |
| 49 | `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts:42` | POST /newsletter/unsubscribe | H2 named handler |
| 50 | `apps/website/src/server/inbound/public-http/routes/site/pages.ts:3029` | GET /:slug | H1 inline |
