# 2026-09-07 — "Home page vanished from admin / broken preview" — could not reproduce

Agent K. Dispatched to investigate a page with `slug = "/"` that reportedly rendered
correctly on the live site, failed in preview, and vanished from the admin Pages list.

## DB facts (read-only, confirmed)

`sites/tovu-com/content.db`, `posts` table:

| id | title | slug | status | template_choice | updated_at |
|---|---|---|---|---|---|
| `2305703d-40a6-4cc4-b452-eccf1f9a91b0` | Home | `home` | published | `index.html` | 2026-09-07T18:47:57.701Z |
| `4f220108-5113-415a-a264-e787d13d2ec4` | Landing sample — xai | `/` | published | `pages-default.html` | 2026-09-07T18:48:12.116Z |

`posts_workspace_slug_unique` is a UNIQUE index on `(workspace_id, slug)`. These are two
**different** slugs (`home` vs `/`) — there is no DB-level conflict, and never was one:
only one row can ever hold the literal `/` slug at a time. The 15-second gap between the
two `updated_at` values is consistent with a manual two-step slug edit (rename the old
home away from `/`, then give the new page `/`) through the ordinary Page editor's Slug
field — there is no dedicated "Set as Home" feature in this codebase
(grepped `apps/admin/src`, `apps/website/src` for `setAsHome`/`isHomePage`/`homepage`:
nothing). So "set a page as home" = "edited its slug to `/`."

## Mechanism — why this was expected to work

`postPublicPath` (`apps/website/src/platform/routing/routing.ts:118-120`) is the one
place `slug -> path` conversion happens for the live site / SEO / menus: `"/" -> "/"`,
everything else `-> /${slug}`. Committed 2026-09-03 (`ae4fecdc`), well before today.

Three other surfaces each have their own **already-shipped, deliberate** handling of
the same root-slug case:

1. **Admin "My Pages" list** (`apps/admin/src/features/pages/rules.ts:53-91`):
   `pagePublicPath` (site-link column) and `pageAdminPath` (edit-link column, falls back
   to **id** instead of slug because the SPA route is `/pages/:slug` and a literal `/`
   can't be one path segment) — both explicitly documented as mirroring
   `postPublicPath`, admin is a separate deployed package with no server-source
   dependency so it can't just import the website's copy. Landed in commit `58574a7e`
   ("consolidate slug-vs-id page-editor path into `pageAdminPath`"), pre-dates today.
2. **Admin template-preview route** (`apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts:193`):
   calls `postPublicPath(post.slug)` before resolving menus — same helper, same fix.
3. **Static export route manifest** (`apps/website/src/platform/export/route-manifest.ts:294-306`):
   explicit "Content-owned homepage" handling — finds the post/page route that landed at
   path `/` and **replaces** the seeded `{ path: "/", kind: "home" }` entry with it,
   rather than emitting a duplicate `/` route.

None of these are new; none were touched by today's commits (`1499abc3`/`80defbc6` are
unrelated media `htmlAttributes`/slug work in `render.ts`/`resolver-service.ts`/
`pages.ts` — media attributes, not post/page routing).

## Live verification (this session, read/click only, no writes)

Checked the actually-running dev servers Leona has open, https://localhost:5173 (admin)
and https://localhost:3000 (site) — no restart, no data changes:

- **Admin "My Pages" list** (`/admin/pages`): "Landing sample — xai" is the **first**
  row (sorted by Updated desc). Site-link column reads `/` and points at
  `https://localhost:3000/`. Title-link column points at
  `/admin/pages/4f220108-5113-415a-a264-e787d13d2ec4` (id fallback, exactly as
  `pageAdminPath` documents). **Not missing.**
- **Admin PageEditor → Preview tab** (`/admin/pages/4f220108-...`): renders fully
  themed/styled, `pages-default.html` template applied, real content visible.
  **Not broken.**
- **Live public site** (`https://localhost:3000/`): serves "Landing sample — xai"
  correctly, full content confirmed via page text extraction. (Already expected to
  work per the dispatch.)

**I could not reproduce either reported symptom against the current code and current
DB state.** Screenshot of the working Preview tab and the full accessibility-tree dump
of the working admin list are in this session's tool transcript, not re-attached here.

## Answer to "is two published pages competing for home a legal state?"

Not really "competing" — only one row can hold the literal `/` slug at any instant
(unique index), so there is no ambiguity for the resolver to resolve either way. What
actually happened is a plain slug reassignment: the old home page (`Home`, `index.html`)
was renamed to `home`, then the new page (`Landing sample — xai`, `pages-default.html`)
was given `/`. Both are still `published`, so both remain independently reachable at
their own current slugs (`/home` and `/`) — that's an intentional, ordinary consequence
of slug-based routing, not an undefined state. If the second write (claiming `/`) had
failed instead of succeeding, the site would have briefly had *no* row at `/` and every
render path already has a defined (if not obviously advertised) fallback:
`route-manifest.ts`'s seeded `{path:"/", kind:"home"}` entry is exactly that fallback
description for the "no page claims `/`" case; the live `GET /` route (`routes/site/pages.ts`,
not modified in this investigation) would need separate confirmation of its own fallback,
but that path was not exercised here since the DB shows the second write succeeded.

## Conclusion / recommendation

No code change made — nothing reproduced to fix, and the standing rule here is not to
touch Agent J's in-flight files (`render.ts`, `resolver-service.ts`, `routes/site/pages.ts`,
media routes) without checking in first, which was moot since no defect was found in them.

Most likely explanation for what Leona saw: a **stale SPA tab** — if her `/admin/pages`
tab was left open spanning the ~15s gap between the two slug-edit saves (rather than a
fresh navigation/reload after both completed), `usePages`' `load()` has no in-flight
version guard (`apps/admin/src/features/pages/hooks/use-pages.hooks.ts:93-102`) and a
content-refresh-bus-triggered refetch fired mid-transition could theoretically resolve
out of order — but this is speculative; I did not observe it, and by the time this
investigation loaded a **fresh** `/admin/pages`, the list, preview, and live site all
agreed. Recommend: if this recurs, hard-refresh (not soft-navigate) the admin tab and
check whether the row reappears immediately, and note the exact tab/URL state (was it
open before the second save, or opened after) — that would confirm or rule out the
staleness theory above.

No commit needed (no files changed).
