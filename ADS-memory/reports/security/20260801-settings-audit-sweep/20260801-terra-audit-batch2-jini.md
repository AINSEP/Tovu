# Terra audit — batch 2, Jini (13 files)

Generated: 2026-07-31 ~21:30 local.
Auditor: **`gpt-5.6-terra`, `model_reasoning_effort=xhigh`** via `codex exec` as an external reviewer
(`--ignore-rules --ignore-user-config --ephemeral`).
Packet: `terra-audit-scope/packet-batch2-jini.md`. Raw: `terra-audit-scope/runs/batch2-jini.jsonl`.

Run health (checked): errors=0, turn.failed=0, turn.completed=1, stderr empty.
Usage: 1,179,654 input (1,063,936 cached), 17,813 output, 14,765 reasoning.

Scope: the `source-config-list` feature (add/edit/test list for user-supplied service configs) plus
`react/components/Icon.tsx`, `LanguageMenu.tsx`, `utils/index.ts`, `utils/notifications.ts`.

> **UNVERIFIED.** Terra's claims, reproduced verbatim. Batch 1's verification pass killed two of six
> HIGH findings. Verify before fixing.

## Coordinator note

Findings 1–3 are the **React half of the same credential-disclosure theme** batch 4 found in the
logic layer, and batch 1 found in `agent-runtime/connection-test.ts`. Read them together: batch 4's
`source-config-list/rules.ts:22` accepts an SSRF target, and this batch's
`SourceConfigTestControl.tsx:35` renders the resulting adapter message unredacted. Same feature,
two layers, one fix boundary to decide.

---

No CRITICAL findings.

**[SEVERITY: HIGH] Connection-test responses can display API keys verbatim**
- **File:** `packages/ui/src/features/source-config-list/react/components/SourceConfigTestControl.tsx:35`
- **What is wrong:** The component renders the arbitrary `SourceTestResult.message` supplied by a host adapter without redaction or a safe-result contract.
- **Failure scenario:** A test endpoint returns HTTP 200 with `{ ok: true, message: "Connected with key sk-live-secret" }` → the API key is rendered in the success status.
- **Fix:** Replace free-form result messages with safe reason/status codes mapped to local copy; do not render adapter response text in this control.

**[SEVERITY: HIGH] Add-source failure messages can expose credentials**
- **File:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts:67`
- **What is wrong:** An arbitrary `addSource` result message is retained in React state and rendered by `SourceConfigAddForm`.
- **Failure scenario:** An adapter returns `{ ok: false, message: "Provider rejected sk-live-secret" }` → the secret persists in `submitError` and is displayed in the form alert.
- **Fix:** Store and render only a fixed, localized failure category; redact or discard transport-provided messages before state assignment.

**[SEVERITY: HIGH] Rejected credential-test requests become unhandled promise rejections**
- **File:** `packages/ui/src/features/source-config-list/react/components/SourceConfigList.tsx:78`
- **What is wrong:** The component discards `list.test()` and `addForm.submit()` promises, while both hooks rethrow adapter failures after `finally`.
- **Failure scenario:** Testing a draft with `apiKey: "sk-live-secret"` rejects with an error that includes the request/body → the discarded promise triggers `unhandledrejection`, which browsers and monitoring tools commonly log with the secret.
- **Fix:** Catch port failures inside both hooks, convert them to safe generic UI state/results, and ensure event handlers never leave rejected promises unobserved.

**[SEVERITY: MEDIUM] Test status is not tied to the configuration that was tested**
- **File:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts:137`
- **What is wrong:** Results are keyed only by source ID (or `__draft__`) and are never invalidated for field edits, updates, removals, or superseded test requests.
- **Failure scenario:** Test key A successfully, edit the card’s API key to B, and save—or edit the unsaved draft after testing—→ the prior green result remains beside the changed configuration. Removing and recreating an item with the same ID can also attach its old result to the new item.
- **Fix:** Associate each test with a field/version snapshot; clear or hide results on edits, successful updates, removal, and draft reset, and ignore completions whose version is no longer current.

**[SEVERITY: MEDIUM] A slow reload can replace newer sources with stale data**
- **File:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts:67`
- **What is wrong:** Concurrent `fetchSources()` calls have no request generation, abort, or unmount guard; every completion writes state.
- **Failure scenario:** Port A’s initial fetch starts, the host switches to port B and B’s fetch completes, then A completes → sources from A overwrite the list being shown for B.
- **Fix:** Track the latest reload generation and mounted state (and abort when supported); only the active request may update state.

**[SEVERITY: MEDIUM] An add started for one port can appear in a later port context**
- **File:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts:60`
- **What is wrong:** An in-flight `addSource` completion is accepted after `port` changes and invokes `onAdded` without checking that its port/session is still current.
- **Failure scenario:** Start adding a source in workspace A, switch the still-mounted list to workspace B, then A’s request resolves → A’s source is appended to B’s list.
- **Fix:** Capture a port/session generation for each submit and ignore completions after a port change or unmount.

**[SEVERITY: MEDIUM] Same-item actions can race and overwrite an acknowledged edit**
- **File:** `packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx:87`
- **What is wrong:** The enabled checkbox and trust selector remain usable during other item actions, while the hook applies whichever `refresh`/`update`/`setTrust` response arrives last.
- **Failure scenario:** Start a slow refresh, toggle Enabled off, and receive the update response; when the earlier refresh returns its old Enabled=true object, it overwrites the user’s saved change.
- **Fix:** Disable every mutation control while any action for that item is pending and use per-item operation/version tokens so stale responses cannot update state.

**[SEVERITY: MEDIUM] Password disclosure survives a successful form reset**
- **File:** `packages/ui/src/features/source-config-list/react/components/SourceConfigField.tsx:33`
- **What is wrong:** `revealed` is local state that remains true when the add form clears its values after a successful submission.
- **Failure scenario:** Reveal API key A, add it successfully, then type API key B into the reset form → B is entered into a `type="text"` field and visibly exposed.
- **Fix:** Reset `revealed` when the password value is cleared/reset, or provide a form-session key that remounts password fields after submission.

**[SEVERITY: LOW] The feature barrel omits types/constants needed for direct hook composition**
- **File:** `packages/ui/src/features/source-config-list/index.ts:1`
- **What is wrong:** It exports controllers and card/view props that use `SourceUpdateInput`, but does not export that type; it also documents draft test state while omitting `DRAFT_TEST_SCOPE`.
- **Failure scenario:** A host importing only `@jini-ai/ui` cannot import `SourceUpdateInput`, and must duplicate `"__draft__"` to read draft test state from `useSourceConfigList`.
- **Fix:** Re-export `SourceUpdateInput` and `DRAFT_TEST_SCOPE` from this barrel.

## Assessed and found clean

- Unsafe rendering: no string-built SVG, dynamic icon loading, `dangerouslySetInnerHTML`, or caller-derived `href`/`src` sink was found.
- Password-kind values are masked in collapsed/detail item displays.
- `LanguageMenu` removes its document listeners on close and unmount.
- Notification constructor handlers and retained notification references are released on close/error.