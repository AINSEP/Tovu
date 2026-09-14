# Design note: chat assistant has no page-copy tool (2026-09-07)

Software Architect. Bootstrap confirmed: `AI-Dev-Shop/agents/software-architect/skills.md` loaded.
Design only — no source touched, nothing implemented.

## 0. Provenance

This is item C4 in `ADS-memory/reports/2026-09-07-tovu-d6-handoff.md` §5. The failing request was
"copy Landing sample — xai and name it 'Landing Page'". `ADS-memory/reports/2026-09-07-home-page-slug.md`
confirms "Landing sample — xai" is a real `posts` row (`4f220108-5113-...`, `kind: page`, `slug: "/"`,
`status: published`, `template_choice: pages-default.html`) — i.e. an ordinary CMS Page, not a theme
template or a starter file. The ask is exactly what it sounds like: read one page's content, create a
second page from it with a new title.

## 1. The gap, concretely — the dispatch's framing needs three corrections

**What actually exists for CMS pages (the product concept — a `PostRecord` with `kind: "page"`):**

- `content_post_*` (`apps/website/src/features/post/agent-tools.ts` + `tool-registrations.ts`):
  `content_post_search` / `_list` / `_get` / `_create` / `_update` / `_delete`. This is where a
  page's identity lives — title, slug, status, `bodyJson`. Applies to `kind: "post"` and `kind: "page"`
  through one shared catalog.
- `pages_read_html` / `pages_write_html` (`apps/website/src/features/pages/agent-tools.ts` +
  `tool-registrations.ts`): the ONLY two tools in the `pages_*` namespace. They read/overwrite a
  page's bespoke `body_html` (the format "Landing sample — xai" actually uses,
  `pages-default.html`/HTML-format pages generally). Deliberately not full CRUD — creation is
  `content_post_create(kind:'page')`; there is no `pages_list`/`pages_delete` because those already
  exist as `content_post_list`/`content_post_delete`. The file header spells this division out.

So pages do NOT have "only `page_action`" — they have two real, wired, authoring-capable tool
families (`content_post_*` for metadata/lifecycle, `pages_*` for the HTML body), together offering
full field-level read/write, just no single-call *copy*.

**What `page_action` actually is — not an authoring tool at all.** `page_action` only appears as a
`ClientDirective.kind` value in `apps/website/src/assistant/site/client-directives.ts` and
`apps/website/src/assistant/site/tools.ts`. That whole file is ADR-054's **public, anonymous-visitor**
site-chat surface: three read-only tools (`search_published_entries`/`get_published_entry`/
`list_categories`) plus three navigation directives (`navigate_to_entry`/`scroll_to_entry`/
`highlight_entry`) that only ever resolve an already-published slug to a path for the VISITOR'S
browser. It has no write tool of any kind, by design (the file's own header: "there is no path by
which a tool not written here becomes callable"). It is not reachable from — and has nothing to do
with — the authenticated admin/authoring assistant session that received "copy Landing sample". The
dispatch's framing conflated this with the admin-authoring surface; they are two different chat
products.

**The tool that actually produced the error is a third, unrelated "page" concept.** `page.navigate`
(and the rest of `page.*`) is `@jini-ai/agentic`'s `PAGE_CAPABILITIES`
(`apps/website/src/assistant/frontend-control-capabilities.ts:62,106`), spread into the authenticated
admin assistant's tool set via `createFrontendControl` (`agent-daemon-server.ts`). Its "published
page" is a registered **admin SPA screen** — one of the ids in
`apps/admin/src/lib/agent-pages.ts`'s `ADMIN_AGENT_PAGE_PATHS` (`"posts"`, `"pages"`,
`"widget-regions"`, `"settings"`, …), derived from `panels.tsx`'s `ADMIN_PANELS` and matched to
`[data-agent-page]` DOM markers. It has nothing to do with `PostRecord`/CMS content at all — its
"Available: …" list is admin-screen ids, never a post/page title or slug.

**Corrected statement of the gap:** across `content_post_*`, `pages_*`, `sites_duplicate_site`
(features/sites), and `theme_*` (features/theme) — every write-capable catalog in this repo — there is
no tool, in any domain, that duplicates a single content row. `sites_duplicate_site` copies a WHOLE
site (content, uploads, themes, plugins) as one unit; nothing copies one page/post. And contrary to
the dispatch's framing, `theme_*` is not "full CRUD" either: `theme_create`/`theme_delete`/
`theme_rename_folder` are explicitly out of scope in that catalog's own header ("a theme's folder
name IS its id... stays just as un-trashable/un-renamable"). Only file-level operations inside an
*existing* theme are wired. So "no copy primitive below whole-site" is a pattern across this codebase,
not a pages-specific oversight.

## 2. Product decision — surfaced, not decided

**Option A — a first-class `content_post_duplicate` tool.**
- Pros: one call, atomic; server-side control over slug collision (reuse `content_post_create`'s
  existing disambiguation) and over the one real correctness trap a naive copy hits (below); one
  audit-trail line ("Agent duplicate page 'X' as 'Y'") instead of two unrelated ones; matches this
  repo's own precedent that "duplicate" is a verb worth its own tool (`sites_duplicate_site`), not a
  compose-it-yourself flow, once a domain decides duplication is a supported operation.
- Cons: new surface to design, review, and keep in sync with `createPost`/`pages` write-service
  changes going forward; the real design work is non-trivial (see the widgetEmbed trap below) —
  this is not a thin wrapper; only serves the post/page domain, doesn't generalize to any other
  domain that might later want "duplicate an entry."
- **The correctness trap that actually decides this, not just UX taste:** a page's `bodyJson` can
  contain `widgetEmbed` nodes whose `attrs.placementId` addresses an embed **placement scoped to the
  original page** (`postAgentToolCatalog`'s own schema doc: "referencing an existing widget instance's
  placement"). A byte-for-byte copy of `bodyJson` into a new row would carry those placement ids
  along, and the COPY would then render embeds that still belong to, and can still be edited out from
  under it via, the ORIGINAL page — a silent cross-page coupling, not a crash, so nothing would flag
  it. The same risk applies to an HTML page's `data-agent-element` region handles if anything outside
  this codebase keys off them by more than string identity (not confirmed either way — flagged as an
  open question, not asserted). A dedicated tool can special-case "strip or refuse to copy widgetEmbed
  nodes" once, in one reviewed place; a naive read+recreate composition (Option B) has no reason to
  know this trap exists.

**Option B — compose from tools that already exist (`content_post_get` → `content_post_create`, and
`pages_read_html` → `pages_write_html` for an HTML-format page).**
- Pros: zero new server code, zero new registration, zero new permission decision, works today;
  reuses the exact tools this repo has already hardened (slug validation, optimistic concurrency);
  generalizes for free to any other content-bearing domain later.
- Cons: multi-turn/multi-tool-call — more context spent, more chances to drop a step (most likely:
  forgetting the HTML-body copy for an HTML-format page, since `content_post_create` only carries
  `bodyJson`, never `body_html`); no atomicity — a failure between the two calls leaves an orphaned
  half-copied row the model has to notice and clean up itself; walks straight into the widgetEmbed
  trap above with nothing to stop it, since neither `content_post_get`/`_create` nor `pages_read_html`/
  `_write_html` has any awareness that a widgetEmbed reference must not be carried across rows; and,
  as verified in §5 below, the model currently has **no textual cue anywhere** that this composition
  is the intended way to satisfy a "copy this page" request — that is arguably as much the proximate
  cause of today's failure as any missing tool.

**Recommendation:** Option B is the correct *immediate* unblock — it needs no new tool, only
description/keyword text (§5), and every primitive it composes already exists and is tested. Whether
to *also* build Option A should turn on how often page-copy is actually requested and, specifically,
on whether copied pages commonly carry widget embeds: if they do, Option B will eventually produce a
page that silently shares live embeds with its source, and that is worth a dedicated tool to close
correctly rather than patching after the fact. This is the owner's call, not decided here.

## 3. Proposed tool surface

**Option A shape**, if chosen — lives in `features/post` (identity/lifecycle is a `post.ts` concern,
same as `content_post_create`), not as a new standalone domain:
- `content_post_duplicate`
  - input: `{ id: string (required), kind: 'post'|'page' (required, must match the source row — same
    disclosed asymmetry as content_post_get/_update), title?: string (default "Copy of <source
    title>"), slug?: string (default: derive-from-title with the same collision disambiguation
    content_post_create already runs), status?: 'draft'|'published' (default 'draft' — a copy must
    never silently go live) }`
  - authorization: `content.write` (mirrors `content_post_create`); sideEffects:
    `mutates-durable-state`.
  - behavior: read the source via the same path `content_post_get` uses; create a new row with the
    same `kind`/`bodyJson`, new id/title/slug, `status` defaulted to `draft`; if the source has an
    HTML-format body (a `PagesHtmlDocumentStore` row exists for it), copy `body_html` onto the new id
    through that same store (`ensureHtmlFormat` + `write`, exactly `pages_write_html`'s own sequence);
    strip or reject `widgetEmbed` nodes in the copied `bodyJson` (the trap in §2) rather than silently
    carrying stale placement ids across rows — this is the one piece of real design work, not
    boilerplate, and it needs its own decision on strip-vs-reject before implementation.

**Option B shape**, if chosen — no new tool; a documentation/retrieval fix only, detailed in §5.

**Site-page navigation** (the dispatch's second ask) is a narrower, separable problem, and it likely
does **not** need a new tool either. `assistant_admin_screen_link`
(`apps/website/src/assistant/admin-screen-link-tool.ts`) already exists as the generic "point the
human at an admin screen" fallback, takes an open `path` segment with no enum/registry check, and its
own header already documents it as the intended fallback whenever no domain tool can perform the
action itself. Two options, smallest first:
- **Preferred:** extend `content_post_get`/`_list`/`_create`'s existing response with an `adminUrl`
  field (e.g. `/admin/pages/<id>` or `/admin/posts/<id>`, mirroring `apps/admin/src/features/pages/
  rules.ts`'s `pageAdminPath` id-fallback logic), the same way `publicUrl` was added to those same
  three tools on 2026-08-30 for the identical reason ("closing a real capability gap surfaced by a
  production transcript" — this file's own header). This is a response-shape addition to an existing,
  tested tool family, not a new registration surface, and it directly answers "where can I go edit
  this" the moment the model already has the row in hand.
  the model already has the row in hand.
- **Fallback, if a separate tool is wanted:** the model can already compose `content_post_get`/`_list`
  (to get an id) with `assistant_admin_screen_link` (`path: "pages/<id>"`) today — no schema change
  needed, only (again) a description/keyword cue, per §5.

## 4. The misleading error

**File/line:** `/Users/la/Programming/Jini/packages/agentic/src/core/page-executor.ts:414` (this repo's
`node_modules/@jini-ai/agentic` is a symlink to that workspace path):

```
`"${safePage}" is not a published page. Available: ${safePages.length > 0 ? safePages.join(', ') : '(none)'}`
```

`safePages` is `listPages()` — the admin-screen-id keys of `ADMIN_AGENT_PAGE_PATHS`
(`apps/admin/src/lib/agent-pages.ts`), never a CMS post/page title or slug. This text is genuinely
correct for its actual purpose (an admin-SPA navigation refusal) — the problem is that "page" and
"published" are exactly the vocabulary this codebase's OWN, unrelated `PostRecord.status ===
"published"` concept uses, so a model (or a human reading the transcript) that asked about a CMS Page
has every reason to misread this as "there is no published page named that" rather than "that is not
a registered admin-screen id."

**Confirmed: nothing in Tovu rewraps this today.** `PAGE_CAPABILITIES` is spread directly into
`frontend-control-capabilities.ts`'s combined capability set (line 106) and registered as-is via
`createFrontendControl` in `agent-daemon-server.ts` (line ~426) — no `catch`/reclassification layer
exists for this family, unlike `features/post/tool-registrations.ts`'s own
`toModelFacingUpdateError`, which exists for exactly this reason (reshaping a lower-layer error before
it reaches the model) on `PostVersionConflictError`.

**What it should say when the intent looks like CMS content, and where:** not a change to
`@jini-ai/agentic` itself — that package is a Jini workspace dependency with consumers beyond this one
repo, and its message is accurate for what it actually checks. The fix belongs on Tovu's side, at the
call site that wires `page.navigate` into the admin assistant's tool set, following the
`toModelFacingUpdateError` precedent: catch the thrown error there and append a disambiguating note,
e.g. `"${page}" is not a registered ADMIN SCREEN id (this navigates the admin UI, not site content).
Available screens: ${...}. Looking for a post or page instead? Use content_post_search /
content_post_get, not page.navigate.` The better fix, upstream of the error entirely, is the tool
description work in §5 — steering the model away from calling `page.navigate` with a CMS-page name in
the first place, so this message is rarely reached at all.

## 5. Wiring risk

**If Option A lands inside `features/post`:** low risk, by construction. `buildPostRegistrations`
wires its catalog with no `unwiredToolIds` escape hatch — the file's own comment: "a 7th catalog entry
added without a handler fails the build." Add the entry to `postAgentToolCatalog`
(`agent-tools.ts`) and its handler to `buildPostRegistrations`'s `handlers` map
(`tool-registrations.ts`); no change needed to `tool-catalog-manifest.ts` or
`assistant/tool-registrations.ts` — `contributePostTools()` already covers this domain.

**If Option A instead becomes a new standalone domain** (as `sites_duplicate_site` did): needs its own
`agent-tools.ts` + `tool-registrations.ts`, AND two separate edits to
`apps/website/src/server/runtime/composition/tool-catalog-manifest.ts` — the import line (pattern at
line 13, `contributeThemesTools`) and the `registerToolContributor(...)` call inside
`installFirstPartyToolContributors()` (pattern at line 227). Missing either one is exactly this repo's
dominant defect (correct primitive, unwired call site): the tool would exist, compile, and pass its
own unit tests while never actually being registered into any running assistant.

**A third, less obvious registration surface, confirmed by grep — not hypothetical:**
`apps/website/src/assistant/tool-search-keywords.ts`'s existing `content_post_*` entries carry NO
"copy"/"duplicate" keyword at all (`content_post_create`'s row: `"post blog article write new create
draft"` — no "copy"). If this assistant gates which tools the model sees behind a retrieval/search
step (the `tool-search-*.ts` file family strongly implies it does), then EVEN a correctly-composed
Option B fix, or a correctly-wired Option A tool, can still fail to reach the model on a "copy this
page" request if its keywords/description text never mentions "copy"/"duplicate" — a tool can be
registered, wired, and still never surfaced. Any implementation of either option must add "copy"/
"duplicate" to the relevant entries in `tool-search-keywords.ts` (and, if used for retrieval quality,
`tool-search-doc2query.ts`'s example-question set) as part of the same change, not as an afterthought.

**If the smaller `adminUrl`-on-response fix (§3) is chosen instead:** no new registration at all — it
changes `toPostToolViewWithPublicUrl` inside the existing, wired `content_post_get`/`_list`/`_create`
handlers. Zero wiring risk, but real test-surface risk: `apps/website/src/features/post/__tests__/
tool-registrations.public-url.test.ts` already asserts the exact response shape those three tools
return today (from the `publicUrl` addition this would mirror) and would need extending, not
replacing, the same way that file itself extended an earlier assertion when `publicUrl` was added.

## Summary for the owner

- The gap is real: no tool anywhere copies one page/post; only `sites_duplicate_site` copies (a whole
  site) and it's out of scope for this ask.
- The dispatch's framing was imprecise on three points, corrected above: pages have two real tool
  families already (`content_post_*` + `pages_*`), not "only `page_action`"; `page_action` is an
  unrelated, read-only, anonymous-visitor directive with no bearing on this failure; and `theme_*` is
  not full CRUD either (no theme-level create/delete/copy), so "no copy below whole-site" is a
  repo-wide pattern, not a pages-specific oversight.
- Decide: compose page-copy from existing tools now (cheap, ships today, but silently mishandles
  widget embeds if the copied page has any), or build a first-class `content_post_duplicate` that
  gets the embed case right once (more design work, no schedule estimate given here).
- Independent of that decision: `tool-search-keywords.ts` has no "copy"/"duplicate" vocabulary on
  `content_post_*` today — worth fixing regardless of which option is chosen, since it may be blocking
  retrieval of the very tools that already solve half of this.
- The misleading error is `page-executor.ts:414` in `@jini-ai/agentic` (Jini workspace, not this repo);
  recommended fix is a Tovu-side catch-and-rewrap at the `page.navigate` call site, matching the
  `toModelFacingUpdateError` precedent already in this codebase, plus steering the model away from
  reaching for `page.navigate` on CMS-page requests via the description/keyword work above.
