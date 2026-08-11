# Recon: was the Pages template dropdown ever built?

Generated: 2026-08-11
Agent: Sonnet 5 subagent (`codebase-analyzer` persona), read-only. Verified against live source and a
read-only `sqlite3` query of `infra/content.db`; servers untouched.

**Verdict: never built.** The underlying mechanism exists and was proven live the same day, but no
admin UI surfaces it for Pages — and the missing UI left a render gate mis-scoped, which is an active
bug on the owner's live site.

---

## ⚠️ LIVE BUG — real pages render with the wrong template

`src/server/routes/site/pages.ts:546` gates the post-template branch on:

    theme.manifest.tier === "static" && post.bodyFormat === "doc" && theme.manifest.postTemplate.length > 0

It checks **`bodyFormat`, never `kind`** — despite a comment directly above it claiming the branch is
"deliberately scoped to Posts only." Pages and Posts share the `posts` table, distinguished by `kind`
(`post`/`page`) and `bodyFormat` (`doc`/`html`).

Live rows confirmed by direct DB read:

| slug | kind | body_format | template_choice |
|---|---|---|---|
| `terms-of-service` | page | doc | NULL |
| `privacy-policy` | page | doc | NULL |
| `contact` | page | doc | NULL |
| `team` | page | doc | NULL |
| `faq` | page | doc | NULL |
| `untitled`, `untitled-4` | page | doc | NULL |
| `our-story` | page | doc | `page-shell.html` |

Those legacy Pages predate the Pages-vibecoding HTML rework and are still `doc` format. With
`template_choice = NULL`, `resolvePostTemplate`'s "never chosen" arm falls back to the theme's
**first** `postTemplate` entry. Result, named in a same-day continuity handoff:

> **"Terms of Service renders as `<title>Blog post — Basic</title>`."**

Not cosmetic — it is the Post mechanism firing on Pages, triggered by a data-format artifact rather
than any user choice. **The owner has been told twice and has not directed a fix.**

`our-story` (`page-shell-demo`) is the single row with `template_choice` set, done by hand via raw
SQL `UPDATE` as a proof of concept — never through any admin control.

---

## Posts: the working round trip (the shape a Pages version would mirror)

- **UI** — `apps/admin/src/features/posts/PostEditor.tsx:387-406`. A `<select>` bound to
  `templateChoice`, populated from the active theme's `theme.json` `postTemplate` array. Real
  templates first, `"No template chosen"` (`""`) last. Rendered only when `bodyFormat === "doc"`.
- **Save** — `PUT` → `src/server/routes/admin/posts/update.ts:115` → `updatePost` →
  `src/features/post/repo.sqlite.ts` → column `template_choice` (`src/db/schema.ts:107`, migration
  `0028`, additive/nullable, no backfill).
- **Render** — `pages.ts:546` → `renderPostViaTemplate` (`pages.ts:298-324`) →
  `resolvePostTemplate` (`static-render.ts:459-485`) → `injectPostEmbedId` substitutes the real post
  id into the template's literal `{"id":"{{post}}"}` → `resolveHtmlPageEmbeds` resolves the now-real
  `{"type":"post"}` marker → `renderHtmlPageBody` splices it in → `renderStaticPage({htmlOverride})`
  applies token/asset/slot/menu/link treatment on top.

**`resolvePostTemplate` tri-state:** `null`/`undefined` = never chosen → theme's first template;
`""` = explicit opt-out → diagnostic page; a filename = explicit choice. (This is the tri-state whose
test rot was fixed earlier today in `c408ff7`.)

## Pages: what's missing

`apps/admin/src/features/pages/PageEditor.tsx` has **no template control at all** — title, slug,
status, and an HTML/Interactive/Preview toggle over a raw textarea / GrapesJS editor. Its own file
header: *"There is no Tiptap here, and there never will be."* A Page authored here is always
`bodyFormat: "html"`.

So the column is not page-specific; it is simply never written or read for a page, for two
independent reasons:

1. No admin surface sets it for a `kind: "page"` row.
2. The render gate requires `bodyFormat === "doc"`, and PageEditor only ever produces `"html"`.

**The two features are currently mutually exclusive by construction, not merely by missing UI.**

## Paper trail

It was **never specced**. No entry in `development/todos.md` (searched "template"), nothing in
`ADS-memory/specs/`. It appears only as an *open item* in
`ADS-memory/reports/continuity/2026-08-11-page-theme-composition-handoff.md`:

> "**Admin has no UI for any of this.** No template picker for Pages, no fork-a-theme action.
> `template_choice` was set directly in the database. The picker EXISTS but is only rendered in
> `PostEditor`, not the Pages editor."

Same doc records the working demo: *"Page `our-story` … Live at `http://localhost:3000/our-story` —
200, nav + footer inherited from `basic`, content injected, zero unresolved markers. This is the
working demonstration of the whole model."*

**The generic-embed-contract decisions (2026-08-05 / 08-07) are NOT the same decision.** Zero
mentions of "template" or "dropdown" in
`ADS-memory/reports/media-embeds/IMPLEMENTATION-PLAN-data-embed-type-2026-08-07.md`. That work is the
substrate a Pages picker would sit on, not a plan for one.

## Marker spine — confirmed current shape

- Attribute: **`data-embed-config`**, single, JSON-valued: `{"type":"…","id":"…", …}`. One scanner,
  `src/core/embeds/marker.ts:1-99` (`MARKER_PATTERN`), unified 2026-08-10 from four independent
  scanners across two vocabularies.
- **Page-embed-stage types** (`HTML_EMBED_RESOLVERS`, degrade to placeholder on failure):
  `widget`, `media`, `post`.
- **Theme-owned types**, deliberately outside that registry and resolved later by `static-render.ts`:
  `partial`, `menu`. `isPageEmbedType` returns false for these on purpose, so theme nav/footer is
  never blanked by the page-embed stage.
- `form` was retired 2026-08-10 (`47af7b2`), folded into `widget`.
- A generic **`content`** marker is explicitly **not built** — flagged as "the highest-value next
  step," called for by two independent peer reviews.
- `npm run check:embed-marker-drift` → `development/scripts/check-embed-marker-drift.ts`. Fails on
  retired attributes in real attribute position (HTML comments blanked first), unparseable
  `data-embed-config`, and legacy `activeAttr`. Scans 121 theme files **plus DB-stored Page bodies** —
  an earlier sweep missed the DB and one page silently broke.

## Correction to the earlier static-tier recon

The claim "`renderStaticPage` only understands `partial` and `menu`" is right in net effect but
imprecise in mechanism. A static-tier `postTemplate` file does carry a `{"type":"post"}` marker — but
it is resolved by the **caller** (`renderPostViaTemplate`, via `injectPostEmbedId` literal
substitution then `resolveHtmlPageEmbeds`) *before* `renderStaticPage` is invoked with
`htmlOverride`. `renderStaticPage`'s own marker handling still knows only `partial` and `menu`.

Also note: a `kind: "page"` / `bodyFormat: "html"` Page reached via the **generic** branch
(`pages.ts:551-553`, `resolveHtmlEmbedsForRender`) DOES get `resolveHtmlPageEmbeds` run on
`post.bodyHtml`. That is the Pages-vibecoding embed pipeline (SPEC-047) — already working, and a
different mechanism from the theme-template-file path Posts use.

## What blocks a real Pages picker

1. No UI control sets `template_choice` on a `kind: "page"` row.
2. Pages from PageEditor are always `bodyFormat: "html"`; the render gate demands `"doc"`. Mutually
   exclusive today.
3. The `pages.ts:546` missing `kind` check is an active bug, orthogonal to the picker, and must be
   resolved either way.
4. **No design exists** for what a template picker should mean for an `html`-format Page — there is
   no analog to `{{post}}` placeholder substitution for a Page's own bespoke body. This needs actual
   design, not just UI wiring.

## Handoff Contract

- **Inputs used:** live source across `PostEditor.tsx`, `PageEditor.tsx`, `pages.ts`,
  `static-render.ts`, `marker.ts`, `resolver-service.ts`, `schema.ts`; a read-only `sqlite3` query of
  `infra/content.db`; `development/docs/architecture/embed-type-inventory.md`; and today's continuity
  handoff.
- **Output summary:** the Pages template dropdown was never built and never specced; the mechanism
  works and is proven; the missing UI left a render gate mis-scoped that is breaking live pages.
- **Risks:** five real legacy pages (Terms, Privacy, Contact, Team, FAQ) currently render under a
  Post template on the live site.
- **Suggested next assignee:** owner decision on the `kind` gate first; design before implementation
  for the picker itself.
