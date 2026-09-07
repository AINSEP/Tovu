# Architecture & DI review — commits of 2026-09-06

- Reviewer: Software Architect (dispatched, read-only; persona `AI-Dev-Shop/agents/software-architect/skills.md`)
- Scope: 99 commits `4b89cd09..eb678ed3` (10:22–17:42). Code read at HEAD, not just diffs.
- Focus (per Leona): dependency injection, layering/boundary violations, coupling, duplicated seams; plus the three known repo failure patterns (unwired sink, one-arm fix, multi-route symptom).
- Every finding is marked **CONFIRMED** (read the code, defect certain) or **PLAUSIBLE** (looks wrong, not fully proven). Ranked worst first.

## Findings

### F1 — CONFIRMED · HIGH · HEAD of `apps/website` does not type-check; a debug print is committed
`2cd019cd` ("drop the Connection header on HTTP/2 SSE streams") swept two unrelated hunks of another in-progress change into `apps/website/src/server/runtime/composition/modules/assistant-byok.ts`:

- `:95` `console.error("[DEBUG] contentDbPath=", routeDeps.contentDbPath, "TOVU_DB=", process.env.TOVU_DB);`
- `:98` `new SqliteToolAttemptAuditSink(openContentDb(routeDeps.contentDbPath))`

`RouteDeps` at HEAD (`apps/website/src/server/routes/types.ts:1199`, an intersection of `*Deps` interfaces all local to that file, no index signature) has **no `contentDbPath` member** — `git show HEAD:…/types.ts | grep contentDbPath` is empty. `git log -S` for both strings resolves to `2cd019cd`. The other half (`types.ts` +15, `deps.ts` +3, `app.ts` +4, and a lazy-sink rewrite of the same function) sits **uncommitted** in the working tree right now.

Why it matters: `tsc` on HEAD fails (TS2339); `tsx` strips types so the dev server and tests keep running, which is why nobody noticed. The 17:38 commit's "tsc exit 0" was measured on the working tree, not HEAD. This is the shared-index trap from memory: `git commit -- <path>` commits the whole file's working-tree state, including a teammate's hunks.

Fix: whoever owns the in-flight `contentDbPath` work must land or revert it as one commit (the in-flight diff already deletes the `[DEBUG]` line). Then see F2 before landing it as designed.

### F2 — CONFIRMED · HIGH (DI) · A module opens its own DB handle and reads `process.env`; the in-flight fix threads a *path*, not a *port*
`assistant-byok.ts:93-99` (`resolveToolAttemptAuditSink`) decides memory-vs-sqlite by reading `process.env.TOVU_DB` inside a composition *module*, then calls `openContentDb(...)` — which **auto-migrates** (memory: migrations auto-apply on the live DB) — to open a **second** `ContentDb` for the tool-attempt audit sink. The uncommitted fix keeps that shape and adds `contentDbPath: string` to `RouteDeps` (in-flight `types.ts:1051-1065`, `deps.ts:1370-1372`, `app.ts:670-673`) plus a lazy wrapper to defer the open.

This is exactly the anti-pattern the review was asked to find. The composition root `createSqliteRouteDeps` already holds `db` and already resolves `TOVU_DB`; it should construct the sink there and inject `toolAttemptAuditSink: ToolAttemptAuditSink` on `RouteDeps`. `app.ts`'s hermetic root injects the in-memory sink. That removes `openContentDb`, `process.env`, the lazy wrapper and the path field from the module in one move, and the module becomes testable with a plain fake. The in-flight doc for `contentDbPath` even concedes the hermetic root has "no real file of its own, so the global default is the only honest answer" — a field a root has to fake is the wrong abstraction.

Sibling: `agent-daemon-server.ts` builds its own `auditSink` the same way (the byok header says "mirrors … byte-for-byte"). It *is* a composition root, so constructing there is legitimate, but both should call one shared factory (`features/tool-audit`) rather than two hand copies.

### F3 — CONFIRMED · HIGH (one-arm fix) · Optimistic concurrency wired in 1 of 3 `updatePost` arms and 1 of 2 editors
`be45461e` added `expectedVersion` to `updatePost` (`features/post/post.ts:342, 897-905, 952`); `9c7d16bf` wired it into the Posts route and Posts editor:
- wired: `routes/posts/update.ts:41-73` (validated, 409 `VERSION_CONFLICT` split), `apps/admin/.../use-post-editor.hooks.ts:797-815`.
- **not wired**: `routes/pages/update.ts:22-24` (`Pick<UpdatePostInput, "title"|"slug"|"bodyJson"|"status">` — no field), `features/post/tool-registrations.ts:530-538` (`content_post_update` input literal `{workspaceId,id,title,slug,bodyJson,status}`), `apps/admin/.../pages/hooks/use-page-editor.hooks.ts` and `page-editor-port.hooks.ts` (zero occurrences).

The commit message scopes to "posts only … pages is a later ticket" — fine as a plan, but the Pages editor is the arm that just gained standing-draft autosave and the html data-loss fix, and it still clobbers silently; the agent tool can still overwrite a human's save with no error. PLAUSIBLE (not opened): `pages/update.ts`'s `sendPageUpdateError` lacks the `VERSION_CONFLICT` branch.

Fix: lift `parseExpectedVersion` + the 409 split out of `posts/update.ts` into a shared helper, use it in `pages/update.ts`; add optional `expectedVersion` to `content_post_update`'s schema and input; send `page.version` from `usePageEditor.save`.

### F4 — CONFIRMED · MEDIUM (one-arm fix) · "null clears an SEO override" landed in the agent tool; the admin UI still writes `""`
`eb10f5de` fixed `write-service.ts` (+`types.ts` `SeoExtFieldsPatch`, `agent-tools.ts` schema) so `null` removes an override, explicitly because an empty-string override "silently suppressed the site default". The HTTP route `routes/seo/put-entry.ts:63` passes `req.body` through, so it *can* carry `null` — but the admin client cannot produce one:
- `apps/admin/src/lib/api.ts:928-943` `SeoEntryOverridesPatch` has no `null` anywhere.
- `apps/admin/src/features/seo/Seo.tsx:244-327` `setField("title", e.target.value)` etc. — emptying a field stores `""`; `use-seo-entry-panel.hooks.ts:74-76, 84` sends `touched` verbatim.

So the human-facing arm still has the exact bug the server commit describes. Fix: widen `SeoEntryOverridesPatch` fields to `| null`; in `useSeoEntryPanel` map an emptied string to `null` (a pure rule, `rules.ts`-style) before `putSeoEntry`.

### F5 — CONFIRMED · MEDIUM (DI) · Boot-session token is a module singleton on a security route; the justification is false and the route is untested
`features/identity/boot-session-token.ts:105` creates `processStore` at module scope; `dev-auth.ts:18, 408` imports `redeemBootSessionToken` directly. The header claims the minting site (CLI) and redeeming site (route) have "no dependency path between them" — but `cli/commands/serve.ts:4-5` imports both `createApp` and `createSqliteRouteDeps` and *builds the very `deps` bag* `registerAuthRoutes(app, deps)` receives. The store should be created in `runServeCommand` and injected (`bootSessionTokens: BootSessionTokenStore` on `RouteDeps`, or on the `SessionAuthDeps` slice).

Consequences today: (a) no server-side test exercises `POST /api/admin/v1/auth/boot-session` — `grep boot-session` hits only the store unit test and the desktop client test; (b) every `createApp()` in a process shares one store (and `app.ts` constructs an `app` at module load — `app.ts:878` comment). The factory `createBootSessionTokenStore` already exists; only the wiring is wrong.

### F6 — CONFIRMED · MEDIUM (duplicated seam across a package boundary) · `dev-auth.ts` re-implements the identity library's private session minting
`dev-auth.ts:297-312` `mintSessionForPrincipal` writes a `sessions` row itself with `createHash("sha256").update(rawToken).digest("hex")`, duplicating `@jini-ai/cms/identity`'s private `hashToken` because the library exposes only `login()` (password-verifying). The author added a runtime fork guard (`:427-434` re-`validateSession`s the row) — good, and it keeps this from being HIGH — but the seam belongs in Jini: add `createSessionForPrincipal({deps, input:{workspaceId, principalId}})` next to `login`, delete the copy and the guard.

### F7 — CONFIRMED · LOW · A dead credential-seeding seam survives the "no site password" ruling
`apps/desktop/src/tovu-server.cjs:323-326, 449` still accepts `desktopCredential` and, when present, **overwrites** `TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD` in the child env. No caller passes it (`main.cjs:412-418`, `project-ipc.cjs`) and no `*.test.cjs` references it. `desktop-auth.cjs:42-45` keeps an unexported `DESKTOP_OWNER_USERNAME = "admin"` whose comment still says "the owner account this shell seeds and logs in as". Provably unreachable → delete (repo rule), before someone re-wires a shell-chosen password through it.

### F8 — PLAUSIBLE · LOW · Sibling tool missing from the search vocabulary
`agent-daemon-server.ts:73-79` registers `chat_list_pending_attachments`; `tool-search-keywords.ts:61` gained a row only for its sibling `media_promote_chat_attachment`. Daemon `search_tools` is FTS over id/description/keywords (`agent-daemon-server.ts:1149` `buildToolCatalogQuery(registry)`). Its description does contain "attached"/"files", so it may still rank; not verified against the eval. Add the row for parity.

### Minor
- `PageEditor.tsx:246`, `PostEditor.tsx:716` call `Date.now()` inside render for the banner copy — a clock read in a `.tsx`; `usePageEditor`/`usePostEditor` already own `recoverableDraft`, so compute the message (or `now`) there.

## Arms checked and found complete (no finding)
| Change | Arms verified |
|---|---|
| SSE `Connection` header guard (`2cd019cd`) | all 4 Tovu SSE writers: `site-assistant.ts:148`, `assistant-byok.ts:188`, `assistant-ag-ui.ts:412`, `settings/events.ts:117` |
| AVIF accept lists (`04806e6b`) | both admin mirrors (`Media.tsx:600`, `use-post-editor.hooks.ts:317-323`); no other `image/gif` list in `apps/*` |
| Standing-draft autosave | route kind-blind + registered (`modules/content.ts`); both editors wired (`use-page-editor.hooks.ts:292,459,508`; `use-post-editor.hooks.ts:504,754,828`); banners in both `.tsx`; flush-on-exit in the shared hook |
| `readAppliedSchemaIdentity` extraction | `content-db-schema-guard.ts` delegates; `repair-site.ts` read-only (`openContentDbReadOnly`), no `express`/`cli` import |
| Desktop `project-ipc.cjs` | every dependency injected; `startProject`/`stopProject` stubs are not called by the renderer |
| New media tools | daemon-only registration is correct (they need the daemon's `AttachmentStore`); principal scoping via `RUN_PRINCIPAL_HEADER` sits behind the bearer gate |

## Not reviewed
`apps/desktop/src/renderer/App.hooks.ts` (1025 lines), `fleet-chat-transport.ts`, `app.css`; the ~40 `agentHandle` tagging commits (spot-checked `Media.tsx` only); `Roles.tsx`/`Seo.tsx` tab conversions beyond the SEO patch path; `development/e2e/desktop-shell.spec.ts`; landing-page design commits; migration `0058` snapshot; `admin-dev-proxy.ts` beyond its diff. I did **not** run `tsc` against HEAD (would require reverting the shared tree); F1 rests on static reading of `RouteDeps` at HEAD. No tests were run, no files outside this report were touched.
