# Theme capability-CSS gap — 7-theme inventory + `fuel` worked example

**Date:** 2026-08-12
**Scope:** Bounded pass per Coordinator brief — inventory across all 7 static themes, plus ONE theme
(`fuel`) implemented as a worked example. The other five (`gracious-timing`, `portfolite`,
`tailark-dusk`, `tailark-quartz-dark`, `tailark-quartz-libre`) are inventoried but **not touched**.

## TL;DR

The brief's framing — "only `basic` has capability CSS, the other six are the same gap, just missing
CSS" — is correct for **five** of the six non-`basic` themes. `fuel` is a **different, larger** problem:
it cannot currently render a single post's real content through the styled template path *at all*,
CSS or no CSS. Adding capability CSS to `fuel` (this pass's worked example) is still correct prep work,
but it is dormant until a separate, structural gap (no `blog-post.html` template) is closed — that is
new template-authoring work, not a CSS backfill, and is explicitly **not** done here.

## The authoritative capability list (derived from `basic`, not from the brief's own list)

`basic/css/styles.css:300-343` is the only place these five capability groups are styled. Each one
maps to a `renderDocNode`/`renderMarks` case in `src/server/http/site/render.ts` that emits a fixed
class name or attribute selector, independent of theme — confirmed by reading the render cases
directly, not inferred from the CSS alone:

| # | Capability | Renderer output (`render.ts`) | Selector(s) `basic` styles | Added |
|---|---|---|---|---|
| 1 | Highlight mark | `<mark>` / `<mark style="background-color:…">` (`renderMarks`, `"highlight"` case, line ~293) | `.post-detail-body mark` | 2026-08-11 |
| 2 | Table | `<table>`/`<tr>`/`<td>`/`<th>` (`renderDocNode`, `"table"`/`"tableRow"`/`"tableCell"`/`"tableHeader"`, line ~589) | `.post-detail-body table`, `.post-detail-body th, .post-detail-body td`, `.post-detail-body th` | 2026-08-11 |
| 3 | Task list | `<ul data-type="taskList">` / `<li data-type="taskItem"><label>…</label><div>…</div></li>` (line ~573) | `.post-detail-body ul[data-type="taskList"]`, `li[data-type="taskItem"]` (+3 descendant rules) | 2026-08-11 |
| 4 | YouTube embed | `<div class="youtube-embed"><iframe>…</iframe></div>` (line ~677) | `.post-detail-body .youtube-embed`, `.post-detail-body .youtube-embed iframe` | 2026-08-11 |
| 5 | Post mention | `<a class="post-mention" href="/…">@label</a>` (line ~693) | `.post-detail-body .post-mention`, `:hover` | 2026-08-11 (mention) / 2026-08-12 (today) |

Excluded from this list, deliberately: `basic`'s `.post-detail-body code/pre/img/blockquote` (lines
292-299) are **pre-existing baseline typography**, not tagged to the 2026-08-11 capability pass in
their own comments (unlike all five rows above, which each carry an explicit "2026-08-11" comment) —
inline code/paragraphs/lists predate the rich-text expansion. Font-family/size/line-height/color/
background-color (the `textStyle` mark) are excluded for a structural reason, not an oversight: they
render as inline `style="…"` attributes (`render.ts:263-292`), so there is no selector for any theme to
carry — that capability is already theme-independent by construction and has no gap.

## Part 1 — the 7-theme inventory

**Critical finding that changes the shape of this inventory**: whether a capability selector's absence
even matters depends on whether the theme reaches `.post-detail-body` at all. That wrapper is not
theme-authored — it's a fixed string the SERVER emits (`renderWidgetPostContent`,
`src/server/http/site/render.ts:1206`, `` `<div class="post-detail-body">${renderDocNode(bodyJson)}</div>` ``),
reachable only when `isEligibleForTemplateBranch` (`src/features/theme/static-render.ts:611-620`)
returns true — which requires `theme.json` to declare a non-empty `templates` array AND at least one of
those template files to actually contain the `{"type":"content"}` embed marker. Verified directly
(`theme.json` + `grep` for the marker) for all 7 themes:

| Theme | `templates` (theme.json) | Template file has `{"type":"content"}` | Reaches `.post-detail-body`? |
|---|---|---|---|
| `basic` | `blog-post.html`, `blog-sidebar-template.html`, `page-shell.html` | yes (all 3) | **yes** |
| `fuel` | *(none — key absent)* | n/a — no template file exists | **no** |
| `gracious-timing` | `project.html` | yes | **yes** (its only template, misleadingly named — see note) |
| `portfolite` | `blog-post.html` | yes | **yes** |
| `tailark-dusk` | `blog-post.html` | yes | **yes** |
| `tailark-quartz-dark` | `blog-post.html` | yes | **yes** |
| `tailark-quartz-libre` | `blog-post.html` | yes | **yes** |

`gracious-timing` note: its sole declared template is `project.html` (a case-study layout), not
`blog-post.html`. Since a theme's `templates` list is generic (any post/page can pick any listed
template, and the admin editor defaults an unset choice to `templates[0]` —
`use-post-editor.hooks.ts`'s load effect), `project.html` is also what an ordinary blog post defaults
into on this theme. Confirmed it carries the same `data-embed-config='{"type":"content"}'` marker
(`gracious-timing/pages/project.html:24`), so it reaches `.post-detail-body` exactly like a
purpose-named `blog-post.html` would.

`fuel` has no `templates` key in `theme.json` at all and no template-shaped page file anywhere in its
directory. `isEligibleForTemplateBranch` returns `false` unconditionally, so `pages.ts`'s route handler
falls through to the generic `renderSite({ route: "post", … })` path. For `route !== "home"` on a
static theme, that resolves to `entryContent` (`render.ts:835-838`), which wraps the post body in
`<div class="wrap"><a class="back">…</a><article class="entry">…<div class="prose">BODY</div></article></div>`
— generic classes (`.entry`/`.prose`), generic `siteHeader`/`siteFooter` (`render.ts:746-751,840-842`,
**not** `fuel`'s own `nav.html`/`footer.html` partials), and `fuel/css/styles.css` has zero rules for
`.entry`/`.prose` (confirmed by grep — only 2 unrelated `.site-header`/`.site-footer` rules exist,
authored for `fuel`'s own static pages, coincidentally same class names). A post on `fuel` today is a
200 response with real content, generically wrapped, entirely off-brand — not a 404, not an error, and
not what the brief's "structurally correct but unstyled" framing describes (that framing is accurate
for the other five; `fuel` never even reaches the styled structural layer).

### Capability-selector presence, for the 6 themes that reach `.post-detail-body`

Verified by `grep` against each `css/styles.css`, count of matching selector occurrences:

| Theme | Highlight mark | Table | Task list | YouTube embed | Post mention |
|---|---|---|---|---|---|
| `basic` (source) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `gracious-timing` | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) |
| `portfolite` | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) |
| `tailark-dusk` | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) |
| `tailark-quartz-dark` | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) |
| `tailark-quartz-libre` | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) | ❌ (0) |

Exactly matches the brief's characterization for these five: pure CSS gap, template path already
works, `.post-detail-body` already reachable, all 5 capability groups completely absent.

`fuel` is excluded from this table on purpose — "0/5 selectors present" would be true but misleading
next to the other five, since for `fuel` the selectors are unreachable regardless of count.

## Part 2 — `fuel` implemented (worked example)

**Commit:** (see below) — `src/themes/static/fuel/css/styles.css` only.

Added the same 5 capability-selector groups as `basic`, scoped to `.post-detail-body`, placed in a new
"Post detail body" section right after `fuel`'s existing "Blog-post page" section (that existing
section styles `fuel`'s own pre-authored marketing blog mockups — `.post-hero`/`.post-body` grid — a
different thing from the dynamic per-post template this backfill targets).

### Token mapping

`fuel/tokens.json` has every custom-property name `basic`'s rules reference, under the identical name
— no renaming or judgement calls needed for the structural rules:

| `basic` rule uses | `fuel` token | Fuel's actual value |
|---|---|---|
| `var(--border)` (table cell borders) | `var(--border)` | `rgba(17,17,17,0.10)` |
| `var(--surface)` (table header bg) | `var(--surface)` | `#f7f7f7` |
| `var(--accent)` (mention link color) | `var(--accent)` | `#111111` (fuel's near-black brand accent, not `basic`'s) |

**One judgement call, not a token substitution:** the highlight `<mark>` color
(`background: #fef08a; color: #422006`) is copied verbatim from `basic` rather than mapped to a `fuel`
token. `basic`'s own comment states this is a deliberate, fixed, theme-independent
highlighter-yellow — chosen specifically so it stays legible regardless of an author-supplied inline
`background-color`, not a themed color. Treating it as a token would be inventing a rule `basic` itself
doesn't follow; copying the same constant is the correct "backfill from the authoritative source" move,
same as reusing the un-tokened structural values (`border-collapse`, `flex` layout, `aspect-ratio: 16/9`
etc.) that neither `basic` nor `fuel` ever tokenizes.

**Tokens mapped cleanly:** 3 of 3 (`--border`, `--surface`, `--accent`). **Values requiring a judgement
call:** 1 (the mark color, resolved by copying `basic`'s own stated-deliberate constant, not inventing
a new one). No case where `fuel` lacked a suitable token — nothing was hardcoded to fill a gap.

### Why this is dormant (the thing not to miss)

This CSS cannot currently take visible effect. `fuel` has no `templates` array in `theme.json` and no
`blog-post.html` (or any template) file, so no post ever renders with a `.post-detail-body` wrapper —
see Part 1. The rules are added anyway per this pass's brief (CSS-only, using existing tokens) so they
are ready the moment `fuel` gets a template; giving it one is a separate, larger change (a new HTML
page file plus a `theme.json` edit — template *authoring*, not styling) explicitly out of scope here.

### Verification performed (static, no server restart)

- Confirmed `fuel`'s pages link exactly one stylesheet (`<link rel="stylesheet" href="../css/styles.css">`,
  `pages/index.html:8`) — no second/later-loaded partial that could out-cascade these rules once
  reachable.
- Grepped for a pre-existing bare `table`/`mark` element selector elsewhere in `fuel`'s stylesheet that
  could tie or beat the new rules on specificity/source order — none found.
- Confirmed no duplicate selectors were introduced (occurrence counts match exactly the 10 new
  selector lines added).
- Brace-balance sanity check on the full file (200 open / 200 close).
- **Not done**: an actual browser render. `:3000` caches theme files at boot and a restart needs
  sign-off (owner is watching it) — flagged to Coordinator rather than restarting unilaterally. In this
  specific case a live render would not have proven the fix works anyway (see above: it structurally
  cannot yet, template or no CSS), so the static verification above is the complete, conclusive check
  available without a template also existing.

## Estimate for the remaining five

`gracious-timing`, `portfolite`, `tailark-dusk`, `tailark-quartz-dark`, `tailark-quartz-libre` are all
in the "pure CSS gap" bucket — `.post-detail-body` already reachable, same 5 selector groups missing,
same token-substitution mechanics `fuel` just demonstrated (read each theme's own token file, map
`--border`/`--surface`/`--accent`-equivalent names, copy the highlighter-yellow constant verbatim,
copy the un-tokened structural rules as-is). Each is a same-shaped, small, low-risk diff — expect
15-25 minutes per theme including reading its token file and placing the new section sensibly, so
roughly **1.5-2 hours** for all five, plus whatever time the owner wants spent on live-rendering
verification per theme (blocked on the same `:3000` restart/rescan sign-off noted above, once for all
five rather than once per theme). None of the other five have `fuel`'s template gap — ordinary
backfill-and-verify work, not a structural fix.

Related: [[project_tovu_theme_copy_model]], [[feedback_css_presence_is_not_precedence]]
