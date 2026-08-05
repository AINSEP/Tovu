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

