# DECIDED — one `templates` key, one `content` marker, type resolved from the row

Owner decision, 2026-08-11. Supersedes the `postTemplate` / `pageTemplate` split shipped earlier the
same day (commits `3ee2838`, `f27f27d`). **Not yet implemented.** Dispatch when `PageShell` has landed
— it is currently editing `static-render.ts` and `pages.ts`, the same files this rewrites.

---

## The decision

Replace the two template arrays and the two body markers with one of each.

```jsonc
// theme.json
"templates": ["blog-post.html", "page-shell.html"]   // was: postTemplate + pageTemplate
```

```html
<div data-embed-config='{"type":"content"}'></div>            <!-- the entity the route resolved -->
<div data-embed-config='{"type":"content","id":"…"}'></div>   <!-- a specific entity -->
```

No id → the current entity. With an id → that row. The resolver reads the row's `bodyFormat` and
dispatches: `doc` renders the Tiptap tree, `html` splices the stored HTML and resolves its nested
embeds. **The author never declares which.**

This replaces `{"type":"post","id":"{{post}}"}` and its `injectPostEmbedId` literal-string
substitution, and it replaces the freshly-added `{"type":"content"}`-without-id form.

## Why this is right, not just simpler

**The owner already settled this exact argument for media**, recorded in
`project_tovu_generic_embed_contract`:

> *"Audio/video/image are NOT separate types — one `media` asset differing by stored mime; the
> resolver dispatches on mime. Making the author choose at write time breaks silently when an asset
> is replaced with a different format."*

Identical shape. And it is cleaner here, because **Posts and Pages are literally the same table** —
`posts`, distinguished by `kind` and `bodyFormat` (verified by direct DB read, see
`ADS-memory/reports/recon/2026-08-11-pages-template-dropdown-status.md`). An id lookup already carries
the type. Encoding it in the marker duplicates a fact the database owns.

It is also strictly more capable: the optional id expresses related-post and featured-page embeds,
which `{{post}}` string substitution cannot.

## Three guards — none optional

**1. Escaping stays per-format.** Rendering a Tiptap tree and splicing stored HTML have different
safety rules. One type at the SCANNER level; dispatch inside the RESOLVER. This is the codebase's own
settled rule — *"genericity belongs in the scanner, not the renderer; a generic renderer would be a
security hole."* Do not collapse the two render paths into one branchless function.

**2. Visibility filtering.** An arbitrary id can pull a **draft or unpublished** row onto a public
page. The resolver must filter on publication state, not merely fetch by id. Today the `{{post}}`
substitution could only ever reference the entity being rendered, so this hazard did not exist —
adding the optional id creates it. **This is the highest-risk part of the change.**

**3. Recursion guard.** A body containing a content marker resolving to itself loops forever;
A→B→A does too. Needs depth limiting or cycle detection. `MAX_HTML_EMBEDS_PER_PAGE = 50` is the
existing precedent for that kind of bound, but it is a per-page count, not a depth bound — a count
alone does not stop a cycle.

## What this does NOT solve

**Template applicability.** `blog-post.html`'s byline, publish date, tags and next-post nav still do
not belong on Privacy Policy. Type-on-resolve answers *"what do I render"*, not *"should this
template be offered here."* Merging the arrays makes the wrong choice one click away where the split
made it unrepresentable.

Two options, and this needs an explicit call rather than drifting:

- **Interim:** `loadTheme` infers applicability by scanning which markers each template contains, and
  the picker filters on that. One key, nothing hand-declared, the file is the source of truth.
- **End state:** the post-specific chrome becomes markers too (`{"type":"field","name":"publishedAt"}`
  and similar) that degrade to nothing when the field is absent. Then applicability stops being a
  question at all. Bigger work; the right destination.

Note `PostRecord` has **no `publishedAt`** — only `updatedAt` (`src/features/post/post.ts:44`), with a
doc comment saying calling it `publishedAt` "would tell the model something false." The `entries`
table has a real one but is not threaded into `SiteRenderContext`. **Any field-marker work must
resolve that first**, or the end state ships a date that moves whenever someone fixes a typo.

## Migration

Cheap now, expensive later — which is why it is being done today.

- `postTemplate` exists in a small number of `theme.json` files; `pageTemplate` exists in **zero to
  one** (PageShell is adding the first as this is written).
- **No backward-compat aliases.** The owner's standing rule on this contract is strictness over compat
  code. Convert the manifests; do not accept both spellings.
- `npm run check:embed-marker-drift` must be extended to fail on the retired
  `{"type":"post","id":"{{post}}"}` form, exactly as it already fails on retired attributes. It scans
  121 theme files **plus DB-stored Page bodies** — an earlier sweep missed the DB and one page
  silently broke.
- `resolvePostTemplate`'s tri-state (`null` → theme's first template, `""` → explicit opt-out,
  filename → explicit choice) and the deliberate **absence** of a first-template fallback for Pages
  must both survive the merge. That asymmetry is what stopped Terms of Service rendering as a blog
  post; losing it silently reintroduces this session's headline bug.

## Files this touches

`src/features/theme/theme.ts` (manifest parse + `loadTheme` validation), `static-render.ts`
(`resolvePostTemplate` / `resolvePageTemplate` / `injectPostEmbedId` / `injectPageContent`),
`src/server/routes/site/pages.ts` (`renderPostViaTemplate` / `renderPageViaTemplate`),
`src/widgets/resolver-service.ts`, `src/core/embeds/marker.ts`,
`development/scripts/check-embed-marker-drift.ts`,
`development/docs/architecture/embed-type-inventory.md`, the admin pickers in `PostEditor.tsx` and
`PageEditor.tsx`, and every `theme.json` carrying `postTemplate`.

## Acceptance

- A Post and a Page render correctly through the **same** template file.
- An unpublished row referenced by id does **not** leak onto a public page — negatively verified.
- A self-referencing body terminates instead of hanging — negatively verified.
- `check:embed-marker-drift` clean, and failing on the retired post-marker form.
- Terms of Service still renders `<title>Terms of Service</title>`, not a post template.
