# Fix admin defects — Programmer(Admin Defects), 2026-09-06

Source: `ADS-memory/reports/2026-09-06-tovu-8f-handoff.md` section C items 2, 3, 4.

## Item 1 — "Make default" also toggles its row — FIXED, commit `00bc4bd6`

Confirmed against current source: `AccessTokensTab.tsx`'s `TokenRowDefaultIndicator` rendered
"Make default" as a `<button>` inside `TokenRow`'s `<summary>` with no `preventDefault`/
`stopPropagation` — claim was accurate.

**RED-then-GREEN evidence (both genuine, verified by reverting the fix and re-running):**
- First attempt asserted on `details.hasAttribute("open")` after a click — proven to be a
  green-tolerates-the-bug test: jsdom does not implement `<details>`/`<summary>`'s native
  toggle-on-click at all (verified directly via a raw jsdom script), so that assertion passes
  identically with or without the fix.
- Second attempt asserted the click never bubbles to a native listener on `<summary>` — also
  wrong, for a different reason: React 17+ delegates events to the app's root container, so
  `e.stopPropagation()` inside the button's `onClick` only runs once the event has already bubbled
  past a plain `summary.addEventListener` sitting between the button and that root. This produced a
  false RED (failed even after the fix was applied).
- Final, correct assertion: `event.defaultPrevented`, captured via a `document`-level capturing
  listener — the exact flag a real browser's `<summary>` activation behavior checks, checked only
  after the full dispatch completes, so it's unaffected by delegation timing or jsdom's toggle gap.
  Verified RED without the fix (`expected false to be true`) and GREEN with it, twice.

Fix copies `deployment/StaticSiteTab.tsx`'s `CredentialVerifyAction` pattern exactly
(`preventDefault()` + `stopPropagation()` in the `onClick`), per the dispatch's own instruction not
to invent a second variant. `aria-label` and the row's own `agentHandle`/`aria-labelledby` pairing
were untouched — only the `onClick` body changed.

Regression sweep (all pass, run individually): `AccessTokensTab.credential-flows.unit.test.tsx`
(62), `AccessTokensTab.unit.test.tsx` (1), `access-tokens-revoke-copy.unit.test.tsx` (1),
`Security.unit.test.tsx` (6). No new `tsc --noEmit` errors (31 pre-existing errors, all in
untouched files — none in `security/`).

## Item 2 — push-to-talk mic stays live if released during the permission prompt — FIXED, commit `4c65e392`

Confirmed against current source: `endHold` only acted on `state.status === "recording"`, and
`push-to-talk-state.hooks.ts`'s transition table had no `requesting-mic:stop` key — claim accurate.

**Design:** added a `"cancelling"` status. `requesting-mic:stop` → `cancelling` (previously
silently dropped). `cancelling:mic-granted` and `cancelling:mic-denied` both settle to `idle` —
never `recording`, never surfacing an error for a prompt nobody is watching. `startHold`'s own
`capture.start().then()` is the only place holding a live reference to the capture, so it's what
actually releases the mic: after computing the transition, if the result is not `"recording"`, it
calls `capture.stopAndTranscribe()` and discards the result. `endHold` now explicitly handles both
live arms (`"recording"` unchanged; `"requesting-mic"` new); every other status (`idle`,
`transcribing`, `error`, `cancelling` itself) stays a no-op, matching pre-fix behavior for those
arms — direct-invocation coverage of "every arm of the state table", not just the named one.

**RED-then-GREEN evidence:**
- Pure state-machine test (`push-to-talk-state.hooks.unit.test.ts`): 3 new cases
  (`requesting-mic:stop`→cancelling, `cancelling:mic-granted`→idle, `cancelling:mic-denied`→idle),
  RED (3 failures) before the transition table changed, GREEN (17/17) after.
- Hook-level test (`use-push-to-talk.hooks.unit.test.ts`): drives `capture.start()` to a
  deliberately-deferred promise, calls `endHold()` while still `"requesting-mic"`, then resolves
  permission and asserts `capture.stopAndTranscribe` was called once, `indicator.isRecording` is
  `false`, and `onTranscript` was never called. Failed against pre-fix production code before the
  fix (initially caught in an earlier draft that hard-coded `if (state.status !== "recording")
  return;`), passed after.

**Test-construction issue found and fixed (not a production bug):** the first version of this test
wrapped the manual promise resolution in `await act(async () => { resolveStart(); await
startPromise; })`. That construction hung the test to exactly Vitest's 5000ms default timeout,
reproducibly, even though debug logging proved the production code ran correctly and completed
(state transitioned `cancelling`→`idle`, `stopAndTranscribe` called once) well within the window —
the hang was after the test body's logic had already finished. Root cause: nesting a manual
`act(async ...)` around a promise resolved from outside React, alongside this file's other
`waitFor`-based tests, appears to conflict with RTL's own internal `act()` flushing in `waitFor`.
Fix: resolve the promise bare (no manual `act()` wrapper) and let `waitFor` alone drive the
aftermath — matching the idiom this file's other deferred-capture tests already use. Confirmed
stable across two consecutive full-file runs (12/12 passing, ~3.3s total) after the change.

Regression sweep (all pass, run individually): `push-to-talk-state.hooks.unit.test.ts` (17),
`use-push-to-talk.hooks.unit.test.ts` (12), `PushToTalkMicButton.unit.test.tsx` (10),
`voice-to-composer.integration.test.tsx` (6). No new `tsc --noEmit` errors.

## Item 3 — eleven hand-rolled stale-settlement guards — NOT STARTED

Not reached this session. Items 1 and 2 are committed independently and are a complete, safe
stopping point per the dispatch's own instruction ("commit items 1-2 and stop... that is a good
outcome, not a failure"). Enumerating and diffing the eleven `*GenerationRef` guards across ten
hook files, plus any extraction, is left for a fresh session/context.

## Machine notes

System load bounced between ~10 and ~250 throughout this session from other concurrent agents
(unrelated to this task); every test run here was preceded by an `uptime` check and run as a single
scoped file, one at a time, per the dispatch's machine-safety constraints. No directory-wide or
glob test runs were made. `git add -A` and bare `stash`/`pop` were never used; both commits staged
exact paths only. `apps/admin/src/features/deployment/StaticSiteTab.tsx` was temporarily edited
during investigation (to confirm jsdom's lack of native `<details>` behavior) and restored via
`git checkout --` before any commit — it was clean at session start and is clean now, not part of
either commit.

## Verified nothing else was touched

Off-limits paths (`MenuEditor.tsx`/`.hooks.tsx`, `features/settings/**`, the four
button-inside-`<a>` sites, everything outside `apps/admin/src`) were not read or edited.
