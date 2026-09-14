# Content Capability Gap Audit — 2026-09-11

Skill loaded: `AI-Dev-Shop/agents/codebase-analyzer/skills.md` (v1.2.0), confirmed in first output line to the dispatching agent.

**Diagnosis only. No source file changed, no migration run, no process restarted, no `.db` written.**

## Sampling Notice

Files read in full: `apps/website/src/features/post/agent-tools.ts` (as of this run — 872 lines, uncommitted, contains today's node+mark schema expansion and its own drift-guard doc comments), `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` (1056 lines), `apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts` (273 lines), `apps/website/src/features/widgets/resolvers/recent-entries.ts`, `apps/website/src/features/widgets/types.ts` (first 100 lines).

Files read in targeted excerpt (grep + windowed reads): `apps/website/src/server/inbound/public-http/http/site/render.ts` (~1-120, 536-660, 1160-1250, 1900-1950 — `MARK_RENDERERS`, `DOC_NODE_HANDLERS`, `renderImageTag`/`renderVideoTag`, `renderPostBody`/`entryContent`), `apps/website/src/features/widgets/html-embeds.ts` (grep only, lines ~226-252), `apps/website/src/server/inbound/public-http/routes/site/{pages,sitemap,llms}.ts` (grep only), `apps/website/src/contracts/headless/contracts.ts` (~1-100), `Jini/packages/cms/src/media/media-service.ts` (~85-113, the upload MIME allowlist).

Not examined: `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts` (Pages share the post editor per code comments — not independently verified), the widget region-placement UI, taxonomy/comments bodies, newsletter campaign bodies, the theme-side Liquid/Handlebars template vocabulary (only confirmed they consume pre-rendered `post.content` HTML, not that they have no independent gaps), commerce product descriptions. Three other agents were live-editing `agent-tools.ts`, media, and a `reattach` feature during this run; every claim below was re-checked against a single coherent read of the file at time of citation, but a later edit could move line numbers.

Confidence: node/mark schema-vs-renderer parity — High (exact key-set comparison, both sides read directly). Collection-entry public-route absence — High (exhaustive grep across every public route file for `EntryRepoPort`/`EntryListPort`/collection-entry references, zero hits, cross-checked against `pages.ts`'s own comment disclosing `PostRecord` as a separate table). Media MIME/render coverage — High (both ends read directly). Widget registry closed union — High (type read directly). "Three render paths diverge" claim — Low/unverified for body-content specifically (see note at bottom); did not chase the full theme-tier architecture, out of scope for this audit's token budget.

---

## Headline

Two structurally different defect classes surfaced, and they are not the same size:

1. **Schema-only gaps (tier a) are now CLOSED.** A different agent's same-day pass (`agent-tools.ts`, 2026-09-11) brought the agent tool schema's node vocabulary (22 types) and mark vocabulary (10 types) into *exact* parity with what `render.ts`'s `DOC_NODE_HANDLERS`/`MARK_RENDERERS` actually dispatch on, including `textAlign`/`codeBlock.language` attrs that were missing before. A drift-guard test (`agent-tools.tiptap-node-vocabulary.test.ts`) now fails the build if a future renderer addition isn't mirrored in the schema. **This closes the exact defect class the owner's two complaints both were.** There is no remaining "editor/renderer can do X, agent schema doesn't know it" gap for posts/pages.

2. **A whole surface has zero public rendering.** Collection entries (`features/entries`, the Collections feature in admin) can be created, edited, and "published" — and never appear on the public site under any URL. This is bigger than either of today's two reported bugs and was not on anyone's radar; see Gap 4 below.

---

## Gap Matrix

| # | Capability | Editor | Agent schema | Renderer | Public route | Tier | Citations |
|---|---|---|---|---|---|---|---|
| 1 | Doc nodes (22 types) | Full (TipTap extensions) | Full, matches exactly | Full (`DOC_NODE_HANDLERS`) | via posts/pages | **CLOSED today** | see below |
| 2 | Marks (10 types incl. color/align/font) | Full | Full, matches exactly | Full (`MARK_RENDERERS`) | via posts/pages | **CLOSED today** | see below |
| 3 | `video` doc node | ✗ no extension | ✗ not in schema | ✗ no `DOC_NODE_HANDLERS["video"]` — but `renderVideoTag` exists, tested, used elsewhere | n/a | **(c)** genuinely unbuilt for body content, but reuses a finished renderer | render.ts:687, :1193-1216 |
| 4 | Collection entries — public visibility | Present but thin | n/a (no agent tools for entries seen) | n/a — never invoked on entry bodyJson | **✗ NONE** | **(c)** genuinely unbuilt | see Gap 4 |
| 5 | Collection entry rich-text capability | **Thin**: `[StarterKit, WidgetEmbed]` only | n/a | n/a (moot — nothing renders it) | n/a | **(b)** one missing arm, but low value until #4 exists | use-collection-entry-editor.hooks.ts:112 |
| 6 | Media: image | Full | Full | Full | Full | CLOSED | — |
| 7 | Media: video | Uploadable, previewable | ✗ (no TipTap node) | `renderVideoTag` exists but unreachable from a body | Only via page-level HTML-embed markers | **(c)**/hybrid — see Gap 3 | — |
| 8 | Media: audio | **✗ not even uploadable** | ✗ | ✗ no `renderAudioTag` anywhere | ✗ | **(c)** full-stack, largest gap in this row | Jini media-service.ts:107-113 |
| 9 | Widget types | 5 closed types, no media type | n/a | n/a | n/a | **(c)** if a first-class media widget is wanted | widgets/types.ts:63 |
| 10 | `widgetEmbed` in body | Read/recognize only, authored via tool | Documented as reference-only | Resolves to one of the 5 widget types | via posts/pages | By design, not a gap | agent-tools.ts:262-266 |

### Detail: Gap 1 & 2 (CLOSED, for the record)

`render.ts:1193-1216`'s `DOC_NODE_HANDLERS` has exactly: `doc, paragraph, heading, title, text, bulletList, orderedList, listItem, taskList, taskItem, table, tableRow, tableCell, tableHeader, blockquote, codeBlock, horizontalRule, hardBreak, image, youtube, mention, widgetEmbed` (22 keys, not 24 — recount from source). `agent-tools.ts`'s `TIPTAP_DOC_SCHEMA` (`:301-632`) names every one of these except `doc`'s own wrapper (implicit) and `title` (deliberately excluded — renders empty by design, documented at `:286-292`, since `post.title` prints separately). No gap.

`render.ts:536-547`'s `MARK_RENDERERS` has exactly 10 keys: `bold, italic, code, underline, strike, subscript, superscript, textStyle, highlight, link`. `agent-tools.ts`'s `TIPTAP_MARK_SCHEMA` (`:196-240`) names all 10, with the `textStyle`/`highlight`/`link` `attrs` shapes matching what `render.ts` reads (`color`/`backgroundColor`/`fontFamily`/`fontSize`/`lineHeight`, `href`). The editor's extension list (`use-post-editor.hooks.ts:543-574`) produces exactly this same set: `StarterKit` (bold/italic/code/strike/underline), `Highlight`, `Subscript`, `Superscript`, `TextStyle`+`Color`+`BackgroundColor`+`FontFamily`+`FontSize`+`LineHeight`, plus `StarterKit`'s bundled `Link`. Full three-way parity, verified by direct comparison of all three key-sets — not by grep count alone.

### Detail: Gap 3 — `video` cannot go in a post/page body

`render.ts:687-699`'s `renderVideoTag` is real, has its own doc comment describing it as `renderImageTag`'s sibling, and is called at `render.ts:1937` — but that call site is inside the **media embed IR resolver** (`renderWidgetIr`'s `"media-image"`/embed-type branch, fed by `resolver-service.ts`'s `resolveHtmlPageEmbeds`), which serves **Page-level HTML embed markers** (`html-embeds.ts`), a completely separate authoring surface from a post/page's TipTap `bodyJson`. There is no `DOC_NODE_HANDLERS["video"]` entry, no `Video` TipTap extension in `use-post-editor.hooks.ts`'s extension list (only `MediaImage`, `:656`), and `agent-tools.ts`'s own doc comment (`:293-299`) explicitly discloses this: *"There is no `video` doc node type in this schema, because `renderDocNode` has no case for one... Using THIS schema's `image` node with a video asset's id will still resolve a transform version... and render a broken `<img>` instead of a video."* This is the owner's second reported incident, confirmed still open. **Closing it is comparatively cheap**: the render primitive (`renderVideoTag`) is done and tested; the work is one new TipTap node (mirroring `MediaImage`'s ref-shape: `{assetId, transformName?}` — video doesn't need a `transformName` the way image does, per `renderVideoTag`'s own doc at `:687-699` noting it doesn't read one), one `DOC_NODE_HANDLERS["video"]` entry delegating to `renderVideoTag`, and one schema `$defs` entry mirroring `image`'s.

### Detail: Gap 4 — Collection entries have no public route at all

This is the audit's biggest, least-expected finding, so the trail is laid out in full:

- `apps/website/src/server/inbound/public-http/routes/site/*.ts` and `routes/content/*`: grepped for `EntryRepoPort`, `EntryListPort`, `AdminEntry`, `collections`, `contentType` — **zero matches** in any actual route file (the only hits are on `render.ts`/`page-head.ts`, internal plumbing already accounted for by Gap 9's widget resolution, and two integration test files).
- `routes/site/pages.ts:278`'s own comment states plainly: *"`PostRecord` (`features/post`) is a separate, pre-ADR-022 table"* from the generic `entries` store — i.e., the code itself documents that the catch-all public page resolver was built against `PostRepoPort`, not `EntryRepoPort`, and this was a deliberate, disclosed choice at the time, not an oversight anyone since has revisited.
- `routes/site/sitemap.ts` and `routes/site/llms.ts` both have a local variable named `entries` — but it is `IndexableEntry[]` (confirmed by reading), which is posts/pages, not the Collections `entries` domain. Neither file references `EntryRepoPort`.
- `admin-http/routes/entries/{create,list,update,lifecycle}.ts` exist — full admin CRUD plus publish/unpublish (`lifecycle.ts`) — confirming entries genuinely have a "published" state with no public consequence.
- The **only** place a collection entry's existence reaches the public site is the `recent-entries` **widget** (`widgets/resolvers/recent-entries.ts:51-57`): it queries `EntryListPort.listByWorkspace({status: 'published', ...})` **across every content type**, not narrowed to posts (confirmed by reading the resolver — no `contentType` filter is applied, and the file's own comment at `:44-46` states this is intentional: *"a 'recent entries' widget is intentionally not narrowed to one type"*). It maps each row to `{id, title, slug}` only (`:64`) — no body, no excerpt, no link target resolution.
- Given Gap 4's first bullet, that `slug` resolves to **nothing** on the public site for any entry whose kind isn't post/page. A collection entry can be authored, its rich text written, and marked "published" — and the only trace of it a site visitor could ever see is a bare, dead-ended title string inside a `recent-entries` widget list.
- There is also no admin-side preview for a collection entry: `CollectionEntryEditorController` (`use-collection-entry-editor.hooks.ts:63-84`) has no `view`/`templatePreviewUrl`/preview-form fields at all, unlike `PostEditorController`'s several (`use-post-editor.hooks.ts:160-206`). So today, nobody — author or visitor — ever sees a rendered collection entry anywhere.

This reframes Gap 5 (the thin editor extension list): widening it to match the post editor is mechanically cheap, but its value is capped at zero until Gap 4 is closed, since nothing renders a collection entry's `bodyJson` regardless of how rich it is.

### Detail: media widgets and audio

`widgets/types.ts:63`: `WidgetTypeKey = "text" | "social-links" | "recent-entries" | "menu" | "contact-form"` — confirmed no media/image/video type. A theme region (as distinct from an inline post body) has no first-class way to place standalone media; the only route is the Page-level HTML-embed "media" marker (`html-embeds.ts:252`, resolves to a bare `<img>`/`<video>` tag), a different, page-template-only authoring surface.

Audio is the deepest gap of anything found: `Jini/packages/cms/src/media/media-service.ts:107-113`'s `DEFAULT_ALLOWED_MIME_TYPES` lists exactly `image/jpeg, image/png, image/webp, image/gif, image/avif, video/mp4, video/webm` — **no audio MIME type is accepted by the upload endpoint at all**, so nothing downstream (admin preview, TipTap node, renderer) has anything to act on even in principle. `render.ts` has no `renderAudioTag` function (confirmed absent by grep across the whole file). `html-embeds.ts:244`'s `SELF_RENDERING_MEDIA_TAGS` set names `"audio"` alongside `"img"`/`"video"` — but this is purely defensive (the marker-splicing mechanism would handle an `<audio>` tag correctly if one ever existed to splice); there is no producer anywhere in the codebase that could ever emit one. Closing this needs the full stack: MIME allowlist, admin upload/preview UI, a TipTap node, a `renderAudioTag`, and a schema entry.

---

## Ranked Top 5 (value per unit of work)

1. **`video` TipTap node for posts/pages** (Gap 3). Cheapest fix of anything found — one render primitive already exists, tested, and used elsewhere; only the node registration (editor + schema + `DOC_NODE_HANDLERS` entry) is missing. Directly closes the owner's own second-reported incident today. **Do this first.**
2. **Widen the collection-entry TipTap editor** to match the post editor's extension list (Gap 5) — mechanical, import-and-register work, no new design. Low cost, but sequence it *after* or *alongside* #3 below, since its value is otherwise latent.
3. **A first-class media widget type** (image/video, region-placeable) — moderate, contained: one `WidgetTypeRegistration` + a `static`-capability resolver mirroring the existing `"text"` widget's simplicity (no new resolver-dispatch machinery needed). Gives page regions the same media capability post bodies already have.
4. **Collection entries: a public route** (Gap 4) — the single worst gap in absolute user-visible-value terms (an entire content model is publish-and-vanish), but the most expensive to close: needs slug resolution scoped by content type (with a collision policy against posts/pages/theme static pages), a render path, and sitemap/`llms.txt` inclusion. High value, not cheap — flagged here rather than ranked #1 specifically because of that cost, per the brief's own value-per-unit-of-work framing. If the owner's priority is "nothing should silently vanish," this should jump the queue despite the cost.
5. **Audio, end-to-end** — the largest, least-requested gap (owner asked about video specifically; audio was never mentioned). Full stack missing: MIME allowlist, upload UI, TipTap node, renderer, schema. Do last.

## Single worst gap

**Collection entries have no public rendering path at all** (Gap 4) — not a formatting loss like the image/video incidents, but total invisibility: a fully authored, explicitly "published" piece of content that no visitor, sitemap crawler, or `llms.txt` consumer will ever see. It was not caught by either of today's two complaints because those were about post/page bodies; this is a different surface no one has hit yet, structurally worse than either.

## What was surprising

- The node/mark schema-only gap the owner already reported was fixed *same-day*, by another concurrent agent, before this audit started — the matrix above documents that it's actually closed rather than assuming the brief's premise still holds.
- `recent-entries` widget already silently surfaces dead-ended collection-entry titles today — a partial, half-working leak of Gap 4's underlying problem that a site owner could stumble on without any code change at all.
- The `html-embeds.ts` marker-splicing mechanism already defensively anticipates `<audio>` tags, years ahead of anything that could produce one — the splice layer is not the blocker for audio; everything upstream of it is.
