# BYOK triage — Next Steps #2, #3, #5 (2026-08-05, QA/E2E dispatch)

Written incrementally. Isolation used on every run: `BYOK_E2E_PORT_BASE=7621` (exclusive to
this dispatch) **and** `--output=test-results/qa-taskA-*` / `qa-taskB-*` / `qa-taskC-*` (never
the shared `test-results/`).

## Task A (Next Steps #2) — provider-switch leak, test 4 — ACQUITTED as a real regression

**Verdict: NOT a real product regression.** The premise in the handoff ("consistency across
varying conditions is strong evidence of a real regression") does not survive contact with the
actual error text. Flagging this pushback with evidence below, per the dispatch's invitation to
correct a wrong premise rather than execute the brief mechanically.

### What was measured

Ran `byok-credential-persistence.spec.ts` test 4 alone (`--grep "HELD"`), isolated:
`BYOK_E2E_PORT_BASE=7621`, `--output=test-results/qa-taskA-1`. Confirmed via `lsof` before and
after: ports free before, webServer bound to `[::1]:7621`/`[::1]:7622` during the run (IPv6-only,
matching the documented trap), fully freed after. One test, one failure, real error text read
directly from the output (nothing wiped — no concurrent run touched this `--output` dir):

```
1) ... HELD: switching to a never-configured provider clears the API key field and never sends
   the OLD provider's key in the NEW provider's request

Test timeout of 90000ms exceeded.
Error: locator.fill: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('input[list="jini-byok-model-options"]')

  > 211 | await page.locator('input[list="jini-byok-model-options"]').fill("claude-sonnet-4-5");
```

The failure is at line 211 — the **first fill of the Model field**, immediately after the API-key
fill, *before* the test ever reaches the provider-switch step (line 216 onward) that the test
name and the "leak" framing are about. The page snapshot captured at timeout shows the Model
field is not a plain input at all:

```
'combobox "Model: Custom…" [ref=e321] [cursor=pointer]':
  - generic [ref=e322]: Custom…
textbox [ref=e325]
```

### Root cause (confirmed by reading source, not inferred from the snapshot alone)

`/Users/la/Programming/Jini/packages/ui/src/features/execution/react/components/ByokProviderForm.tsx:255-302`.
The Model field now branches on `showModelPicker` (true once `modelDiscovery.status === 'ok'`):

```tsx
{showModelPicker ? (
  <SearchableModelSelect ... testId="jini-byok-model-select" ... />
) : null}
{!showModelPicker || customModelActive ? (
  <input ... list={!showModelPicker && suggestions.length > 0 ? modelListId : undefined} ... />
) : null}
{!showModelPicker && suggestions.length > 0 ? (
  <datalist id={modelListId}>...</datalist>
) : null}
```

When `showModelPicker` is true and `customModelActive` is false (the state right after a
successful model-discovery response), **the plain `<input>` does not render at all** — only the
`SearchableModelSelect` combobox does. `input[list="jini-byok-model-options"]` then matches
nothing, forever, until something flips `customModelActive`. Playwright's `.fill()` keeps
auto-retrying against a locator that never appears, until its own 90s timeout fires — which it
did, cleanly, exactly as designed.

Test 4's own setup guarantees this path every single run: `page.route("**/assistant/execution/models", ... { ok: true, models: ["stub-model"] })` at line 201 is precisely a successful discovery
response, so `modelDiscovery.status` reaches `'ok'` and `showModelPicker` flips to `true`
deterministically — independent of any "contamination state." **That is the real explanation for
why this failed identically three times under different conditions**: not a flaky/timing-sensitive
product regression, but a deterministic selector/DOM mismatch that fires every time this stub is
in place.

**This is uncommitted, in-progress work in a sibling repo, not part of this session:**
```
$ cd /Users/la/Programming/Jini && git status --porcelain -- packages/ui/src/features/execution/react/components/ByokProviderForm.tsx
 M packages/ui/src/features/execution/react/components/ByokProviderForm.tsx   (+137/-9, uncommitted)
$ git log -1 -- <same file>
4082999e 2026-08-01 ... refactor: fold @jini-ai/ui-core into @jini-ai/ui, add @jini-ai/admin
```
The last *committed* version of the file predates this combobox design entirely; the change is
sitting in Jini's working tree, untouched by anything in this dispatch or the prior session
(neither mentions a `SearchableModelSelect`/`CUSTOM_MODEL_SENTINEL` change anywhere). Tovu
consumes `@jini-ai/ui` via a symlink to `dist`, and `dist` is current (built Aug 5 07:48,
post-dates the source edit) — ruled out as a stale-build artifact; it's a live reflection of
someone's in-progress work.

### Disposition — deliberately NOT patched

Per the "moving target" lesson already burned once this week (Task C's "a moving `src/index.ts`"
contamination), I did not edit the Tovu-side selector to chase an uncommitted, still-changing
upstream component. A fix written against WIP markup can go stale again the moment that WIP
changes further, lands, or gets reverted — and this is cross-repo, someone else's active work,
not this dispatch's to alter or coordinate silently.

**What test 4 (and by extension test 3, which uses the identical selector — see Task B) actually
needs, once the Jini refactor lands and stabilizes:** either target the new combobox's
`data-testid="jini-byok-model-select"` and drive its "Custom…" option before filling the sibling
free-text `<input>`, or (if the intent is genuinely "type an arbitrary model id"), select "Custom…"
first. Do not restore this recommendation to "use `input[list=...]`" — that element is
conditionally absent by design now.

**Answering the assigned question directly: ACQUIT.** Test 4 is not evidence of a real product
regression in Tovu. It is evidence of test/dependency drift against an uncommitted, unrelated
UI refactor in `@jini-ai/ui`. Recommend flagging to whoever owns that Jini work (visible,
in-progress, not hidden) rather than silently working around it from the Tovu side.

## Task B (Next Steps #3) — the fourth hang — DOES NOT REPRODUCE; settled by Task A's root cause

**Verdict: the previously reported 16-18 minute stall / "Playwright's own timeout did not fire"
does not reproduce on the current tree.** Test 3 ("SECURITY PIN...") now fails cleanly and
quickly, at exactly the configured per-test timeout, via the **identical** stale-locator cause
found in Task A. The assigned experiment (`--trace on --timeout=20000` with live `ps` during the
stall, watching for `detectLocalAgents` subprocess accumulation) was run as designed; the
subprocess-accumulation hypothesis found **no supporting evidence** and the phenomenon under test
(a stall past the timeout) never occurred to observe.

### What was measured — two isolated runs, `BYOK_E2E_PORT_BASE=7621`, dedicated `--output` each

**Run 1** (`--grep "SECURITY PIN" --timeout=20000 --trace on`, `--output=test-results/qa-taskB-1`):
failed at **exactly 60.0s** (`test.slow()` × 20000ms), at the same locator as Task A:
```
Test timeout of 60000ms exceeded.
Error: locator.fill: Test timeout of 60000ms exceeded.
  - waiting for locator('input[list="jini-byok-model-options"]')
> 175 | await tabB.locator('input[list="jini-byok-model-options"]').fill("claude-sonnet-4-5");
```
Live monitoring throughout (`ps` on the webServer API pid's direct children, sampled every 15s,
plus `lsof -p <api_pid>` FD counts) showed **no CLI-probe subprocess spike at any point** — only
the one expected `agent-daemon-server.ts` child. FD count stayed in the 40s range, then dropped to
0 the moment the process exited. Zero evidence of the hypothesized 24-subprocess (or 48, two-tab)
`detectLocalAgents` sweep accumulating.

**Run 2, confirmatory** (default timeout, i.e. the exact configuration the original 16-18 minute
report used — `--output=test-results/qa-taskB-2`, no `--timeout` override): failed at **exactly
90.0s** (`test.slow()` × the config's 30000ms default), same locator, same line:
```
Test timeout of 90000ms exceeded.
  - waiting for locator('input[list="jini-byok-model-options"]')
```
A parallel `Monitor` polling loop sampled the webServer's child-process count every 15s for the
full duration: `child_count=1` (the daemon, nothing else) at every sample from t=15s through
t=86s, then `PORT_7621_FREE` immediately after — clean exit, no orphans, no subprocess spike, no
stall past the timeout boundary.

### Why this settles the question, and what it does NOT prove

This is the same root cause as Task A: `stubExecutionRoutes()` makes model discovery succeed for
both tabs, `ByokProviderForm.tsx`'s uncommitted combobox refactor removes the `list` attribute
once discovery succeeds, and `.fill('input[list="jini-byok-model-options"]')` waits — correctly,
and boundedly — for a locator that will never appear. Playwright's own timeout fired cleanly both
times, at exactly the configured value. There is no "worker stuck" behavior on the current tree.

**What this does NOT prove:** that the earlier agent's 16-18 minute observation was mistaken. The
Jini `ByokProviderForm.tsx` change is uncommitted and has no history — it may have been in a
different, genuinely hang-inducing intermediate state at the time of that report, and has since
moved on (the same repo, the same file, still being actively edited — confirmed uncommitted,
+137/-9 lines as of this session). That state is not recoverable to re-test against. What can be
said with confidence: **on the tree as it exists right now, this specific hang does not
reproduce**, the `detectLocalAgents`-concurrency hypothesis has no measured support here, and no
fix should be built to chase a stall that isn't currently occurring. The actionable next step for
this test is identical to Task A's: once the upstream combobox refactor lands/stabilizes, update
the Model-field locator to match its real DOM (combobox `data-testid="jini-byok-model-select"` +
"Custom…" selection, or its stable successor) — not before.

**Pushback, stated plainly:** the "fourth hang" as described in the handoff is not a distinct,
unsettled mystery requiring a `TOVU_PARENT_PID`-style architectural fix. It was two instances of
the same Task A locator-staleness bug, observed at two different moments in an evolving,
uncommitted upstream component — one of which (the earlier one) apparently manifested as a worse
symptom (timeout-defeating stall) that the current component state no longer produces. Recommend
closing Next Steps #3 as "settled — same root cause as #2, not independently actionable" rather
than carrying it forward as an open architectural question.

## Task C (Next Steps #5) — the real 40-test BYOK number

**The real number: 26 passed, 14 failed, out of 40.** This is substantially more than the "two
known pre-existing failures" the handoff anticipated — 12 of the 14 failures were previously
undocumented. Reported here in full, categorized by cause, with confidence level stated per
category. This is the first time this suite's real, uncontaminated result has been obtained (see
handoff: every prior attempt was corrupted by stray processes, port collisions, a log-buffering
misread, or a moving `src/index.ts`).

### Method

10 files match `byok-*.spec.ts` (not 6 — the handoff's "6-file" count is stale; 40 tests total,
confirmed by both a source grep and the run totals below). Given the config's `workers: 1` (forced
single-worker — deliberate, documented in the config as a rate-limit avoidance for the shared login
route) and the expectation that several tests would now hit the 90s per-test timeout because of the
Task A/B root cause, each file was run as its own isolated invocation
(`BYOK_E2E_PORT_BASE=7621`, a distinct `--output=test-results/qa-taskC-<file>` per file) rather than
one combined run — this keeps any single file's runtime and blast radius bounded, and gives a clean
per-file breakdown, at the cost of ~10 extra login/boot cycles. Ports verified clear via `lsof`
before every invocation; zero collisions, zero orphans across all 10 runs.

### Per-file results

| File | Pass | Fail | Notes |
|---|---|---|---|
| `byok-azure-path.spec.ts` | 6 | 0 | clean |
| `byok-credential-persistence.spec.ts` | 2 | 2 | tests 3, 4 — Task A/B root cause |
| `byok-empty-key-guard.spec.ts` | 2 | 0 | clean |
| `byok-google-live-smoke.spec.ts` | 0 | 1 | NEW — see below |
| `byok-google-tool-schema.spec.ts` | 0 | 1 | KNOWN pre-existing (deputy not receiving a request) — matches the brief exactly |
| `byok-hostile-provider.spec.ts` | 5 | 2 | NEW — see below |
| `byok-key-handling.spec.ts` | 8 | 3 | NEW, uncertain — see below |
| `byok-model-discovery-self-heal.spec.ts` | 0 | 1 | NEW — see below |
| `byok-ssrf-guard.spec.ts` | 3 | 0 | clean |
| `byok-state-races.spec.ts` | 0 | 4 | NEW — see below |
| **Total** | **26** | **14** | |

### Category 1 — the Task A/B combobox-refactor family (9 of the 14 failures)

Confirmed root cause: the same uncommitted `ByokProviderForm.tsx` refactor from Tasks A and B. All
of these read/fill the Model field in a state where `showModelPicker` is true, so the plain
`<input list="jini-byok-model-options">`/`<datalist>` this code was written against does not exist:

- `byok-credential-persistence.spec.ts` tests 3, 4 (already diagnosed in Task A/B).
- `byok-state-races.spec.ts` tests 1, 2 — same `.fill('input[list="jini-byok-model-options"]')`
  90s-timeout shape as Task A.
- `byok-state-races.spec.ts` test 3 ("HELD: an in-flight model-discovery response for OpenAI...")
  — **confirmed by reading the test** (`development/e2e/byok-state-races.spec.ts:161-176`):
  `readOptions()` does `document.getElementById("jini-byok-model-options")`, which is `null` the
  moment `showModelPicker` is true (no datalist renders at all), so `expect.poll(readOptions)`
  gets `null` instead of the stubbed model list — same cause, different manifestation (immediate
  `null` via `getElementById` rather than a `.fill()` timeout).
- `byok-google-live-smoke.spec.ts` (1 test): `label:has-text("Model") input` — a **different**
  selector than Task A/B's, but the error itself names the same combobox: strict-mode violation,
  2 elements matched, one of which is `getByRole('combobox', { name: 'Model' })` — the new
  `SearchableModelSelect`. Not root-caused to the same line-level precision as the others, but the
  combobox's presence in the match set is direct evidence of the same family.
- `byok-hostile-provider.spec.ts` tests 6, 7 (10,000-model datalist render; XSS-payload-in-datalist):
  both expect a specific, large/injected content in `#jini-byok-model-options`'s `<option>`s and
  instead get a small, generic 4-item list. Consistent with the same refactor changing which
  component/state renders model options, but **the exact mechanism (why 4 static items instead of
  the stubbed list) was not traced to a specific line within this dispatch's time budget** — flagged
  as same-family by symptom, not fully confirmed by source reading like the others above.
- `byok-model-discovery-self-heal.spec.ts` (1 test): expected `modelsCallCount` of 2, got 4 — double
  the expected discovery-fire count. Plausibly an extra effect/re-render introduced by the new
  `SearchableModelSelect`/`customModelActive` state, but **not confirmed by source reading** — same
  caveat as above.

**Disposition: do not patch any of these yet**, for the same reason as Task A — the upstream
component is uncommitted and still moving. Once it lands, all of Category 1 needs the same fix
sweep: update Model-field locators/assertions to the new combobox contract.

### Category 2 — ADR-058 staleness, a second file never updated (1 of the 14)

`byok-state-races.spec.ts` test 4 ("a fast provider switch... still snapshots the typed key into
the OUTGOING provider's saved draft") — **confirmed by reading the test**
(`development/e2e/byok-state-races.spec.ts:230-232`): asserts
`parsed.savedByProviderId?.anthropic?.apiKey` read back from `localStorage`'s
`tovu:execution-credentials:v1` key. This is the **exact same "never populated" mechanism** already
diagnosed and fixed (by inversion, not deletion) in `byok-credential-persistence.spec.ts` in the
prior session (per `execution-settings.ts`'s own header, item 2: `savedByProviderId` is scoped out
of v1 and never populated). That fix pass evidently touched only `byok-credential-persistence.spec.ts`
— this file has the identical pre-ADR-058 assumption, never updated. Same disposition as the
credential-persistence precedent: don't delete, invert into whatever it can honestly still prove
(most likely: the key never reaches this localStorage path at all, matching that file's test 3).
Recommend the same owner who did that inversion apply it here too, rather than re-deriving it.

### Category 3 — three newly-surfaced failures, NOT root-caused here (3 of the 14)

`byok-key-handling.spec.ts`:
- **Test 3** ("byte-for-byte, no client or server-side trim"): expects
  `Bearer   sk-test-PADDED-KEY-FAKE-NOT-REAL  ` (with the padding preserved), receives it trimmed.
  This reads as a **possible real behavior change** (something now trims the key that didn't
  before) — distinct in shape from the Category 1/2 families (no model-field/localStorage
  involvement at all). Not investigated further; flagged for dedicated triage.
- **Test 7** ("an endpoint that echoes the API key... never shows the raw key"): 90s timeout with
  the "Test connection" button stuck `disabled` for the entire wait (`element is not enabled`,
  repeated ~100+ times in the retry log). Could plausibly be gated by the same model-discovery
  state Category 1 disturbs (button enablement often depends on discovery/model state in this
  form), but this is speculation, not confirmed — flagged, not diagnosed.
- **Test 9** ("composed with the loopback SSRF carve-out"): expects `deputyPrefix.hits() >= 1`
  within 5s, gets 0. Could be a timing/debounce change or a genuine regression in the
  base-URL-edit-resend behavior this file is explicitly pinning as `KNOWN-BAD, not fixed`. Not
  diagnosed.

**Recommend a dedicated, focused follow-up on `byok-key-handling.spec.ts` alone** — these three
don't share an obvious single cause the way Categories 1 and 2 do, and deserve their own root-cause
pass rather than being bundled into this dispatch's already-broad scope.

### Bottom line for Next Steps #5

The clean number is **26/40 passing**. Of the 14 failures: 1 is the previously-known
`byok-google-tool-schema.spec.ts` deputy issue (unchanged, out of scope, matches the brief); 9 trace
to the same uncommitted Jini `ByokProviderForm.tsx` refactor already diagnosed in Tasks A/B (fix
deferred until that component stabilizes); 1 is a second, previously-missed instance of the
already-solved ADR-058 staleness pattern (mechanical fix, same as the existing precedent); 3 are
genuinely new and not yet root-caused, recommended for separate triage. **None of the 14 are newly
introduced by anything in this dispatch** — all are pre-existing relative to this session's own
work, surfaced only because this is the first clean, uncontaminated run this suite has ever gotten.

