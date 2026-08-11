# Recon: how a theme expresses a non-literal value (dates, posts, "today")

Generated: 2026-08-11
Agent: Sonnet 5 subagent (`codebase-analyzer` persona), read-only. Verified against live source, not
the graph — Codebase Memory MCP was index-fresh at HEAD but blind to the session's uncommitted
theme/explore edits.

**Question that prompted it:** a theme page hardcodes
`<time datetime="2026-06-02">Jun 2, 2026</time>`. How is an author supposed to express a real value —
a post's publish date, or the current day?

---

## Short answer

On a static page, **you hardcode it, because nothing else is wired.** That is not an authoring habit;
it is the only reachable option today. The mechanism to fix it already exists and needs two wires, not
a new feature.

---

## Static tier: interpolated, but only two marker types

`renderStaticPage()` — `src/features/theme/static-render.ts:336-360`. **Not byte-for-byte.** Six
transforms run on every static page:

| transform | mechanism |
|---|---|
| token-CSS injection | string match/replace |
| `rewriteAssetPaths` | regex |
| `injectColorMode` | regex |
| `resolveSlots` | marker, `{"type":"partial"}` |
| `injectMenuEmbeds` | marker, `{"type":"menu"}` |
| `rewritePageLinks` | regex |

The marker mechanism (`data-embed-config='{"type":...}'`, one shared scanner at
`src/core/embeds/marker.ts`) is the real "this is not a literal" seam. `renderStaticPage` understands
**only `partial` and `menu`**.

## Tier map

`ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code"` (`theme.ts:33`; `code`
unbuilt). Dispatch at `render.ts:1294-1359`:

- `static` → `renderStaticPage` (home route only)
- `templated` → LiquidJS via `renderLiquidInSandbox` (worker_threads sandbox)
- `handlebars` → `renderHandlebarsInSandbox`
- `declarative` → `renderBlock(tree, ctx)`

## Context object — shared by three tiers, withheld from static

`ctx: SiteRenderContext`, built at `render.ts:1295-1308`, type at `render.ts:50-100`. Reaches the
Liquid/Handlebars workers via `workerData` (structured clone, not JSON — Maps survive).

Real top-level keys:

```
siteTitle, route, posts, post, products, product, themeName,
widgetRegions, widgetInlineResolved, mediaTransformVersions,
mediaAssetMetadata, pageHtmlEmbeds
```

**`renderStaticPage` never sees `ctx`.** That is the root of the gap.

## THE TRAP: there is no publish date on a post

`PostRecord` has **no `publishedAt`** — only `updatedAt` (`src/features/post/post.ts:44`). A doc
comment at `assistant/site/tools.ts:47` says naming it `publishedAt` "would tell the model something
false", so this was a deliberate call, not an oversight.

Consequence: wire dates onto `posts` and a blog listing shows the **last-edited** date. Fix a typo in
an old post and it reads as new.

A separate `entries` / `EntryRecord` table **does** carry a real `publishedAt` (`db/schema.ts:923`),
but it is not threaded into `SiteRenderContext` at all — today only the comments-closing feature reads
it (`comments/index.ts:104`).

**Decide which table backs public listings before any rendering code is written.**

## Dates today: exactly one site in the codebase

`renderWidgetPostContent`, `render.ts:873-886`:

```js
new Date(updatedAt).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" })
// → <time datetime="${updatedAt}">…</time>
```

Fires only when a `{"type":"post"}` marker resolves through
`resolveHtmlPageEmbeds` / `renderHtmlPageBody` (`widgets/resolver-service.ts` + `render.ts`), which is
wired **only for the single post-detail template** (`pages.ts:294-323`, `resolvePostTemplate`).

Worth copying: it derives the human string from the machine value in one place, so the `datetime`
attribute and the visible text cannot drift apart. Any new date rendering should keep that shape.

## Why markers are inert on marketing pages

Ordinary static pages (`blog.html`, `changelog.html`, `pricing.html`, `index.html`) are served by
`pages.ts:529` — `renderStaticPage({theme, pageId: slug, menus})`, no `htmlOverride` — and therefore
**never call `resolveHtmlPageEmbeds` at all**. A `{"type":"post"}` marker in `blog.html` is not
rejected; it is never scanned.

Verified hardcoded fake dates: `blog.html:28-64`, `changelog.html:23-47` (including the literal
`<time datetime="2026-06-02">Jun 2, 2026</time>` that prompted this recon).

## Partials, per tier

- **static** — the only tier where `DiscoveredTheme.partials` is populated at all (`theme.ts`,
  `loadStaticTierAssets`, tier-gated).
- **Liquid** — `include`/`render`/`layout`/`block` are LiquidJS defaults but are stripped by the
  allowlist (`liquid-allowlist.ts:10,32`). `skipLiquidAllowlist:true` widens the filter set, but the
  sandbox is `NO_ACCESS_FS` (`theme.ts:72-73`), so there is likely nothing to include from.
  *(Inferred, not runtime-verified.)*
- **Handlebars** — hard, non-optional refusal, no opt-out (`handlebars-allowlist.ts:264`: "partials
  are not available to themes").

## Theme JS runs on the real public page — confirmed

`rewriteAssetPaths` (`static-render.ts:31-35`) rewrites `src="../js/..."` to
`/theme-assets/{themeId}/js/...`; that prefix is served by `registerThemeStaticAssets`
(`src/server/middleware/theme-static-assets.ts:29`), mounted in the main composition at
`app.ts:895`. Its own doc comment states this exists because the static-tier branch rewrites assets
"before serving it as the live site's response."

Active `basic` ships five live scripts (theme-toggle, main, motion, reveal, hero-intro) that execute
in the visitor's browser. **No existing script computes a date client-side** (all of `basic/js/*.js`
checked).

## The JS read-only change is narrower than it sounds

`explore.ts` gains `READ_ONLY_GROUPS = new Set(["script","other"])` (`explore.ts:216-226`), blocking
`.js` through the Explore PUT/rename/reset routes. **Scoped to that one HTTP route file.**

The `theme_write_file` AGENT tool (`src/features/theme/tool-registrations.ts:184-198`, backed by
`writeThemeFile` in `theme-files.ts`) has **no extension or group restriction** and can still write
`.js` in a theme folder.

So the human point-and-click path closes; the write *capability* does not. Do not describe this as
"theme JS can no longer be edited."

---

## The gap, stated plainly

An author currently **cannot** express, on a static page:

- a real post's date, title, or excerpt (no `ctx`, markers unscanned)
- the current date/time server-side (no `now` in context)
- any listing driven by real content

…and if the wiring were added naively against `posts`, the date shown would be `updatedAt`, which
moves when the post is edited.

## Recommended shape (not implemented)

Two wires, not a feature: pass `ctx` into `renderStaticPage`, and route static pages through
`resolveHtmlPageEmbeds`. Then a real content date is a **third marker type**, reusing the existing
scanner — which is what the already-decided generic embed contract is for. Client-side JS remains the
right answer for "today", since only the browser knows the reader's timezone and a server-rendered
`now` collides with any future page caching.

## Handoff Contract

- **Inputs used:** live source reads across `src/features/theme/`, `src/server/http/site/render.ts`,
  `src/server/routes/site/pages.ts`, `src/core/embeds/marker.ts`, `src/db/schema.ts`,
  `src/features/post/post.ts`, the allowlists and sandboxes, and the live `basic` theme pages.
- **Output summary:** static tier interpolates but is deliberately context-free; dates exist in
  exactly one code path, keyed on the wrong field; markers are the correct seam and are already shared.
- **Risks:** building listings on `posts.updatedAt` produces dates that move; `entries.publishedAt`
  exists but is unthreaded.
- **Suggested next assignee:** Sonnet subagent for the `ctx` + `resolveHtmlPageEmbeds` wiring, after
  the owner picks `posts` vs `entries`.
