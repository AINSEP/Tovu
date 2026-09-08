# Admin settlement-race sweep — 2026-09-07

Agent: Code Inspection (A2-SETTLEMENT). Dispatched by team-lead to sweep `apps/admin` hooks and
components changed since `24c71a5be3bb0668acbe1ff6a614f888baefeb7f`, for the four stale-settlement
race patterns (setState-after-unmount, out-of-order responses, missing effect cleanup, missing
`key=`). Scope excluded `apps/admin/src/features/settings/*` and `apps/admin/src/lib/api.ts`
(A1-MCPDRIFT's concurrent work).

## Method

`git diff --stat 24c71a5b HEAD -- apps/admin` (178 files). Narrowed to `.hooks.ts(x)` files plus a
map-render key audit of changed `.tsx` components. Read `use-settlement-generation.hooks.ts` (the
extracted helper, and its doc's list of the 8 covered call sites + 3 documented bespoke exceptions)
before reading anything else, per the dispatch's "learn the established fix shape first" instruction.

## Findings (2, both confirmed with RED test before any fix)

### 1. `apps/admin/src/features/pages/hooks/use-pages.hooks.ts` — `load` (was lines 110–123)

Pattern 2 (out-of-order responses). `load` is wired to both the mount effect and
`useContentRefreshSubscription` (new trigger this window — before, `load` only ran once at mount).
No generation guard on `port.listPages().then(setPages)`.

**Failure scenario:** operator has the Pages list open. An assistant run edits two different pages
back to back via `pages_write_html`, publishing two content-refresh notifications close together.
Each fires its own `listPages()` GET with no ordering guarantee on the HTTP responses. If the OLDER
GET resolves last, its `.then(setPages)` overwrites the freshly rendered (newer) list — an edited
page can appear to silently revert/vanish until the next refresh event happens to arrive, with no
error shown.

**Fix:** adopted `useSettlementGeneration` — `load` mints a generation before the request, checks
`isCurrent` before both `setPages` and `setError`.

**Test:** `apps/admin/src/features/pages/__tests__/use-pages.unit.test.ts` — new case "does not let
a slower, earlier-triggered refresh overwrite a newer one that already settled". RED confirmed by
temporarily stripping the guard (assertion failed, stale response won); GREEN with the guard
restored. Full file: 22/22 passing.

`use-posts.hooks.ts` (this screen's twin) looks structurally identical and likely shares the same
gap, but it was **not** touched this window and is out of scope — flagged for the team, not fixed
here.

### 2. `apps/admin/src/features/seo/hooks/use-seo-entry-panel.hooks.ts` — `save`'s trailing analyze refresh (was lines 89–110)

Pattern 2 (out-of-order responses), narrower than #1. `save()`'s `finally { setSaving(false) }`
fires the moment `putSeoEntry` resolves — before the fire-and-forget `getSeoEntryAnalyze(...)
.then(setAnalysis)` that follows a successful save settles. The Save button re-enables immediately,
so a second edit+save can complete in full — including its OWN trailing analyze refresh — while the
first save's analyze call is still in flight. No generation guard existed.

**Failure scenario:** operator edits an entry's SEO title, saves, immediately edits again and saves
a second time. If the first save's analyze response is slower than the second save's full
put+analyze round trip, the first (now-stale) analyze response lands last and overwrites the
second save's fresh score/issues with data computed against overrides the second save already
replaced.

Also checked and cleared: the OTHER obvious race in this file — `load`'s
`Promise.all([getSeoEntry, getSeoEntryAnalyze])` re-running when `entryId` changes — is neutralized
because `Seo.tsx:384` renders `<SeoEntryPanel key={entryId} .../>`, so switching entries remounts
the whole hook; a stale response from a previous entry lands on a dead fiber and is silently
dropped. This is the "missing `key=`" pattern working correctly, not a finding.

**Fix:** added a second `useSettlementGeneration` instance (`analyzeSettlement`), minted right
before the fire-and-forget `getSeoEntryAnalyze` call, checked in its `.then()` before `setAnalysis`.
`setResolved`/`setTouched`/`setNotice` from the PUT itself needed no guard — two saves cannot
overlap on the PUT phase (the button is disabled until the first PUT resolves), only on the
trailing analyze call that follows it.

**Test:** `apps/admin/src/features/seo/__tests__/use-seo-entry-panel.unit.test.ts` — new case "does
not let a slower, earlier save's trailing analyze refresh overwrite a newer save's fresher
analysis". RED confirmed (assertion `80` vs expected `42` failed without the guard); GREEN with the
guard restored. Full file: 10/10 passing.

## Explicit per-file negatives (checked, clean)

- `use-settlement-generation.hooks.ts` — the helper itself; correct, including the
  referential-stability contract its own tests assert.
- `use-standing-draft-autosave.hooks.ts` — serial `chainRef` enqueue chain (`writeAutosave`,
  `clearStandingDraft`) plus a `cancelled` flag on the mount-time recovery check; deliberately
  engineered against exactly this class of bug, per its own extensive header doc.
- `Media.hooks.tsx`, `use-edit-media-modal.hooks.ts` — no async settlement surface at all
  (presentational tab/icon derivations; native `<dialog>` open/close lifecycle).
- `use-edit-media-panel.hooks.ts` — single `useFetchMutation` keyed via `key={editingItem.id}` at
  the render site; a stale save cannot land on the wrong item because the panel remounts.
- `media-dependencies.hooks.ts`, `media-port.hooks.ts`, `use-media-tabs.hooks.ts`,
  `seo-dependencies.hooks.ts`, `seo-port.hooks.ts`, `page-editor-dependencies.hooks.ts`,
  `page-editor-port.hooks.ts`, `post-editor-dependencies.hooks.ts`, `post-editor-port.hooks.ts` —
  pure DI wiring/type files; grepped for `useState`/`useEffect`/`.then(`/`await` — zero hits (one
  `await` in `page-editor-dependencies.hooks.ts` is a plain non-hook async function).
- `MenuEditor.hooks.tsx` — synchronous confirm/remove logic only, no I/O.
- `Roles.hooks.tsx`, `Sites.hooks.tsx`, `Seo.hooks.tsx` (feature-level tab-descriptor files) —
  presentational/derived-value only, no async state.
- `use-roles.hooks.ts` — the documented `permissionsGenerationRef` exception from
  `use-settlement-generation.hooks.ts`'s own header; every action (`onSaveRole`, `onDeleteRole`,
  `onSavePolicy`, `onDeletePolicy`, `onWritePermission`, `loadPermissions`) keys its settle-time
  state reset off the call's own id or the shared generation, checked before every state write
  including the failure path. Thorough, matches the doc.
- `use-seo.hooks.ts` — the mount-time settings load runs once (no re-trigger path). Save and
  Regenerate-sitemap share one `saving` flag that disables both buttons, so there is no reachable
  path to start them concurrently (checked `Seo.tsx`'s `disabled={saving}` on both).
- `AssistantDock.hooks.tsx` — read ~978 of 1471 lines (did not finish the last ~500). Every async
  hook seen (`useExecutionConfig`, `useByokRuntime`, `useLocalCliSelection`,
  `useComposerCapabilities`) uses a `cancelled` flag, a purpose-built ref guard
  (`localWriteRef`/`hydratedRef`/`touchedRef`), or module-level in-flight dedup
  (`daemonOnlineInFlight`). Flagging the unread remainder as a scope gap, not a clear.
- `push-to-talk-state.hooks.ts` — pure state machine, zero I/O.
- `use-push-to-talk.hooks.ts` — `cancelled` flag on the one-shot availability probe; `startHold`/
  `endHold` drive the FSM via functional updates keyed off `previous` state, which self-corrects an
  out-of-order capture start/stop (checked `next.status !== "recording"` after a granted-permission
  race).
- `use-page-editor.hooks.ts` (759 lines) / `use-post-editor.hooks.ts` (1049 lines) — both already
  on `useSettlementGeneration` (for `save`/`runSave`) and the new `useStandingDraftAutosave`; the
  page/post load effects use a `cancelled` flag. Verified via targeted grep plus the two other
  effects in `use-page-editor.hooks.ts` (a synchronous HTML-prettify-on-tab-switch effect and a
  `ResizeObserver` effect — neither touches async settlement). **Not** a full line-by-line read of
  either file; noting as a scope caveat rather than an exhaustive clear.
- Map-render key audit across `Media.tsx`, `Themes.tsx` (marketplace + installed grids),
  `AgentPlugins.tsx`, `MenuEditor.tsx` (item tree), `AccessTokensTab.tsx` (row groups),
  `ThemeExplore.tsx` (file list) — every stateful/async row keys off a stable id or path
  (`item.id`, `themeId`, `plugin.id`, `child.id`/`item.id`, `row.row.id`, `file.path`), never an
  array index.
- `Comments.tsx` — this window's diff is `agentHandle`/i18n-key annotations only; no logic touched.

## Verification

- `env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/pages/__tests__/use-pages.unit.test.ts
  src/features/seo/__tests__/use-seo-entry-panel.unit.test.ts` (run from `apps/admin`): 32/32
  passing.
- `npx tsc --noEmit` from `apps/admin`: run, baseline result recorded in the follow-up message to
  team-lead (long-running; captured separately).

## Commits

See follow-up message to team-lead for commit sha(s) — staged explicit paths only, unique
commit-message file, no `git add -A`.
