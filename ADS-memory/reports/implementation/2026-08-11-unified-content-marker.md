# Implementation report — unified `content` marker + `templates` key

Agent: Sonnet 5 subagent (`programmer` persona, `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1),
dispatched 2026-08-11 on branch `general-work`. Spec: `ADS-memory/reports/design/
2026-08-11-unified-content-marker-and-templates.md` (owner-approved decision). Ground truth for prior
state: `ADS-memory/reports/implementation/2026-08-11-basic-page-template.md` + `ADS-memory/reports/
implementation/2026-08-11-pages-template-picker.md`. Commit: `69e08d9` (63 files).

---

## What shipped

`ThemeManifest.postTemplate`/`pageTemplate` → one `templates: string[]`. `{"type":"post","id":"{{post}}"}`
(the retired template-slot placeholder) and the original `{"type":"content"}` → one unified marker:
`{"type":"content"}` (no id) means "the entity the route already resolved"; `{"type":"content","id":"…"}`
means a specific row. The resolver reads the referenced row's `bodyFormat` and dispatches: `doc` renders
via the existing TipTap path (`renderDocNode`, reusing the `"post-content"` IR unchanged), `html`
recursively fetches and splices the stored body, resolving its own nested embeds.

**Live-verified end to end on the running `:3000`** (a `tsx watch` process, so my saved changes were
already live — no restart needed or performed): all 5 legacy Pages render `200`, correct per-page
`<title>`, zero `widget-placeholder`; three published Posts (`welcome`, `about`, `how-themes-work`)
still render through `blog-post.html` correctly (`about`'s real `<h1>What Is Tovu?</h1>` present, zero
unresolved `content` markers). **`our-story` fix confirmed, not assumed**: `<title>Our Story</title>`
(was `Blog post — Basic`), and `article class="wrap post-detail"` in the output — `page-shell.html`'s
exact wrapper-class order (`blog-post.html`'s is `"post-detail wrap"`, reversed) — proves it is
genuinely rendering through `page-shell.html` now, not a coincidental title match.

## The three guards

**Guard 1 (escaping stays per-format)**: `"doc"`-format targets never touch raw HTML splicing — they
stay id-carrying markers routed to `resolveContentTypeEmbeds` (`resolver-service.ts`), which returns
raw `{title, bodyJson, …}` for `render.ts`'s existing `renderDocNode`-backed `"post-content"` case.
`"html"`-format targets never touch the TipTap path — they are fetched and spliced entirely inside
`pages.ts`'s new `resolveHtmlFormatContentMarkers`, using stored-HTML trust rules unchanged from what
`PagesHtmlDocumentStore`/`pages.edit_html` already assume. The two paths share no function.

**Guard 2 (visibility)** — the highest-risk part, per the design doc. New `findPublishedPostById`
(`features/post/post.ts`): the `findById`-shaped, non-throwing, `status`+trash-filtered counterpart to
`getPublishedPostBySlug`. Wired into both the new `content` resolver and, **retrofitted**, the
pre-existing generic `post` resolver (`resolvePostTypeEmbeds`) — investigation surfaced that `post` had
the *identical* unguarded `postRepo.findById` hole since it shipped 2026-08-10 (any id, including a
draft or trashed row, would resolve). Fixed alongside `content` rather than left live next to a
freshly-hardened sibling in the same file, and disclosed in both the code and `embed-type-inventory.md`
as a pre-existing bug, not one this dispatch introduced.

*Negatively verified*: `post.test.ts` proves the raw, unfiltered `repo.findById` call **does** return
a draft, then proves the guarded `findPublishedPostById` call on the identical repo state returns
`null` — the guard is shown to be the reason the behavior holds, not merely asserted. 6 tests for
`findPublishedPostById` (draft, trashed, nonexistent, cross-workspace, published-succeeds), 8 more at
the `resolveHtmlPageEmbeds` integration seam for both `content` and `post` (draft, trashed, html-format-
reaches-registry-and-is-refused, no-postRepo-degrades, published-control-case).

**Guard 3 (recursion)** — depth limiting (`MAX_CONTENT_EMBED_DEPTH = 5`) *and* a shared fetch budget
(`MAX_CONTENT_EMBED_FETCHES = 50`) threaded through every recursive call in
`resolveHtmlFormatContentMarkers`. Depth alone bounds a simple cycle (A→A, A→B→A) to a fixed number of
steps regardless of shape; the budget additionally caps the adversarial-branching case (many distinct
ids at one level, each branching further) that depth alone does not — without it, a full-depth
traversal of an N-way branch could fetch up to N^depth entities.

*Negatively verified two ways*: (1) a wall-clock `Promise.race` timeout around every termination test
(a hang fails the test instead of hanging the run); (2) an actual **fault injection** — I disabled the
depth/budget early-return in `pages.ts`, reran the guard-3 suite, watched the fetch-count assertions
fail with `51` (not `∞`) instead of the guarded `6`, then restored the source and reran green. This
also surfaced that the budget-slicing line (`ids.slice(0, budget.remaining)`) is an *independent*
second bound beyond the explicit early-return check — even with the early-return disabled, the run
still terminated, because the slice starves further fetches once the budget hits zero. Two
independent mechanisms achieve the bound, not one with a silent single point of failure.

## Template applicability — evaluated, not implemented (pushback invited by the dispatch)

The design doc's own "interim" proposal was: infer applicability by scanning which markers each
template carries, so the pickers can filter. **That signal is gone by the time the unification is
actually built** — `blog-post.html` and `page-shell.html` both carry the identical single
`{"type":"content"}"` primary-slot marker after conversion, so there is nothing left to distinguish
"Post-shaped" from "Page-shaped" via a marker-type scan. Applicability filtering was never
code-implemented pre-unification either (it was structurally guaranteed by the two SEPARATE manifest
arrays, not by any per-template marker inspection) — so implementing the interim proposal literally
today would be a function that always says "yes, applicable to everything," a no-op indistinguishable
from not filtering at all. I did not write that no-op. Both admin pickers now read one shared
`activeThemeTemplates` field and offer the same flat list to both Posts and Pages, unfiltered — which
is the honest, minimal-footprint consequence of the unification, disclosed rather than silently
shipped as if solved. The design doc's own "end state" (post-specific chrome becomes field markers
that degrade to nothing when absent) remains the real fix and is unchanged by this pass.

## Migration

No back-compat aliases (owner's standing rule). Converted **every** `theme.json` carrying
`postTemplate`/`pageTemplate` — not only `basic`: `tailark-quartz-libre`, `tailark-quartz-dark`,
`gracious-timing`, `tailark-dusk`, `portfolite`, plus the `__marketplace__`/`__original-themes__`
pristine-catalog copies of `basic` (these are what a theme reset/reinstall copies from — leaving them
on the retired field name would have silently produced a zero-template theme on the next reset).
`fuel` never had `postTemplate` and needed no conversion. Every matching `{"id":"{{post}}"}` occurrence
converted via a single literal `sed` pass across theme files, `preview/{light,dark}` snapshots
included (the drift check scans those too — `check-embed-marker-drift.ts`'s own header already
documents why, from an earlier incident).

`check:embed-marker-drift` extended with check 3b: the literal retired string `"id":"{{post}}"`,
comments stripped, same style as the existing retired-attribute check. Negatively verified: a synthetic
fixture carrying the retired form fails with exit 1 and a correct, actionable message; the real repo
(138 theme files, 11 stored Page bodies) is clean.

Did **not** touch `development/docs/themes/theme-authoring-guide.md` — it already carries uncommitted
changes from a concurrent session and references stale pre-2026-08-10 vocabulary (`data-embed-id`)
beyond this dispatch's scope; flagged as a follow-up rather than risking a collision with in-flight
work. Did not touch `src/themes/static/basic/pages/index.html`/`pricing.html` (explicitly forbidden,
confirmed untouched via `git status` before and after).

## Files this touches beyond the brief's list, and why

- `src/server/http/site/render.ts`: one doc-comment fix (a stale function-name reference), no logic
  change — kept the "not in the file list" constraint by reusing the existing `"post-content"`
  componentId/case rather than adding a new one.
- `src/core/embeds/marker.ts`: two new generic primitives (`withAddedId`, `withInnerContentFinal`) plus
  a new `EmbedMarker.inner` field — needed by the unified injector and the recursive splice; both are
  general marker operations, not content-specific, consistent with the file's existing `withInnerContent`.
- Several `apps/admin` doc comments (`PostTemplateModal.tsx`, `PostEditor.tsx`) and test files
  (`PostEditor.unit.test.tsx`, `use-page-editor.unit.test.ts`) — the wire-contract rename required it.

## A design decision worth flagging: `renderViaTemplate` now threads `mediaRepo`/`transformDefinitionRepo`

Previously `renderPostViaTemplate`/`renderPageViaTemplate` only passed `{entryRepo, postRepo}` to
`resolveHtmlPageEmbeds`. The unified `renderViaTemplate` passes the full media deps too (needed for the
recursive pre-splice's nested `resolveHtmlPageEmbeds` calls to resolve `media` markers inside spliced
content). Side effect: a `media` marker inside a template-rendered Post/Page now resolves where it
silently degraded to a placeholder before. Purely additive, no regression risk identified, disclosed
here since it wasn't explicitly requested.

---

## Function-quality table

| unit | disposition | findings | complexity |
|---|---|---|---|
| `withAddedId` (marker.ts) | NO_RECORDED_FINDINGS | — | O(n) over marker attrs length |
| `withInnerContentFinal` (marker.ts) | NO_RECORDED_FINDINGS | — | O(n) over marker attrs length |
| `findPublishedPostById` (post.ts) | NO_RECORDED_FINDINGS | — | O(1), one indexed lookup |
| `injectCurrentEntityContentId` (static-render.ts) | NO_RECORDED_FINDINGS | — | O(n) over html length, one scan-splice pass |
| `resolveTemplate` (static-render.ts, merged) | NO_RECORDED_FINDINGS | — | O(n) over template html, ≤2 candidates |
| `isEligibleForTemplateBranch` (static-render.ts, merged) | RECORDED_AND_KEPT | LOW: three-branch shape (kind, then bodyFormat within kind=page) is a deliberate preservation of two pre-existing, differently-shaped asymmetries — flagged in its own doc as "preserved, not unified," not simplified away, since unifying the `doc`-vs-`html` `""` divergence would be an undisclosed behavior change | O(1) |
| `resolveContentTypeEmbeds` (resolver-service.ts) | NO_RECORDED_FINDINGS | — | O(e) refs, concurrent `findPublishedPostById` calls |
| `resolvePostTypeEmbeds` (resolver-service.ts, modified) | RECORDED_AND_FIXED | MEDIUM (pre-existing, not introduced here): unguarded `postRepo.findById` visibility hole, fixed by swapping in `findPublishedPostById` | O(e) refs, concurrent |
| `resolveHtmlFormatContentMarkers` (pages.ts) | RECORDED_AND_VERIFIED | Security-relevant by design (guard 3) — fault-injection tested, see above; no residual finding | Bounded by `MAX_CONTENT_EMBED_FETCHES` total fetches across the whole call tree, never unbounded |
| `renderViaTemplate` (pages.ts, merged) | NO_RECORDED_FINDINGS | — | I/O-bound, one recursive pre-pass + one `resolveHtmlPageEmbeds` call |
| `validateTemplateDeclarations` (theme.ts, simplified) | NO_RECORDED_FINDINGS | — | O(t) templates × O(n) marker scan |

**Zero-findings skepticism pass**: given this is a security-relevant change (guards 2 and 3), the
zero-findings units above were re-examined specifically for the failure modes those guards exist to
prevent — every one of them either delegates all decision logic to an already-assessed function
(`injectCurrentEntityContentId`→`withAddedId`, `resolveTemplate`'s slot-check→`markersOfType`) or is a
straight, ≤3-branch field comparison. The two units that DO carry a real disposition
(`isEligibleForTemplateBranch`'s preserved asymmetry, `resolvePostTypeEmbeds`'s retrofitted fix) are
recorded as such rather than folded into "no findings." Variable-name audit: `entityId` (pages.ts,
`resolveHtmlFormatContentMarkers`) vs `postId`/`entityId` elsewhere — checked consistent (always the
row being fetched, never conflated with `workspaceId`); `idsToFetch` vs `ids` — checked `idsToFetch` is
genuinely the budget-sliced subset, not the full set, at every read site.

## Architecture Audit

**Status: PASS.**

- Layering respected: `resolver-service.ts` still does not import from `render.ts` (verified via grep
  before and after); the new recursive resolve+splice interleaving lives in `pages.ts`, the one layer
  that already legitimately imports both.
- `core/embeds/marker.ts` stays a leaf module (no new imports added).
- No new runtime edge crossing a feature boundary that didn't already exist.
- Shared-git-index discipline followed throughout: every commit staged by explicit path,
  `git diff --name-only --cached` checked against my own edit list before committing,
  `git show --stat HEAD` checked after. Confirmed post-commit that other agents' concurrently-modified
  files (`AssistantDock.tsx`, `panels.tsx`, `theme-authoring-guide.md`, `app.ts`, `index.html`,
  `pricing.html`, and a later Preview-tab addition to `use-post-editor.hooks.ts`) remained untouched/
  uncommitted by me.

## Pre-Completion Checklist

- Requirements re-verified against the design doc's Acceptance section (all 6 items) and this dispatch's
  own brief, above.
- Fresh evidence, all re-run in this session after the final edit: server `tsc --noEmit` clean; admin
  `tsc --noEmit` at baseline 35 (no new errors); 373 scoped `node:test` cases across 6 files (theme 210,
  post 36, widgets 111, marker canary 9, guard-3 6, headless-contracts 1), all green; 114 admin `vitest`
  cases across 6 files, all green; `check:embed-marker-drift` clean (138 files, 11 stored bodies) and
  negatively verified to fail on the retired form; live `:3000` verification of 5 legacy Pages + 3
  published Posts + `our-story`.
- No certified test was deleted or weakened. The 7 retired theme test files were REPLACED by 4
  consolidated files covering every case from their predecessors (verified case-by-case while writing
  them) plus new cases the unification specifically needs (cross-kind resolution, back-compat-alias
  rejection); `marker.canary.test.ts`'s one retired-behavior test was rewritten to pin the mechanism
  that replaced it, not deleted.
- Scope: the file list matches the brief's, plus the disclosed additions in "Files this touches beyond
  the brief's list" above, plus every theme manifest/file carrying the retired vocabulary (required by
  "no back-compat aliases," not optional).
- Open items: template applicability (disclosed, not solved — see above); `theme-authoring-guide.md`
  left stale (disclosed, out of scope); `post` embed type's generic-reference role is now largely
  superseded by `content` but not retired (kept for backward compatibility with any live authored
  content, not verified absent).

## Self-Validation

**PASS.** Runtime-changing behavior (marker resolution, template rendering, admin wire contract) was in
scope. Critical path checked live on `:3000`: 5 legacy Pages + 3 Posts + `our-story`, all correct.
Negative/edge paths checked: guard 2 (draft/trashed non-leak, both unit and integration level, plus the
raw-vs-guarded differential proof), guard 3 (termination under self-reference, mutual reference, and
wide branching, plus fault-injection proving the guard is load-bearing), the retired-form drift check.
No bounded diagnosis pass was needed — the one real bug encountered (the guard-3 fetch-count test's
off-by-one, caused by not initially accounting for the boundary-level `resolveHtmlPageEmbeds` re-fetch)
was root-caused and fixed within one pass by tracing the actual recursion, not by guessing.

## Risks and tech debt

- Template applicability filtering is unsolved (disclosed above, not new debt — inherited from the
  design doc's own open question, now with the "interim" option ruled out rather than left ambiguous).
- The generic `post` embed type is functionally superseded by `content`-with-id but not retired; a
  future pass could fold it in once confirmed there's no live content depending on it specifically.
- `theme-authoring-guide.md` documents the retired `postTemplate`/`pageTemplate`/`{{post}}` vocabulary;
  needs a rewrite once its concurrent in-flight edit lands.
- `resolveHtmlEmbedsForRender` (the non-templated Page render path) gained `postRepo` for doc-format
  `content`/`post` references but was deliberately NOT extended to the recursive html-format pre-splice
  — an `"html"`-format nested reference inside a non-templated Page's own body degrades to the honest
  placeholder rather than resolving; disclosed as a scope boundary in that function's own doc comment.
- `PostTemplateResolution`'s type name stays Post-specific in spelling (pre-existing debt, explicitly
  out of scope both before and after this pass).

## Files changed

Commit `69e08d9`, 63 files. Core: `src/core/embeds/marker.ts`, `src/features/post/post.ts`+`index.ts`,
`src/features/theme/theme.ts`+`static-render.ts`+`index.ts`, `src/widgets/resolver-service.ts`,
`src/server/routes/site/pages.ts`, `src/server/http/site/render.ts` (doc-only). Wire contract:
`src/headless/contracts.ts`, `src/server/http/admin/presentation.ts`,
`src/server/routes/admin/presentation/{get,patch-active-theme}.ts`, `apps/admin/src/lib/api.ts`,
`apps/admin/src/features/{posts,pages}/hooks/use-{post,page}-editor.hooks.ts`,
`apps/admin/src/features/pages/PageEditor.tsx`, `apps/admin/src/features/posts/PostTemplateModal.tsx`.
Tests: 4 new consolidated theme test files, 7 deleted, `marker.canary.test.ts`,
`resolve-html-page-embeds.integration.test.ts`, `post.test.ts`, `headless-contracts.test.ts`, 2 admin
test files, 1 new `resolve-html-format-content-markers.test.ts` (guard 3). Tooling/docs:
`development/scripts/check-embed-marker-drift.ts`, `development/docs/architecture/
embed-type-inventory.md`. Theme content: `basic`, `tailark-quartz-libre`, `tailark-quartz-dark`,
`gracious-timing`, `tailark-dusk`, `portfolite`, plus `__marketplace__`/`__original-themes__` catalog
copies of `basic`.
