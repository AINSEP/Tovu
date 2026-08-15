# `useWired*` migration catalog — apps/admin

**Date:** 2026-08-14
**Scope:** every component `.tsx` under `apps/admin/src` (63 files; `*-i18n.tsx`, `__tests__/`, and `*.hooks.tsx` excluded).
**Method:** scripted scan (`scratchpad/scan2.mjs`) + hand verification of every suspicious hit.

---

## The target pattern (canonical example: `features/pages/hooks/use-theme-pages.hooks.ts`)

Four files per feature:

| File | Role |
|---|---|
| `<thing>-port.hooks.ts` | the interface the hook depends on (`ThemePagesPort`) |
| `<thing>-dependencies.hooks.ts` | the real binding (`defaultThemePagesPort`, wraps `lib/api`) |
| `use-<thing>.hooks.ts` → `useX(port)` | pure hook, deps injected as an argument |
| same file → `useWiredX()` | zero-arg pair that binds the real port |

Component contract (canonical: `features/posts/Posts.tsx:48`):

```tsx
export function Posts({ usePostsHook = useWiredPosts }: PostsProps) { … }
```

The hook arrives **as a prop defaulted to the wired hook**, so a test passes a fake and the
component stays dumb. Component holds no `useState`, no `useEffect`, no `lib/api` import, no `t`
resolution of its own.

---

## ⚠️ CORRECTION (same day, after dispatch) — two scan blind spots

Found by the `wire-media-forms` agent pushing back on its brief, then verified independently.

**1. Every "Class B" component was ALREADY prop-injected.** The scan's injection regex required a
`= useWired` default, so it could not see components defaulting to the *bare* hook —
`export function Users({ useUsersHook = useUsers })`. That form is used at 19 sites:
`Database.tsx:167,216,334` · `Recovery.tsx:293,365` · `Users.tsx:522` · `Roles.tsx:458` ·
`Dashboard.tsx:115` · `Login.tsx:20` · `SettingsUi.tsx:200` · `AiAssistant.tsx:166,231,493` ·
`Media.tsx:148,433` · `FormEditor.tsx:80,205` · `Seo.tsx:232` · `Collections.tsx:287`.

Consequence: Class B's remaining work is **hook-side only** — build the port/dependencies, add the
`useWiredX()` half, and swap each prop default from bare to wired. The components are already dumb
and already injectable. Three hooks (`use-settings-ui`, `use-admin-assistant-switch`,
`use-admin-execution-mode`) are pure AND already injected — i.e. already in their finished state.

**2. `use-dashboard.hooks.ts` does 5 api calls, not 0.** The scan's api regex was single-line and
missed the multi-line chain `api\n  .listPosts()`. The file's own header documents the missing port
as a knowingly-deferred gap. Now in scope.

Re-verified with a comment-stripped, multi-line-aware check: `use-media-lightbox`, `use-media-tabs`,
`use-field-attributes-dialog`, `use-form-fields-editor`, `use-settings-ui`,
`use-admin-assistant-switch`, `use-admin-execution-mode`, `use-seo-entry-section`, and
`use-lifecycle-confirm-dialog` are all genuinely pure — the "no port" verdicts for those stand.

**Method lesson:** both blind spots were regexes encoding an assumed *call style* (`= useWired`,
`api.foo()`) rather than the property being measured. A hit count from a shape-specific pattern is
evidence about the shape, not about the property.

### Final error tally — five confirmed, all one root cause

Every agent that checked its brief against the disk found something. Corrected in full:

| # | Claim | Reality | Found by |
|---|---|---|---|
| 1 | Class B components not prop-injected | All 19 already were, defaulted to the *bare* hook | `wire-media-forms` |
| 2 | `use-dashboard` does 0 api calls | Does 5 — multi-line chain `api\n  .listPosts()` | `wire-media-forms` |
| 3 | `use-post-editor` has no port files | Has a full 6-member `PostEditorPort` | `wire-pages-posts` |
| 4 | `Collections.tsx` value-imports `lib/api` | Imports `CONTENT_TYPE_FIELD_KINDS`, a const array | `wire-inline-to-props` |
| 5 | `Redirects.tsx` value-imports `lib/api` | Imports `describeApiError`, a pure classifier | `wire-themes-misc` |

Plus: **Class D was a phantom.** The claim of "16 hooks with a `useWired` half but no port" came from
deriving the port filename from the hook filename. Re-derived by resolving actual `import`
statements (`2026-08-14-class-d-port-coverage.md`): **57 of 60 hooks have a full port + dependencies
+ fake triple**, 0 have a port without a fake, and the 3 without ports are all genuinely I/O-free.

Single root cause across all six: **a pattern matching an assumed shape was treated as a measurement
of the property.** Non-type import ≠ API client (#4, #5). Filename convention ≠ import graph (#3,
Class D). Single-line regex ≠ the code's line breaks (#2). One default form ≠ all default forms (#1).

The same three false-positive shapes recurred in the independent audits and were correctly rejected
there: `api.xxx()` inside a doc comment, `deps.api` as a locally-scoped parameter, and a multi-name
import clause. Any future sweep should resolve imports and read call sites, never count occurrences.

### Independent verification of the result

- **Port consistency audit** (`2026-08-14-port-consistency-audit.md`): all 8 new port trios, every
  dependency array enumerated. **Zero hooks put `port` in a dep array**; **zero `use-*.hooks.ts`
  value-import `api`**. Real findings were 5 trios missing `@param`/`@returns` and one
  `useEffect(load, [])` dodging `exhaustive-deps` implicitly — both fixed.
- **Negative verification**: new fake-port tests were checked for vacuity by breaking the fake and
  confirming RED per test. Where run, every test caught its regression, and fake-path tests stayed
  green while the *wired* default was broken — proving the fake path is genuinely exercised and not
  shadowed by the real one.

---

## Verified facts that constrain the work

1. **`useT()` is not a defect anywhere.** All 7 grep hits for `useT()` in components are *prose
   inside comments*, not call sites. `SettingsUi.tsx` and `AiAssistant.tsx` deliberately take `t`
   as a prop **because the component itself mounts the `I18nProvider`** — calling `useT()` there
   would resolve to the wrong context. Do not "fix" this.
2. **Not every unwired hook needs a port.** Six of them do no I/O at all — a port would be
   ceremony with nothing to inject. Those need prop-injection only.
3. **`useAdminLocale`** (`hooks/use-admin-locale.hooks.ts`) is a shared leaf primitive consumed by
   5 components. It does raw `useState`+`useEffect`+`loadLanguage()`. Wiring it is a single
   cross-cutting decision, not per-component cleanup — tracked separately below.

---

## OWNER RULING — where UI state lives (2026-08-14, mid-sweep)

- **Async / API / data-fetching state → always moves into the hook.** Non-negotiable.
- **Pure interactive DOM-chrome state stays LOCAL in the component**: `aria-pressed`, `<dialog>`
  open, focus management, expanded/collapsed, active tab, sort toggles.
- **When unsure:** attempt the move, run the suite, revert and document if real-DOM assertions break.

Why: every controller fake in `apps/admin` is a **static object** (`useThemeExploreHook={() =>
controller({…})}`), so injected setters are `vi.fn()` stubs and the value never changes. Moving
`device`/`fullscreen` into the hook broke 6 real-DOM assertions in `ThemeExplore.unit.test.tsx` —
proven empirically by making the move, then reverted. Ratified precedent: `Posts.tsx:64`
(`updatedSort`), a client-side sort toggle deliberately kept local.

Two alternatives were **explicitly declined** by the owner: adopting stateful test fakes
codebase-wide, and redesigning controllers around keyed per-item records for per-card state.

Technical footnote so this isn't mis-recorded: the seam *could* carry interactive state — the
injected dependency is a hook, so a fake is free to hold `useState`. There is simply no precedent
for that in this codebase (verified: zero stateful fakes), and the owner chose not to introduce one.

Consequence: these `useState` counts are **expected to remain**, not defects —
`ThemeExplore.tsx` (device, fullscreen), `Themes.tsx` (stage, expanded, manualTab), `Posts.tsx`
(updatedSort), and any tooltip/modal chrome in Class A. Each site should carry a comment saying why.

---

## CLASS A — no hooks file at all (logic still inline in the component)

| File | Lines | What is inline |
|---|---|---|
| `lib/widget-embed-extension.tsx` | 199 | `api` value import, `useState`×3, `useEffect`×1 |
| `lib/media-image-extension.tsx` | 123 | `api` value import, `useState`×1 |
| `components/WidgetConfigFields/WidgetConfigFields.tsx` | 254 | `api` value import |
| `components/MediaPickerDialog/MediaPickerDialog.tsx` | 94 | `api` value import |
| `features/playground/Playground.tsx` | 237 | `useState`×2, local hook defined in file |
| `features/posts/PostTemplateModal.tsx` | 135 | `useState`×1, `useEffect`×1, local hook |
| `components/InfoTip.tsx` | 99 | `useState`×3 |
| `features/settings/ComposioKeyField.tsx` | 96 | `useState`×1 |
| `components/ImagePreviewModal.tsx` | 75 | `useEffect`×1 |
| `features/plugins/AgentPluginDetailsModal.tsx` | 68 | `useState`×1 |
| `lib/fetch-query/adapter.tanstack.tsx` | 252 | 3 local hooks — **infrastructure, not a screen; exclude** |

---

## CLASS B — hooks extracted, but no `useWired` pair (no port / no dependency injection)

### B1 — hook does real I/O → needs the full port + dependencies + `useWired` triple

| Component | Lines | Unwired hooks (hook lines) |
|---|---|---|
| `features/database/Database.tsx` ← *named by owner* | 386 | `use-timeline-section` (189), `use-restore-points-section` (73), `use-migrate-forward-section` (127) |
| `features/users/Users.tsx` | 659 | `use-users` (402, 7 api calls) |
| `features/roles/Roles.tsx` | 615 | `use-roles` (399, 8 api calls) |
| `features/recovery/Recovery.tsx` | 394 | `use-recovery` (90), `use-restore-flow` (148) |
| `features/ai-assistant/AiAssistant.tsx` | 854 | `use-visitor-credential-form` (486) |
| `features/media/Media.tsx` | 754 | `use-media-preview` (59), `use-media-lightbox` (182) |
| `features/forms/FormEditor.tsx` | 790 | `use-field-attributes-dialog` (64), `use-form-fields-editor` (68) |
| `features/dashboard/Dashboard.tsx` | 175 | `use-dashboard` (126) |
| `features/auth/Login.tsx` | 43 | `use-login` (47) |

### B2 — hook is pure UI state (no I/O) → **no port needed**, prop-injection only

| Component | Unwired hook | Hook lines |
|---|---|---|
| `features/settings/SettingsUi.tsx` | `use-settings-ui` | 197 |
| `features/ai-assistant/AiAssistant.tsx` | `use-admin-assistant-switch`, `use-admin-execution-mode` | 22, 47 |
| `features/media/Media.tsx` | `use-media-tabs` | 22 |
| `features/seo/Seo.tsx` | `use-seo-entry-section` | 19 |
| `features/collections/Collections.tsx` | `use-lifecycle-confirm-dialog` | 29 |

---

## CLASS C — wired, but leftovers in the component

### C1 — `lib/api` still imported as a *value* in the component
| File | Lines | Detail |
|---|---|---|
| `features/pages/PageEditor.tsx` ← *named by owner* | 579 | `api.templatePreviewUrl(id, templateChoice)` called in JSX (`:552`). Owner's instruction: inject `api` into the hook and **re-export the URL from the controller**. |
| `features/posts/PostEditor.tsx` | 1165 | `api` value import + `useState`×1 + `useEffect`×1 |
| `features/redirects/Redirects.tsx` | 303 | `api` value import |
| `features/collections/Collections.tsx` | 500 | `api` value import (plus B2 item above) |

### C2 — raw React state left in a wired component
| File | Lines | Detail |
|---|---|---|
| `features/themes/ThemeExplore.tsx` | 1175 | `useState`×3, `useEffect`×2 |
| `features/themes/Themes.tsx` | 438 | `useState`×3 |
| `features/pages/Pages.tsx` | 260 | `useState`×1 |
| `components/AssistantDock/AssistantDock.tsx` | 557 | `useState`×1, `useEffect`×1 |
| `features/plugins/AgentPlugins.tsx` | 122 | `useState`×1 |
| `features/posts/Posts.tsx` | 175 | `useState`×1 |

### C3 — calls `useWiredX()` inline instead of accepting it as a prop
| File | Lines | Inline calls |
|---|---|---|
| `features/collections/CollectionEntryEditor.tsx` | 384 | 2 (`useWiredTermPicker`, `useWiredCollectionEntryEditor`) |
| `features/menus/MenuEditor.tsx` | 340 | 1 (`useWiredMenuEditor`) |
| `features/menus/Menus.tsx` | 92 | 1 (`useWiredMenus`) |
| `features/collections/CollectionEntries.tsx` | 85 | 1 (`useWiredCollectionEntries`) |
| `features/comments/Comments.tsx` | 425 | 2 inline vs 1 prop-injected — inconsistent within one file |
| `features/settings/SettingsUi.tsx` | 836 | 1 (`useWiredAdminExecutionCredential`) |
| `features/ai-assistant/AiAssistant.tsx` | 854 | 1 (`useWiredAdminExecutionCredential`) |

---

## CLASS D — has a `useWired` pair but **no port/dependencies files**

The `useWired` half exists, but it binds imports directly rather than a named port, so tests can't
swap the dependency. 16 hooks:

`useWiredAiAssistantLocaleSync`, `useWiredEditMediaPanel`, `useWiredEntryPicker`,
`useWiredFormEditor`, `useWiredFormSubmissionDetail`, `useWiredFormsList`, `useWiredHitCountCell`,
`useWiredImportRedirectsForm`, `useWiredMenuEditor`, `useWiredPosts`, `useWiredSeoEntryPanel`,
`useWiredSettingsLocaleSync`, `useWiredTermDetailPanel`, `useWiredWidgetInstanceEditor`,
`useWiredWidgetRegionEditor`, `useWiredWidgetsLibrary`

---

## Already clean (no action)

`Analytics.tsx`, `Authentication.tsx`, `Payments.tsx`, `FormsList.tsx`, `IntegrationDeliveries.tsx`,
`Integrations.tsx`, `Members.tsx`, `Plugins.tsx`, `Taxonomy.tsx`, `WidgetInstanceEditor.tsx`,
`WidgetRegionEditor.tsx`, `WidgetRegions.tsx`, `WidgetsLibrary.tsx`, `Workspace.tsx`,
`AdminByokKeyPanel.tsx`, `ChatFab.tsx`, `EmbedInsertControl.tsx`, `SeeMore.tsx`, `Select.tsx`,
`TabBar.tsx`, `main.tsx`, `panels.tsx`, `App.tsx`*, `Placeholder.tsx`*, `PlaceholderTabs.tsx`*

\* clean apart from consuming the shared `useAdminLocale` leaf.
