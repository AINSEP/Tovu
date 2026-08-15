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
- **Mode tagging (added mid-session per team-lead review):** every mutation below is tagged
  `mode: injection-seam` or `mode: production-path`. These prove different things and both matter
  for a DI sweep specifically:
  - `injection-seam` — mutates the SUT's own code at the point it reads an injected dependency
    (swap a hardcoded real hook/binding in for the injected prop/parameter, or make the SUT read
    off something other than what it was handed). Proves the injection is real — that the test
    actually observes the dependency it injects, rather than the component/hook quietly using the
    real binding underneath with the "injected" prop being decorative. This is the specific defect
    class this sweep exists to catch: an un-migrated component that ignores its injected prop
    passes a production-path mutation and fails only an injection-seam one.
  - `production-path` — mutates ordinary business logic (a guard, a fallback-chain transition, an
    array-append, an effect-cleanup detail) with no DI dimension, or mutates a dependency-defining
    module's own internals when the file under test IS that module (not a consumer of it). Proves
    the assertion is real, not that any wiring is real.
  - Where an injected port/prop with a decorative-default risk exists, an injection-seam mutation
    was run for it. Where none exists (a required, non-defaulted dependency parameter, or a file
    testing a dependency module's own internals rather than a consumer), production-path is both
    correct and complete — there is no "ignored the prop" bug shape available to mutate.

## Summary — true hit rate

**11/11 files verified. 9/11 fully clean (PROVEN). 2/11 produced a finding:**

| # | File | Verdict |
|---|---|---|
| 1 | `Playground.unit.test.tsx` | PROVEN |
| 2 | `use-playground.hooks.unit.test.ts` | PROVEN |
| 3 | `use-post-template-source.hooks.unit.test.ts` | PROVEN |
| 4 | `PostTemplateModal.unit.test.tsx` (injection block) | PROVEN |
| 5 | `widget-config-fields-dependencies.unit.test.ts` | PROVEN |
| 6 | `MediaPickerDialog.unit.test.tsx` (injection block) | PROVEN |
| 7 | `use-edit-media-panel.hooks.unit.test.tsx` | PROVEN |
| 8 | `use-media-preview.hooks.unit.test.tsx` | PROVEN |
| 9 | `use-admin-locale.hooks.test.ts` | **MIXED — 1 VACUOUS test found** |
| 10 | `admin-locale-dependencies.hooks.test.ts` | PROVEN |
| 11 | `ThemeExplore.unit.test.tsx` (`.liquid` assertion) | **MIXED — 1 narrow assertion-precision gap found** |

At the individual-mutation level: 22 mutations run (21 in the original pass + 1 supplementary
injection-seam mutation added for file 9 after review), 20 went RED as expected, 2 stayed green
when they should not have. Both findings are detailed in their file's section below, left unfixed,
and flagged for the owner's call (per instructions — this pass does not patch vacuous tests).

Combined with the four prior negative-verification batches referenced in the handoff (13/13, 8/8,
6/6, 9/10 — two vacuous tests found there), the base rate across all batches to date is roughly
**4 vacuous/weak findings out of ~57 files checked**, holding steady at "not zero, worth doing."

## Results

### 1. `apps/admin/src/features/playground/__tests__/Playground.unit.test.tsx`

Two mutations against `Playground.tsx` (the component under test; the "fake" here is the injected
controller object, which is trivial data — the thing worth breaking is whether the component
actually routes through it).

- **Mutation A** — `mode: injection-seam`. Line `usePlaygroundHook()` → `usePlayground()`
  (hardcode the real hook, defeating injection). Test: `"renders purely off an injected fake,
  proving usePlaygroundHook is not hardcoded"`. **RED** (`getByText("0 of 5")` not found — real
  hook's registry rendered instead). Reverted. Full file green (4/4).
- **Mutation B** — `mode: production-path`. `onClick={() => addToSurface(entry)}` →
  `onClick={() => {}}` (breaks the render's own click-to-callback wiring, not the injection point
  itself — `addToSurface` already arrived via the controller either way). Test: `"Add to surface
  and Clear surface call through to the injected controller's actions"`. **RED** (`addToSurface`
  called 0 times). Reverted. Full file green (4/4).

**Verdict: PROVEN.**

### 2. `apps/admin/src/features/playground/__tests__/use-playground.hooks.unit.test.ts`

Tests the real `usePlayground` hook directly (no injected port — this tab is deliberately
client-side-only per its own file header, so there is no decorative-injection risk to target).
Mutation target: the hook's own source, `use-playground.hooks.ts`.

- **Mutation** — `mode: production-path` (no port exists). `addToSurface`'s `updateComponents`
  children array: `[...existingChildren, newId]` → `[newId]` (clobbers earlier entries instead of
  appending). Test: `"addToSurface appends multiple entries under the same root without clobbering
  earlier ones"`. **RED** (`expected [ 'pg-2' ] to have a length of 2 but got 1`). Reverted. Full
  file green (7/7).

**Verdict: PROVEN.**

### 3. `apps/admin/src/features/posts/__tests__/use-post-template-source.hooks.unit.test.ts`

`useTemplateSource(themeId, themeTier, templateFilename, port)` takes `port` as a required,
non-defaulted parameter (only its zero-arg sibling `useWiredTemplateSource` supplies a default) —
so there is no "ignored the prop, fell back to default" bug shape reachable from inside this
function; that specific risk lives in `PostTemplateModal.tsx`'s consumption of it instead (file 4,
below). Both mutations here are therefore production-path.

- **Mutation A** — `mode: production-path`. `use-post-template-source.hooks.ts`:
  `if (themeTier !== "static") return;` → `if (false) return;` (removes the tier guard, so the
  hook always fetches). Test: `"never calls the port for a non-static theme tier"`. **RED**
  (`fetchSpy` called once, `not.toHaveBeenCalled()` failed). Reverted.
- **Mutation B** — `mode: production-path`. `post-template-dependencies.hooks.ts`: removed the
  `if (options.fetchTemplateSourceError) throw ...` branch from `createFakePostTemplatePort` (this
  mutates the fake's own correctness, not a consumer's injection wiring — there is no
  hardcode-vs-injected question being tested in this file). Test: `"resolves to error with the
  rejection's message on a port failure"`. **RED** (state resolved to `{status: "loaded", html:
  ""}` instead of `{status: "error", ...}`). Reverted.

Full file green (6/6) after both reverts.

**Verdict: PROVEN.**

### 4. Injection block in `apps/admin/src/features/posts/__tests__/PostTemplateModal.unit.test.tsx`

Only the `"PostTemplateModal template-source-hook injection"` describe block is in scope (the
other 6 tests in this file predate the sweep and don't test injection).

- **Mutation** — `mode: injection-seam`. `PostTemplateModal.tsx`: `useTemplateSourceHook(...)` →
  `useWiredTemplateSource(...)` (hardcode the real hook, bypassing the injected prop). Test:
  `"renders purely off an injected fake, proving useTemplateSourceHook is not hardcoded"`. **RED**
  (`getByText("fake template source")` not found — real hook's `loading` state rendered instead,
  since global `fetch` was stubbed to a `vi.fn()` that never resolves). Reverted. Full file green
  (7/7).

**Verdict: PROVEN.**

### 5. `apps/admin/src/components/__tests__/widget-config-fields-dependencies.unit.test.ts`

This file tests the dependency-defining module's own two exports directly (`defaultWidgetConfigFieldsPort`,
`createFakeWidgetConfigFieldsPort`) — it is not a consumer with an optional/defaultable injection
point, so both mutations are production-path (testing the module's own internal correctness, not a
consumer's wiring to it).

- **Mutation A** — `mode: production-path`. `defaultWidgetConfigFieldsPort.listMenus` body:
  `() => api.listMenus()` → `() => Promise.resolve({ menus: [] })` (stop delegating to `api`).
  Test: `"listMenus delegates to api.listMenus"`. **RED** (`expected "listMenus" to be called 1
  times, but got 0 times`). Reverted.
- **Mutation B** — `mode: production-path`. `createFakeWidgetConfigFieldsPort`: removed the
  `if (options.listMenusError) throw options.listMenusError;` branch. Test: `"rejects with the
  given errors when set"`. **RED** (`port.listMenus()` resolved to `{menus: []}` instead of
  rejecting). Reverted.

Full file green (5/5) after both reverts.

**Verdict: PROVEN.**

### 6. `apps/admin/src/components/__tests__/MediaPickerDialog.unit.test.tsx`

Only the `"MediaPickerDialog — useDialog injection"` describe block is in scope (the file's own
header calls this "the seam-specific test the split adds"; the other describe blocks predate the
sweep, exercising the real hook against a mocked `api.listMedia`).

- **Mutation** — `mode: injection-seam`. `MediaPickerDialog.tsx`: `useDialog(...)` →
  `useWiredMediaPickerDialog(...)` (hardcode the real hook). Test: `"renders entirely off an
  injected useDialog — api.listMedia and api.mediaOriginalUrl are never called"`. **RED**
  (`getByTitle("Fake asset")` not found — real hook's loading state rendered, since `api.listMedia`
  was left as an un-mocked spy that never resolves). Reverted. Full file green (11/11).

**Verdict: PROVEN.**

### 7. `apps/admin/src/features/media/__tests__/use-edit-media-panel.hooks.unit.test.tsx`

Two mutations against `use-edit-media-panel.hooks.ts`. Note: this file's own comments already
claim a self-documented negative-verification for the first two tests in its top describe block
("Negative verification (per this refactor's own required check)..." at line 82) — per this
session's own standing instruction to verify claims written in code comments rather than trust
them, both the baseline-diff claim and the port-seam claim were independently re-verified below
rather than taken on the comment's word. `useEditMediaPanel(props, { port, locale })` takes `port`
as a required dependency (no default) — the decorative-injection risk that lives elsewhere for
defaultable params doesn't apply to this function's own signature, but mutation B below still
targets the injection seam by testing whether the function's *body* reads off the `port` it was
handed rather than computing independently.

- **Mutation A** — `mode: production-path`. `save()`:
  `diffMediaMetadata({ item: baselineRef.current, draft })` → `diffMediaMetadata({ item, draft })`
  (diff against the live, drifting `item` prop instead of the frozen mount-time baseline —
  reintroducing the exact TM-TOVU-2026-08-12-A silent-revert bug the test's own comment describes;
  no DI dimension, pure hook-state logic). Test: `"does not revert a field changed elsewhere while
  the panel stays open, when only a different field was edited here"`. **RED**
  (`expected '' to be 'Changed by operator B'` — the concurrent operator's write got silently
  reverted, exactly the documented failure mode). Reverted.
- **Mutation B** — `mode: injection-seam`. `originalUrl`: `port.mediaOriginalUrl(item.id)` →
  `` `computed://not-from-port/${item.id}` `` (bypass the injected port entirely — proves
  `originalUrl` is genuinely sourced from `port`, not computed independently by the hook). Test:
  `"originalUrl is exactly the injected port's mediaOriginalUrl, not one this hook computed
  itself"`. **RED** (`expected 'computed://not-from-port/m1' to be 'fake://media-original/m1'`).
  Reverted.

Full file green (4/4) after both reverts.

**Verdict: PROVEN.**

### 8. `apps/admin/src/features/media/__tests__/use-media-preview.hooks.unit.test.tsx`

Two mutations against `use-media-preview.hooks.ts` (same required, non-defaulted `port`
dependency shape as file 7's hook):

- **Mutation A** — `mode: injection-seam`. `src`: `port.mediaOriginalUrl(item.id)` →
  `` `computed://not-from-port/${item.id}` `` (bypass the injected port). Test: `"src is exactly
  the injected port's mediaOriginalUrl, not one this hook computed itself"`. **RED**
  (`expected 'computed://not-from-port/m1' to be 'fake://media-original/m1'`). Reverted.
- **Mutation B** — `mode: production-path`. `handleVideoError`: `setStage("unsupported")` →
  `setStage("video")` (break the fallback-chain's terminal transition — no DI dimension). Test:
  `"advances image -> video -> unsupported on successive probe failures, same as before the port
  injection"`. **RED** (`expected 'video' to be 'unsupported'`). Reverted.

Full file green (3/3) after both reverts.

**Verdict: PROVEN.**

### 9. `apps/admin/src/hooks/__tests__/use-admin-locale.hooks.test.ts`

Five mutations against `use-admin-locale.hooks.ts`. Result: **mixed** — the first genuine vacuous
finding of this batch. `useAdminLocale(port: AdminLocalePort = defaultAdminLocalePort)` is the one
hook in this codebase with a *defaulted* injected parameter (per its own doc comment, an explicit,
temporary exception for ~40 un-migrated bare call sites) — exactly the decorative-injection shape
a DI sweep needs to check, so mutation E below (added after team-lead review flagged this file as
the one place in the batch where an injection-seam mutation was missing) targets it directly.

- **Mutation A (VACUOUS FINDING)** — `mode: production-path`. cleanup: `cancelled = true;
  unsubscribe();` → `cancelled = true;` (dropped the `unsubscribe()` call entirely — the listener
  stays subscribed forever after unmount; this is an effect-cleanup correctness bug, not an
  injection-wiring one — `port` itself was still the one passed in). Test: `"unsubscribes on
  unmount — a refresh after teardown does not touch a torn-down instance"`. **STAYED GREEN.** The
  test's only assertion is `expect(() => port.publishLocaleChange("de")).not.toThrow()`.
  `publishLocaleChange` just iterates listeners synchronously calling each one; the listener
  (`fetchLocale`) kicks off an async `port.loadLanguage().then(...)` that would call `setState` on
  an unmounted component — which produces, at most, an async React `act` warning, never a
  synchronous throw, so `not.toThrow()` passes identically whether or not `unsubscribe()` ran.
  Checked whether the project fails tests on console.error/act warnings
  (`apps/admin/src/__tests__/setup.ts`, `vitest.config.ts`): it does not — no
  `onConsoleLog`/console-error-to-throw wiring exists. The test's own comment claims *"the fake's
  own subscriber-count behaviour... is what proves the listener was actually removed"*, but the
  actual assertion never inspects subscriber count (that behavior IS separately, correctly tested —
  see file 10 below — just not from this test). **This specific test would pass unchanged even if
  `unsubscribe()` were deleted from the hook.** Reverted; confirmed `git diff` against the file is
  empty (exact restore) before continuing.
- **Mutation B** — `mode: production-path`. `port.subscribeToSettingsRefresh(fetchLocale)` →
  `port.subscribeToSettingsRefresh(() => {})` (registers a no-op instead of the real refetch
  callback — a wiring-within-the-hook bug, not a hardcoded-vs-injected-port bug). Test: `"re-fetches
  and updates when the port announces a refresh"`. **RED** (`expected "de", received "en"`).
  Reverted.
- **Mutation C** — `mode: production-path`. `.catch(() => undefined)` → `.catch(() => { if
  (!cancelled) setLocale("broken-on-error"); })` (fetch failure sets a visible wrong value instead
  of swallowing). Test: `"swallows a failed fetch and stays at DEFAULT_LOCALE..."`. **RED**
  (`expected 'broken-on-error' to be 'en'`). Reverted.
- **Mutation D** — `mode: production-path`. Moved the `cancelled` flag from effect-local (`let
  cancelled = false` inside the effect body, fresh per mount) to a module-level variable shared
  across mounts, reproducing the exact pre-fix bug this file's own header describes ("the cancelled
  flag resets on mount, not only on unmount"). Test: `"a fresh mount after unmount still updates on
  refresh"` (StrictMode mount→unmount→mount shape). **RED** (`expected "ja", received "en"` — the
  second mount's update was silently dropped because the module-level flag, set `true` by the first
  mount's cleanup, was never reset). Reverted; confirmed `git diff` empty after restoring the
  original three-line structure (this mutation required more surgery than a single-line swap, so
  it was checked for an exact source match afterward, not just re-running tests).
- **Mutation E (supplementary, added after team-lead review)** — `mode: injection-seam`.
  `port.loadLanguage()` → `defaultAdminLocalePort.loadLanguage()` inside the effect body — the
  hook keeps accepting `port` as a parameter but the fetch call itself silently uses the real
  module-level singleton instead, exactly the "prop is decorative" defect shape a defaulted
  parameter makes possible. Test: `"resolves to the port's locale once the initial fetch settles"`
  (asserts `result.current` becomes `"fr"`, a value only the fake `port` could produce). **RED**
  (`expected "fr", received "en"` — with the mutation in place, the hook keeps calling through to
  the real binding and the fake's seeded locale never surfaces). Reverted; confirmed `git diff`
  empty afterward.

Full file green (7/7) after all reverts. The two tests not independently mutation-targeted
(`"starts at DEFAULT_LOCALE before the fetch resolves"` and the `useWiredAdminLocale`
`typeof`-is-a-function smoke test) are trivial-enough assertions that a targeted mutation isn't
informative — the first is exercised as a side effect of mutations B/C/D/E's own setup, and the
second has no behavior to break short of deleting the export (a compile error, not a runtime
mutation).

**Verdict: MIXED — 4 of 5 mutation-tested assertions PROVEN (including the injection seam itself),
1 genuinely VACUOUS.** Not fixed, per instructions — reported for the owner's call. Candidate fix
(not applied): the "unsubscribes on unmount" test would need to assert against the fake's own
subscriber count/a spy on `unsubscribe` itself rather than `not.toThrow()`, or be deleted as
redundant with file 10's `createFakeAdminLocalePort` unsubscribe test (see immediately below) plus
a rewritten claim.

### 10. `apps/admin/src/hooks/__tests__/admin-locale-dependencies.hooks.test.ts`

This file tests the dependency-defining module's own internals directly (the real binding's
namespace filter, and the fake's own correctness) — not a consumer's wiring to an injected
parameter, so both mutations are production-path, same reasoning as file 5:

- **Mutation A** — `mode: production-path`. `admin-locale-dependencies.hooks.ts`'s
  `refreshApplies`: `scope === null || scope.includes(LANGUAGE_NAMESPACE)` → `scope === null` (drop
  the namespace match, only the "refresh everything" case still applies). Test: `"calls the
  listener when a refresh names core.language"`. **RED** (`expected "vi.fn()" to be called 1
  times, but got 0 times`). Reverted.
- **Mutation B** — `mode: production-path`. `createFakeAdminLocalePort`'s
  `subscribeToSettingsRefresh`: `return () => listeners.delete(listener)` → `return () => {}`
  (fake's own unsubscribe becomes a no-op). Test: `"a subscriber's unsubscribe stops it, without
  affecting other subscribers"`. **RED** (`a` still called once after its own `unsubscribeA()`).
  Reverted. Notably, THIS is the test that actually proves the fake's unsubscribe/subscriber-count
  behavior that file 9's vacuous test claimed (in its comment) to be relying on — the claim is true
  of THIS file, just not of the test that cited it.

Full file green (10/10) after both reverts.

**Verdict: PROVEN.**

### 11. Rewritten `.liquid` assertion in `apps/admin/src/features/themes/__tests__/ThemeExplore.unit.test.tsx`

Test: `"points a selected .liquid TEMPLATE's preview at /theme-explore/{theme}/template/
{templateId}, not the generic notice"`, pinned against `ThemeExplore.tsx`'s `previewSrcFor` — a
pure function with no injected hook/port parameter, so both mutations are production-path.

- **Mutation A** — `mode: production-path`. Disabled the whole `.liquid`-template branch:
  `if (isLiquidTemplateFile(file))` → `if (false && isLiquidTemplateFile(file))` (reproduces the
  exact pre-fix "honest gap" behavior the test's own comment describes — falls through toward the
  generic notice / `null` preview src). **RED** (`getByTitle("Theme preview")` — the iframe never
  renders at all, since `previewSrc` came back `null`). Reverted.
- **Mutation B (NARROW GAP FOUND)** — `mode: production-path`.
  `templateId = file.label.replace(/\.liquid$/i, "")` → `templateId = file.label` (stop stripping
  the `.liquid` extension, so the URL becomes `/theme-explore/novice/template/home.liquid` instead
  of `.../home`). **STAYED GREEN.** The assertion is
  `expect(iframe.src).toContain("/theme-explore/novice/template/home")` — a substring check, and
  `"home.liquid"` still contains `"home"` as a leading substring, so the broken,
  extension-still-attached URL satisfies `toContain` anyway. The test correctly proves the
  `.liquid`-preview branch exists and fires (mutation A), but does NOT tightly pin the exact
  `templateId` value the way the "PROVEN" mutations elsewhere in this batch do — a regression in
  the extension-stripping specifically would slip through undetected. This is narrower than file
  9's finding (the primary claim in the test's own title — "not the generic notice" — IS proven;
  only the precise-URL half is not), so it's reported separately as a gap rather than folded into
  the vacuous count. Reverted; confirmed `git diff` empty (exact restore).

Full file green (46/46) after both reverts.

**Verdict: MIXED — primary claim PROVEN, one narrow assertion-precision gap found (not vacuous,
but weaker than it reads).** Not fixed, per instructions.

## Running tally

11/11 files verified. **2 files produced a finding** (file 9: one genuinely vacuous test; file 11:
one assertion that doesn't pin what it appears to pin, though the file's primary claim IS proven).
9/11 files fully clean.

At the assertion/mutation level: 22 mutations run across the batch, 20 went RED as expected, 2
stayed green when they should not have (both detailed above, both left unfixed for the owner).

Mode breakdown: **6 injection-seam mutations** (files 1A, 4, 6, 7B, 8A, 9E — all RED, all PROVEN
the injection is real, none decorative) and **16 production-path mutations** (2 of which, files 9A
and 11B, are the batch's findings).

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
