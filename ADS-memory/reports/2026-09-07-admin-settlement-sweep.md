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

- `552043f8` — fix(admin/pages): use-pages.hooks.ts settlement guard.
- `5f625a02` — fix(admin/seo): use-seo-entry-panel.hooks.ts analyze-refresh settlement guard.
- `086aef9d` — docs: this report (first pass).
- `c9a9ad7b` — fix(admin/posts): use-posts.hooks.ts settlement guard (gap-closure round, below).

## Follow-up: closing the three scope gaps (same day)

Team-lead asked for the three caveats from the first pass to be closed rather than left open, and
noted the RED-capture method used in the first pass (temporarily editing the real hook file,
running the test, then reverting) is unsafe in a shared tree with several concurrent agents — a
revert window is exactly where another agent's in-flight edit could get clobbered. **Not repeated
below**: each gap-closure test was proven RED against the real, unmodified source first (the bug
was still live at that point), then the fix applied, then GREEN — no working-tree revert at any
point.

### Gap 1 — `use-posts.hooks.ts`

Brought into scope despite being unchanged this window, since it is `use-pages.hooks.ts`'s
byte-for-byte twin. **Confirmed the same defect**: `load` wired to both the mount effect and
`useContentRefreshSubscription`, no generation guard. Same failure scenario as finding #1 (two
`content_post_create`/`_update`/`_delete` agent writes back to back can let a stale `listPosts()`
response overwrite the newer Posts list). Fixed identically with `useSettlementGeneration`.

RED test added against the real unmodified source (failed naturally — no revert needed, since the
file had not been fixed yet); GREEN after the fix. Full file: 20/20 passing. Commit `c9a9ad7b`.

### Gap 2 — the unread tail of `AssistantDock.hooks.tsx`

Finished reading lines 979–1471 (the file is 1471 lines total, now fully read). The remainder is:
`resolveComposerDiscoveryOutcome` (async, but its only await is a single tool-call passthrough with
no local state to settle), `useComposerDiscoverySelect` (pure `useCallback` wrapper),
`shouldPublishOnMessagesChange`/`useMessagesChangeHandler` (a `useRef` dedup marker plus two
synchronous bus publishes, no fetch), `resolveRunContext`/`useRunContext` (pure derivation,
`useMemo`), `buildAssistantMcpUiSandboxProxyUrl` (pure), and the ten `use*Seam` wrappers (each a
bare `override ?? realHook` call — no new state or effects of their own; they compose hooks already
reviewed in the first 978 lines). **No new async-settlement surface in the unread tail.** File is
clean end to end — no findings.

### Gap 3 — the async settlement sites in `use-page-editor.hooks.ts` / `use-post-editor.hooks.ts`

Both files read in full this round (759 and 1049 lines respectively; previously only grep-sampled).
Every state-setting async site:

- **Mount load effects** — `use-page-editor.hooks.ts:399-435` uses a `cancelled` flag.
  `use-post-editor.hooks.ts:676-739` does **not** use one, but this is safe, not a gap: both
  `<PageEditor>` and `<PostEditor>` are rendered `key={ctx.params.slug}` /
  `key={ctx.params.postId}` at their route in `panels.tsx:166` and `panels.tsx:192` — the latter's
  own comment explicitly cites the `SeoEntryPanel key={entryId}` precedent as the reason it "was
  never vulnerable." Switching posts/pages remounts the hook instead of leaving a stale in-flight
  response to land on the wrong entry — the same "missing `key=`" check the dispatch asked for,
  confirmed present and load-bearing at both route sites.
- **`runSave`/`writePage`** (both files) — fully guarded with `useSettlementGeneration`, checked
  before every state write on both the success and catch branches (and, in `use-page-editor.hooks.ts`,
  the `finally` too — `use-post-editor.hooks.ts` has no `finally`/`saving` flag to guard, by explicit
  documented design: neither Save nor Publish disables while a request is in flight there, so the
  generation guard is the ONLY correctness mechanism, and it is applied correctly on both branches).
- **`saveOverwritingConflict`** (both files) — re-reads the row and calls `setPage`/`setPost` with
  the fresh copy BEFORE handing it to the (generation-guarded) `runSave`, and that intermediate
  `setPage`/`setPost` call itself carries no generation guard. Considered as a possible finding and
  **not escalated**: the "Save anyway" button in both editors has no `disabled` gate, so a double
  click can start two overlapping `saveOverwritingConflict()` calls — but both calls re-read the
  SAME row at nearly the same instant with no write in between (the realistic double-click window),
  so their bases and the operator's live-state content are identical in every reachable case; and
  even in the constructed edge case where a third party writes between the two re-reads, the
  server's own optimistic-concurrency compare-and-swap (the whole reason `runSave` takes an
  explicit `basis`/`expectedVersion`) rejects a save built on a version that's no longer current —
  producing a re-shown conflict banner, not a silent overwrite. No divergent, user-visible failure
  scenario could be constructed, so per "a finding without a failure scenario is a guess" this is
  reported as a considered-and-cleared observation, not a finding.
- **Every other effect** (`draftHtml` prettify-on-tab-switch, `ResizeObserver` pane-width,
  mention-list fetch-once, autosave-scheduling, pending-content-preview `setTimeout`) is either
  synchronous or self-documents why no `cancelled` flag is needed (the `setTimeout` case: a cleared
  timer provably never fires, unlike a `fetch` promise).

**No new findings.** Both files are now fully read, not sampled.

## What was fully read vs. sampled (final accounting)

Fully read, this sweep, in full: `use-settlement-generation.hooks.ts` (+test), all files listed
under "Explicit per-file negatives" above except where noted, `use-pages.hooks.ts`,
`use-seo-entry-panel.hooks.ts`, `use-posts.hooks.ts`, `AssistantDock.hooks.tsx` (all 1471 lines),
`use-page-editor.hooks.ts` (all 759 lines), `use-post-editor.hooks.ts` (all 1049 lines). No files
in this sweep's final scope were left at grep-only/sampled coverage.

## Commits (gap-closure round)

- `c9a9ad7b` — fix(admin/posts): guard the Posts list reload against out-of-order content-refresh
  responses.

See follow-up message to team-lead for the full commit list.
