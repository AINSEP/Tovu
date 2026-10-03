# Accidental publish to tovu.fly.dev (2026-09-26 ~22:38 UTC): live check

Read-only investigation. Live runs commit 18e3a3e0a. All code refs are at that commit (`git show 18e3a3e0a:<path>`).

## Verdict: PARTIAL WRITE

The whole `tovu-theme` theme-files tree was republished to live before the run aborted on the first form row. The complete per-row list exists only in live's `publish_content_runs` row (phase `failed`, `items_json`), which public GETs can't reach.

## 1. Transaction semantics at 18e3a3e0a

- **Checked before any write:** only `publish_content.apply`, the token, and the plan hash (`apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts:243-259`, then the gateway's own authorize). Each row's own write permission is checked per row, inside that type's `apply()` → `executeCommand` authorize (`features/publish-content/apply-loop.ts:451-461`).
- **No single transaction.** The gateway doesn't wrap `executeMutation` (`contracts/core/gated-mutations/gateway.ts:33`: each feature opens its own). The apply loop walks rows one after another, and each row commits on its own (`apply-loop.ts:728-749`).
- **On error:** a failure that isn't a conflict or row-level error is re-thrown (`apply-loop.ts:476-486`). The run is saved as `failed`, and completed rows stay in place with no rollback (`apply-loop.ts:750-771`). The route maps it to 500 INTERNAL_ERROR (`import.ts:92`).
- **Restore point:** captured inside `executeMutation` before any write (`features/publish-content/gated-hooks.ts:279-290`), after the costClass refusal (`features/publish-content/execute-import.ts:50-57`). It appears to be a database-file snapshot (local `restore-point-*.db` files follow that pattern), so theme files on disk are probably NOT covered. Not verified.
- **Row order** is the types' `dependsOn` order (`planner.ts:500-512`, `type-registry.ts:520-565`, registration order in `server/runtime/composition/publish-content-manifest.ts:51-65`): media → redirect → theme-files → **form** → content-type → taxonomy → term → post → page → menu → collection-entry → widget → widget-area → site-setting → active-theme. Only media, redirect and theme-files rows could run before the form failure.

## 2. Live state (public GETs only; local DB read with sqlite3 -readonly)

- **theme-files (tovu-theme): WRITTEN.**
  - Every `/theme-assets/tovu-theme/*` file probed has `Last-Modified: Sat, 26 Sep 2026 22:38:30 GMT`. The deploy's own assets (`/site-chat/*`) show 21:20:37 GMT, and other themes (basic-2, tailark-*, fashion-modern) show 01 Sep.
  - Live `css/theme.css` sha256 `ec8b4aa8…` is identical to local.
  - `render/pages/posts-2-sidebars.html` is untracked locally and was created 21:27 UTC, after the deploy. It now returns 200 on live, byte-identical to local (sha256 `b32e10ff…`).
  - Compared with the copy shipped in 18e3a3e0a (`content/themes/static/tovu-theme`), local has 15 changed files (theme.css, main.js, theme-toggle.js, theme.json, tokens.light.json, nav/footer partials, several render/pages) and 7 new ones. Live now serves the local version.
- **media: probably nothing written.** The plan screenshot (`owner-publish-all-order.png`) shows media rows as "Already up to date". Such rows only refresh the baseline record on live.
- **redirects: UNKNOWN.** Redirect apply writes with no permission check (`features/redirects/publish-content.ts:327-399`). The 15 local redirects created 2026-09-24 have override=0, and live has pages at each of those paths (all 200), so public GETs can't tell.
- **Local source records nothing:** `publish_content_runs` has 0 rows, and I found no saved copy of the plan.
- **Other writes on live:** staged bundle row, restore-point snapshot plus its row, run row (`failed`), baseline upserts for unchanged rows, and possibly uploaded blobs from the staging phase.

## 3. Why forms were refused

- The grant covers `form` (`deploy/publish-trust.json`), so this is not a grant or env problem. It's an entity-type name mismatch:
  - `withPublishTrustContentAuthorize` answers only when `typePermissions.get(params.entityType) === params.permission` (`server/inbound/admin-http/publish-trust-auth.ts:394-396`).
  - `typePermissions` is keyed by publish-type name (`import.ts:106-112`), which is `form` for forms (`features/forms/publish-content.ts:24-25`).
  - But the forms write service calls `executeCommand` with `entityType: "form_definition"` (`features/forms/write-service.ts:158`, also :231, :315).
  - The lookup misses and falls through to `publishTrustAuthorizeFor`, which denies `admin.forms.manage` as "outside this publishing grant" (`publish-trust-auth.ts:148-156`). That error isn't a row-level error, so the whole run aborts with a 500.
- **HEAD does NOT fix it.** `publish-trust-auth.ts`, `routes/publish-content/import.ts` and `features/forms/` are unchanged since 18e3a3e0a. After deploying HEAD, the next Publish hits the same 500 whenever a form row is ticked.
- **Same bug in active-theme:** it authorizes with `entityType: "presentation"` (`features/theme/active-theme-publish-content.ts:76`), so it is refused too, shown as "blocked" rather than a 500.

## Recommended next steps

1. Owner (signed in to live admin) reads live's newest `publish_content_runs` row or the Change sets list to get the exact landed rows, including any redirects.
2. Decide whether live keeps the new tovu-theme files. If not, undo the theme-files change set on live. The restore point likely doesn't cover files on disk.
3. Fix the entity-type lookup for forms (`form_definition`) and active-theme (`presentation`) before the next Publish. Until then, untick the 7 forms.
