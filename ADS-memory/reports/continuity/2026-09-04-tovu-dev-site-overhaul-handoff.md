# tovu.dev site overhaul — session handoff

**Date:** 2026-09-04
**Branch:** `restructure/apps-website-phased`
**Prior session:** Opus 5, coordinator + 9 dispatched Sonnet subagents

---

## Why this work started

The owner asked for a subagent to read tovu.dev as a newcomer and say whether the docs
explained how Tovu works. The audit found something worse than thin docs: **the homepage
was the stock `basic` theme's unedited marketing demo**, selling a fictional product called
"Basic" with placeholder customer logos, a fake testimonial, and a fake free tier — because
no home page had ever been authored, and `GET /` could not render content at all.

Two audits were run and both reports are on disk:

- `ADS-memory/reports/2026-09-03-tovu-dev-docs-comprehension-audit.md` — newcomer read of the
  live site. Verdict MOSTLY: the doc corpus is genuinely decent, the front door was the problem.
- `ADS-memory/reports/2026-09-03-tovu-capability-ground-truth.md` — what Tovu actually ships,
  from code, so doc coverage can be measured against reality.

**The headline gap, still open:** the site documents roughly a dozen concepts; the product
ships ~27 shipped admin capability areas. Undocumented and shipped: media, forms, members,
newsletter, comments, redirects, SEO, taxonomy, widgets, analytics, change-sets, deployments,
external MCP, API keys, agent plugins.

---

## What landed (14 commits, all verified against the running server, not from agent claims)

**Content-owned homepage** — `710b6cf4`, `ae4fecdc`, `82186ed3`, `a99576d4`
A Page can now claim the literal slug `"/"`, gated to `kind: "page"` (posts are for articles).
`GET /` looks it up and renders it through the same template path `GET /:slug` uses; with no
such page it falls back byte-identically to the theme's `index.html`. Shared `postPublicPath`
helper at `apps/website/src/platform/routing/routing.ts:118`.

**Content restructure** — `acbd454a`, `3f7aa466`
19 pages / 0 posts. All 8 doc "posts" recreated as pages (`kind` is immutable — `post.ts:714`
— so this required delete-and-recreate; the owner approved losing revision history on those 8).
`documentation` → `docs` with a 301. Nav menus rewritten. `our-story`, `team`, `testing-page`,
and a stray `deepseek` article deleted.

**Post-previews marker** — `06f3ea87`, `462c4656`
A `{"type":"post-previews"}` marker so any page can host a post listing, since `GET /` was the
only route ever handed the post list.

**Admin link fixes for the root slug** — `45101306`, `6f09b603`, `58574a7e`, `17a5c5aa`
`pagePublicPath()` and `pageAdminPath()` in `apps/admin/src/features/pages/rules.ts`.
`pageAdminPath` prefers the slug and falls back to the id only for `"/"` (the admin router is
`/:slug`; a value containing `/` can never match). Fixed the Pages list, the Page editor's view
link and preview iframe, and two slug-collision links.

**Dev HTTPS scheme drift** — `014c36b8`
`51c59f5c` made the dev API server HTTPS-only and left three `http://` fallbacks stale:
`site-url.ts:14`, `deps.ts:928`, `admin-static.ts:116`. Also reset the stale `origin_settings`
row by deleting it and letting the corrected seed recreate it (proved the seed recreates on an
existing DB, not just a fresh one).

**Absolute canonical / og:url / og:image / sitemap loc** — `d4a10b35` (28 files)
Root cause was a literal `TODO(ADR-040)` at `routing.ts:125`: the origin-joining seam was built
and tested, then never wired up. New helper `apps/website/src/features/seo/absolute-url.ts`.

**Theme cleanup** — `5b8cd188`, `ef49a332`, `d0ab5eaa`, `b1f42e0e`, `ed7f5820`
All in the SITE copy (`sites/tovu-com/themes/static/basic/`); the stock theme
(`content/themes/static/basic/`) is deliberately untouched because it is the sample every new
user installs. Landing shell replacing the fictional hero, footer Resources column converted to
an admin-editable menu embed, nav CTA repointed to `/download`, `publishedPages` emptied (so
`/pricing` `/signin` `/signup` `/blog` now 404 instead of serving fake pages), and `blog.html`
reshaped into a reusable `listing-default.html` bound to `/articles`.

---

## The four things the owner named, plus what else is open

### 1. robots.txt `Sitemap:` line is relative — BLOCKS the owner's stated goal

The owner explicitly wants tovu.dev freely indexed by Google and AI crawlers. Today:

```
User-agent: *
Allow: /

Sitemap: /sitemap.xml
```

`Allow: /` is correct. **But the `Sitemap:` directive must be an absolute URL** — Google ignores
a relative one, so no crawler can currently find the sitemap.

The other two thirds of "sitemap done correctly" are already fixed: `<loc>` entries went absolute
in `d4a10b35`, and `/llms.txt` already returns 200 (the AI-crawler discovery equivalent).

**The blocker is narrow and known:** `buildRobots` (`apps/website/src/server/inbound/public-http/routes/site/sitemap.ts`)
takes a `{settingsRepo}`-only deps shape with no path to `originRegistry`. It needs the same
threading `d4a10b35` did for `GetEntryMetaDeps`/`SeoSitemapDeps`/`SeoToolDeps`. Reuse
`toAbsoluteUrl`/`resolveWorkspaceOrigin` from `features/seo/absolute-url.ts`; do not write a
second joiner. Remaining step after that is submitting the sitemap in Google Search Console,
which only matters once they deploy.

### 2. Sites nav link — good idea, but NOT a nav link as described

Owner's ask: a "Sites" item in the admin left nav to switch between `sites/<name>/` by activating
one, so developers don't need the desktop app. Plus: should a flag hide it on Tovu-Runner?

**Why it is not a nav link:** `siteDir()` (`apps/website/src/server/runtime/composition/deps.ts:199`)
resolves from `TOVU_SITE_DIR`/`TOVU_SITE` **at boot**, and content.db, uploads, and themes all
bind off it at the composition root. A running server cannot swap its own database out from
under itself. Two honest options:

- **Activate writes the choice and triggers a restart.** Acceptable for a developer running
  locally; the screen is really a supervisor UI, not a router.
- **Make site a per-request dimension.** Correct long-term, but touches every port. A real project,
  not a screen.

**On the flag — invert the owner's framing.** Do not build a Runner-specific hide. Build a
capability flag meaning "this deployment can switch sites": Runner turns it OFF (it already
supervises processes and switches natively, so two UIs would be redundant), local dev turns it ON,
and a hosted multi-tenant deploy turns it OFF and uses **workspaces**, which already exist and are
the correct axis there. This matches the owner's standing "modular + reversible, data over code"
constraint.

Related known trap: `reference_daemon_inherits_cwd_not_site_dir` — the daemon resolves the site
from cwd and can open the WRONG site's DB. Worth reading before designing this.

### 3. The pages / copywriting pass — the actual overhaul, untouched

`/`, `/download`, and `/articles` are one-line placeholders. There are **no install instructions
anywhere** — `/quickstart` starts at `tovu init my-site` with no step for how a person obtains the
`tovu` CLI, which both audits called the single worst gap. And the ~15 shipped-but-undocumented
capabilities listed at the top of this file need pages.

**Do item 4 below BEFORE writing landing copy** — otherwise the CSS workaround becomes permanent.

The owner explicitly acknowledged these pages will drift and asked to be sure we come back to
them. A promise is not a mechanism. Cheapest real guard: the capability inventory is derived from
a typed `capability-inventory.ts`, so a `check:` gate that fails when a shipped capability has no
doc page would catch drift automatically. Note from memory: **no `check:*` gate can currently fail
a build** — see `project_tovu_check_gates_all_report_only`.

### 4. `.post-detail-header` is baked into the marker type — real debt, do it first

Discovered during theme cleanup and not anticipated: `{"type":"content"}` markers always resolve
through `resolveContentTypeEmbeds` → `renderWidgetPostContent`, which **unconditionally** wraps a
doc-format target in `.post-detail-header` (an `<h1>` plus a date byline). That is in application
code, not the template, so no template can opt out, and `PUT /posts/:id` has no field to change a
Page's `bodyFormat`.

The theme-cleanup agent was scoped out of `apps/website`, so it hid the node with a scoped CSS rule
(`sites/tovu-com/themes/static/basic/css/theme.css:356`, `.landing-content .post-detail-header
{ display: none; }`). It works visually and is well documented in place, **but the landing page now
emits an `<h1>Home</h1>` and a date that are `display:none`** — a page whose only h1 is hidden is an
SEO liability, which directly conflicts with goal #1.

Proper fix: make the header wrapper a property of the template or content type rather than of the
marker type, then delete the CSS rule.

### 5. Everything else not gotten to

- **`tovu init` should seed a `/` page.** Deliberately left out of scope when the root-slug work
  landed. Without it, every new install still starts on the theme's demo homepage — the exact trap
  that caused this whole session. Highest-leverage small item on this list.
- **`/plugin-api`** is published but linked from nowhere (orphaned since before this session).
- **Weak doc pages**: `welcome` reads like an internal QA note (stray `console.log`, "build the
  skateboard first"), `self-hosting` and `how-plugins-work` are stubs.
- **`/contact` ships live placeholders** — "support@example.com — replace with your real address",
  "link to your GitHub repository".
- **`use-pages.hooks.ts:117`** navigates by id after `createPage`; not a bug (it was never
  slug-based) but inconsistent with `pageAdminPath` now. Owner's call.
- **Two pre-existing test failures** in `apps/admin/src/features/posts/__tests__/posts-agent-drive.unit.test.tsx`
  — unrelated to this work, do not chase, but do not let them mask a real failure either.
- **Dev server needs a restart** to clear a leftover `CACHE-PROBE-…` sentinel from its in-memory
  theme snapshot. Disk is clean and the tree is committed — nothing shipped — but the running
  server still renders it in the footer.
- **Deploy: explicitly deferred by the owner.** None of this has reached tovu.dev; production still
  shows the "Basic" homepage. Note deploys come from a **separate public mirror repo**
  (`github.com/leonaburime-ucla/Tovu`), not this checkout — `gh` run from here answers about the
  wrong repo. See `reference_tovu_deploys_from_a_separate_public_mirror`.

---

## Traps this session paid for — read before dispatching

- **`apps/admin` tests must run from INSIDE `apps/admin`** (`cd apps/admin && npx vitest run <path>`).
  Running them from the repo root via `--prefix`/`--root` spuriously fails 3 CSS-fixture suites on
  ENOENT because `process.cwd()` resolves wrong. `apps/website` is the exact opposite — it must run
  FROM the repo root. Both trees use `process.cwd()`; the cwd rule is inverted between them.
- **`apps/website` uses the Node runner via tsx; `apps/admin` uses vitest.** Pick by path.
- **Passing several test files as argv to one `node` invocation silently runs only the first.**
  One explicit path per invocation, and check the reported test count.
- **A scoped test run proves nothing about files it never loaded.** An agent reported green on its
  own file while leaving 3 red assertions in a sibling file that its change had broken.
- **This repo's `tsc` excludes test files**, so widening a deps interface breaks test fixtures that
  `tsc` will not catch.
- **`validateTemplateDeclarations` fails theme load** if a `theme.json` `templates` entry has no
  matching content marker — the manifest entry and its marker must land in the SAME commit or the
  whole site breaks. And never prepend to `templates`; `templates[0]` is the Post fallback.
- **Soft-delete keeps a trashed row's slug reserved forever**, so delete-then-recreate-at-same-slug
  409s. Rename to a scratch slug first, then delete, then create.
- **The dev API server snapshots theme content in memory at boot** — a theme file edit only goes
  live after a restart. Restart procedure: SIGTERM the `dev.mjs` orchestrator, never child PIDs.
- Shared working tree: stage explicit paths only, uniquely-named commit message files, verify with
  `git log -1 --format=%B`.
