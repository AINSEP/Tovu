# Independent Security/Correctness Audit — Batch 2 (Jini source-config-list)

- **Auditor:** Claude Sonnet 5 (independent second opinion)
- **Date:** 2026-07-31
- **Packet:** `/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/handoff/terra-audit-scope/packet-batch2-jini.md`
- **Repo / branch:** `/Users/la/Programming/Jini` @ `feat/settings-execution-canary`

> **UNVERIFIED — independent second opinion.**

This audit was performed without reading any prior (e.g. gpt-5.6-terra) report on this same scope, per dispatch instructions. Findings below are formed independently from the code.

---

## Findings (most severe first)

### [SEVERITY: MEDIUM] Editing a source's URL/key does not invalidate its last test result

- **File:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts:145-157` (`update`), consumed by `packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx:187-194`
- **What is wrong:** `update()` patches `sources` via `port.updateSource` but never touches `testResults`. `SourceConfigItemCard` renders `testResults[source.id]` unconditionally whenever it exists, with no check for whether the source's fields have changed since that result was produced.
- **Failure scenario:** User adds a source, clicks "Test" → gets `{ ok: true, message: 'Connection ok.' }`, rendered green. User expands the card, clicks Edit, changes the URL/key to a different (possibly broken) value, clicks Save (`saveEditing` → `onUpdate({ label, fields })` → `list.update(id, patch)`). The card re-renders still showing the stale green "Connection ok." for fields that were never tested — the exact "stale green connection OK on a config whose URL or key has since changed" scenario. A user relying on this status has no way to know the currently-saved config is unverified.
- **Fix:** In `update()`, clear (or mark stale) `testResults[id]` whenever `patch.fields` is present, e.g. `setTestResults((current) => { const { [id]: _drop, ...rest } = current; return rest; })` before/after the port call.

### [SEVERITY: MEDIUM] Add-form draft test result survives field edits and a full form reset

- **File:** `packages/ui/src/features/source-config-list/react/components/SourceConfigList.tsx:76-79`, `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts:130-143` (`test`), `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts:60-68` (`submit`)
- **What is wrong:** All draft tests share one fixed key, `DRAFT_TEST_SCOPE`, regardless of what's currently in the form. `SourceConfigList` passes `testResult: list.testResults[DRAFT_TEST_SCOPE]` into the add form whenever it exists — there is no invalidation on `setField`/`setTrust`, and a successful `submit()` resets `values`/`trust` in `useSourceConfigAddForm` but never clears `list.testResults[DRAFT_TEST_SCOPE]` (a different hook's state, uncoordinated).
- **Failure scenario:** User fills the draft with URL A, clicks "Test" → green "Connection ok." shown for `DRAFT_TEST_SCOPE`. User clicks "Add source" → succeeds, form resets to empty. User starts a second, unrelated source (URL B) without touching "Test" yet — the add form still shows the leftover green "Connection ok." from A's test underneath B's untested fields, because nothing ever cleared `testResults[DRAFT_TEST_SCOPE]`. This is strictly worse than the per-item case above since it isn't even scoped to one item's id.
- **Fix:** Clear `testResults[DRAFT_TEST_SCOPE]` (and any pending flag under that key) on every `setField`/`setTrust` call, and explicitly on successful `submit()` before/alongside the values reset — most simply, have `useSourceConfigAddForm` accept a `clearDraftTestResult` callback from the orchestrator and invoke it in both places.

### [SEVERITY: MEDIUM] Every mutating port call except `reload` swallows rejections into an unhandled promise with zero user feedback

- **File:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts` — `remove` (89-100), `refresh` (102-114), `setTrust` (116-128), `test` (130-143), `update` (145-157); `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts` — `submit` (54-72)
- **What is wrong:** Each of these wraps its `await port.X(...)` in `try { ... } finally { clearPending }` with **no `catch`**. Contrast with `reload` (`useSourceConfigList.ts:63-74`), which correctly does `try/catch/finally` and surfaces `LOAD_FAILED_MESSAGE` via `error`. If any port method rejects instead of resolving to an `{ok:false}`-style value, the pending flag is correctly cleared (so the UI doesn't hang on "Removing…"/"Testing…" forever), but the promise returned by e.g. `remove(id)` rejects with nothing downstream ever awaiting or `.catch`-ing it (call sites are all `onRemove={() => void list.remove(id)}` style — `void` discards, it does not attach a handler).
- **Failure scenario:** A host's `port.testSource` throws (e.g. `fetch` rejects on a network error instead of being caught and turned into `{ ok: false, message }`). User clicks "Test": the button flips to "Testing…", then silently flips back to "Test" with **no error, no status line, nothing** — `setTestResults` is never reached because the rejection skips it — while the browser/error-tracking pipeline logs an unhandled promise rejection. The user has no way to tell the test failed vs. was never run. Same pattern for Remove/Refresh/Set-trust/Update/Add.
- **Fix:** Add a `catch` in each method that sets an appropriate error surface (a new `actionErrors` map keyed like `pendingKeys`, or reuse `submitError`/`error`) before/alongside the `finally`, mirroring what `reload` already does correctly.

### [SEVERITY: MEDIUM] Out-of-order resolution lets a stale `refresh`/`update`/`setTrust` response clobber a newer one for the same item

- **File:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts:102-128,145-157`, `packages/ui-core/src/features/source-config-list/rules.ts:126-132` (`updateSourceById`)
- **What is wrong:** None of `refresh`, `setTrust`, `update` track a request generation/sequence per item or use an abort signal. Each does `setSources((current) => updateSourceById(current, id, resultFromPort))` unconditionally once its own promise resolves, regardless of whether a newer call for the same `id` has since completed.
- **Failure scenario:** User clicks "Refresh" on an item (host's `refreshSource` is slow, 3s). Before it resolves, user expands the same card, edits the URL, clicks Save — `update(id, {fields})` resolves quickly (200ms) and the UI now correctly shows the new URL. At t=3s the slow `refresh` from step 1 resolves with the **pre-edit** snapshot it fetched at t=0 and overwrites the whole item via `updateSourceById`'s full-object spread, silently reverting the visible URL/fields back to the stale pre-edit value with no indication anything changed underneath the user.
- **Fix:** Track a per-id request counter (or `AbortController`) and ignore/drop a resolution if a newer request for the same id has started since, e.g. bump a `requestSeq[id]` on every call and check it's still current before calling `setSources` in the `.then`.

### [SEVERITY: LOW] Raw secret value persists in `SourceConfigItemCard` local state after Cancel or Save

- **File:** `packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx:61,73-77` (`editFields`, `cancelEditing`, `saveEditing`)
- **What is wrong:** `startEditing()` copies the item's real (unmasked) `source.fields` — including any `password`-kind field's actual secret value — into local state `editFields`. Neither `cancelEditing()` nor `saveEditing()` clears `editFields` afterward; it's only overwritten the next time `startEditing()` runs.
- **Failure scenario:** User expands a card, clicks Edit (secret copied into `editFields`), clicks Cancel. `editing` flips to `false` so the field is no longer rendered, but the component instance is still mounted (card still expanded) and `editFields` in its React fiber state still holds the plaintext secret indefinitely — inspectable via React DevTools by anyone with local access to the page, even though nothing on screen shows it anymore.
- **Fix:** Reset `editFields`/`editLabel` to empty (or drop them) in both `cancelEditing` and `saveEditing`, not just flip `editing`.

### [SEVERITY: MEDIUM] No redaction safety-net in the one shared path that renders host-supplied test-result text tied to secret fields

- **File:** `packages/ui/src/features/source-config-list/react/components/SourceConfigTestControl.tsx:30-37`
- **What is wrong:** `SourceConfigTestControl` is the single code path in this whole feature that renders `SourceTestResult.message` — free-form text supplied entirely by the host's `testSource` port implementation — directly into `role="status"`/`role="alert"` DOM content with zero scrubbing. `testSource(id, draft)` is documented (`ports.ts:47-58`) to receive the raw, unmasked draft field values, including any `password`-kind field, specifically so a host can perform a live connection test with them. The packet notes a sibling audit already found a real instance of a non-error 2xx path returning an unredacted key in this codebase's test-control family.
- **Failure scenario:** A host's `testSource` implementation builds a diagnostic message that echoes request details on failure (a very common pattern — e.g. `Failed to connect to ${url}` where a webhook-style URL embeds its auth token in the path/query, or an error body that echoes back the submitted key for "confirmation"). Because this component performs no redaction and has no contract requiring the host to redact before returning `message`, that raw secret renders verbatim and visibly in the live DOM the moment the result arrives, with no defense-in-depth layer to catch a host's mistake — and the codebase already has one confirmed precedent for exactly this class of mistake.
- **Fix:** At minimum, this shared component (or a shared helper in `ui-core`'s `rules.ts`) should strip/redact any substring of `message` that matches a currently-entered `password`-kind field value before rendering, so a single host-side oversight doesn't become an immediate on-screen leak.

### [SEVERITY: LOW] `SourceUpdateInput` is part of this barrel's public API surface but isn't re-exported by it

- **File:** `packages/ui/src/features/source-config-list/index.ts:1-33`
- **What is wrong:** The type-export block hand-lists `AddSourceInput`, `AddSourceResult`, `SourceActionKind`, `SourceConfigItem`, `SourceConnectionStatus`, `SourceDraftIssue`, `SourceDraftValidation`, `SourceFieldKind`, `SourceFieldOption`, `SourceFieldSpec`, `SourceFieldValues`, `SourceTestResult`, `SourceTrustOption` from `@jini-ai/ui-core` — but omits `SourceUpdateInput`, even though this same file exports `SourceConfigItemCardProps` (`onUpdate: (patch: SourceUpdateInput) => void`), `SourceConfigListViewProps` (`onUpdate: (id: string, patch: SourceUpdateInput) => void`), and `SourceConfigListController` (`update: (id, patch: SourceUpdateInput) => Promise<void>`), all of which reference it. (It IS reachable via `@jini-ai/ui-core` directly, since that package's barrel does `export *` from this feature's own `ui-core` index — so this is an inconsistency in `@jini-ai/ui`'s curated re-export, not a total dead end.)
- **Failure scenario:** A consumer of `@jini-ai/ui` who wants to name the patch type for `onUpdate` (e.g. to type a handler variable, `const onUpdate: (patch: SourceUpdateInput) => void = ...`) without adding a separate dependency on `@jini-ai/ui-core` cannot import it from this feature's barrel — every sibling type used by the same props is importable from here except this one.
- **Fix:** Add `SourceUpdateInput` to the type export list at the top of `index.ts`.

---

## Assessed and found clean

- **Priority 4 — Unsafe rendering (`Icon.tsx`, `LanguageMenu.tsx`, list components):** No `dangerouslySetInnerHTML`, no inline SVG built from strings, no `href`/`src` derived from caller content anywhere in these files. `Icon`'s `name` prop is a closed compile-time union consumed by a `switch` that falls through to `return null` for anything unmatched — there is no dynamic DOM API call or dynamic import keyed by an icon name. Verified clean.
- **Priority 5 — `utils/notifications.ts` and `utils/index.ts`:** No mutation of caller-owned objects (`notificationOptionsFor` always builds a fresh object). The single shared `AudioContext` is an intentional long-lived singleton, not unbounded growth. `activeNotifications` (a `Set<Notification>`) is added-to only in `showViaConstructor` and reliably removed via `onclose`/`onerror`/`onclick`→`close()`→`onclose`, which is a correctly-paired lifecycle for the direct-`Notification` path (the service-worker path never touches this Set at all, so there's no double-tracking). The silent-failure behavior in `playSound`/`requestNotificationPermission`/`showViaServiceWorker` is explicitly documented as intentional (never throw into UI code for a non-critical audio/notification cue) and is the correct UX call, not a swallowed-error defect. `utils/index.ts`'s deliberate omission of `file-transfer.js` re-exports is documented and correct (avoids an ambiguous double `export *`). Verified clean.

Areas with findings above (Priority 1 credential handling, Priority 2 async/React correctness, Priority 3 test-result attribution, Priority 6 public API surface) were all read and reasoned through in full — see findings for specifics; the parts of each area not called out above (e.g. masking via `maskFieldValue`/`sourceDisplayLabel` being correctly applied in every summary/aria-label render path, `reload`'s correct error handling, the deliberate non-export of `file-transfer.js` symbols) were checked and are sound.
