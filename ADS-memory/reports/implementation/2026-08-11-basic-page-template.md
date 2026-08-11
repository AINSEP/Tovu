# Implementation report — `basic`'s page-shell.html + assigning it to the 5 legacy Pages

Agent: Sonnet 5 subagent (`programmer` persona, `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1),
dispatched 2026-08-11 on branch `general-work`. Ground truth: `ADS-memory/reports/implementation/
2026-08-11-pages-template-picker.md` (predecessor) + `ADS-memory/reports/continuity/
2026-08-11-pages-template-decisions.md` (owner decisions).

Five tasks, in dispatch order. Code commit: `72d7f2b` (title-survival fix + load-time validation +
tests). Theme addition (`page-shell.html` + `theme.json`'s `pageTemplate` line): landed inside
`028dba3`, a concurrent agent's commit — see "Commit hygiene note" below for why, and how it is still
cleanly isolable.

---

## Task 1 — recover and author `page-shell.html`

**Status: DONE, with a real bug found and fixed during authoring.**

Recovered via `git show '085e4c1^:src/themes/static/basic-child/pages/page-shell.html'` (the file
`085e4c1` deleted the same session, alongside dead runtime theme inheritance). Kept the structure
(nav marker → `<main><article class="wrap post-detail" data-reveal>` → footer marker → scripts) and
its "why nav/footer can't be forgotten" reasoning, but rewrote the second paragraph: it talked about a
child theme forking a parent and inheriting nav/footer content at runtime — that model was deleted
the same day. Rewrote it around the copy-not-inherit model (themes are copied from a pristine
catalog; editing a theme's own copy of this ~10-line file is cheap because nav.html/footer.html still
hold the real content, untouched by any edit here).

**The one structural change**: swapped `{"type":"post","id":"{{post}}"}` for `{"type":"content"}`.

**The title trap, and the bug I introduced fixing it**: `renderStaticPage`/`pageShell` apply zero
title logic to a templated render — the `<title>` in the raw template file IS the final `<title>`,
verified by reading `renderStaticPage` (`static-render.ts`) and `renderPostViaTemplate`/
`renderPageViaTemplate` (`pages.ts`) directly: neither calls `buildExtraHead`/`foldPageHead` (the SEO
fold that gives the CURRENT non-templated Page render path its correct per-page `<title>`). Shipping
the recovered file's literal `<title>Page — Basic</title>` would have reintroduced the exact bug
Task 1 of the predecessor's dispatch fixed (`<title>Blog post — Basic</title>` on all five pages) —
this time via the Page path instead of the accidental Post-branch hijack.

Fix: `injectPageTitle` (`static-render.ts`), a new pure function mirroring `injectPostEmbedId`'s
string-substitution convention — a literal `<title>{{title}}</title>` placeholder in the template,
substituted with the Page's real title, wired into `renderPageViaTemplate` right alongside
`injectPageContent`. `blog-post.html`'s identical limitation for Posts is left alone (disclosed,
accepted, out of scope — I am not authorized to touch existing `basic/` files, and `renderPostViaTemplate`
was never in scope here).

**Caught while authoring, before shipping**: my first version used a bare-token
`.replace("{{title}}", ...)`. `page-shell.html`'s own explanatory comment mentions the placeholder as
prose one paragraph above the real `<title>` tag — `.replace()`'s first-match semantics matched the
COMMENT, not the real tag, silently leaving `<title>{{title}}</title>` unfilled in the output. Found
via a local repro script before it ever reached a test or a live page. Fixed by scoping the match to
the whole `<title>...</title>` element (mirroring how `injectPostEmbedId` scopes its own match to
`"id":"..."` rather than a bare `{{post}}`) and reworded the comment to not spell out the literal
token. Regression-guarded explicitly in `inject-page-title.test.ts` ("an authoring comment that
mentions the placeholder as prose does not shadow the real `<title>` slot").

**`class="post-detail"` reviewed, kept**: checked `css/styles.css` — `.post-detail` sets
`max-width: 720px; margin: 0 auto; padding: 72px 0 96px` plus heading/paragraph/list/code typography.
It is the theme's one long-form-article style, already reused by `blog-sidebar-template.html`'s docs
article (line 490's own comment confirms this), not something post-specific in effect despite the
name. Kept it rather than authoring a near-duplicate class.

**Also added, not in the recovered file**: `<script src="../js/theme-toggle.js"></script>` in
`<head>` and `<script src="../js/vendor/motion.js"></script>` before `reveal.js`. Checked: every
single page in `basic/pages/` (`about.html`, `docs.html`, `blog-post.html`, …) loads both. Without
`theme-toggle.js`, `nav.html`'s real `<button data-theme-toggle>` would render but do nothing on
these five pages specifically, and the dark/light mode saved in `localStorage` would not reapply on
load — a real, visible, page-specific inconsistency the recovered file predates (it was authored
before `basic`'s nav shipped the toggle button). Without `vendor/motion.js`, the `data-reveal`
fade-in on the article would silently no-op (`reveal.js`'s own `if (!window.Motion) return`) —
harmless but inconsistent with every sibling page.

## Task 2 — register `pageTemplate` in `theme.json`

**Status: DONE**, one line: `"pageTemplate": ["page-shell.html"]`, alongside the existing
`postTemplate`.

**Load-time validation — did NOT exist, so I built it** (the brief asked me to check, not assume). No
`loadTheme` code anywhere validated that a `postTemplate`/`pageTemplate` entry actually carries a
matching slot marker; a bad entry would previously load "valid" and silently render an
empty/mis-templated page — the owner's continuity doc names this explicitly as the failure class to
close. Added `validateTemplateDeclarations` (`theme.ts`), called from `loadStaticTierAssets` for BOTH
`postTemplate` (`"post"` marker) and `pageTemplate` (`"content"` marker) — one function, not two
copies. The owner's doc explicitly invited adding the symmetric `postTemplate` check "if the shape is
identical, which it is" — confirmed by checking every live static theme's `postTemplate` entries
(`blog-post.html`, `blog-sidebar-template.html`, `project.html` across 6 themes) all already carry a
real `"post"` marker, so this added guard changes zero themes from valid to invalid. 11 tests in
`theme-static-tier.test.ts` (missing file, missing marker, present marker, symmetric postTemplate
case, absent-field no-op). Negatively verified: stubbed the guard to `return []`, watched the 3
relevant tests fail with `'valid' !== 'invalid'`, restored, reran green.

**On-disk convention confirmed, not guessed**: read `resolveTemplateChoice` (`static-render.ts`) —
it looks up `theme.pages[pageId]`, and `theme.pages` is populated purely from `pages/*.html`
(`loadStaticTierAssets`). So a page template MUST live under `pages/`, same as `blog-post.html`
already does — no alternative convention exists to choose. **Flagging exactly what the brief asked
me to flag**: `pages.ts`'s marketing-page route checks `theme.pages[slug] !== undefined` (not
`theme.manifest.pages`, the declared marketing-page allowlist), so `page-shell.html` is now directly
reachable at `GET /page-shell` the same way `blog-post.html` has always been reachable at
`/blog-post` — pre-existing behavior across every template file in this theme, not something this
task introduced, and out of this task's scope to fix. It will also appear in the Explore file list
alongside real marketing pages, same as `blog-post.html`/`blog-sidebar-template.html` already do.

## Task 3 — assign the template to the five published legacy pages

**Status: DONE, live-verified per page.**

**Restore point** (captured before any write, `@jini-ai/infra`'s `SqliteDbOpsAdapter`, same mechanism
the admin Database panel and the predecessor's conversion script use):

```
artifactRef='/Users/la/Programming/Tovu/infra/restore-point-assign-page-shell-template-to-legacy-pages-wm2-1786484079805.db'
watermarkAtCapture=2
```

**How it was set — corrected from the brief's phrasing**: `PagesHtmlDocumentStore` (I checked its
full surface) only owns a Page's `body_html` — `template_choice` is not one of its fields at all. The
real chokepoint for `template_choice` is `updatePost` (`src/features/post/post.ts`), reached through
the SAME `PUT /api/admin/v1/workspaces/:id/posts/:postId` route the Pages editor's own Save button
calls (confirmed by reading `apps/admin/src/lib/api.ts`'s `updatePost` client and
`src/server/routes/admin/posts/update.ts`'s handler — command-gateway wrapped, `content.write`
authorized, change-set recorded, revertible). I called that same route directly (via `fetch()` run
inside the already-authenticated admin browser session, `credentials: "same-origin"`) rather than
clicking through the picker UI, because **the Playwright session in this environment is shared across
concurrent agents** — I observed another agent's navigation land mid-task (URL jumped to
`/admin/pages/hacker-news` between my own calls). A multi-step click-then-Save UI flow is racy under
that condition; an atomic `fetch()` to the real route, driven by an id rather than "whichever page is
currently open," is not. This is still "through the application," never raw SQL, and it is the exact
route the picker itself uses — I verified the picker reflects the result correctly afterward (see
Task 5).

All 5 succeeded (`200`, `templateChoice: "page-shell.html"` in the response, title/slug/status
unchanged):

| slug | before | after |
|---|---|---|
| terms-of-service | `templateChoice: null` | `templateChoice: "page-shell.html"` |
| privacy-policy | `templateChoice: null` | `templateChoice: "page-shell.html"` |
| contact | `templateChoice: null` | `templateChoice: "page-shell.html"` |
| team | `templateChoice: null` | `templateChoice: "page-shell.html"` |
| faq | `templateChoice: null` | `templateChoice: "page-shell.html"` |

The four `untitled*` drafts and `our-story` were not touched.

## Task 4 — `our-story`

**Status: DECIDED — leave it alone, with a corrected root-cause trace.**

The predecessor's trace ("stranded explicit choice falls back to the theme's first usable template,
by design, not a regression") still holds, but I verified — not assumed — what actually happens now
that `page-shell.html` exists, and the brief's own hope ("may simply resolve correctly again") turns
out to be **wrong**: `our-story` is `kind: "page"`, `bodyFormat: "doc"`, `templateChoice:
"page-shell.html"` (confirmed live via the admin API). `bodyFormat: "doc"` means it is routed through
`isEligibleForPostTemplateBranch` → `renderPostViaTemplate` → `resolvePostTemplate`, NOT
`renderPageViaTemplate`/`resolvePageTemplate`. I proved this directly (`resolvePostTemplate` given the
real `basic` theme and `templateChoice: "page-shell.html"` returns `{kind: "template", pageId:
"blog-post"}` — the fallback — while `resolvePageTemplate` given the exact same input correctly
returns `{kind: "template", pageId: "page-shell"}`). The reason: `resolvePostTemplate` requires a
`"post"` marker, and `page-shell.html` deliberately carries `"content"`, not `"post"` — that split is
the whole point of Task 3/4's separate-arrays design (`ADS-memory/reports/continuity/
2026-08-11-pages-template-decisions.md`'s DECIDED section). So `page-shell.html` existing did not fix
`our-story`; it cannot, while `our-story` stays `doc`-format, because it is structurally the wrong
template SHAPE for the resolver `doc`-format rows go through, not a missing-file problem. Live-confirmed:
`/our-story` still renders `<title>Blog post — Basic</title>` via `blog-post.html`'s fallback, 200,
real content, themed nav/footer (unchanged from the predecessor's own observation).

**Why I did not fix it**: three real options exist — (a) convert `our-story` to `bodyFormat: "html"`
via a Task-2-style content migration (a script that touches its `body_json`→`body_html`, which the
predecessor's Task 2 explicitly did NOT authorize itself to do without a restore point and owner
sign-off, and I have no signal the owner wants their standalone demo page converted), (b) author a
POST-shaped equivalent page-shell so `our-story` can use it (a second near-duplicate template file for
one demo row), or (c) re-point `our-story`'s `template_choice` to `blog-post.html` explicitly (purely
cosmetic — makes the current de-facto behavior explicit, changes nothing observable). None is
obviously "the" fix, `our-story` is explicitly the demo row this whole feature was proven against (not
real content), and the brief scoped my write authorization to the five published pages only. Leaving
it alone is itself the decision, recorded here with the reasoning, per the brief's instruction to
"decide" rather than a default to fix.

## Task 5 — end-to-end proof

**Status: DONE, per page, not aggregate.**

`curl` on all 5, individually:

| slug | `<title>` | nav | footer | `.wrap post-detail` | unresolved markers | `widget-placeholder` |
|---|---|---|---|---|---|---|
| terms-of-service | `Terms of Service` | ✓ | ✓ | ✓ | 0 | 0 |
| privacy-policy | `Privacy Policy` | ✓ | ✓ | ✓ | 0 | 0 |
| contact | `Contact` | ✓ | ✓ | ✓ | 0 | 0 |
| team | `Team` | ✓ | ✓ | ✓ | 0 | 0 |
| faq | `FAQ` | ✓ | ✓ | ✓ | 0 | 0 |

"Unresolved markers" checked precisely, not by raw `grep -c data-embed-config` (which is nonzero on
every page — `content`/`menu` markers legitimately KEEP their wrapper attribute forever per
`withInnerContent`'s documented contract): I inspected each surviving marker's actual inner content
per page and confirmed all 3 per page (`menu-header-nav`, `content`, `menu-footer-nav`) carry real
substituted output (real links, the real FAQ body), zero literal `{{title}}`/`{{post}}` leftovers,
zero `widget-placeholder` anywhere across all 5 pages.

Picker at `http://localhost:5173/admin/pages/faq`: confirmed via accessibility snapshot BEFORE the
assignment that `page-shell.html` was already selectable (not disabled) with "No template chosen"
selected, and AFTER, that it shows `page-shell.html` `[selected]`. Screenshots captured:
`.playwright-mcp/faq-before.png` (public FAQ, pre-template, bare `<h2>`s inside a generic
`Tovu Demo Site` shell — NOT `basic`'s real nav/footer at all, since the untemplated Page path uses
`renderSite`'s cross-tier generic entry/footer, not `renderStaticPage`), `.playwright-mcp/
faq-after-public.png` (public FAQ, post-template: real `basic` nav with theme-toggle/Sign in/Get
started, centered ~720px prose column, real multi-column footer), `.playwright-mcp/
faq-editor-picker-after.png` (admin picker showing `page-shell.html` selected). Console: zero errors
attributable to this change (`favicon.ico` 404 only, pre-existing and unrelated).

Login was already authenticated in the shared session; `admin`/`tovu-dev` was not needed.

---

## Commit hygiene note — a real git-index race, and why I did not rewrite history to fix it

`apps/admin/src/features/themes/ThemeExplore.tsx`/its test/`styles.css` belong to a concurrently
active agent (`ExploreUI2`), explicitly off-limits to me. When I ran `git add
src/themes/static/basic/pages/page-shell.html src/themes/static/basic/theme.json`, the shared index
already held that agent's staged files; before I could `git commit` my two-file set separately, that
agent's own `git commit` ran first and swept up everything staged at that moment — including my two
files — into their commit `028dba3`. I did not discover this until after the fact (`git diff --cached`
showed their files staged alongside mine, which I then unstaged with `git reset HEAD -- <their 3
paths>`, but by then their commit had already happened and moved HEAD, so nothing was left to
separate).

I deliberately did **not** rewrite `028dba3` to split it out: it is a concurrent agent's commit,
possibly still being built on, and this session's standing rules are explicit about not taking
destructive/rewriting git actions without a clear need. The separation the brief wanted
("revertible alone") is still fully available without touching history:

```
git diff 028dba3^ 028dba3 -- src/themes/static/basic/theme.json src/themes/static/basic/pages/page-shell.html
```

is a clean, self-contained 2-file/60-line additive diff (confirmed), and
`git checkout 028dba3^ -- src/themes/static/basic/theme.json src/themes/static/basic/pages/page-shell.html`
reverts exactly and only my part if ever needed. Content at current HEAD verified correct
independently of this: `pageTemplate` line present, `page-shell.html` present and unmodified from
what I authored.

Separately: my own first commit attempt (`git commit -m "$(cat <<'EOF' ... EOF)"`) produced a commit
message with a stray literal `EOF`/`)` appended (a heredoc-construction artifact, not a tool
behavior I understand the root cause of). Caught by reading back `git log -1 --format=%B` immediately
after, before doing anything else — fixed with `git commit --amend -F <file>` (same commit, just
created by me in this same turn, not pushed, no hook failure — the narrow case where amending is
lower-risk than leaving a garbled message in permanent history) and confirmed clean.

---

## Function-quality table

| unit | disposition | findings | complexity |
|---|---|---|---|
| `injectPageTitle` (static-render.ts) | RECORDED_AND_FIXED | MEDIUM: initial bare-token match collided with an incidental mention of the placeholder in the template's own comment, silently leaving `<title>` unfilled — caught pre-ship via a local repro, fixed by scoping the match to the whole `<title>...</title>` element, regression-guarded in `inject-page-title.test.ts` | O(n) over `html` length |
| `escapeHtmlText` (static-render.ts, private) | NO_RECORDED_FINDINGS | — | O(n) over `value` length; 4-line mirror of `render.ts`'s own vetted `escapeHtml`, no new escaping logic |
| `validateTemplateDeclarations` (theme.ts) | NO_RECORDED_FINDINGS | — | O(t) over the template array; O(n) per entry's marker scan |
| `loadStaticTierAssets` (theme.ts, modified) | NO_RECORDED_FINDINGS | — | unchanged O(f) shape, 2 added parameters + 2 added calls, no new branching |
| `renderPageViaTemplate` (pages.ts, modified) | NO_RECORDED_FINDINGS | — | unchanged I/O-bound shape, one added pure call inserted into the existing sequence |

**Zero-findings skepticism pass** (for the 4 units with no findings): `escapeHtmlText` is a verified
byte-for-byte mirror of an already-shipped, already-reviewed function — no new logic to distrust.
`validateTemplateDeclarations` is a straight loop over ≤2 candidates with two independently-tested
branches (missing file, missing marker) and no state; its error-message strings are asserted
verbatim in `theme-static-tier.test.ts`, not just presence-checked, so a wrong field name or wrong
marker type in the message would fail the test. `loadStaticTierAssets`/`renderPageViaTemplate` both
only gained a threaded parameter and a call to an already-assessed function — no new decision logic
of their own to audit. Variable-name audit: `withTitle` (pages.ts) holds the template AFTER title
substitution, BEFORE content substitution — checked it is used only to feed `injectPageContent` next,
never confused with the final `bodyResolvedHtml`; no mismatch found.

`injectPageTitle` is the one unit that actually shipped with a bug during this session (not a
disclosed risk — a real defect caught before commit). Recorded here rather than silently folded into
"no findings" because that is precisely the kind of finding step 10a exists to surface.

## Architecture Audit

**Status: PASS.**

- `validateTemplateDeclarations` imports `markersOfType` from `#src/core/embeds/marker` — checked
  `marker.ts` has zero imports of its own (a leaf module), so this adds no cycle risk into `theme.ts`.
- `injectPageTitle`/`escapeHtmlText` were kept OUT of `server/http/site/render.ts` deliberately, even
  though that file already exports an identical `escapeHtml` — importing it would create the first-ever
  runtime edge from `features/theme` back into `server/http/site` (today only a type-only import runs
  the other direction). A 4-line duplicate was judged cheaper than introducing that edge.
- `page-shell.html`/`theme.json`'s `pageTemplate` line are the only changes inside `src/themes/static/
  basic/` — no existing file in that directory was modified or reverted (confirmed via `git diff` on
  `theme.json` showing exactly one added line, and `page-shell.html` being a new file).
- Stayed out of `apps/admin/src/features/themes/ThemeExplore.tsx`, `Themes.tsx`, `apps/admin/src/
  styles.css`, and `apps/admin/src/features/pages/PageEditor.tsx` (ExploreUI2's zone) — confirmed via
  `git show --stat` on my own commit that none of those four appear in it.
- No ADR ambiguity encountered.

## Pre-Completion Checklist

- Requirements re-verified against the brief's 5 tasks + owner's continuity doc, above.
- Fresh evidence commands re-run in this same session, after all changes: `npx tsc --noEmit` (exit 0),
  71/71 scoped `node:test` tests across 8 files, `npm run check:embed-marker-drift` (138 theme files +
  11 stored Page bodies, zero findings), per-page `curl` verification of all 5 legacy pages plus
  `our-story`, admin-API round-trip confirmation of all 5 `templateChoice` writes, live picker
  snapshot before/after.
- No certified test was deleted or weakened. `page-template-render.canary.test.ts` was rewritten, not
  weakened — it now asserts against `basic`'s real shipped file instead of a synthetic fixture, a
  strictly stronger version of the same claims (plus new title assertions the old version could not
  make, since `injectPageTitle` did not exist yet).
- Scope: exactly as authorized (`page-shell.html` added, one line added to `basic/theme.json`, no
  other file in `basic/` touched) plus the code changes needed to make the title survive and to add
  the load-time guard, both outside `basic/` and both explicitly invited/required by the brief and the
  owner's continuity doc.
- Open items: `our-story` intentionally left unresolved (see Task 4); `page-shell.html`/`blog-post.html`
  are reachable as bare theme-page routes (`/page-shell`, `/blog-post`) and appear in the Explore file
  list — pre-existing behavior, flagged not fixed.

## Self-Validation

**PASS.** Runtime-changing behavior (title injection, load-time theme validation, live template
assignment to 5 published pages) was in scope. Critical path checked: all 5 pages render themed,
correctly titled, zero unresolved markers. Negative/edge path checked: `injectPageTitle`'s
comment-shadowing bug (found, fixed, regression-guarded), the guard-stub negative verification on
`validateTemplateDeclarations`, `our-story`'s stranded-choice path traced to its precise root cause.
No bounded diagnosis pass was needed — every failure encountered (the title bug, the doc-comment
duplication, the git-index race) was root-caused and resolved within one pass each. Report not
written to `ADS-memory/reports/self-validation/` as a separate artifact — folded into this report per
this dispatch's own instructions ("Write to `ADS-memory/reports/implementation/…`").

## Risks and tech debt

- `our-story` still resolves to `blog-post.html`'s fallback, not `page-shell.html` — see Task 4.
- `page-shell.html` (like every existing template file in `basic/pages/`) is reachable as a bare route
  and listed in Explore alongside real marketing pages — pre-existing theme-wide behavior, not
  introduced here, not fixed here.
- The Pages editor's own "Preview" tab (`PageEditor.tsx`, out of my authorized scope) shows the raw
  body HTML in an iframe regardless of the selected template — it does not visually reflect
  `page-shell.html`'s wrapper even though the picker correctly persists the choice and the live public
  route correctly renders it. Worth a follow-up for whoever next touches `PageEditor.tsx`.
- `blog-post.html`'s own fixed-`<title>` limitation for Posts remains unfixed (disclosed, accepted,
  explicitly out of scope for this dispatch).
- Commit hygiene: the theme addition is not its own standalone commit (`028dba3`, alongside a
  concurrent agent's unrelated ThemeExplore work) due to the git-index race described above. Still
  cleanly isolable via the two-path `git diff`/`git checkout` shown above if a revert-alone is ever
  needed.

## Files changed

Code (`72d7f2b`): `src/features/theme/static-render.ts` (`injectPageTitle`, `escapeHtmlText`),
`src/features/theme/theme.ts` (`validateTemplateDeclarations`, wired into `loadStaticTierAssets`),
`src/features/theme/index.ts` (re-export), `src/server/routes/site/pages.ts`
(`renderPageViaTemplate` wiring), `src/features/theme/__tests__/inject-page-title.test.ts` (new),
`src/features/theme/__tests__/theme-static-tier.test.ts` (11 new/extended tests),
`src/features/theme/__tests__/page-template-render.canary.test.ts` (repointed at the real theme).

Theme addition (landed in `028dba3`, see commit hygiene note): `src/themes/static/basic/pages/
page-shell.html` (new), `src/themes/static/basic/theme.json` (`pageTemplate` line added).

Data (via the real application route, restore point captured first — see Task 3): `template_choice`
set to `"page-shell.html"` on the `terms-of-service`, `privacy-policy`, `contact`, `team`, `faq` Post
rows.
