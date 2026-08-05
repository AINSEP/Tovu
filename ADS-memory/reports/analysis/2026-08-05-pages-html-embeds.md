# Pages: public html rendering + widget/form embeds (2026-08-05)

Subagent: Sonnet 5, ADS Programmer persona. Slices 1+2 landed together (coupled: slice 1's
`renderPostBody` branch is the seam slice 2's substitution needed).

## Slice 1 — html Pages render publicly (was a total silent failure)

`src/server/http/site/render.ts` had NO `bodyFormat` branch; all three body call sites went
straight to `renderDocNode(post.bodyJson, ...)`, which is null for an html Page. A published
bespoke Page rendered as an empty shell inside theme chrome. Admin preview worked (SrcDocSandbox
renders the string directly), so the failure was invisible from the editor.

Fix: `renderPostBody(ctx)` branches on `post.bodyFormat`; `"html"` emits `body_html` unescaped
(same trust level `update-html.ts` already discloses). Wired into `entryContent()`,
`renderSlot("content")`, and `buildTemplateRenderData()`'s `post.content` — so declarative, Liquid
and Handlebars tiers all get it, not just one.

**Independently verified by the coordinator**, not taken on report:
`curl localhost:3000/glassmorphic-landing` — `data-agent-element` 0 -> 4, `gm-landing` 0 -> 8,
17087 -> 25019 bytes.

## Slice 2 — embeds

`<div data-widget-embed="{widgetEntryId}"></div>` / `<div data-form-embed="{formDefinitionId}"></div>`.
Div must be EMPTY: no HTML parser exists in this repo, a regex over a leaf pair is safe, and
matching nested content would need real tag-balance tracking. Non-empty divs simply don't match and
render inert (safe degrade).

- `src/widgets/html-embeds.ts` — pure `scanHtmlEmbeds`/`substituteHtmlEmbeds`, capped at
  `MAX_HTML_EMBEDS_PER_PAGE = 50`.
- `src/widgets/resolver-service.ts` — extracted `resolveWidgetInstances` out of `resolvePageWidgets`,
  added `resolveHtmlPageEmbeds()` on top. `data-form-embed` is sugar: a synthetic never-persisted
  `contact-form` widget instance routed through the same `resolveWidgetType`/`CORE_RESOLVERS` path,
  so a Forms definition can be named directly without creating a throwaway widget instance.
- Route wiring in `routes/site/pages.ts` resolves ahead of `renderSite`, keeping `render.ts` I/O-free.
- 26 new tests (7 integration with real repos, 11 unit, 8 render). Widgets dir + render.test.ts
  green (68). Root typecheck clean.

## Coordinator rulings (message #1)

1. **Do NOT harmonize** the found-but-broken (present, placeholder IR) vs nonexistent (absent)
   asymmetry in the resolved map. Inherited from `resolvePageWidgets`, renders identically, and
   diverging the html path from the Tiptap path costs more than the tidiness gains.
2. **Index `entry_refs` from `scanHtmlEmbeds` output, never from the resolved map.** They differ
   exactly on the case entry_refs exists to catch: a page pointing at a deleted widget is absent
   from the resolved map, so indexing the map would leave the only genuinely broken page
   unindexed and report clean. Scan -> refs unconditionally.
3. `MAX_HTML_EMBEDS_PER_PAGE` is a render/index-time resource bound, NOT an invariant — nothing
   stops `pages_write_html` storing 5000. Comment must not imply a guarantee.
4. Slice 4 must SPLICE the form embed into the owner's real glassmorphic page (read -> splice ->
   write), never rewrite the document.

## Still open

- Slices 3 (entry_refs) and 4 (live embed) in flight.
- No `pages.edit_html` permission, no rate limit, no HTML sanitization on the write path.
- Published html Pages render unsanitized markup; the admin preview is sandboxed, the site is not.
