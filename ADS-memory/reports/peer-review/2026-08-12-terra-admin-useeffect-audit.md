# Peer audit — useEffect render-loops and effect correctness, apps/admin

- **Peer:** `gpt-5.6-terra`, `model_reasoning_effort=high`, codex-cli 0.147.0
- **Date:** 2026-08-12
- **Framing:** adversarial bug hunt, read-only, against a detached worktree snapshot at `e3d41aa`
- **Scope:** 79 `useEffect` calls across 61 hook files in `apps/admin/src`
- **Cost:** 2,232,414 input / 11,541 output tokens, 23 tool calls
- **Commissioned because:** the owner did not trust that Sonnet-5 sweeps (useWiredX DI, i18n
  bound-`t`, UI-state-into-hooks) had avoided introducing infinite render loops.

## Headline

**No render loop found.** The hypothesised mechanism was real but inert: wired wrappers *do* create
fresh `t` closures and deps objects every render, but **no effect declares one as a dependency**, and
production ports are module singletons. The sweeps did not introduce this bug class.

**A different confirmed bug class was found instead: 8 hooks with stale-response races** — async
effects keyed on a route param or id that commit their result with no cancellation guard.

## Verification status

Two of the eight were independently spot-verified against source by the Coordinator before dispatch
(`use-form-submissions.hooks.ts`, `use-collection-entry-editor.hooks.ts`) — both confirmed. The
remaining six share the identical pattern and were accepted on that basis, not individually re-read.

## Routing

- 5 (collections, forms x3, integrations) -> `FetchQuery` agent; the `lib/fetch-query` migration
  should fix them by construction, since a keyed query cannot commit a response from a prior key.
  Instructed to verify rather than assume.
- 3 (widgets x2, menus) -> `HookSweep` agent; not being migrated, so they need explicit
  `cancelled`-flag guards on every `then`/`catch`/`finally`.

---

I’ll trace effect dependencies through their hook call sites, concentrating first on injected dependency objects and the bound translator—the places most likely to turn state-setting effects into render storms.

The translator closures are indeed recreated by several wired wrappers, but no effect currently declares one as a dependency. I’m continuing through the effects that do state writes and their production call paths, rather than treating those closures alone as defects.

No confirmed render loop or translator-driven fetch storm. The wired wrappers create fresh `t` closures and deps objects, but no effect depends on those identities; production ports are module singletons.

- [use-collection-entry-editor.hooks.ts:96](apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:96)  
  **Severity:** CONFIRMED-BUG  
  The effect runs twice on first mount because `editor === null` changes when TipTap initializes. Neither request is cancelled. If the older request resolves after the newer one—especially after the operator begins editing—it resets title, slug, fields, and editor content to the stale response. It also races when the entry route changes.  
  **Operator sees:** Typed entry content or fields snap back to an earlier entry/load.  
  **Minimal fix:** Add an `active`/generation guard and return cleanup; guard every `then`, `catch`, and `finally` state/editor write.

- [use-form-editor.hooks.ts:117](apps/admin/src/features/forms/hooks/use-form-editor.hooks.ts:117), [use-menu-editor.hooks.ts:165](apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:165), [use-widget-instance-editor.hooks.ts:99](apps/admin/src/features/widgets/hooks/use-widget-instance-editor.hooks.ts:99)  
  **Severity:** CONFIRMED-BUG  
  These route-param loaders write state after their id changes with no cancellation/current-request guard. The panel router reuses the same editor component type for `/new` and `/:id`, and for one `:id` to another. A slower old response can therefore overwrite the newer editor; the form loader can even populate a newly opened “new form” screen with the previously requested form.  
  **Operator sees:** The wrong menu/widget/form appears after quick navigation, potentially followed by saving edits to the wrong record.  
  **Minimal fix:** Use an effect-local `cancelled` flag (or sequence ref) and ignore stale resolves/rejections/finally writes.

- [use-form-submissions.hooks.ts:56](apps/admin/src/features/forms/hooks/use-form-submissions.hooks.ts:56), [use-form-submission-detail.hooks.ts:48](apps/admin/src/features/forms/hooks/use-form-submission-detail.hooks.ts:48)  
  **Severity:** CONFIRMED-BUG  
  Both effects key their request on form/submission ids but allow an earlier response to settle after those props change. The submissions list can be replaced by the old form’s rows; the detail view can show the previous submission while its props identify the new one.  
  **Operator sees:** Wrong submission list/detail, with delete acting against the newly selected id while showing stale data.  
  **Minimal fix:** Add cancellation/generation guards; reset detail state when its ids change.

- [use-widget-region-editor.hooks.ts:83](apps/admin/src/features/widgets/hooks/use-widget-region-editor.hooks.ts:83), [use-integration-deliveries.hooks.ts:46](apps/admin/src/features/integrations/hooks/use-integration-deliveries.hooks.ts:46)  
  **Severity:** CONFIRMED-BUG  
  Same stale-response race on dynamic route parameters. Each effect clears/loading-starts for the new id, but an old request can later commit its region placements or delivery log.  
  **Operator sees:** A different region’s placements or subscription’s deliveries displayed under the current URL.  
  **Minimal fix:** Cancel or sequence-gate each request and guard all completion setters.

## Where I looked and found nothing

- `useAdminLocale`: fetches once per mount and on explicit refresh-bus events; no render-driven re-fetch path.
- All bound-translator wired wrappers inspected (`useWiredMedia`, forms, pages, collections, widgets, themes, integrations, analytics, taxonomy): fresh `t` identity is not used in an effect dependency.
- `useSettingsSlice`, `useAssistantChats`, `useAdminExecutionCredential`, `usePageEditor`, `useThemeExplore`, visitor credential discovery, `AssistantDock`, `ChatFab`, `Select`, and `SeeMore`: no confirmed update loop; observer/listener/timer cleanups were present in the relevant effects.
- Locale-sync hooks: equality guard prevents `setLocale` from repeatedly writing after convergence.

## What I could not determine

- The implementation identity guarantees of external `@jini-ai/ui`’s `useI18n().setLocale` are not in this snapshot. It does not create a loop here unless the provider itself fails to converge its exposed locale.
