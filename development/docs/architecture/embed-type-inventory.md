# Embed types — what exists, what was removed, and why

Written 2026-08-10, branch `refactor/jini-admin-extraction`. Companion to
`embed-marker-migration.md`, which is the *contract*; this is the *reasoning*.

Read this before adding an embed type, removing one, or re-litigating `form` or `menu`. Every
number below was verified against `infra/content.db` and the source on the date above, not carried
over from a prior document.

---

## The distinction that makes the rest obvious

**Widgets are the placement mechanism. Menus and forms are content domains that get placed.**

Almost every confusing question in this area dissolves once those are held apart:

| | Content domain | Placement mechanism |
|---|---|---|
| Owns storage | `menus` table, `form_definitions` table | `entries` rows of `type: "widget"` |
| Owns behavior | submission, rate limiting, mail (`src/forms/`); menu tree resolution (`src/navigation/`) | resolution, batching, region binding, failure isolation |
| Knows about the other | no | yes — a widget type is a thin adapter over a domain |

`src/forms/` owns everything that makes a form a form. The `contact-form` widget type
(`src/widgets/resolvers/contact-form.ts`) is a **read-only adapter** over it: it imports only
`forms/ports.ts`'s `FormDefinitionRepoPort`, never the submission write path or the mail module, so
it structurally cannot persist a submission, send mail, or duplicate rate limiting. It reads the
definition's declared field vocabulary and hands it on as render props. That is the whole of it.

The same shape holds for menus: `src/navigation/` owns the `menus` table and `resolveMenuDoc`; the
`menu` widget type delegates to it and stores no menu data of its own.

So the rule for a new embed type is: **an embed type is justified when it names a distinct
resolution mechanism, not when it names a kind of content.** A kind of content that a widget can
already place is a widget type.

---

## Why `form` was removed

`form` was a registered embed type until 2026-08-10 (commit `47af7b2`). It is gone, and it should
not come back.

It never named a mechanism. `resolveFormTypeEmbeds` did exactly this:

1. Read the marker's `id` — which was a **Forms definition** id, not an entry id.
2. Build a **synthetic, never-persisted** `WidgetInstanceView`: `{ id: <that form definition id>,
   widgetType: "contact-form", config: { formDefinitionId: <same id> } }`.
3. Hand it to `resolveWidgetType({ typeKey: "contact-form", ... })` — the identical call a real,
   persisted `contact-form` widget instance already went through.
4. Return the result, which `render.ts`'s `renderWidgetIr` rendered through its existing
   `"contact-form"` case, unchanged.

There was no second render path, no form-specific resolution, and no data that only this type could
reach. It was an author-convenience shorthand — "name the Forms definition directly instead of
creating a widget instance first" — implemented as a permanent second entry in the type vocabulary.

That shorthand was not free. Every consumer of the marker spine had to carry the second spelling:
the resolver registry, `HTML_EMBED_TARGET_KINDS` in `core/entry-refs/extractor.ts`, every type
switch, every test fixture, and every future consumer that would ever ask "which types are there".
A synthetic instance also means the thing on the page is not a real object: it cannot be listed in
the widgets admin surface, configured, reused, or found by anything that enumerates widgets.

**Embedding a form today** is `{"type":"widget","id":"<contact-form widget entry id>"}`. The widget
instance is real, persisted, listable, and configurable — its `config` carries `formDefinitionId`
and can carry `successMessage`, which the synthetic instance never could.

### What removing it cost the integrity index — nothing

A `form` marker used to produce an `entry_refs` row targeting the form definition. It no longer
does. The reference is not lost; it moved one hop:

```
before:  page --(page-html-embed)--> form definition
after:   page --(page-html-embed)--> contact-form widget --(config-field)--> form definition
```

The second edge already existed and was already extracted — `classifyRefFieldKey` maps any key
ending in `Id` to an entry-target ref, and `formDefinitionId` has always matched. Both edges are
live rows in `entry_refs` today. The chain is one hop longer and **every hop is a real persisted
object**, which is what safe-delete's where-used check actually wants: the old single edge pointed
from a page to a definition through a thing that did not exist.

### Stored content written before the removal

Page bodies live in the database, and the `b7acc21` marker sweep only covered theme files on disk.
One real Page (`glassmorphic-landing`) carried `data-embed-type="form"` and had **silently stopped
rendering its contact form** — the retired attribute is invisible to the shared parser, so it
rendered as an inert empty `<div>`.

`development/scripts/migrate-page-embed-markers.ts` migrates such rows (dry-run by default). For a
`form` marker it finds a live `contact-form` widget instance already carrying that
`formDefinitionId` and rewrites onto it; with no match it reports BLOCKED and changes nothing,
rather than fabricating a widget. `check:embed-marker-drift` now scans stored bodies too, so this
class of drift cannot go unreported again.

---

## Why `menu` was kept, despite having two mechanisms

`menu` genuinely has two resolution paths, and unlike `form` this is **the owner's explicit
decision, not an oversight.** Do not "clean it up".

| | Static-theme marker | `menu` widget type |
|---|---|---|
| Marker | `<nav data-embed-config='{"type":"menu","id":"docs-nav","variant":"tree"}'>` | `{"type":"widget","id":"<menu widget entry id>"}`, or a region binding |
| Resolved by | `features/theme/static-render.ts`'s `injectMenuEmbeds` | `widgets/resolvers/menu.ts` |
| Reads | `menuRepo.findBySlug`/`findById` + `resolveMenuDoc` | `getMenu` (`NavMenuReadModel`) + `resolveMenuDoc` |
| Theme tier | static themes — hand-authored HTML files on disk | templated/declarative themes with widget regions |

They serve **different theme tiers**, and both funnel into the same `src/navigation` core over the
same `menus` table. There is one storage, one tree-resolution function (`resolveMenuDoc`), and two
placement mechanisms — because the two theme tiers genuinely place things differently. A static
theme has no region model to bind a widget into; a declarative theme has no hand-authored `<nav>` to
fill.

This is the opposite of `form`'s situation. `form` was two spellings of **one** mechanism. `menu` is
one content domain reachable by **two** genuinely different placement mechanisms, each the only one
available in its tier.

Note that a static-theme `menu` marker is **not owned by the page-embed stage at all**:
`isPageEmbedType("menu")` is false, so `resolveHtmlPageEmbeds` leaves it exactly as authored for the
later `static-render.ts` stage to fill. That "unresolved means untouched" default is load-bearing —
substituting a placeholder over a theme's nav would silently delete it and still render a tidy page.

---

## The current roster

**Registered in `HTML_EMBED_RESOLVERS` (`src/widgets/resolver-service.ts`)** — the page-embed stage
owns these, and a failure to resolve degrades to the REQ-28 placeholder:

| Type | Target | Resolver |
|---|---|---|
| `widget` | a `widget`-type `entries` row | `resolveWidgetTypeEmbeds` — batched, any widget type |
| `media` | a media asset (`MediaRepoPort`) | `resolveMediaTypeEmbeds` — image-only today; `MediaRecord` persists no mime type |
| `post` | a `posts` row | `resolvePostTypeEmbeds` — returns raw post data, `render.ts` renders it |

**Theme-owned, deliberately absent from that registry** — seen by the shared parser, resolved by a
later stage, never touched by the page-embed stage:

| Type | Resolved by | In theme markup today |
|---|---|---|
| `partial` | `static-render.ts`'s slot resolution | 164 occurrences |
| `menu` | `static-render.ts`'s `injectMenuEmbeds` | 61 occurrences |
| `content` | `static-render.ts`'s `injectPageContent` | new, 2026-08-11 |

(`post` also appears in theme markup, 12 occurrences, via the post-template picker.)

### `content` (2026-08-11) — the Pages template picker's missing piece

Built for the Pages template picker (recon 2026-08-11 flagged this as the highest-value next step,
called for by two independent peer reviews): a page-template file needs a slot meaning "the Page's
own body goes here", the way `{"type":"post"}` means "this chosen post's body goes here" in a
post-template file.

**Placed with `partial`/`menu`, not in `HTML_EMBED_RESOLVERS`, despite looking at first glance like it
should sit next to `post`.** The apparent parallel to `post` is real but shallow: both are resolved by
the CALLER (`renderPostViaTemplate`/`renderPageViaTemplate`) before `resolveHtmlPageEmbeds` ever runs,
via a literal pre-substitution (`injectPostEmbedId`/`injectPageContent`) rather than an async registry
lookup. But `post`'s pre-substitution only swaps a placeholder ID into the marker's JSON — the marker
still gets a real, async, ID-keyed resolution afterward (`resolvePostTypeEmbeds`, a `postRepo.findById`
call that CAN fail: post deleted, bad id). `content` has no such second stage and cannot fail the same
way: by the time a route calls `injectPageContent`, it already holds the Page's own `bodyHtml` as a
plain string (possibly empty, never absent) — there is no id to look up and no "not found" outcome to
model. Registering it in `HTML_EMBED_RESOLVERS` anyway would give it the REQ-28 generic-placeholder
failure mode, which is right for "a referenced widget was deleted" and actively wrong for "this page
has no body" — there is no legitimate case where a Page's own content "fails to resolve". Keeping it
theme-owned (`isPageEmbedType("content")` is `false`, matching `partial`/`menu`) means a marker that
somehow reaches `resolveHtmlPageEmbeds` unsubstituted (the injection step skipped, or a stray marker in
a non-Page template) is left exactly as authored rather than blanked — the same load-bearing default
that already protects theme nav/footer from being wiped by a resolution miss.

**Uses `withInnerContent`, not a whole-element replace, unlike `post`/`partial`.** Both of those are
bare, classless `<div>`s in every theme shipped in this repo (verified by grep across
`src/themes/static/*/pages/*.html` on this date) — whole-element replacement has never had a styling
hook to lose for them. A `content` slot is far more likely to be authored as
`<main class="page-body" data-embed-config='{"type":"content"}'></main>`, the same reason `menu`
markers already use `withInnerContent`: the theme's own wrapper and its authored fallback content must
survive, with only the inside swapped.

**Indexed into `entry_refs` (`HTML_EMBED_TARGET_KINDS`)**: `widget` → `"entry"`, `media` →
`"asset"`. A type absent from that map is still scanned but produces no row — guessing a target kind
would be actively wrong data, not merely incomplete.

### What registering a new type costs

The generic contract exists so this is cheap. Adding one is:

1. **One entry in `HTML_EMBED_RESOLVERS`** plus its resolver function. Nothing else in
   `resolveHtmlPageEmbeds`'s call chain changes; the scanner never gates on type.
2. **One entry in `HTML_EMBED_TARGET_KINDS`** — only if the type should be safe-delete-visible, and
   only if an existing `EntryRefTargetKind` fits. A genuinely new storage domain needs a new target
   kind (that is why `media` is `"asset"` and not an overloaded `"entry"`).

What it does **not** cost: no scanner change, no parser change, no `PageHtmlEmbedRef` signature
change, no theme-side vocabulary change. That is the whole point of one attribute carrying JSON.

Before paying even that, apply the rule at the top: **does this name a distinct resolution
mechanism, or a kind of content a widget already places?** If the latter, it is a widget type.

---

## Categories and tags — fully built, entirely unused

Verified directly against `infra/content.db` on 2026-08-10:

| Table | Rows |
|---|---|
| `terms` | **0** |
| `entry_terms` | **0** |
| `taxonomies` | **1**, named literally `dummy` |
| `taxonomy_revisions` | 5 |

The feature is not a stub. It has:

- Four tables with real indexes, including a `entry_terms_unique` uniqueness constraint.
- Nine admin routes: `create-taxonomy`, `delete-taxonomy`, `create-term`, `delete-term`,
  `rename-term`, `merge-term`, `assign-terms`, `list`, plus deps.
- An admin UI surface, mounted at `apps/admin/src/panels.tsx` (panel id `taxonomy`).
- `entry_refs` integration: `EntryRefTargetKind` includes `"term"`, and
  `classifyRefFieldKey` routes any config key ending in `TermId` to it.

And exactly **one consumer** anywhere in the product: `recent-entries`'s `categoryTermId`, declared
in `widgets/registry.ts` with `"x-ref-target": "term"`. That resolver does not filter by it — its
own doc says so plainly ("this resolver does not filter by it (no taxonomy dependency wired here)"),
matching EC-03's allowance to render as if the filter were unset. So the single consumer of the
single taxonomy feature reads the field and ignores it.

The 5 `taxonomy_revisions` against 1 surviving taxonomy named `dummy` suggest the admin surface has
been exercised by hand and then cleaned up — this is a built-and-abandoned feature, not one waiting
on a missing piece.

### Term references are SOFT, with no safe-delete guarantee

This is stated in the code (`widgets/registry.ts:82`: "targetKind 'term' (no safe-delete
guarantee)") and it is worth being precise about *why*, because the reason is stronger than the
comment suggests.

Term-target rows are **written** into `entry_refs` and **never read**. Every caller of
`findByTarget` in the codebase passes `targetKind: "entry"`, hardcoded — there are five, all in
`widgets/`. Nothing anywhere queries for `targetKind: "term"`. And `delete-term.ts` consults no
where-used index at all before deleting.

So deleting a term that a `recent-entries` widget references will succeed silently and leave a
dangling `categoryTermId`. Today that is harmless, precisely because the one consumer ignores the
field. **It stops being harmless the moment anyone wires real category filtering**, which is exactly
when someone would reach for this feature. Wiring that filter without also wiring a term-target
where-used check would ship the dangling-reference bug and the feature that exposes it in the same
change.

---

## `pages.edit_html`

**Intended end state**, specified as SPEC-047 REQ-9: a permission distinct from `content.write`,
granted to `admin` but not `editor`, on the reasoning that a malformed generated page is a
broken-artifact risk closer to `theme.edit` than to an ordinary content edit.

**Not wired, and blocked outside this repository.** `authorize()` (`@jini-ai/cms`'s
`identity/authorize.ts`) is purely DB-driven: it matches literal `policy_permissions` rows and never
consults the permission catalog. Verified against this repo's own `content.db` — `content.write`
resolves to the `admin` and `editor` roles, and **no row anywhere spells `pages.edit_html`**.
Switching the gate to it ahead of the seed would leave only `owner` able to edit Page HTML and break
the feature for `admin`: a functional regression wearing a security fix's clothes. The seed lives in
`@jini-ai/cms`, a separate repository.

**The interim gate** (commit `ee7af59`): `PUT /api/admin/v1/workspaces/:workspaceId/pages/:pageId/html`
now checks `content.write`, matching what the agent-tool path (`pages_write_html`) always checked.
Before that it checked **nothing** — authenticated like any admin route, but with no per-action
authz, so any principal who could reach the admin could write raw unsanitized HTML that renders into
the public site.

- **What it buys:** a principal without `content.write` can no longer write Page HTML. The two paths
  to the same store now agree.
- **What it does not buy:** REQ-9's actual intent. `editor` holds `content.write`, so an editor can
  still edit Page HTML. This is a strictly smaller hole, not a closed one.

Still open on this route, unchanged: no rate limit (REQ-10), no command-gateway/change-set record
(so body writes are absent from the mutation audit trail and not revertible), and **no HTML
sanitization** — the stored markup renders into the public site at the same trust level the theme
layer has.
