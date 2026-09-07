# Code-inspection bug hunt — commits of 2026-09-01 through 2026-09-03

Reviewer: Code Inspection persona (read-only; nothing run, nothing outside this file written).
Scope: the 292 commits in `git log --since="2026-09-01 00:00" --until="2026-09-04 00:00"`
(Sep 1: 19, Sep 2: 79, Sep 3: 194), reviewed as the code stands at HEAD `6f32d027`. This window had
never been reviewed. Excludes anything already in `2026-09-06-review-bugs.md`,
`2026-09-06-review-architecture.md`, `2026-09-06-review-excess-code.md`,
`2026-09-04-to-05-review-architecture.md`, `2026-09-04-to-05-review-excess-code.md`,
`2026-09-04-to-05-review-bugs.md`, and the still-open item in
`2026-09-06-tovu-f6-outstanding-worklist.md`.

Given 292 commits (small for this repo's pace), effort went deep on writes/events/security/routing
rather than a shallow pass over everything. ~150 commits were skipped outright as out of this lens:
the ~40-commit "batch A-H" complexity-ceiling refactor sweep (mechanical extractions, no behavior
change claimed or found), the parallel coverage-only test-writing sweep (~60 commits, "test(...):
raise X to 100%"), docs/content/theme-template-naming commits, and dependency-republish chores.

---

## Findings, worst first

### 1. CONFIRMED — creating a post/page directly as `published` never fires `entry.published`; the sitemap cache silently goes stale with no TTL to self-correct

`updatePost`/`deletePost` route every draft→published/published→X status change through
`emitStatusTransitionEvent`, which enqueues `entry.published`/`entry.updated`/`entry.unpublished` so
SEO's sitemap-cache invalidation subscriber can react. `createPost` — the function backing BOTH
`POST /api/admin/v1/workspaces/:workspaceId/posts` and the pages route, and, more importantly, the
`content_post_create`/`content_page_create` assistant tools — never calls it at all, even though
creating directly with `status: "published"` is an explicitly validated, first-class, documented
input, not an edge case.

- `apps/website/src/features/post/post.ts:769-823` (`createPost`) never calls
  `emitStatusTransitionEvent` or `deps.outbox.enqueue`, in contrast to `:443` (trash) and `:977`
  (`updatePost`), which both do.
- `apps/website/src/features/post/post.ts:719-724` (`resolveCreateStatus`) validates a caller-supplied
  `status` against `draft`/`published` and defaults to `draft` only when *absent* — `published` at
  creation is a supported, reachable input, not something the type system or validation blocks.
- `apps/website/src/features/post/post.ts:1011-1031` (`emitStatusTransitionEvent`) —
  `classifyStatusTransition(undefined-as-draft, "published")` would resolve to `"entry.published"` if
  it were ever called from `createPost`; it isn't.
- `apps/website/src/features/post/agent-tools.ts:419-440` — `content_post_create`'s own tool
  description: *"Creates a new post or page. Always starts as 'draft' unless status is explicitly set
  to 'published'."* `status` is a documented enum parameter (`["draft", "published"]`) on the create
  tool, not just the update tool.
- `apps/website/src/server/inbound/admin-http/routes/posts/create.ts:98-111` and
  `.../pages/create.ts` (same shape) forward `req.body.status`/the tool's `status` straight into
  `createPost` and never call `processOutbox` either (moot here, since nothing is enqueued to drain).
- `apps/website/src/server/runtime/composition/app.ts:930` —
  `routeDeps.bus.subscribe("entry.published", ... seoEventSubscriptions.onEntryPublished)`.
- `apps/website/src/features/seo/sitemap.ts:29` — `sitemapCache = new Map<string, string>()`, no TTL,
  cleared only by `invalidateSitemapCache` (the three event handlers, `:194-199`) or an explicit
  `seo_regenerate_sitemap`/admin "regenerate" call.

**Failure scenario:** `sitemap.xml` has already been served once for a workspace (crawler hit, or
warmed at boot), so `sitemapCache` holds an entry. The assistant is asked to "write and publish this
post" and calls `content_post_create` with `status: "published"` in one shot (its own tool
description recommends exactly this usage) — or an API client does the same directly. The post is
created and publicly live immediately, but no `entry.published` fires, so the cached `sitemap.xml`
is never invalidated. The new post is permanently absent from the sitemap until some UNRELATED post
in the same workspace is separately updated/published/unpublished (which invalidates the whole
workspace's cache as a side effect) or the process restarts. This is the same class of gap
`6c499cf0` (09-03 17:13, in this same window) fixed for entries/content-types — that audit checked
`content-types/register.ts`/`update-fields.ts` and confirmed they enqueue nothing, but never checked
`createPost`'s own sibling gap on the post/page side.

**Fix:** call `emitStatusTransitionEvent(deps.outbox, "draft", post.status, post)` (or equivalent)
at the end of `createPost` when the created status is `published`, and drain the outbox in
`posts/create.ts`/`pages/create.ts` the same way `update.ts`/`delete.ts` already do.

### 2. CONFIRMED — `site-exporter.ts`'s redirect-stub HTML still has no scheme check on `location`; the exact class of stored XSS fixed everywhere else in this window, left open here by the fixing commit's own admission

Same window, same day: `a69f5892` (09-03 16:36) fixed a `javascript:`-scheme stored-XSS in
static-tier menu hrefs and explicitly listed sibling gaps still open; `0a41515c` (09-03 16:54) closed
the `render.ts` widget-IR siblings 18 minutes later. Neither commit touched
`platform/export/site-exporter.ts`, which `a69f5892`'s own commit message named as a live, disclosed,
"not fixed" gap: *"`renderRedirectStub()` escapes but does not scheme-check `location`."* It is still
true at HEAD.

- `apps/website/src/platform/export/site-exporter.ts:385-394` (`renderRedirectStub`) —
  `const safe = escapeHtmlAttr(location);` then embeds `safe` into THREE sinks: a
  `<meta http-equiv="refresh" content="0; url=${safe}">`, `<link rel="canonical" href="${safe}">`,
  and `<a href="${safe}">${safe}</a>`. `escapeHtmlAttr` only neutralizes quote/attribute-breakout
  characters — it does not touch the URL scheme, unlike `safeHref`/`static-render.ts`'s `safeHref`
  which this exact window added everywhere else a comparable sink exists.
- `:381` — the function's own doc: `location` is "whatever the live app's real 3xx response actually
  said," which traces back to an operator-authored redirect rule's target
  (`admin.redirects.manage`-gated, `routes/redirects/create.ts:69`) — the same "workspace member
  authors a string that ends up in an `href`" trust boundary the sibling fixes this window treated as
  attacker-controlled.

**Failure scenario:** an operator (anyone holding `admin.redirects.manage`, not necessarily the
owner) creates a redirect rule whose target is `javascript:alert(document.cookie)` (or `data:`, or a
protocol-relative host). A later static site export (`site-exporter.ts`'s job) writes a redirect stub
page for that rule. Any visitor who follows the old path lands on the stub; the browser's
meta-refresh may refuse a non-http(s) `url=`, but the always-rendered visible fallback link
`<a href="javascript:alert(...)">Redirecting to javascript:alert(...)</a>` executes the payload the
moment it's clicked, in the exported static site's own origin, on a page whose whole reason for
existing is to be linked from search results and old bookmarks.

**Fix:** run `location` through the same `safeHref` allowlist the two 09-03 commits just added
everywhere else (`static-render.ts`'s or `render.ts`'s copy — both are duplicated for layering
reasons per those commits' own notes; a third duplicate here follows the established pattern).

### 3. PLAUSIBLE — `sendUpdateMenuTreeError`'s catch-all 500 is self-flagged in-repo as masking a real 400-shaped validation bug, and was deliberately left unverified

`7e1cea7e` (09-03 15:53, restoring a `?? ""` fallback wrongly deleted under a bad coordinator brief)
recorded, without fixing: *"The one remaining gap is `sendUpdateMenuTreeError`'s default 500, left
deliberately uncovered — it maps to a real bug (a menu item with a missing/null `target` 500s instead
of 400ing, root cause in the Jini repo) rather than a test gap; asserting the 500 would enshrine it."*

- `apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts:34-48`
  (`sendUpdateMenuTreeError`) — `MenuValidationError`→400, `MenuConflictError`→409,
  `MenuNotFoundError`→404, everything else→`500 {"error": "internal error"}`.
- No Tovu-side test exercises a menu item with a missing/null `target` (`grep` of
  `admin-menus-routes.test.ts` for `target`+`null`/`missing`/`500` is empty), consistent with the
  commit's own "left deliberately uncovered."

**Why PLAUSIBLE and not CONFIRMED:** the alleged root cause (Jini's `updateMenuTree` throwing a raw
error instead of a `MenuValidationError` for this specific input shape) lives in the sibling `Jini`
repo, out of this review's scope per its constraints, and this review runs no tests. I can confirm
the Tovu-side symptom shape (a permissive catch-all that would 500 any error class the feature layer
doesn't explicitly classify) but not reproduce the specific missing-`target` trigger.

**Failure scenario (as described by the fixing commit, unverified by me):** an admin edits a menu in
the UI, removing or leaving blank an item's link target, and saves. The route returns
`500 internal error` instead of a `400` naming the bad field — the admin sees a generic server-error
toast for what is actually their own input mistake, and nothing routes them back to the offending
field.

**Fix (as the commit itself proposes):** trace the actual error class `updateMenuTree` throws for a
missing/null `target` and either have Jini raise `MenuValidationError` for it, or have this route's
error mapper recognize that error class as a 400.

### 4. PLAUSIBLE (low; already self-documented, not yet tracked as an open item) — `DELETE /workspaces/:id`'s guard is row-count-based, not identity-based; lets an admin delete the server's own live workspace once a second workspace row exists

Pre-existing risk, but its Tovu-side documentation was added/corrected in this window
(`1738b578`, 09-03 16:49) and it does not appear in the outstanding worklist or either prior bug
report, so it isn't currently tracked anywhere as a follow-up.

- `apps/website/src/server/inbound/admin-http/routes/workspace/delete.ts:22-40` — the route only
  ever accepts `:workspaceId === deps.workspaceId` (404s otherwise, `:24`) and always calls
  `deleteWorkspace({ input: { id: deps.workspaceId } })` (`:40`) — i.e. this endpoint can only ever
  target the running process's OWN workspace, never a different row.
- The guard inside `deleteWorkspace` (`@jini-ai/cms/workspace`, out of Tovu's tree) is
  `repo.list().length <= 1` — "refuse only if this is the last remaining row" — not
  "refuse if this is `deps.workspaceId`." The route's own doc comment (`:6-20`, corrected by
  `1738b578`) states this plainly: *"the moment a second, addressable workspace row exists, an admin
  can create it and then successfully DELETE this process's own `deps.workspaceId`, leaving the
  running app pointed at a workspace id that no longer resolves."*
- `apps/website/src/server/inbound/admin-http/routes/workspace/create.ts` exists and is reachable
  (gated by whatever `workspace.manage`-equivalent permission it declares), so "a second workspace
  row" is not hypothetical — it's one authenticated POST away.

**Failure scenario:** an admin (holding `workspace.manage`) creates a second workspace row (e.g.
experimenting, or scripting against the API), then calls `DELETE /api/admin/v1/workspaces/<the
original id>`. The row-count guard sees 2 rows, allows it, and removes the row `deps.workspaceId`
still points at in memory — every subsequent request in that process now operates against a
non-existent workspace id until restart. Not a privilege-escalation path (still gated), but a
straightforward self-inflicted outage with no code-level guard against it today.

**Fix:** the route's own comment already names the fix — add an explicit
`if (target.id === deps.workspaceId) refuse` check ahead of (or in addition to) the row-count guard,
independent of how many other workspace rows exist.

---

## Checked and found sound (no finding)

- **Member-access gating sweep** (`7fb47f55` → `9bf661e9` → `67b93b80`, 09-02/09-03): each commit
  explicitly named and closed the gap the previous one left (post page → content-API-by-slug →
  media-rendition/sitemap.xml/llms.txt). Verified no other public lister in
  `public-http/routes/site/*` (robots.ts, store.ts, products.ts) exposes gated post content; `llms.ts`
  was independently rewritten (09-04, outside this window) to derive from the same
  `computeIndexableEntries` sitemap.xml uses.
- **Taxonomy render-surface fix** (`ab3c01cc`, 09-03 10:20 — note: the commit at `64e6c029`,
  09-03 10:23, carries this SAME commit message text but is unrelated; its message was clobbered by
  the shared-git-index hazard already in memory — its actual diff is a credential-redaction fix in
  `credentialed-request.ts`, self-corrected via a `git notes` "CORRECTION" on the commit itself).
  Verified `renderViaTemplate` (static-tier, appends terms directly into its own returned HTML,
  `pages.ts:823`) and `renderGenericPostPage`→`renderSite`→`renderPostBody` (the other three tiers,
  via `SiteRenderContext.assignedTerms`, `render.ts:1400`) are mutually exclusive render branches —
  no double-render of the terms block on any tier.
- **Mail idempotency-key-per-batch-item fix** (`704f0a4c`): correct and complete for its actual
  target (Resend's HTTP adapter). Checked the sibling `SmtpMailerAdapter.sendBatch()`
  (`smtp.nodemailer.ts:178-186`) — it has the textually-identical "same opts reused across the loop"
  shape, but `send()`'s `_opts` parameter is unused (underscore-prefixed) for SMTP, which has no
  provider-side idempotency-key dedup mechanism; reusing the key there is inert, not a live bug.
- **`withToolFailureRecovery`'s `{saved: false}` fix** (`726511a4`): bounded to exactly one retry of
  the original call regardless of outcome — not an unbounded loop, and the new
  `remedyReportedFailure` check is additive to (not a replacement for) the existing
  `status !== "completed"` check.
- **Outbox-drain audit** (`6c499cf0`, 09-03 17:13): correctly identified and fixed all FOUR routes
  that enqueue but never drained (entries/create, entries/update, entries/lifecycle,
  content-types/lifecycle), and correctly ruled out content-types/register.ts and
  update-fields.ts (verified they never enqueue). The one sibling it didn't check is Finding 1 above
  (createPost/createPage never enqueue at all, so there's nothing for a drain call to help).
- **Restore-point idempotency fix** (`1738b578`): the idempotency-key check now runs before the real
  backup capture, mirrors the sibling `createRestorePoint` primitive correctly, and is covered by a
  same-key-returns-original regression test.
- **The two rounds of restored `?? ""`/`?? {}` fallbacks** (`a63534b5`, `7e1cea7e`, 09-03 15:30/15:53,
  undoing deletions from `e80f1eb9`/`69157f8c`/`9e416602`/`cec9d2bf` under a bad coordinator brief):
  cross-checked the full set of ten+six named files against `git diff <parent> -- <path>` per the
  commits' own stated verification method; both restorations are internally consistent and I found
  no further file in this window carrying an un-restored deletion of the same shape.

## Not covered

The ~40-commit complexity-ceiling "batch A–H" refactor sweep beyond spot-checking two of its claims
above (trusted as mechanical, not independently re-derived function-by-function); the ~60-commit
coverage-only test-writing sweep's assertion quality; the `agentHandle` tagging and admin BYOK/footer
UI split (`576a8316`/`6546ffab`/`f152ebad` and neighbors) beyond what's referenced above; the
custom-credentials reseal/username/token family (`86df1179`, `50e582b1`, `dc326086`, `a4fe6766`,
`8b7206f9`, `922f2ef6`) beyond the one retry-loop check in Finding-adjacent code; the
external-MCP OAuth AAD-versioning commits (`db7c002f`, `61d7185a`, `e3cb674a`, `ffb5ce44`); the
media-generation/provider-agnostic commits (`93146234`, `c7f3861b`, `24500310`); the desktop/admin
UI-only commits (sorting, tab merges, footer styling); docs/content/theme-naming commits; and, per
the task's hard constraints, nothing was run (no tests, no `tsc`, no build), and Jini
(`node_modules/@jini-ai/*` symlinks) was not read — Finding 3's root-cause claim rests solely on the
fixing commit's own message.

---

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WSRJGxMeru4jFPez4niaqA
