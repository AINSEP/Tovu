# Autosave API-key wipe — root cause and fix

Agent: Programmer(Execution). Repo `/Users/la/Programming/Tovu`, branch `refactor/jini-admin-extraction`.

Dispatched to fix: typing an API key into the admin BYOK settings, pausing ~600ms, and the key
silently vanishing before "Save key" can be pressed — reported by `byok-key-handling`
(`ADS-memory/reports/analysis/2026-08-05-byok-key-handling-root-cause.md`, probes A–D at the bottom).

## Status: FIXED and verified. Root cause independently confirmed and refined (the brief's mechanism
was correct in effect, wrong in the specific code path).

## Root cause — precisely, with the code path

The brief's hypothesis was "the ledger autosave's round trip replaces the settings slice with the
server's stored value." Verified by reading the actual code (not taking the hypothesis as given, per
dispatch instruction) — **the mechanism is real, but it is not `runSave`'s own return path**:

1. `apps/admin/src/hooks/use-settings-slice.hooks.ts`'s `runSave()` **never calls `setValue`** — a
   debounced save's own promise resolving cannot, by itself, overwrite the form. This is what an
   earlier static read (by a scout subagent I dispatched) concluded, and on that alone it looked like
   the bug didn't exist. That conclusion was incomplete, not wrong about what it checked.

2. The actual overwrite path is `refresh()` in the same file, wired to
   `subscribeToSettingsRefresh` (`apps/admin/src/lib/settings-refresh-bus.ts`), which is in turn fed
   by `apps/admin/src/lib/settings-events.ts`'s `EventSource` subscription to the server's
   `GET /api/admin/v1/workspaces/:workspaceId/settings/events` SSE feed
   (`src/server/routes/admin/settings/events.ts`).

3. That SSE endpoint **polls the shared revision ledger every 1s and broadcasts `settings-changed` to
   every open connection for the workspace — including the tab that made the write.** There is no
   self-exclusion in `events.ts` or in `settings-events.ts`'s client.

4. Sequence that reproduces the bug: operator types a key, then edits a ledger field (baseUrl/model)
   within the same 600ms debounce window. The settled debounce calls `saveExecutionConfig`, which
   persists the ledger field and — by design, per its own doc comment — never touches `apiKey`. Once
   that save resolves, `refresh()`'s guards (`timer.current`, `hasUnsavedEdits.current`) are both
   false: the edit genuinely was fully saved, just not the key half of it. ~1s later the SSE echo of
   that same write arrives at this same tab, `refresh()`'s guards pass, `loadExecutionConfig()` is
   called (always returns `byok.apiKey: ""` — write-only server store, ADR-058), and `refresh()`
   replaces `value` outright with the reload — wiping the typed key.

This matches the probe sequence in the byok-key-handling report exactly (key typed, then model typed,
then wiped ~600ms–1s later) and explains why a scout's `runSave`-only static read missed it: the wipe
happens on a *different* code path than the save itself, roughly 1 second later, triggered by the
server echoing the writer's own write back to it.

## Fix

Preserves both ADR-058 invariants (verified against `ADS-memory/reports/architecture/ADR-058-site-
assistant-credential-store.md`): the key still never round-trips from the server, and no automatic
path persists it — this fix only changes what a *reload* does with a field it structurally never
manages, not what gets written.

1. **`apps/admin/src/hooks/use-settings-slice.hooks.ts`** (generic mechanism): added an optional
   `reconcileRefresh?: (current: T, loaded: T) => T` to `SettingsSliceOptions<T>`. `refresh()` now
   calls it (when supplied) to merge the just-loaded server value against the operator's current
   in-memory value before it replaces `value`/`latest`; `persisted` still takes the raw `loaded` value
   unconditionally, since that ref is the diff base `save()` uses and should reflect true server state
   for every consumer, reconciled or not. Default behavior (option omitted) is unchanged — every other
   `useSettingsSlice` consumer in the app is unaffected.

2. **`apps/admin/src/lib/execution-settings.ts`**: added `reconcileExecutionConfigRefresh(current,
   loaded)`, which copies every field from `loaded` except `byok.apiKey`, which it takes from
   `current`. Correct specifically because `saveExecutionConfig` never persists `apiKey` in the first
   place — a reload can never be "more current" about a field it never wrote or read, so the reload's
   always-empty value carries no real information.

3. Wired `reconcileRefresh: reconcileExecutionConfigRefresh` into both `useSettingsSlice<ExecutionConfig>`
   mount sites — `apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts` (Settings →
   Execution tab) and `apps/admin/src/features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts`
   (`AdminExecutionMode`, the AI Assistant tab's own mount over the same ledger namespace) — both
   needed it; missing either would leave the bug live on that screen.

## Tests (fail against pre-fix code, pass after)

- `apps/admin/src/hooks/__tests__/use-settings-slice.hooks.test.ts` — new `describe("refresh — external
  notification re-reads the persisted value")`: pins the default (no-reconciler) replace-outright
  behavior, the existing unsaved-edit refusal guard, the existing stale-commit guard (reconciler must
  not even be consulted for a discarded stale reload), and — the core regression pair — the exact
  bug reproduced generically (a field `save`/`load` never touch gets wiped by a same-shape reload
  without `reconcileRefresh`, and survives with it), using the identical "type two fields inside one
  debounce window, then let an external refresh land" sequence measured in production.
- `apps/admin/src/lib/__tests__/execution-settings.test.ts` — new `describe("reconcileExecutionConfigRefresh
  — the 2026-08-05 autosave key-wipe fix")`: direct unit coverage of the merge function (preserves typed
  key, takes every other field from the reload, no-ops when nothing is typed).

Ran scoped (never the full suite): both files, plus `SettingsUi.unit.test.tsx`,
`use-admin-execution-credential.hooks.test.ts`, `AdminByokKeyPanel.unit.test.tsx` —
**87 + 36 = 123 passed, 0 failed** in the files this change touches or depends on.
`npx tsc --noEmit` at repo root: **0 errors** (unchanged).

One unrelated pre-existing failure exists in `AiAssistant.unit.test.tsx` ("the not-yet-built roadmap
accordion", 4 tests) — confirmed via `git stash`/re-run that it fails identically with my changes
reverted, so it predates this dispatch and is out of scope.

## Commit-scope note — flagging, not deciding unilaterally

`apps/admin/src/lib/execution-settings.ts` and its test file already carried a large (~300-line),
apparently complete and tested, uncommitted rewrite before I started (the ADR-058 write-only
admin-execution-credential-store implementation, `admin-byok-keystore-design.md`). My own delta in
each is small (the reconciler function/doc, ~30 and ~40 lines respectively) but is not separable from
that surrounding rewrite by a clean patch — my second edit's anchor text is itself part of the
pre-existing uncommitted prose, not HEAD's. Same situation, smaller scale, for the two brand-new
untracked hook files (`use-settings-ui.hooks.ts`, `use-admin-execution-mode.hooks.ts`) — part of an
apparently-finished "admin-hooks-extraction" refactor I didn't do.

Given the explicit "commit only your own files" constraint, I committed only the two files that are
cleanly, entirely mine (`use-settings-slice.hooks.ts` + its test) — the generic mechanism, verified
working and tested in isolation. I did **not** commit `execution-settings.ts`, its test file, or the
two hook files, since doing so would sweep a large amount of other work (already verified coherent —
tsc clean, tests green — but not mine to attribute) into my commit. Nothing is lost either way; the
fix is live in the working tree regardless of commit boundaries. Flagged to the team lead for a call
on whether to commit that substrate separately or fold it in.
