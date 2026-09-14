# Web Design(Execution): fix four `<button>`-inside-`<a href>` sites

Date: 2026-09-06. Branch: `restructure/apps-website-phased`. Persona: `AI-Dev-Shop/agents/web-design/skills.md`, loaded before work started.

## Summary

Verified the four line-pointed claims against current source (all confirmed real), searched the full `apps/admin/src` tree for the same pattern, found the `.btn-*`-on-`<a>` "blocker" comment to be false (the CSS fix has existed since 2026-08-01 and is already used in production by `Dashboard.tsx`), corrected that comment, and repaired all four assigned sites plus verified live in the browser. No CSS changes were needed.

## The `.btn-*` "blocker" — investigated, found false

`CollectionEntries.tsx`'s comment claimed `.btn-*` classes on a bare `<a>` render wrong and that a fix was "in flight elsewhere." Checked `apps/admin/src/styles.css`:

- Lines 1127–1139: `a.btn-secondary, a.btn-ghost, a.btn-danger, a.btn-warning, a.btn-primary { display: inline-flex; align-items: center; text-decoration: none; }` plus a `:hover` variant — committed **2026-08-01** (`bdc3776e3`), not modified since, not in the working tree diff.
- Already used in production: `Dashboard.tsx:128-136` renders `<a className="btn-secondary" href={siteUrl("/")} ...>{t("View site ↗")}</a>` with no wrapping/nested button.
- `git blame` on the false comment (`CollectionEntries.tsx:72`, commit `c9c4b19cb`, 2026-08-01 13:28:11) shows it was written **one minute after** the CSS fix landed (13:27:35) — it was already stale the moment it was written and nobody has touched it since.

Conclusion: the CSS mechanism was never broken. No `.btn-*` CSS commit was needed; the four repairs use the existing, already-working `a.btn-primary`/`a.btn-secondary` rules directly.

## Repo-wide scan for the same pattern

Wrote a small comment-aware Python scanner (strips `{/* */}` and `//` before matching) over all 312 `.tsx` files under `apps/admin/src`, looking for `<a href=...>...<button...>...</a>`. Found **13 real instances** (a naive first pass without comment-stripping found 14; the 14th, `Users.tsx:333`, was a false positive — the text `<a href="#">` appeared inside a JSX comment, not real markup).

| File:line | Status |
|---|---|
| `CollectionEntries.tsx:74` | **Fixed** (this dispatch) |
| `CollectionEntryEditor.tsx:361` | **Fixed** (this dispatch) |
| `FormsList.tsx:72` | **Fixed** (this dispatch) |
| `FormEditor.tsx:971` | **Fixed** (this dispatch) |
| `MenuEditor.tsx:373` | Off-limits — owner's own uncommitted work, not touched |
| `PostEditor.tsx:662` | Out of scope, not touched (file already dirty — another agent's in-flight work per git status) |
| `PageEditor.tsx:102` | Out of scope, not touched (file already dirty — another agent's in-flight work per git status) |
| `Menus.tsx:44` | Out of scope, not touched |
| `WidgetRegions.tsx:98` | Out of scope, not touched |
| `WidgetsLibrary.tsx:113` | Out of scope, not touched |
| `WidgetRegionEditor.tsx:46` | Out of scope, not touched |
| `WidgetInstanceEditor.tsx:134` | Out of scope, not touched |
| `Recovery.tsx:94` | Out of scope, not touched |

## Repairs made

All four: dropped the nested `<button>`, moved its class onto the `<a>` directly (`.btn-primary` for the two bare/class-less buttons, `.btn-secondary` for the two that already carried it), removed the now-inapplicable `type="button"`. Kept every `agentHandle(...)` call byte-identical — it already lived on the outer `<a>` with `role: "link"` in all four cases, so no handle logic changed.

1. `apps/admin/src/features/collections/CollectionEntries.tsx:74` — "New entry" → `<a className="btn-primary" ...>`
2. `apps/admin/src/features/collections/CollectionEntryEditor.tsx:361` — "← {contentTypeLabel}" back link → `<a className="btn-secondary" ...>`
3. `apps/admin/src/features/forms/FormsList.tsx:72` — "New form" → `<a className="btn-primary" ...>`
4. `apps/admin/src/features/forms/FormEditor.tsx:971` — "Back to forms" → `<a className="btn-secondary" ...>`

No logic changed (there was none to begin with in these hunks — pure markup, matching `Dashboard.tsx`'s existing precedent of styling an `<a>` directly with no hook involvement).

## Verification (live, dev admin at `https://localhost:5173`)

Used Playwright (I was the only visual agent running). For each of the four:

- Accessibility snapshot: a single `link`, no nested `button` role.
- `getComputedStyle` + `outerHTML`: correct class, no `<button>` descendant, correct `background-color`/`border-color` for the variant (verified against the CSS tokens: `.btn-primary` → `oklch(0.5529 0.1129 43.4)`; `.btn-secondary` → white bg / bordered), `text-decoration: none`.
- `data-agent-element`/`data-agent-label` present and unchanged; `aria-label` correctly absent (per the "agentHandle's label never becomes aria-label" rule) — accessible name comes from visible text, unchanged before/after.
- Focus: `.focus()` + computed style shows a visible 2px outline focus ring.
- Keyboard activation: on `FormsList`'s "New form" link, focused it and pressed `Enter` — navigated to `/admin/forms/new` exactly once (single action, not the previous undefined double-activation risk).
- Console: only the known `/api/agents` 500/502 flap noted in the dispatch (pre-existing, unrelated to this change) — no new errors or React DOM-nesting warnings.

Screenshots (repo root, not committed):
- `forms-list-after.png`
- `form-editor-new-after.png`
- `collection-entries-list-after.png`
- `collection-entry-editor-after.png`

## Checks run

- `npx eslint` on the four files: clean.
- `npx tsc --noEmit` (apps/admin): 31 pre-existing errors, none in the four edited files (matches the dispatch's documented pre-existing baseline in untouched users/widgets/lib test files).
- `uptime` before starting: load averages 4.82 / 13.96 / 44.13 — proceeded per the "one test process at a time" rule; ran no test suites (none needed — no hooks/logic changed).

## Commits

- `a44148a1` — `fix(admin/collections): drop invalid button-in-anchor nesting; correct stale CSS comment` (CollectionEntries.tsx only)
- `530d6122` — `fix(admin): drop invalid button-in-anchor nesting on 3 more back/create links` (CollectionEntryEditor.tsx, FormsList.tsx, FormEditor.tsx)

Both are `HEAD` on `restructure/apps-website-phased`, not pushed.

**Correction on my own commit message:** commit `530d6122`'s body has a typo — it reads "MenuEndEditor.tsx:373" where it should read "MenuEditor.tsx:373" (the owner's off-limits file). Left as-is per this session's no-amend rule; noting it here for the record.

## What else `.btn-*` affects (checked before touching it)

No CSS file was actually changed, so there is no new blast radius. For completeness, confirmed via grep that `.btn-primary`/`.btn-secondary` are used across ~30+ call sites app-wide (Posts, Pages, Themes, AI Assistant, Sites, etc.) and the anchor-specific rule (`a.btn-*`) already had exactly one production caller (`Dashboard.tsx`) before this dispatch — now four more.
