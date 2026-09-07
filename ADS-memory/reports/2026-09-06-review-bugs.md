# Code-inspection bug hunt — commits of 2026-09-06

Reviewer: Programmer / Code Inspection persona (read-only). Scope: the 97 commits in
`git log --since="2026-09-06 00:00" --until="2026-09-07 00:00"`, reviewed as the code stands at HEAD
`9c7d16bf` (later commits `eb678ed3` onward landed while this ran and were not reviewed). Nothing was
run; nothing outside this file was written. Items already on
`2026-09-06-tovu-f6-outstanding-worklist.md` are excluded unless a *new route* to them was found.

Line numbers are HEAD unless marked WT (working tree — several files were being edited by live agents
during the review: `apps/desktop/main.cjs`, `assistant-byok.ts`, `apps/admin/src/lib/api.ts`, the
posts editor hooks).

---

## Findings, worst first

### 1. CONFIRMED — the admin SEO per-entry editor can only write `""`; it can never clear an override (new route to worklist B7)

`eb10f5de` shipped the primitive (`null` clears a key) but the only human-facing caller was never
wired to it, so the exact `{"description":""}` state worklist item 7 is trying to undo is still
one click away from recurring.

- `apps/admin/src/features/seo/Seo.tsx:243-327` — every text/URL field's `onChange` is
  `setField(key, e.target.value)`; clearing a field yields `""`, never `null`.
- `apps/admin/src/features/seo/hooks/use-seo-entry-panel.hooks.ts:74-76, 84` — `touched` is PUT
  verbatim.
- `apps/admin/src/lib/api.ts:928-940` — `SeoEntryOverridesPatch` has no `| null` member, so the UI
  cannot even express a clear.
- `apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts:63` — `patch: req.body ?? {}`
  passes `""` through.
- `apps/website/src/features/seo/write-service.ts:175-185` — `""` is not `null`, so it is stored.
- `apps/website/src/features/seo/seo.ts:210` — `overrides.description ?? settings.defaultDescription
  ?? deriveExcerpt(post)`: `""` wins over the site default.

**Failure scenario:** SEO → Pages & posts → pick an entry. The Description input shows the resolved
site default. Operator clears it meaning "go back to the default" → Save → `PUT {description: ""}`
→ row holds `{"description":""}` → public `<meta name="description">` is empty and `seo_analyze_entry`
reports `missing_description`. There is no way back from the UI: typing sets a real override, clearing
again re-stores `""`. Only the agent tool (`seo_set_entry_overrides` with `null`) or raw SQL can
repair it — which is exactly how `untitled-25` got stuck at version 4.

**Fix:** in the panel, map `""` → `null` for string/URL fields before PUT (and widen
`SeoEntryOverridesPatch` to `| null`); render "inherits site default" when a key is absent. Consider
also normalising `""` → clear in `write-service.ts` so every client benefits (behaviour change — needs
the owner's nod).

### 2. CONFIRMED — the fleet UI boot path (the default since `a53c80df`) never runs `reconcileOrphans`

- `apps/desktop/main.cjs:677-713` — the `fleetUiRequested()` branch builds `fleetCtx` (including
  `registryPath`), registers IPC and opens the fleet window; it never calls `reconcileOrphans`.
- `apps/desktop/main.cjs:638` — the only call is inside `bootOwnServerMode()`, which the fleet branch
  `return`s before reaching.
- `apps/desktop/main.cjs:420` — sites opened from a card still `recordSiteOpened(...)`, so registry
  rows are written in fleet mode and never read back.

**Failure scenario:** launch (fleet mode by default) → open a project card → `tovu serve` + its agent
daemon start → Electron is SIGKILLed / crashes / the user is logged out → relaunch → nothing reaps the
orphan → click the same card → `startTovuServer` allocates a new port and a *second* `tovu serve`
opens the same `content.db`; the orphan keeps running until the OS session ends. The crash-safety
registry (`site-registry.cjs`) now protects only env-var launches.

**Fix:** hoist `await reconcileOrphans(registryPath)` (with its log line) above the mode split in
`whenReady`, or call it in the fleet branch before `openFleetWindow()`.

### 3. CONFIRMED — the Projects screen seeds the repo's real `sites/tovu-com` as a card whose Delete `rm -rf`s it

Behaviour as designed for user-created projects, but the seed makes a git-tracked repo directory
holding Leona's 44 MB production database one confirm away from deletion.

- `apps/desktop/main.cjs:691` — `seedDevFallbackProject(fleetCtx.projectsPath,
  path.join(REPO_ROOT, "sites", "tovu-com"), classifySiteDir)`.
- `apps/desktop/src/project-ipc.cjs:116-130` — `handleDelete`: stop server → `untrackProject` →
  `fsp.rm(id, { recursive: true, force: true })`; `id` is the tracked `siteDir`.
- `apps/desktop/src/renderer/ProjectGrid.tsx:110-120, 175-215` — a trash button on every card and a
  single-click confirm overlay ("erases its install directory and all of its content").

**Failure scenario:** first launch of the desktop app → the "tovu-com" card exists → trash icon →
"Delete" → `<repo>/sites/tovu-com` (content.db, uploads, themes, agent-plugins) is removed. No
backup, no trash, and `git status` becomes a wall of deletions.

**Fix:** mark the seeded row `protected: true` (Delete = untrack only), or have `handleDelete` refuse
to `rm` any path under `REPO_ROOT` / any path not created by `handleCreate`.

### 4. CONFIRMED — standing-draft autosave discards `applied: false`; the route doc claims the client acts on it

- `apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts:164-166, 189-191` — `await
  port.putAutosave(entryId, draft)`; the `{ applied }` result is dropped.
- `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts:75-79` — "The client hook uses
  it to stop treating its own in-memory edit as current and to skip scheduling another autosave until
  the editor reloads the row." No such logic exists.

**Failure scenario:** Tabs A and B both open post v1. A saves (v2) and its hook clears the parked
draft. B keeps typing for an hour: every autosave PUT returns `applied: false` (`repo.sqlite.ts:
227-244` version guard) and is silently dropped; B sees no indication. B reloads → no banner (nothing
was ever parked) → the hour is gone. With `expectedVersion` now forwarded by the route (`9c7d16bf`)
and being wired into the editor, B's Save will 409 too — B's work is neither parked nor savable, in
precisely the concurrent-edit scenario today's work targeted.

**Fix:** expose a `staleBasis` flag from the controller when `applied === false`, stop scheduling,
and show "another save happened — reload to continue (your text is kept in this tab)"; optionally
fall back to `localStorage` for that tab.

### 5. PLAUSIBLE — flush-on-exit uses a plain `fetch` without `keepalive`; the reload/close case is not guaranteed

- `apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts:203-223` — `pagehide` /
  `visibilitychange` / `blur` → `flushPendingAutosave` → `port.putAutosave`.
- `apps/admin/src/lib/api.ts:1934-1943` — `request()` → `fetch` with the shared init; `keepalive`
  appears nowhere in `api.ts` (grep: zero hits).

A fetch started inside `pagehide` during a reload or tab close is not guaranteed to complete —
browsers may abort it with the document. `fetch(..., { keepalive: true })` (≤ 64 KB body) or
`navigator.sendBeacon` is the documented mechanism. The only browser verification recorded
(`10efb899`) is the in-app-navigation case, where the SPA outlives the unmount; the reload/close arms
the owner actually asked for ("what if they reload the page on accident") are unverified. The jsdom
unit test can only assert the call happened, so it passes either way.

Also: `window` `blur` fires when focus enters the preview `<iframe>`, so every click into the preview
issues an immediate PUT (harmless, but it defeats the debounce for that gesture).

**Fix:** `keepalive: true` on the autosave PUT when the body is under 64 KB (else the normal request),
then verify reload and tab-close in Chrome.

### 6. CONFIRMED at HEAD — a committed `[DEBUG]` stderr print in `assistant-byok.ts`

- `apps/website/src/server/runtime/composition/modules/assistant-byok.ts:95` (HEAD, from
  `2cd019cd`): `console.error("[DEBUG] contentDbPath=", routeDeps.contentDbPath, "TOVU_DB=",
  process.env.TOVU_DB);` — fires on every `createApp()`, i.e. every dev reload and every `tovu` CLI
  invocation (the module-load-time `createApp()`), printing the DB path to stderr.

The working tree already removes it as part of a live agent's larger uncommitted diff on this file;
make sure that lands, or strip the line separately.

### 7. CONFIRMED — every desktop launch mints a 30-day owner session that is never revoked

- `apps/website/src/server/inbound/admin-http/dev-auth.ts:297-312, 402-438` — boot-session
  redemption writes a `sessions` row with `SESSION_TTL_MS` (30 days,
  `Jini/packages/cms/src/identity/auth-service.ts:25`).
- `apps/desktop/main.cjs` — no `logout`/revoke anywhere (`closed`, `before-quit`, `handleDelete`
  only stop the child). The `persist:` partition keeps the previous cookie, which the new one
  overwrites, but the old row stays valid.

**Failure scenario:** N launches of a site → N live owner sessions on that site's server; none is
visible or revocable from the desktop, and a copied `content.db` carries them along. Low severity
(loopback-only minting), but it is a growing set of live credentials.

**Fix:** POST `/api/admin/v1/auth/logout` through the site's partition session in the window's
`closed` handler before `server.stop()`, or give boot sessions a short TTL.

### 8. PLAUSIBLE — the doc→html page conversion is guarded only client-side

- `apps/admin/src/features/pages/rules.ts:226-229` — `pageAcceptsHtmlBody` decides from the `page`
  loaded at mount.
- `apps/website/src/features/pages/html-document-store.sqlite.ts:195-200, 229-246` —
  `ensureHtmlFormat` drops `body_json` on conversion; its own doc says callers must not offer this
  on a page with authored content, and `routes/pages/update-html.ts` performs no such check.

**Failure scenario (TOCTOU):** an operator opens a brand-new (empty, doc-format) page; the assistant
(`content_post_update`) or another tab writes a Tiptap body to it; the operator types HTML and saves
→ `updatePageHtml` converts the row and the assistant's document is gone. The route is pre-existing;
`0b7b6de1` widened the editor path that reaches it (previously only html rows did).

**Fix:** `ensureHtmlFormat` should refuse when `body_json.content` is non-empty unless the caller
passes an explicit `force`.

### 9. Note for the pages optimistic-concurrency ticket (not a live bug)

`updatePageHtml` bumps `posts.version` (`ensureHtmlFormat` `version + 1`; `write()` is
version-conditioned). When `expectedVersion` is wired into the Pages editor's two-step save
(`use-page-editor.hooks.ts:411-425` — HTML first, then `updatePost`), sending `page.version` on the
second call will 409 every time the first call ran. Take the basis from the HTML write's result, or
send it only when no HTML write happened.

---

## Checked and found sound (no finding)

- Boot-session token (`15548bef`): loopback proven from `req.socket.remoteAddress`, single-use
  constant-time redeem, unarmed store refuses everything; route registered before the `/api/admin`
  gate (`modules/core.ts:42-43`) and after `express.json()` (`app.ts:914`); `mintSessionForPrincipal`
  is verified through the library's own `validateSession`; the desktop partition used for
  `redeemBootSession` is the same one `createWindow` gets.
- `chat_list_pending_attachments` scoping: the daemon's tool principal is `{ id:
  decoded.principalId }` from the run's `contextRef` (`agent-daemon-server.ts:662, 675`), and the
  upload's `ownerId` is the same `getAuthedPrincipal(res).id` stamped by `forwardAttachmentUpload` —
  the primitive is wired, and ownerless records are excluded by the store, not by this code.
- `updatePost` optimistic-concurrency (`be45461e`, `9c7d16bf`): not-found before version check,
  subclass branch ordered before `PostConflictError`, `expectedVersion` validated not cast, read-back
  assertions in the route test. (During the review `posts/update.ts` briefly appeared on disk with the
  two 409 branches swapped — the dead-branch bug the comment warns about — and reverted within a
  minute; `git diff` is clean. Consistent with a mutation sweep; confirm the tool cleans up.)
- Autosave version guard + serial request chain: traced save-during-debounce, typing-during-save and
  autosave-in-flight-during-save orderings; the `WHERE version = baseVersion` guard makes all three
  safe. Post restore is idempotent on the title node (`withTitleNode`, `posts/rules.ts:514-522`).
- AVIF: `image/avif` is in Jini's `DEFAULT_ALLOWED_MIME_TYPES`; client `accept` and
  `FILE_HANDLER_ALLOWED_MIME_TYPES` agree with the server.
- `pageEditorSurface` covers both arms of `ThemeCanvasStylingState` (`pending` | `ready`).
- Hop-by-hop stripping and the HTTP/2 `Connection` guards are correct (and inert while HTTP/2 stays
  off on `:3000`).
- `repairSite`/`readAppliedSchemaIdentity`: read-only open, every refusal before the first write,
  `config.json` cleaned up if `.site-meta.json` fails.

## Not covered

~60 `agentHandle`-tagging commits and all docs/design commits; the `Roles`/`SEO` tab conversions
beyond their tab-id logic; `PostEditor.tsx`/`PageEditor.tsx` JSX diffs; the Tovu-Runner renderer
port (`4c75f4c0`, `6a0bd61c`); desktop E2E specs; `0058` migration beyond the column add; test files'
assertion quality except where noted above. Uncommitted live-agent work (expectedVersion wiring in the
posts editor, desktop adoption chokepoint, `assistant-byok.ts` refactor) was not reviewed.
