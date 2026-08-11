# `useWiredX` hook dependency-injection — audit + partial conversion

**Agent:** Refactor persona (`AI-Dev-Shop/agents/refactor/skills.md` v1.2.0), authorized to execute
for this dispatch. Model: Sonnet.
**Spec:** `ADS-memory/reports/continuity/2026-08-11-deferred-wired-hooks-refactor.md`.
**Date:** 2026-08-11.

## Correction to the spec's own pointer

The spec names `AI-Dev-Shop/skills/impeccable/reference/hooks.md` as "the spec." That file exists,
but it documents the **Impeccable design-detector's lifecycle hook** (a Claude Code / Codex / Cursor
post-edit hook), not React hooks or dependency injection — an unrelated system that happens to share
the word "hooks." There is no `useWiredX` spec file anywhere under `AI-Dev-Shop/` (confirmed:
`grep -rl "useWiredX" AI-Dev-Shop/` returns nothing). Per the spec's own "where the doc and the
working code disagree, the code wins" rule, this audit worked entirely from the four named reference
implementations — `use-assistant-chats.hooks.ts`, `assistant-chats-port.hooks.ts`,
`assistant-chats-dependencies.hooks.ts`, `use-external-mcp.hooks.ts` — plus their own doc comments,
which cross-reference `foundry/docs/jini-port/skills/fixing-open-design-web.md` (in the gitignored
`foundry/` tree — see `feedback_foundry_stays_gitignored` — not read) and
`features/html-viewer/react/hooks/usePresentMode.ts` in `@jini-ai/ui` (outside this dispatch's
scope, not read). Recommend the coordinator fix or remove the stale pointer in the continuity doc so
the next dispatch doesn't lose time on it.

## The pattern, as actually practiced in this repo

- `useX(dependencies)`: the pure hook. Dependencies come in as a typed **port** interface
  (`XPort`), never imported.
- `useWiredX()`: zero-arg. Composes `useX(defaultXPort)`. This is what production components mount.
- `X-port.hooks.ts`: declares the port interface. Nothing outside it and the real binding imports
  the concrete client.
- `X-dependencies.hooks.ts`: binds the real client into `defaultXPort`, and exports a
  `createFakeXPort()` for tests — "every port gets a fake."
- **Pure, no-I/O rules stay imported directly** — not injected. `persistableMessages` in the
  reference implementation, `describeApiError` in this session's work. Injecting a pure function
  would let a fake quietly change a decision rule that every test needs to hold still.
- Component-level DI (`RedirectsProps.useRedirectsHook?: typeof useWiredRedirects`, seen already in
  `Redirects.tsx`, `PostEditor.tsx`, `Pages.tsx`, `PageEditor.tsx`) is a **different, older, and
  compatible** layer: it swaps the whole controller hook for component tests. It composes cleanly
  with hook-level DI — the prop's default just needs to point at `useWiredX` instead of the bare
  `useX`, which this session's redirects conversion confirmed.

## Recency verdict: BOTH — and the "recent" half is the more urgent one

Two distinct drift shapes, from `git log`:

1. **`useAdminLocale()` called directly inside a hook body** — concentrated in **one commit**,
   `f645b5f` "feat(admin/i18n): wire locale-aware translation through remaining admin screens"
   (2026-08-08), which touched **34** `*.hooks.ts` files at once. `use-admin-locale.hooks.ts` itself
   was created in that same commit. The `useWiredX` convention already existed 8 days earlier
   (`use-assistant-chats.hooks.ts`, 2026-07-31) — this was a mass i18n rollout that never considered
   it.
2. **`api` imported directly inside a hook body** — older and continuous. `apps/admin/src/lib/api.ts`
   predates the convention (2026-07-06 vs. 2026-07-31), so most hooks started this way. The part
   that matters: **every feature hook created since the convention existed still reaches for `api`
   directly** — `use-posts.hooks.ts` (2026-08-05), `use-users.hooks.ts`/`use-roles.hooks.ts` (via
   f645b5f's own 2026-08-08 pass), `use-external-mcp.hooks.ts`'s sibling `use-composio-config.hooks.ts`
   (2026-08-10) — spanning 12+ days and at least 8 distinct feature-adding commits after the pattern
   was established. Only 2 features ever adopted it unprompted (assistant-chats, external-mcp) before
   this session added a 3rd (redirects).

**Conclusion: a cleanup pass alone will recur.** The convention has never been the default any author
reached for; it has been followed exactly twice in ~12 days of active feature work. This needs a lint
rule, not just conversions. See Recommendation below — there is a **direct, working precedent already
in this repo's `eslint.config.mjs`** for exactly this shape of rule.

## Phase 1 — full hook audit (93 non-test `*.hooks.ts(x)` files under `apps/admin/src`)

Method: every hook file was read for its exported signature, then grepped for `lib/api` (value vs.
`import type`, distinguished), `useAdminLocale`, `lib/router`/`navigate`, `useI18n`/`useTranslation`.
Files marked **REVIEW** were classified from imports + composition, not a full body read — call this
out explicitly rather than overclaim; a future pass should confirm before converting them.

### Conforming (5 hooks + 4 infra files)

| File | Notes |
|---|---|
| `hooks/use-assistant-chats.hooks.ts` | The reference. `useAssistantChats(port)` + `useWiredAssistantChats()`. |
| `hooks/assistant-chats-port.hooks.ts` | Infra — port declaration. |
| `hooks/assistant-chats-dependencies.hooks.ts` | Infra — real binding + `createFakeAssistantChatsPort`. |
| `features/settings/hooks/use-external-mcp.hooks.ts` | Not a `useX`/`useWiredX` pair itself — it IS the wired-dependencies builder for `@jini-ai/ui`'s own already-conforming `useSourceConfigList`. Reaches `api` on purpose, in the one place that's supposed to. |
| `features/redirects/hooks/use-redirects.hooks.ts` | **Converted this session.** |
| `features/redirects/hooks/use-hit-count-cell.hooks.ts` | **Converted this session.** |
| `features/redirects/hooks/use-import-redirects-form.hooks.ts` | **Converted this session.** |
| `features/redirects/hooks/redirects-port.hooks.ts` | Infra — new this session. |
| `features/redirects/hooks/redirects-dependencies.hooks.ts` | Infra — new this session. |

### Not-applicable — no host/service dependency to inject (24)

Pure local/DOM state, or delegates entirely to an already-classified child hook (noted). No `api`,
`useAdminLocale`, `navigate`, or `useI18n`/`useTranslation` reach.

`components/ChatFab/ChatFab.hooks.tsx` (geometry only) · `components/SeeMore/SeeMore.hooks.tsx` (DOM
clamp) · `components/Select/Select.hooks.tsx` · `components/WidgetConfigFields/WidgetConfigFields.hooks.tsx`
· `components/EmbedInsertControl/EmbedInsertControl.hooks.tsx` (delegates to `WidgetPickerDialog`'s
`useWidgetAddControl` — non-conforming there) · `features/collections/hooks/use-escape-to-cancel.hooks.ts`
· `features/forms/hooks/use-escape-to-cancel.hooks.ts` · `features/collections/hooks/use-lifecycle-confirm-dialog.hooks.ts`
(composes `use-escape-to-cancel`) · `features/media/hooks/use-media-tabs.hooks.ts` ·
`features/seo/hooks/use-seo-entry-section.hooks.ts` (composes non-conforming siblings, itself clean) ·
`features/settings-raw/hooks/use-principal-selector.hooks.ts` ·
`features/settings-raw/hooks/use-reset-namespace-dialog.hooks.ts` ·
`features/settings-raw/hooks/use-value-editor.hooks.ts` ·
`features/settings/hooks/use-settings-ui.hooks.ts` (composes `use-composio-config` [non-conforming]
and `use-external-mcp` [conforming] — itself reaches neither directly) ·
`hooks/use-async-action.hooks.ts` · `hooks/use-dirty-guard.hooks.ts` (both generic, framework-shaped —
same tier as `useState`, used un-injected by the conforming reference too) ·
`features/forms/hooks/use-field-attributes-dialog.hooks.ts`,
`features/forms/hooks/use-form-fields-editor.hooks.ts`,
`features/media/hooks/use-media-lightbox.hooks.ts` — **correction to the raw grep**: these three only
`import type` from `lib/api` (a type, erased at compile time, not a runtime reach) and were
miscounted by a naive `grep -c 'lib/api'` pass; confirmed by reading the actual import line.

### Leaf infra / bus singletons — outside the four named categories, flagged for Coordinator (5, REVIEW)

Not `api`/`navigate`/`t`/`useAdminLocale`, but the same *shape* of unmocked reach — a module-level
pub/sub bus or the locale hook itself, called directly rather than injected:

- `hooks/use-admin-locale.hooks.ts` — the leaf itself (calls `loadLanguage()` + subscribes to
  `settings-refresh-bus` directly). This is the thing OTHER hooks are told to inject, not a caller of
  it — treat it like `lib/api.ts` itself: a legitimate reach-point, not a violation.
- `hooks/use-settings-slice.hooks.ts` — reaches `settings-refresh-bus` directly. **REVIEW**: this is
  the file `use-assistant-chats.hooks.ts`'s own `@complexityExemption` comment cites as prior art
  ("a previous attempt at exactly this kind of extraction left that file's total unchanged, 25 → 25")
  — a complexity pass, not a DI pass, but worth the coordinator knowing before dispatching here again.
- `hooks/use-admin-execution-credential.hooks.ts` — reaches `lib/execution-settings` and
  `settings-refresh-bus` directly (not `api` — this feature has its own storage layer).
- `features/ai-assistant/hooks/use-admin-assistant-switch.hooks.ts` — reaches `assistant-dock-bus`
  directly.
- `features/ai-assistant/hooks/use-ai-assistant-locale-sync.hooks.ts` and
  `features/settings/hooks/use-settings-locale-sync.hooks.ts` — both call `useI18n()` from
  `@jini-ai/ui` directly. Same shape as `useAdminLocale`: a locale-bridging leaf, arguably legitimate,
  arguably in-scope. Owner should rule on whether "inject `useAdminLocale`" was meant to extend to
  `useI18n` too.

### Off-limits — audited, conversion plan written, NOT touched (2)

`features/pages/hooks/use-page-editor.hooks.ts`, `features/posts/hooks/use-post-editor.hooks.ts` —
see **Off-limits conversion plans** below.

### Non-conforming — reaches `api` and/or `useAdminLocale`/`navigate` directly (57)

Every file below `import { api, ... }` (a real value import) and/or calls `useAdminLocale()` and/or
imports `navigate` from `lib/router`. Columns: which of the three this file reaches for.

| File | api | useAdminLocale | navigate |
|---|:-:|:-:|:-:|
| `components/MediaPickerDialog/MediaPickerDialog.hooks.tsx` | ✓ | | |
| `components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | ✓ | | |
| `features/ai-assistant/hooks/use-ai-assistant.hooks.ts` | ✓ | | |
| `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` | ✓ | | |
| `features/analytics/hooks/use-analytics.hooks.ts` | ✓ | | |
| `features/auth/hooks/use-login.hooks.ts` | ✓ | | |
| `features/collections/hooks/use-collection-entries.hooks.ts` | ✓ | ✓ | |
| `features/collections/hooks/use-collection-entry-editor.hooks.ts` | ✓ | ✓ | ✓ |
| `features/collections/hooks/use-collections.hooks.ts` | ✓ | ✓ | |
| `features/collections/hooks/use-edit-fields-dialog.hooks.ts` | ✓ | | |
| `features/collections/hooks/use-new-content-type-dialog.hooks.ts` | ✓ | ✓ | |
| `features/collections/hooks/use-term-picker.hooks.ts` | ✓ | ✓ | |
| `features/comments/hooks/use-comment-queue.hooks.ts` | ✓ | ✓ | |
| `features/comments/hooks/use-comment-settings.hooks.ts` | ✓ | ✓ | |
| `features/comments/hooks/use-comments.hooks.ts` | ✓ | | |
| `features/dashboard/hooks/use-dashboard.hooks.ts` | ✓ | ✓ | |
| `features/database/hooks/use-migrate-forward-section.hooks.ts` | ✓ | ✓ | |
| `features/database/hooks/use-restore-points-section.hooks.ts` | ✓ | ✓ | |
| `features/database/hooks/use-timeline-section.hooks.ts` | ✓ | ✓ | ✓ |
| `features/forms/hooks/use-form-editor.hooks.ts` | ✓ | | ✓ |
| `features/forms/hooks/use-form-submission-detail.hooks.ts` | ✓ | | |
| `features/forms/hooks/use-form-submissions.hooks.ts` | ✓ | | |
| `features/forms/hooks/use-forms-list.hooks.ts` | ✓ | | |
| `features/integrations/hooks/use-integration-deliveries.hooks.ts` | ✓ | | |
| `features/integrations/hooks/use-integrations.hooks.ts` | ✓ | | |
| `features/media/hooks/use-edit-media-panel.hooks.ts` | ✓ | ✓ | |
| `features/media/hooks/use-media-preview.hooks.ts` | ✓ | | |
| `features/media/hooks/use-media.hooks.ts` | ✓ | ✓ | |
| `features/members/hooks/use-members.hooks.ts` | ✓ | ✓ | |
| `features/menus/hooks/use-menu-editor.hooks.ts` | ✓ | | ✓ |
| `features/menus/hooks/use-menus.hooks.ts` | ✓ | | |
| `features/pages/hooks/use-pages.hooks.ts` | ✓ | | ✓ |
| `features/pages/hooks/use-theme-pages.hooks.ts` | ✓ | | |
| `features/plugins/hooks/use-plugins.hooks.ts` | ✓ | ✓ | |
| `features/posts/hooks/use-posts.hooks.ts` | ✓ | | ✓ |
| `features/recovery/hooks/use-recovery.hooks.ts` | ✓ | ✓ | |
| `features/recovery/hooks/use-restore-flow.hooks.ts` | ✓ | ✓ | |
| `features/roles/hooks/use-roles.hooks.ts` | ✓ | ✓ | |
| `features/seo/hooks/use-entry-picker.hooks.ts` | ✓ | ✓ | |
| `features/seo/hooks/use-seo-entry-panel.hooks.ts` | ✓ | ✓ | |
| `features/seo/hooks/use-seo.hooks.ts` | ✓ | ✓ | |
| `features/settings-raw/hooks/use-settings-container.hooks.ts` | ✓ | ✓ | |
| `features/settings-raw/hooks/use-settings.hooks.ts` | ✓ | | |
| `features/settings/hooks/use-composio-config.hooks.ts` | ✓ | | |
| `features/taxonomy/hooks/use-merge-term-section.hooks.ts` | ✓ | ✓ | |
| `features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts` | ✓ | ✓ | |
| `features/taxonomy/hooks/use-new-term-form.hooks.ts` | ✓ | ✓ | |
| `features/taxonomy/hooks/use-taxonomy.hooks.ts` | ✓ | ✓ | |
| `features/taxonomy/hooks/use-term-detail-panel.hooks.ts` | ✓ | ✓ | |
| `features/themes/hooks/use-theme-explore.hooks.ts` | ✓ | | |
| `features/themes/hooks/use-themes.hooks.ts` | ✓ | | |
| `features/users/hooks/use-users.hooks.ts` | ✓ | ✓ | |
| `features/widgets/hooks/use-widget-instance-editor.hooks.ts` | ✓ | ✓ | ✓ |
| `features/widgets/hooks/use-widget-region-editor.hooks.ts` | ✓ | ✓ | |
| `features/widgets/hooks/use-widget-regions.hooks.ts` | ✓ | ✓ | ✓ |
| `features/widgets/hooks/use-widgets-library.hooks.ts` | ✓ | ✓ | |
| `features/workspace/hooks/use-workspace.hooks.ts` | ✓ | ✓ | |

For every row, the reached-for dependency is exactly the module-level `api` singleton
(`import { api } from ".../lib/api"`, called as `api.methodName(...)`) and/or `useAdminLocale()`
called directly in the hook body, and/or `navigate` imported from `.../lib/router` — no other
variety of drift was found in this bucket. Converting each follows the same mechanical shape as this
session's `features/redirects` conversion: a `<feature>-port.hooks.ts` interface naming the `api.*`
methods actually called, a `<feature>-dependencies.hooks.ts` binding + fake, the hook takes
`(..., port: XPort)` in place of reaching `api` and a resolved `locale: string` in place of calling
`useAdminLocale()`, and a `useWiredX()` wrapper composes `useAdminLocale()` + `defaultXPort`. 57 files
is far beyond what one dispatch converts safely with a negatively-verified test per hook — left as
the map, per the spec's own "the map is the deliverable even if conversion stalls."

## Phase 2 — converted this session: `features/redirects` (3 hooks, 1 commit)

Commit `2ea11f4`, 9 files (2 new: `redirects-port.hooks.ts`, `redirects-dependencies.hooks.ts`; 7
modified). `useRedirects`, `useHitCountCell`, `useImportRedirectsForm` now take an injected
`RedirectsPort` (all six `api.*redirect*` methods, shared across the three since they read the same
resource); `useWiredRedirects`/`useWiredHitCountCell`/`useWiredImportRedirectsForm` are the
zero-arg pairs. `Redirects.tsx`'s pre-existing component-level DI props
(`useRedirectsHook`/`useHitCountCellHook`/`useImportRedirectsFormHook`) now default to the wired
variants — the same edit shape `PageEditor.tsx`/`PostEditor.tsx` will need (see below).

**Behavior preservation**: every call site's `api.X(...)` became `port.X(...)` with no other change
to control flow, state, or the `useFetchQuery`/`useFetchMutation` wiring around it. Confirmed safe
to leave `port` unmemoized (no `useCallback` in these three hooks depends on it — unlike
`use-assistant-chats.hooks.ts`'s `portRef` pattern, which exists specifically to avoid churning
`useCallback` identities across renders; nothing here has that shape) and confirmed TanStack Query
re-reads `queryFn`/`mutationFn` fresh each render rather than caching the closure from mount, so an
unstable `port` reference cannot desync it.

**Existing tests**: 3 test files, each had its single `renderHook(() => useX(...))` call updated to
`useWiredX(...)` — a call-site swap, not an assertion edit. All pre-existing assertions unchanged
and still pass.

**New tests** (7, one per hook plus 2 for `use-redirects`): each renders the pure hook directly with
`createFakeRedirectsPort(...)` — no `fetch` stub, no `FetchQueryProvider` request plumbing to fake at
the wire level. **Negative verification performed**: temporarily replaced
`use-hit-count-cell.hooks.ts`'s `port.getRedirectHits(...)` call with a hardcoded resolved value,
ran `use-hit-count-cell.hooks.unit.test.tsx` — 6 of 7 tests failed (both new injected-port tests
among them), confirming the tests actually exercise the injection rather than passing vacuously.
Restored via the backed-up original; full `features/redirects` suite re-run green (54/54) after
restore.

**Verification**:
- `cd apps/admin && npx tsc --noEmit` — **35 errors before, 35 after** (baseline unchanged; none in
  `features/redirects`).
- `npx vitest run src/features/redirects` — **54/54 passed**, both before this report was written and
  after the restore.
- `npm run check:admin-complexity-drift` — **identical output before and after** (3 pre-existing
  violations, all in files this session never touched: `PageEditor.tsx`, `lib/prettify-html.ts`,
  `Themes.tsx`). This conversion moved no complexity number in either direction.
- No existing assertion was edited in any of the 3 test files — only the render call-site.

**Function-quality self-check** (`AI-Dev-Shop/skills/function-quality-assessment/SKILL.md`, applied
to the refactored units): all three hook bodies are unchanged in control flow — the only edit per
function was `api.foo(...)` → `port.foo(...)` (a callee-name swap) plus one new trailing
`useWiredX()` one-liner each. No branch, loop, or nesting depth changed, so each hook's own
complexity is identical to its pre-refactor value. The two new files
(`redirects-port.hooks.ts`, `redirects-dependencies.hooks.ts`) are new surface: the port file is a
pure interface declaration (no runtime logic); the dependencies file's `defaultRedirectsPort` is six
one-line pass-throughs, and `createFakeRedirectsPort` is a closed-over in-memory store with linear
`findIndex` lookups over a per-test-seeded array (never more than a handful of rows) — flat control
flow, no nested nesting beyond one `if` per method. Disposition: **no findings** — nothing here
crosses a REQUIRED or RECOMMENDED threshold worth naming individually. Complexity: time O(1) per
port method except `importRedirects`'s O(n) map over the batch (bounded by the route's own
`MAX_IMPORT_BATCH_SIZE`); space O(n) in the fake's stored rows, same bound.

## Off-limits conversion plans

Both files audited in full; neither edited, per the dispatch's explicit constraint (owned by
`TemplateRenderBug`). Both plans below are complete enough to execute without re-deriving the
analysis — the port interfaces are copied verbatim from `lib/api.ts`'s actual signatures.

### `features/pages/hooks/use-page-editor.hooks.ts` — the owner's own named example

Reaches for exactly the four things the owner named: `api` (`getPage`, `getPresentation`,
`updatePageHtml`, `updatePost`, `deletePage`), `navigate` (from `lib/router`, called once in
`remove()`), `t` (from `../page-editor-i18n`, called 4x for error/status strings), and
`useAdminLocale()` (called once, to get `locale` for those `t()` calls).

**New file `features/pages/hooks/page-editor-port.hooks.ts`**:
```ts
export interface PageEditorPort {
  getPage(routeSlug: string): Promise<{ post: AdminPost }>;
  getPresentation(): Promise<{ activeThemeTemplates: string[] }>;
  updatePageHtml(id: string, html: string): Promise<{ post: AdminPost }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">>
  ): Promise<{ post: AdminPost }>;
  deletePage(id: string): Promise<{ post: AdminPost }>;
}
```
Note `getPresentation`'s port signature only needs to promise `activeThemeTemplates` — this hook
reads no other field of that response, unlike `use-post-editor` below. Keep the return type narrow
to what's actually consumed, matching `assistant-chats-port.hooks.ts`'s own minimalism.

**New file `features/pages/hooks/page-editor-dependencies.hooks.ts`**: `defaultPageEditorPort`
wrapping `api.getPage`/`api.getPresentation`/`api.updatePageHtml`/`api.updatePost`/`api.deletePage`
exactly as `redirects-dependencies.hooks.ts` does; `createFakePageEditorPort` seeded with an
`AdminPost` and a template list, tracking writes for assertions.

**Hook signature change**:
```ts
export interface PageEditorDependencies {
  port: PageEditorPort;
  navigate: (path: string) => void;
  t: (locale: string, key: string) => string;
  locale: string;
}
export function usePageEditor(routeSlug: string, deps: PageEditorDependencies): PageEditorController
export function useWiredPageEditor(routeSlug: string): PageEditorController {
  const locale = useAdminLocale();
  return usePageEditor(routeSlug, { port: defaultPageEditorPort, navigate, t, locale });
}
```
`useAdminLocale` itself is **not** injected as a hook reference — its resolved `locale: string` value
is, assembled in `useWiredPageEditor`. Injecting a hook reference and calling it inside the pure
hook's body is legal (React only requires a stable call order, not a stable *source* for the
reference) but has no precedent in this codebase and adds a second calling convention for no benefit
over passing the value; every internal use of `locale` in this file is as a plain string argument to
`t(locale, ...)`, so the value is all it needs.

**Call sites needing an update, currently off-limits to this agent**: `PageEditor.tsx` imports
`usePageEditor` and has `usePageEditorHook?: typeof usePageEditor` defaulting to it (line 40, called
line 164) — needs the exact edit this session made to `Redirects.tsx`: import
`useWiredPageEditor` instead, retype the prop `typeof useWiredPageEditor`, default to it.
`use-page-editor.unit.test.ts` has one `renderHook(() => usePageEditor(routeSlug))` call (line 84) —
swap to `useWiredPageEditor(routeSlug)`, same as this session's redirects test edits, plus new tests
against `usePageEditor(routeSlug, { port: createFakePageEditorPort(...), navigate: fakeNav, t: fakeT, locale: "en" })`.

### `features/posts/hooks/use-post-editor.hooks.ts`

Reaches for `api` (`getPost`, `getPresentation`, `updatePost`, `deletePost`) and `navigate`. **No**
`t`/`useAdminLocale` — every message in this file is hardcoded English (`"failed to load post"`
etc.), unlike its Pages sibling; do not add locale injection here that isn't already present, that
would be a scope-creeping behavior addition, not a refactor. Also composes `useDirtyGuard` (a
conforming/infra-tier hook, called directly — correct, not a drift) and TipTap's own `useEditor` — 
neither needs injection; they're editor/local-state infrastructure, not host ports.

**New file `features/posts/hooks/post-editor-port.hooks.ts`**:
```ts
export interface PostEditorPort {
  getPost(id: string): Promise<{ post: AdminPost }>;
  getPresentation(): Promise<{
    settings: PresentationSettings;
    availableThemes: AdminThemeSummary[];
    activeThemeTemplates: string[];
    activeThemeStaticPageIds: string[];
  }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">>
  ): Promise<{ post: AdminPost }>;
  deletePost(id: string): Promise<{ post: AdminPost }>;
}
```
Wider `getPresentation` shape than the Pages port above — this hook actually reads `settings`,
`availableThemes`, `activeThemeTemplates`, AND `activeThemeStaticPageIds` (see its load effect), so
narrowing it the way the Pages port narrows would be a silent behavior change, not a simplification.

**Hook signature change**:
```ts
export function usePostEditor(postId: string, deps: { port: PostEditorPort; navigate: (path: string) => void }): PostEditorController
export function useWiredPostEditor(postId: string): PostEditorController {
  return usePostEditor(postId, { port: defaultPostEditorPort, navigate });
}
```

**Call site needing an update, currently off-limits**: `PostEditor.tsx` — same
`usePostEditorHook?: typeof usePostEditor` pattern (line 273/276/305).

**Bigger lift than Pages**: `use-post-editor.hooks.ts` has **no existing unit test file** (confirmed:
`find features/posts -iname "*post-editor*test*"` returns nothing) — converting it needs a new test
file authored from scratch, not an edit to an existing one. That is real net-new work, not covered by
"one hook or small group per commit" at the same cost as the Pages sibling or the redirects group.

## Interaction check: `npm run check:admin-complexity-drift`

Baseline (before this session): 3 new violations (`PageEditor.tsx`, `lib/prettify-html.ts`,
`Themes.tsx`) + 2 stale debt entries ready to delete (`Appearance.tsx`, `MenuEditor.tsx`) — **none of
these are hook files**, and all three violating files are outside this dispatch's boundaries (owned
by other live agents). After the redirects conversion: **identical output, byte-for-byte**. This
refactor moved neither the ESLint-visible score nor the owner-tool's closure-aggregated score for any
file, in either direction — expected, since dependency injection here didn't create or eliminate any
closure, it renamed a callee.

## Recommendation: lint rule, not just cleanup — with a working precedent already in this repo

`eslint.config.mjs` (lines ~50–135) already enforces exactly this shape of boundary for a different
dependency: `@tanstack/react-query` is banned repo-wide via `no-restricted-imports` +
`no-restricted-syntax` (covering static import, dynamic `import()`, and `require()`), with a single
`ignores: ['apps/admin/src/lib/fetch-query/adapter.tanstack.{ts,tsx}']` exemption for the one file
allowed to import it. The doc comment on that rule states the exact reasoning that applies here too:
"Keeps `@tanstack/react-query` rippable."

Proposed new block, same shape:
```js
{
  files: ['apps/admin/src/**/*.hooks.{ts,tsx}'],
  ignores: ['apps/admin/src/**/*-dependencies.hooks.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '../../../lib/api', // and every relative depth used — needs a `patterns` glob, not a literal path list, see below
        importNames: ['api'],
        message: 'Inject an XPort instead of importing `api` directly — see redirects-port.hooks.ts / assistant-chats-port.hooks.ts for the pattern.',
      }],
    }],
  },
},
```
Caveat for whoever implements this: `paths` matches exact specifiers, and this codebase's hooks
import `lib/api` at 3 different relative depths (`../lib/api`, `../../../lib/api`,
`../../../../lib/api`) depending on nesting — `patterns` with a `group: ['**/lib/api']` (matching by
suffix, the way this repo's own `group: ['@tanstack/*']` matches by prefix) is the form that
actually generalizes; test it against at least one hook at each nesting depth before relying on it.
The same rule, or a sibling one, should also cover `useAdminLocale` (`importNames: ['useAdminLocale']`
from `.../hooks/use-admin-locale.hooks`) and `navigate` (`importNames: ['navigate']` from
`.../lib/router`) — the two other reach-for patterns this audit found. This is a Coordinator-level
call (a new lint rule is a repo-wide policy change, not something Refactor should land unilaterally
mid-conversion), flagged here rather than added.

## What was NOT done, and why

- **54 of 57 non-conforming hooks are unconverted.** Converting each safely — port interface, real
  binding + fake, signature change, downstream call-site update, existing-test call-site swap, a new
  negatively-verified injected-dependency test, one commit — is real work per file; doing it
  correctly for all 57 in one dispatch was not achievable without cutting corners the spec explicitly
  forbids (editing assertions, skipping the negative-verification step, batching unrelated features
  into one commit). The audit table above is the map; each row converts by the same mechanical
  recipe this session executed twice (redirects' 3-hook group, plus the two written-out off-limits
  plans).
- **The 5 "leaf infra / bus singleton" hooks** (`use-admin-locale`, `use-settings-slice`,
  `use-admin-execution-credential`, `use-admin-assistant-switch`, the two `useI18n` locale-sync
  hooks) were deliberately left unclassified as conforming/non-conforming rather than guessed —
  they're a different shape of reach (a pub/sub bus, or the locale mechanism itself) than the four
  categories the owner named, and forcing them into either bucket without a ruling would be a
  judgment call this report should surface, not make silently.
- **`use-page-editor.hooks.ts` / `use-post-editor.hooks.ts`**: audited, not touched — explicitly
  off-limits this dispatch. Plans above are complete enough to execute directly.
- **No lint rule was added.** Flagged as a Coordinator-level recommendation with a concrete, tested
  precedent to copy, not landed unilaterally — a repo-wide ESLint rule is bigger blast radius than
  "convert some hooks," and getting the multi-depth-import-path matching right needs its own
  verification pass this dispatch didn't have room for.
