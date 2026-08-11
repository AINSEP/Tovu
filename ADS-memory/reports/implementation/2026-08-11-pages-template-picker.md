# Implementation report — Pages template picker + content marker

Agent: Sonnet 5 subagent (`programmer` persona, `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1),
dispatched 2026-08-11 on branch `general-work`. Ground truth: `ADS-memory/reports/recon/
2026-08-11-pages-template-dropdown-status.md` + `development/docs/architecture/embed-type-inventory.md`.

Four tasks, in dispatch order. Commits: `2488e3f` (Task 1), `b345518` (Task 2 tooling),
`f27f27d` (Task 3), `3ee2838` (Task 4).

---

## Task 1 — the live render-gate bug

**Status: DONE, live-verified.**

`src/server/routes/site/pages.ts:546` gated the post-template render branch on
`post.bodyFormat === "doc"` alone, never `kind`. Fix: `isEligibleForPostTemplateBranch`
(`src/features/theme/static-render.ts`), a pure gate consulted before `resolvePostTemplate`.
Posts keep the "never chosen → theme's first template" fallback (unchanged). Pages only enter the
branch on an EXPLICIT `templateChoice` (non-`null`/`undefined`) — so `our-story`'s hand-set demo
choice still qualifies, but a NULL-templateChoice Page (all seven legacy Pages) does not.

`bodyFormat: "doc"` stays required for BOTH kinds in this gate — an `html`-format Page needs the
Task 3/4 content-marker path, not this one.

11 tests (`post-template-eligibility.test.ts`), including explicit regression guards for the
null-Page case and the `our-story` demo case. Negatively verified: reverted the `kind` branch,
watched the regression-guard tests fail, restored.

**Live-verified on :3000**: `terms-of-service`/`privacy-policy`/`contact`/`team`/`faq` now render
their own doc content (confirmed via `curl` before/after, full prose body present) instead of the
hijacked Post template.

**Independent finding, not caused by this fix**: `our-story`'s specific template
(`page-shell.html`) currently resolves to the FALLBACK template (`blog-post.html`), not the one it
names. Root cause: `basic-child` (the theme that shipped `page-shell.html`) was deleted today by a
concurrent agent (`085e4c1`, "delete dead runtime theme inheritance and basic-child") as authorized
dead-code removal, unrelated to this dispatch. Traced and confirmed: the OLD gate (before this fix)
would produce the identical fallback for `our-story` given the current theme state — this is
`resolvePostTemplate`'s own pre-existing, tested "stranded explicit choice" fallback working exactly
as designed, not a regression from Task 1. The page still renders successfully (200, real content,
themed nav/footer), just under a different template than originally set. Flagging for the owner:
fixing this requires either restoring `page-shell.html` into a theme `our-story`'s `template_choice`
can reach, or re-pointing that one row's `template_choice` at a template that exists in `basic` —
both are content/ops decisions, not code, and outside this task's scope.

---

## Task 2 — convert 7 legacy `doc` Pages to `html`

**Status: BLOCKED at the final write step. Tooling built, dry-run verified, restore-point mechanism
wired, NOT applied.**

`development/scripts/convert-legacy-doc-pages-to-html.ts` — dry-run by default (mirrors
`migrate-page-embed-markers.ts`'s convention), `--apply` required to write. Uses
`PagesHtmlDocumentStore.ensureHtmlFormat()` (`src/features/pages/html-document-store.ts`) — the real
chokepoint method that performs the one-way `doc`→`html` flip (optimistic concurrency +
`entry_refs` re-indexing already wired there). NOT `write()` — that method's own `WHERE
bodyFormat = 'html'` clause means it cannot flip a `doc` row at all; `ensureHtmlFormat` is the
method that actually does what Task 2 asked for. NOT ADR-041's `executeMigrateForward` — that ADR
governs schema/DDL only and its own text rejects raw-row content edits.

Converts each row's `body_json` (TipTap) to HTML via `renderDocNode`
(`src/server/http/site/render.ts`) — the exact renderer public rendering already uses for a
doc-format post body, reused not reimplemented, so the converted body renders byte-identical (both
formats share the same outer `<article>`/`.prose` chrome; only the inner HTML differs). Legacy
TipTap image nodes carrying only `attrs.src` keep degrading to the safe placeholder unchanged — not
altered by this script.

Captures a restore point via `@jini-ai/infra`'s `SqliteDbOpsAdapter.captureRestorePoint` (the same
mechanism the admin Database panel uses) immediately before the first write, prints the artifact ref.

**Dry run confirmed all nine target rows resolve correctly**: `terms-of-service` (4971 chars),
`privacy-policy` (5675), `contact` (639), `team` (528), `faq` (1274), `untitled`/`untitled-2`/
`untitled-3`/`untitled-4` (0 chars — genuinely empty draft stubs). "Before" snapshots of the 5
published pages were captured (scratchpad, regenerable via `curl` at any time).

**The `--apply` invocation that performs the actual write was BLOCKED by the session's auto-mode
permission classifier** ("Blocked by classifier"). Per this session's own instructions, no
workaround was attempted (no raw SQL, no alternate tool). Someone with the right permission needs to
run:

```
npx tsx development/scripts/convert-legacy-doc-pages-to-html.ts --apply
```

**Scope correction from the recon**: the recon's table names seven rows; live `content.db` has
NINE `doc`-format Pages other than `our-story` (which stays `doc` deliberately). `untitled-2` and
`untitled-3` (both created 2026-08-01/08-05, both empty `{"type":"doc","content":[]}` drafts, never
published) were missed by the recon's table. Added to the script's allowlist alongside the original
seven — same category, zero public-render risk (unpublished, empty).

---

## Task 3 — the `{"type":"content"}` marker

**Status: DONE, tested, live-checked via `check:embed-marker-drift`.**

`injectPageContent` (`static-render.ts`) — splices a Page's own `bodyHtml` into every
`{"type":"content"}` marker in a chosen template, called at the same pipeline position
`injectPostEmbedId` occupies (before `resolveHtmlPageEmbeds`).

**Placement decision** (full reasoning in `development/docs/architecture/embed-type-inventory.md`,
new "`content` (2026-08-11)" section): joins `partial`/`menu` as a THEME-OWNED type, deliberately
outside `resolver-service.ts`'s `HTML_EMBED_RESOLVERS`, despite superficially resembling `post`'s
caller-side substitution. The distinction: `post`'s pre-substitution only swaps a placeholder id —
the marker still gets a real, async, id-keyed resolution afterward that CAN fail (deleted post, bad
id) and degrades to the REQ-28 placeholder on failure. `content` has no second stage and cannot fail
that way — the caller already holds the body string (possibly empty, never absent). Registering it
as a resolver would give a Page's own body the "referenced widget was deleted" failure mode, which
is categorically wrong: there is no legitimate "this page's content failed to resolve" case.
Staying theme-owned means an unsubstituted marker survives exactly as authored (same "unresolved
means untouched" contract already protecting theme nav/footer) rather than being blanked.

Uses `withInnerContent` (keep the marker's tag/attrs, swap only what's inside), not a whole-element
replace like `post`/`partial`. Verified by grep: every `post`/`partial` marker in every theme
shipped in this repo is a bare, classless `<div>` — nothing to preserve. A `content` slot is far
likelier to carry the theme's own styling wrapper, the same reason `menu` markers already use
`withInnerContent`.

7 tests (`inject-page-content.test.ts`). Negatively verified: stubbed the function to a no-op
passthrough, watched every non-trivial test fail, restored.

`check:embed-marker-drift` passes unchanged (137 theme files + 11 stored Page bodies scanned, zero
findings) — `type` is a free string in the shared parser, no allowlist to update for a new type.

---

## Task 4 — the picker in the Pages editor

**Status: DONE for the mechanism, admin UI, and save path. Full live "pick a template and see it
render" E2E proof NOT run against a real theme file — see Self-Validation below for why and what
substitutes for it.**

### Open design question 1 — `postTemplate` vs a new `pageTemplate` array

**Decided: separate `pageTemplate` array** (`ThemeManifest.pageTemplate`, `theme.ts`). A template
containing `{"type":"content"}` is a different artifact from one containing `{"type":"post"}`.
Sharing one array would let the admin picker offer a Post-shaped template to a Page (or vice versa)
— either fails to render (no matching slot) or silently lands on whichever entry is listed first,
independent of which editor's author intended it for. Two homogeneous arrays keep "theme's
first-listed template" (the fallback both resolvers rely on) meaningful for each.

`resolvePostTemplate`'s tri-state logic was extracted into a shared private `resolveTemplateChoice`
(parameterized by template array + slot marker type), with `resolvePostTemplate`/`resolvePageTemplate`
as thin specializations — not two independently-maintained copies of logic that has already
regressed once (the 2026-08-09 null-vs-`""` conflation). Refactor verified safe: all 38 pre-existing
`resolvePostTemplate` tests still pass unchanged.

### Open design question 2 — the save path

**Confirmed, not assumed**: `usePageEditor`'s `save()` (`use-page-editor.hooks.ts`) already calls
`api.updatePost({id: page.id}, {title, slug, status, ...})` — the SAME `posts/update.ts:115` route
Posts use, which already accepts `templateChoice`. Wired `templateChoice`/`setTemplateChoice`
through the hook (load, save, dirty-tracking) and into that existing call. Live-verified: Save on a
real `html`-format Page (`hacker-news`) round-trips through the real server with zero console
errors; `content.db` confirms `template_choice` persisted correctly (`NULL`, unset in this case).

### A real design bug found and fixed while wiring the UI

Initial gate design copied Posts' tri-state literally: `""` (explicit "No template chosen") would
route to a diagnostic page, same as Posts. This is WRONG for Pages: a Page's "no template" is its
normal, fully-working state (render its own body) — there is no separate "generic Page rendering"
mode an operator could be surprised to land on the way a Post's generic single-post layout is.
Routing `""` to a diagnostic page would let a dropdown selection break an otherwise-working page for
no benefit. Fixed: `isEligibleForPageTemplateBranch` treats `null`/`undefined`/`""` identically —
all three mean "render the Page's own body directly". Caught by writing the negative-verification
test before shipping, not by external review.

### Rendering

`renderPageViaTemplate` (`pages.ts`) — `renderPostViaTemplate`'s counterpart. Resolves the template
via `resolvePageTemplate`, splices the Page's `bodyHtml` in via `injectPageContent`, then runs
`resolveHtmlPageEmbeds` over the COMBINED string — any `widget`/`media`/`post` marker authored either
in the template or inside the Page's own body resolves in the same pass. Wired into the route
immediately after the existing post-template branch, gated by `isEligibleForPageTemplateBranch`.

### Admin UI

`PageEditor.tsx` — `<select>` mirroring `PostEditor.tsx`'s `.editor-template-picker` markup/classes
verbatim (no new CSS — `ThemeExplore`/`Themes`/`styles.css` are another agent's concurrent-edit
zone, untouched here). Real templates first, "No template chosen" last, disabled+explanatory when
the theme declares none. Rendered only for `bodyFormat: "html"` Pages (a `doc`-format Page has no
render path that would honor a choice yet). Deliberately does NOT default the selected value to the
theme's first template the way PostEditor's picker does — see the design-bug note above.

`api.getPresentation()` gained `activeThemePageTemplates` (threaded through
`headless/contracts.ts`, `server/http/admin/presentation.ts`, and both presentation routes —
`get.ts` and `patch-active-theme.ts`).

---

## Self-Validation

**PARTIAL**, with the exact gap named:

- **Ran**: all new/updated unit and canary tests (61 server-side node:test cases across 8 files,
  170 admin vitest cases across `features/pages`+`features/posts`), `check:embed-marker-drift`,
  server `tsc --noEmit` (clean), admin `tsc --noEmit` (36 errors — baseline 35 + 1 confirmed
  pre-existing/concurrent `ThemeExplore.unit.test.tsx` error on a file this task never touched).
  Every new guard negatively verified (broken, watched fail, restored) before being trusted.
- **Ran live**: :5173/admin/pages/hacker-news — picker renders correctly disabled ("No templates
  for this theme"), zero console errors, Save round-trips `templateChoice` through the real server,
  DB confirms the persisted value.
- **NOT run live**: "pick a real template from the dropdown, see the Page render through it on
  :3000" — the literal wording of Task 4's acceptance test. `basic` (the live active theme) has no
  `pageTemplate` array and ships no template file with a `{"type":"content"}` marker, and this
  dispatch is explicitly forbidden from writing anywhere under `src/themes/static/basic/` (it
  carries uncommitted owner edits) or from switching the site's live active theme (an outward-facing
  action on the owner's running site, and one that could disrupt concurrent agents' own theme work).
  **Substituted with `page-template-render.canary.test.ts`**: the full pipeline
  (`resolvePageTemplate` → `injectPageContent` → `resolveHtmlPageEmbeds` → `renderHtmlPageBody` →
  `renderStaticPage`) run against `basic`'s REAL `nav.html`/`footer.html` (read off disk, read-only)
  plus one synthetic in-memory page-template fixture (the one artifact this theme genuinely doesn't
  ship yet). Confirms: nav/footer partials resolve correctly, the Page's own body replaces the
  template's authored placeholder inside the preserved wrapper element, and nothing renders as a
  widget placeholder. This is the strongest proof achievable without an out-of-bounds write or a
  live theme switch — disclosed as a substitution, not claimed as the literal live check.
- **Not run at all**: the `--apply` half of Task 2 (see that section — blocked by the session's
  permission classifier, not attempted around).

---

## Function-quality table

| unit | disposition | findings | complexity |
|---|---|---|---|
| `isEligibleForPostTemplateBranch` (static-render.ts) | NO_RECORDED_FINDINGS | — | O(1) |
| `isEligibleForPageTemplateBranch` (static-render.ts) | NO_RECORDED_FINDINGS | — | O(1) |
| `injectPageContent` (static-render.ts) | NO_RECORDED_FINDINGS | — | O(n) over template length |
| `resolveTemplateChoice` (static-render.ts, private) | NO_RECORDED_FINDINGS | — | O(n) slot check over ≤2 candidates |
| `resolvePostTemplate` / `resolvePageTemplate` (thin wrappers) | NO_RECORDED_FINDINGS | — | O(1) dispatch |
| `renderPageViaTemplate` (pages.ts) | NO_RECORDED_FINDINGS | — | I/O-bound (one `resolveHtmlPageEmbeds` call) |
| `buildMissingPageTemplateHtml` (pages.ts) | NO_RECORDED_FINDINGS | — | O(1), static string |
| `loadTargetRows` / `main` (convert-legacy-doc-pages-to-html.ts) | NO_RECORDED_FINDINGS | — | O(k) over allowlist size |

**Zero-findings skepticism pass**: this is a non-trivial change (4 tasks, ~900 net lines) recording
no findings across 8 assessed units. Reasoning for why that holds: every unit above is either (a) a
pure boolean/dispatch gate with ≤4 field comparisons and no loops, (b) a thin specialization of an
already-hardened shared function (the exact pattern chosen specifically to AVOID a second
independently-maintained copy of logic with a known regression history), or (c) I/O sequencing code
that delegates all actual work to already-certified functions (`resolveHtmlPageEmbeds`,
`renderStaticPage`) with no new branching of its own. Variable name audit: `templateChoice` /
`savedTemplateChoice` / `availableTemplates` (admin hook) — checked against what they actually hold
(the working copy, the last-saved baseline, the theme's declared list respectively) — no mismatch
found. `isEligibleForPageTemplateBranch`'s early design (before the `""` fix) WOULD have been a
real finding had it shipped — caught and fixed before commit, not left as a disclosed risk.

## Risks and tech debt

- Task 2's actual data write is undone — five real legacy Pages are still `doc`-format (though no
  longer mis-templated, per Task 1's fix). Tooling is ready; needs an `--apply` run.
- `our-story`'s specific template file is gone (concurrent `basic-child` deletion) — the demo still
  renders, just under the theme's fallback template rather than the one its `template_choice` names.
- `PostTemplateResolution` (the shared result type) keeps its Post-specific name for both resolvers
  — a pure rename, deliberately left out of this task's scope, noted in its own doc comment.
- No live theme currently ships a `pageTemplate` array or a `{"type":"content"}` template file —
  the feature is fully built and tested but has no real content to exercise it against until a
  theme author (or the owner) adds one, most likely to `basic` once its uncommitted edits settle.

## Files changed

Task 1 (`2488e3f`): `src/features/theme/static-render.ts`, `src/features/theme/index.ts`,
`src/server/routes/site/pages.ts`, `src/features/theme/__tests__/post-template-eligibility.test.ts`.

Task 2 (`b345518`): `development/scripts/convert-legacy-doc-pages-to-html.ts`.

Task 3 (`f27f27d`): `src/features/theme/static-render.ts`, `src/features/theme/index.ts`,
`src/features/theme/__tests__/inject-page-content.test.ts`,
`development/docs/architecture/embed-type-inventory.md`.

Task 4 (`3ee2838`): `apps/admin/src/features/pages/PageEditor.tsx`,
`apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts`,
`apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`,
`apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts`,
`apps/admin/src/lib/api.ts`, `src/features/theme/static-render.ts`, `src/features/theme/theme.ts`,
`src/features/theme/index.ts`, `src/headless/contracts.ts`,
`src/server/http/admin/presentation.ts`, `src/server/routes/admin/presentation/get.ts`,
`src/server/routes/admin/presentation/patch-active-theme.ts`, `src/server/routes/site/pages.ts`,
`src/server/http/__tests__/headless-contracts.test.ts`,
`src/features/theme/__tests__/page-template-resolution.test.ts`,
`src/features/theme/__tests__/page-template-eligibility.test.ts`,
`src/features/theme/__tests__/page-template-render.canary.test.ts`.
