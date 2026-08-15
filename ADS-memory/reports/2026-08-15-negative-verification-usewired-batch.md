# Negative Verification — usewired DI sweep, remaining ~10 test files

- **Session:** 2026-08-15
- **Branch:** `general-work`
- **Dispatch context:** continuation of `ADS-memory/reports/continuity/2026-08-15-usewired-di-sweep-handoff.md`, section 6 item 1.
- **Method (per file):** identify the fake/mock method (or, for component/hook tests with no
  injected port, the production code) the assertion actually depends on; mutate it (wrong return,
  throw, no-op, guard removed); run the single named test with
  `cd apps/admin && npx vitest run <path> -t "<test name>"`; confirm RED; revert; confirm GREEN.
- **Non-goal:** exhaustive mutation of every assertion in every file. One or two mutations per
  file, chosen to hit the assertion(s) that carry the file's actual claim (most of these tests are
  explicitly about proving DI wiring is not hardcoded — that's the mutation target).

## Results

### 1. `apps/admin/src/features/playground/__tests__/Playground.unit.test.tsx`

Two mutations against `Playground.tsx` (the component under test; the "fake" here is the injected
controller object, which is trivial data — the thing worth breaking is whether the component
actually routes through it).

- **Mutation A** — line `usePlaygroundHook()` → `usePlayground()` (hardcode the real hook,
  defeating injection). Test: `"renders purely off an injected fake, proving usePlaygroundHook is
  not hardcoded"`. **RED** (`getByText("0 of 5")` not found — real hook's registry rendered
  instead). Reverted. Full file green (4/4).
- **Mutation B** — `onClick={() => addToSurface(entry)}` → `onClick={() => {}}`. Test: `"Add to
  surface and Clear surface call through to the injected controller's actions"`. **RED**
  (`addToSurface` called 0 times). Reverted. Full file green (4/4).

**Verdict: PROVEN.**

### 2. `apps/admin/src/features/playground/__tests__/use-playground.hooks.unit.test.ts`

Tests the real `usePlayground` hook directly (no injected port — this tab is deliberately
client-side-only per its own file header). Mutation target: the hook's own source,
`use-playground.hooks.ts`.

- **Mutation** — `addToSurface`'s `updateComponents` children array:
  `[...existingChildren, newId]` → `[newId]` (clobbers earlier entries instead of appending).
  Test: `"addToSurface appends multiple entries under the same root without clobbering earlier
  ones"`. **RED** (`expected [ 'pg-2' ] to have a length of 2 but got 1`). Reverted. Full file
  green (7/7).

**Verdict: PROVEN.**

### 3. `apps/admin/src/features/posts/__tests__/use-post-template-source.hooks.unit.test.ts`

Uses `createFakePostTemplatePort` from `post-template-dependencies.hooks.ts` — a real fake with
behavior (not a static stub), so both the fake and the hook's own branching were mutated.

- **Mutation A** — `use-post-template-source.hooks.ts`: `if (themeTier !== "static") return;` →
  `if (false) return;` (removes the tier guard, so the hook always fetches). Test: `"never calls
  the port for a non-static theme tier"`. **RED** (`fetchSpy` called once, `not.toHaveBeenCalled()`
  failed). Reverted.
- **Mutation B** — `post-template-dependencies.hooks.ts`: removed the
  `if (options.fetchTemplateSourceError) throw ...` branch from `createFakePostTemplatePort`, so
  the fake never rejects. Test: `"resolves to error with the rejection's message on a port
  failure"`. **RED** (state resolved to `{status: "loaded", html: ""}` instead of `{status:
  "error", ...}`). Reverted.

Full file green (6/6) after both reverts.

**Verdict: PROVEN.**

### 4. Injection block in `apps/admin/src/features/posts/__tests__/PostTemplateModal.unit.test.tsx`

Only the `"PostTemplateModal template-source-hook injection"` describe block is in scope (the
other 6 tests in this file predate the sweep and don't test injection).

- **Mutation** — `PostTemplateModal.tsx`: `useTemplateSourceHook(...)` → `useWiredTemplateSource(...)`
  (hardcode the real hook, bypassing the injected prop). Test: `"renders purely off an injected
  fake, proving useTemplateSourceHook is not hardcoded"`. **RED** (`getByText("fake template
  source")` not found — real hook's `loading` state rendered instead, since global `fetch` was
  stubbed to a `vi.fn()` that never resolves). Reverted. Full file green (7/7).

**Verdict: PROVEN.**

### 5. `apps/admin/src/components/__tests__/widget-config-fields-dependencies.unit.test.ts`

Two mutations against `widget-config-fields-dependencies.hooks.ts`:

- **Mutation A** — `defaultWidgetConfigFieldsPort.listMenus` body: `() => api.listMenus()` →
  `() => Promise.resolve({ menus: [] })` (stop delegating to `api`). Test: `"listMenus delegates
  to api.listMenus"`. **RED** (`expected "listMenus" to be called 1 times, but got 0 times`).
  Reverted.
- **Mutation B** — `createFakeWidgetConfigFieldsPort`: removed the
  `if (options.listMenusError) throw options.listMenusError;` branch. Test: `"rejects with the
  given errors when set"`. **RED** (`port.listMenus()` resolved to `{menus: []}` instead of
  rejecting). Reverted.

Full file green (5/5) after both reverts.

**Verdict: PROVEN.**

### 6. `apps/admin/src/components/__tests__/MediaPickerDialog.unit.test.tsx`

Only the `"MediaPickerDialog — useDialog injection"` describe block is in scope (the file's own
header calls this "the seam-specific test the split adds"; the other describe blocks predate the
sweep, exercising the real hook against a mocked `api.listMedia`).

- **Mutation** — `MediaPickerDialog.tsx`: `useDialog(...)` → `useWiredMediaPickerDialog(...)`
  (hardcode the real hook). Test: `"renders entirely off an injected useDialog — api.listMedia and
  api.mediaOriginalUrl are never called"`. **RED** (`getByTitle("Fake asset")` not found — real
  hook's loading state rendered, since `api.listMedia` was left as an un-mocked spy that never
  resolves). Reverted. Full file green (11/11).

**Verdict: PROVEN.**

### 7. `apps/admin/src/features/media/__tests__/use-edit-media-panel.hooks.unit.test.tsx`

Two mutations against `use-edit-media-panel.hooks.ts`. Note: this file's own comments already
claim a self-documented negative-verification for the first two tests in its top describe block
("Negative verification (per this refactor's own required check)..." at line 82) — per this
session's own standing instruction to verify claims written in code comments rather than trust
them, both the baseline-diff claim and the port-seam claim were independently re-verified below
rather than taken on the comment's word.

- **Mutation A** — `save()`: `diffMediaMetadata({ item: baselineRef.current, draft })` →
  `diffMediaMetadata({ item, draft })` (diff against the live, drifting `item` prop instead of the
  frozen mount-time baseline — reintroducing the exact TM-TOVU-2026-08-12-A silent-revert bug the
  test's own comment describes). Test: `"does not revert a field changed elsewhere while the panel
  stays open, when only a different field was edited here"`. **RED**
  (`expected '' to be 'Changed by operator B'` — the concurrent operator's write got silently
  reverted, exactly the documented failure mode). Reverted.
- **Mutation B** — `originalUrl`: `port.mediaOriginalUrl(item.id)` →
  `` `computed://not-from-port/${item.id}` `` (bypass the injected port). Test: `"originalUrl is
  exactly the injected port's mediaOriginalUrl, not one this hook computed itself"`. **RED**
  (`expected 'computed://not-from-port/m1' to be 'fake://media-original/m1'`). Reverted.

Full file green (4/4) after both reverts.

**Verdict: PROVEN.**

### 8. `apps/admin/src/features/media/__tests__/use-media-preview.hooks.unit.test.tsx`

Two mutations against `use-media-preview.hooks.ts`:

- **Mutation A** — `src`: `port.mediaOriginalUrl(item.id)` →
  `` `computed://not-from-port/${item.id}` `` (bypass the injected port). Test: `"src is exactly
  the injected port's mediaOriginalUrl, not one this hook computed itself"`. **RED**
  (`expected 'computed://not-from-port/m1' to be 'fake://media-original/m1'`). Reverted.
- **Mutation B** — `handleVideoError`: `setStage("unsupported")` → `setStage("video")` (break the
  fallback-chain's terminal transition). Test: `"advances image -> video -> unsupported on
  successive probe failures, same as before the port injection"`. **RED**
  (`expected 'video' to be 'unsupported'`). Reverted.

Full file green (3/3) after both reverts.

**Verdict: PROVEN.**

## Running tally

8/8 files verified PROVEN so far (0 vacuous). Continuing to the remaining 3 files.

## Six pre-existing dirty files — inspected, not touched

Per dispatch instructions, inspected but did not revert or modify any of these:

1. **`apps/admin/src/__measurements__/request-volume.measurement.test.tsx`** — renames call sites
   from stale hook/prop names (`useContentTypes`/`.contentTypes`, `useRoles`, `useUsers`,
   `useTimelineSection`, `useRestorePointsSection`) to the post-sweep `useWiredX` names and the
   real `.types` field. Verified `useWiredCollections()` really returns `.types` (not
   `.contentTypes`) by reading `use-collections.hooks.ts:46,79,115` — the rename is correct.
   Grepped the full file for any remaining stale names: none found. **Looks complete, not
   partial** (the dispatch brief flagged it as "partial, ~30 lines" — that does not match what's
   on disk; every renamed call site is internally consistent).

2. **`apps/admin/src/features/playground/__tests__/Playground.unit.test.tsx`** — the diff replaces
   a bare `interpreter: {} as PlaygroundController["interpreter"]` cast with a real
   `createA2uiInterpreter(createLabCatalog())`, plus an explanatory comment citing
   `A2uiSurfaceRenderer`'s real `subscribe`/`getRoot` calls. Verified `createA2uiInterpreter`/
   `createLabCatalog` are real exports from `@jini-ai/ui/a2ui` (`Jini/packages/ui/src/features/
   a2ui/index.ts`). **Looks complete** (7-line diff, both import and usage present, file balances
   at EOF). **Does not affect the PROVEN verdict above** — this test file was negative-verified
   with the diff already in place (i.e., against the real interpreter), so mutation A above (`{}`
   is not what was tested).

3. **`apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx`**
   (+85 lines) — adds one new `describe` block, a stale-response race regression test pinning that
   `useFetchQuery`'s cache-key-includes-`entryId` design prevents an old in-flight response from
   clobbering a newer entry's state after a fast entryId switch. Checked brace balance
   programmatically (depth 0 at EOF) and read the full block: it's a complete, self-contained test
   with real assertions, not a truncated fragment. **Looks complete.**

4. **`apps/admin/src/features/plugins/__tests__/AgentPluginBundle.unit.test.ts`** (2 lines) +
   **`apps/admin/src/features/plugins/agent-plugin-source-catalog.ts`** (88 lines, all import
   paths) + **`apps/admin/vitest.config.ts`** (6 lines, comment only) — these three together are one
   coherent change: the Jini repo restructured
   `Jini/packages/plugins/samples/agent-plugins/ui-ux-design` → `Jini/packages/plugins/ui-ux-design`
   (verified on disk: `samples/` no longer exists under `Jini/packages/plugins/`, `ui-ux-design/`
   sits directly under it). All 44 `?raw` import paths in `agent-plugin-source-catalog.ts`, the
   test's `PLUGIN_ROOT`, and the vitest config's explanatory comment were updated consistently to
   match. **Looks complete** — no stale `samples/agent-plugins/` references remain in any of the
   three files.

None of the six looked broken or truncated. No action taken on any of them per instructions.
