# ADR-065: Content-Template Naming Convention — `posts-*` / `pages-*`, Descriptive Not Enforced

- Status: ACCEPTED
- Date: 2026-09-03
- Author: Claude Opus 5 / Leon Aburime
- Supersedes: nothing.
- Relates: ADR-010 (declarative themes by default), ADR-020 (theme capability tiers — the `static`
  tier this convention applies to), ADR-012 (site template and instantiation — read to confirm it
  does not already govern per-theme file naming; it doesn't, see §Governing-ADR check below).

## Context

A `static`-tier theme's `theme.json` declares a `templates` array — the ordered list of
`pages/*.html` (schema v1) / `render/pages/*.html` (schema v2) filenames a Post **or** a Page can
pick between via its `templateChoice` column (`theme.ts:196-207`; DB column `template_choice`,
shared by both `kind: "post"` and `kind: "page"` rows on the `posts` table). This is deliberately
unified: as of the 2026-08-11 unification, ONE array serves both content kinds, replacing an earlier
kind-scoped `postTemplate`/`pageTemplate` split. The unification's own doc comment states why: the
old marker vocabulary made a template's slot type kind-specific, so a template file no longer
declares which kind it's "for" once the marker became a single `{"type":"content"}` shape
(`theme.ts:197`; `static-render.ts:72` — "The old `blog-post.html`/`page-shell.html` split (one
marker type per kind) is gone: BOTH doc-format Posts and Pages, and html-format Pages, use this exact
same function now").

The live `basic` theme's three template filenames — `blog-post.html`, `blog-sidebar-template.html`,
`page-shell.html` — carry no naming signal about which content kind they were designed for.
`page-shell.html` in particular is easy to misread as a Page-only mechanism; it is not — it is a
separate, route-level document-shell contract unrelated to `templateChoice` (see below). The owner
decided theme templates should be named for the content kind they were designed for —
`posts-*.html` / `pages-*.html` — so a theme's template list is self-documenting from its filenames
alone, without touching the underlying kind-agnostic selection mechanism the 2026-08-11 unification
deliberately built.

**Why not also make the prefix a validation rule (enforce kind-match)?** The live database already
has real, non-hypothetical cross-kind usage. Queried directly against `sites/tovu-com/content.db`:

```sql
select template_choice, kind, count(*) from posts group by template_choice, kind;
```

| template_choice | kind=post | kind=page |
|---|---|---|
| `blog-post.html` | 13 | **3** |
| `blog-sidebar-template.html` | 2 | **3** |
| `page-shell.html` | 0 | 6 |
| `''` (empty) | 45 | 26 |

Six live `kind: "page"` rows already select templates that would be named `posts-*` under this
convention (`blog-post.html` → `posts-default.html`, `blog-sidebar-template.html` →
`posts-sidebar.html`). Any rule rejecting a cross-kind selection would need to either break these
rows' render at the next request or force an unrequested reclassification pass — a much bigger
decision than a naming convention, and not what was asked for.

**`page-shell.html` carries a second, unrelated obligation that any rename must preserve.**
`STATIC_TIER_PAGE_SHELL_ID` (`static-render.ts:755`) and `STATIC_TIER_PAGE_SHELL_TEMPLATE`
(`apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts:77`) are two hardcoded,
Tovu-owned string constants that look up this exact filename directly as the generic document shell
for an untemplated `html`-format Page — **never** through `theme.manifest.templates` or its
ordering (`static-render.ts:751-800`'s own doc comment is explicit about this distinction). A theme
lacking the file degrades to Tovu's generic chrome (no `data-theme`, no theme
scripts/icons/manifest) rather than substituting some other template, logged once via a `[theme] …`
warning rather than failing hard. Renaming this one file is therefore not just a `templates` array
edit — it is a rename of a closed-vocabulary contract two independent call sites (site render,
admin canvas styling) depend on by literal string, both of which must move together.

### Governing-ADR check

No existing ADR governs template-file naming or the `templates` array specifically — checked by
grepping every ADR file in this directory for `templateChoice`, `template_choice`,
`blog-post.html`, and `page-shell.html`; the only hits are in this ADR and ADR-064 (unrelated,
deployment). The two ADRs closest in subject were read in full, not just skimmed:

- **ADR-010** (declarative themes by default) sets the `declarative`/`code` two-tier split that
  predates the `static` tier entirely and never mentions per-file template naming.
- **ADR-020** (theme capability tiers) is the closest relative — it names the `static` tier's
  sibling tiers and their engines — but its scope is *which engine/trust tier a theme uses*, not
  *how files within a tier are named*. It does not touch `templates`/`templateChoice` at all.
- **ADR-017** (three-pane content/template/preview editor) is `Proposed (blocked on theme system)`
  and discusses a Template *pane* in the editor UI, not template file-naming; not a governing ADR
  for this decision either.

Nothing here amends an existing ADR's scope. This is a new, narrowly-scoped decision — a new ADR is
correct rather than an amendment.

## Decision

Theme content-templates — the files listed in a static theme's `theme.json` `templates` array — are
named by the content kind they were designed for: `posts-*.html` for a template designed for Posts,
`pages-*.html` for a template designed for Pages.

**The prefix is descriptive of design intent only, not enforced: nothing in
`validateTemplateDeclarations` (`theme.ts:615-641`), `loadTheme()`, or the render path
(`resolvePostTemplate`, `static-render.ts:278-297`) checks a template's filename against the `kind`
of the row that selects it via `templateChoice`, so a Post may still select a `pages-*` template and
a Page may still select a `posts-*` template, and both render exactly as chosen with no warning or
error.** This is the single most important thing to get right about this decision — a reader who
assumes the prefix is validated will write code (or a bug report) against a rule that does not
exist. It is a direct, deliberate continuation of the 2026-08-11 unification's own reasoning
(§Context): reintroducing kind-checking on the filename would recreate the exact per-kind coupling
that unification removed, and would first have to explain away the six already-live cross-kind rows
above.

Standalone theme route pages — `index.html`, `about.html`, `blog.html`, `docs.html`, `404.html`, and
similar — are explicitly **out of scope**. These are addressable routes served directly by slug, not
entries in the `templates` array, and keep their existing names.

`pages-default.html` is the new name for the one filename in this array that is **not** a free
author choice: the canonical page-shell contract (`STATIC_TIER_PAGE_SHELL_ID` /
`STATIC_TIER_PAGE_SHELL_TEMPLATE`, §Context). A theme author following the `pages-*` prefix loosely
for this specific file is not merely off-convention — naming it anything else means the two
hardcoded lookups above silently stop finding it, and static Pages degrade to Tovu's generic chrome.

### Rename (implemented separately, in parallel)

| from | to |
|---|---|
| `blog-post.html` | `posts-default.html` |
| `blog-sidebar-template.html` | `posts-sidebar.html` |
| `page-shell.html` | `pages-default.html` |

This ADR records the naming decision the rename implements; it does not itself certify the rename's
implementation. **Status as last observed, 2026-09-03 (uncommitted working-tree state at the time of
writing — re-verify before relying on this section):** `sites/tovu-com/themes/static/basic/theme.json`
and its `render/pages/` directory carry the new names (`posts-default.html`, `posts-sidebar.html`,
`pages-default.html`); `content/themes/static/basic/theme.json` still lists the pre-convention names —
both verified directly against the files, not assumed. `static-render.ts`'s `resolveTemplate` path
now carries a `LEGACY_TEMPLATE_FILENAME_ALIASES` compatibility map (old id → new id, consulted only
as a fallback after a direct lookup misses) so a stored `templateChoice` naming an old filename keeps
resolving on the renamed theme. **Not yet observed to cover the page-shell-specific lookup**: the
separate `STATIC_TIER_PAGE_SHELL_ID` constant (`static-render.ts:792` as of this writing) still reads
`"page-shell"`, not the alias map — on a theme that has renamed `page-shell.html` to
`pages-default.html` and shipped nothing at the old name, this specific lookup would miss and degrade
untemplated Pages to generic chrome, which is the exact regression `resolveStaticTierPageShellFallback`
was built on 2026-09-02 to prevent. Flagged to the team lead as an implementation detail to verify
before this lands, not fixed here (out of this document's scope — no source file was edited to produce
this ADR).

### Adoption is partial, deliberately

Only the live site copy of the `basic` theme (`sites/tovu-com/themes/static/basic/`) is being
renamed to the new convention now. The shipped seed theme (`content/themes/static/basic/`), plus
`basic-2`, `tailark-dusk`, `tailark-quartz-dark`, `tailark-quartz-libre`, and `__original-themes__`,
keep the legacy names. **The repo will visibly not follow this convention uniformly, and that is
accepted, not a defect to chase down in the same change:** renaming every remaining theme, and
deciding whether stored `template_choice` values get backfilled to the new names, is separable work
the owner has not authorized in this pass — that decision is being made on evidence by the agent
implementing the rename, not settled here. Legacy filenames must keep resolving unconditionally: an
unrenamed theme, and any already-stored `templateChoice` value referencing the old names, must not
break.

## Consequences

- **Two hardcoded constants must accept both spellings**, not just the new one, for as long as any
  live theme or stored `templateChoice` still uses `page-shell.html`: `STATIC_TIER_PAGE_SHELL_ID`
  (`static-render.ts:755`) and `STATIC_TIER_PAGE_SHELL_TEMPLATE`
  (`use-theme-canvas-styling.hooks.ts:77`). This ADR does not require the old spelling be actively
  deprecated or ever removed.
- **Renamed files make existing doc comments false the moment the rename lands**, for the one theme
  it lands on. Every doc-comment citation of `blog-post.html`/`blog-sidebar-template.html`/
  `page-shell.html` in `static-render.ts`, `theme.ts`, and the two theme-authoring guides that
  refers to `sites/tovu-com/themes/static/basic/`'s real filenames goes stale for that theme
  specifically — not for the five themes keeping legacy names, whose citations stay accurate. This
  ADR does not itself correct those comments; whoever lands the rename owns updating the comments it
  makes false, per this repo's standing rule against confident-but-wrong code comments.
- **The `templates` array stays purely descriptive metadata for humans and AI authoring tools**,
  the same non-enforced relationship `theme.json`'s `pages` field already has to the real rendered
  page set (v1 guide §3.2) — useful for a quick inventory, harmless to get slightly out of
  convention, never load-bearing for routing or validation beyond `validateTemplateDeclarations`'s
  existing file-exists/marker-present check.
- **No backfill of stored `template_choice` values — decided, not left open, per the implementing
  agent's own code comment** (`static-render.ts`, `LEGACY_TEMPLATE_FILENAME_ALIASES`'s doc, observed
  2026-09-03): the 27 rows on `sites/tovu-com/content.db` still storing `blog-post.html` /
  `blog-sidebar-template.html` / `page-shell.html` (matching this ADR's own evidence table exactly —
  13+3, 2+3, 0+6) are deliberately **not** rewritten. Rationale given: backfilling to the new name
  would make a row **more** fragile on a future theme switch, not less — a theme that still ships only
  the old filename would stop matching a backfilled row, whereas the alias map keeps a row storing the
  OLD name resolving correctly against both old-named and new-named themes. This ADR adopts that
  reasoning rather than re-deciding it.
- **Reinforces, does not reopen, the 2026-08-11 unification.** A future contributor tempted to
  "finish the job" by making the prefix enforced should read the cross-kind evidence above first —
  enforcement was considered and explicitly rejected here, not merely deferred by omission.

## Rejected alternative

**Enforce the prefix at validation time** — reject a `templates` entry whose prefix doesn't match
some declared expectation, or reject a `templateChoice` that crosses kinds. Rejected: 6 live Page
rows on the production database already select Post-prefixed templates today; enforcing either
direction would break those rows' render or force an unrequested reclassification pass, for a
convention the owner asked for as self-documentation, not as a new validation rule. Revisit only if
the owner separately decides cross-kind template selection should become an error — see
§Re-evaluation triggers.

## Re-evaluation triggers

- The owner asks to enforce the prefix — re-open with this ADR's cross-kind evidence in hand, and
  decide how to handle the (by then, possibly more) already-live cross-kind rows before adding any
  rejection path.
- A second theme is migrated to the new convention — worth re-checking that the two hardcoded
  page-shell constants, and any `templateChoice` resolver logic, still correctly accept both
  spellings under real multi-theme conditions, not just `basic`.
- Stored `template_choice` backfill is decided — record the outcome here as an amendment, or in a
  follow-up ADR; this one deliberately leaves it open rather than guessing at an unmade decision.
