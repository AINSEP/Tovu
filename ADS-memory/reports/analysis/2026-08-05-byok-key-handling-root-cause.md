# byok-key-handling: root cause of tests 3, 7, 9 (+ byok-google-tool-schema)

Agent: QA/E2E (Execution). Repo `/Users/la/Programming/Tovu`, branch `refactor/jini-admin-extraction`, HEAD `d4d8f5b`.
Run discipline: `BYOK_E2E_PORT_BASE=7661`, unique `--output` per run, `workers:1`, no orphans before/after.

Status: **COMPLETE** for the assigned scope. Commits `e77b50f`, `8cb4545`, `4634e08`, `667e357`.

## Final state

| test | before | after | verdict |
|---|---|---|---|
| `byok-key-handling` 3 | ✘ | ✓ | test-premise error — unobservable channel, not a product regression |
| `byok-key-handling` 7 | ✘ (flaky) | ✓ | model-picker refactor; adopted the shared `byok-model-field.ts` helper |
| `byok-key-handling` 9 | ✘ | ✓ | WHATWG bad-port list, then cross-test provider leakage |
| `byok-key-handling` 11 | ✘ | ✓ | `LOGIN_STRICT` budget breach (out of scope, fixed as fallout) |
| `byok-key-handling` 8 | ✘ | ✘ | **still failing** — out of scope, see below |
| `byok-google-tool-schema` | ✘ | ✓ | test gap, not the product bug it was filed as |

`npx tsc --noEmit`: **0 errors** at the end of this dispatch. (Mid-dispatch it reported one error in
`src/server/app.ts` — `pagesHtmlStore` missing from `NewsletterRouteDeps` — which was not mine and has
since been fixed by concurrent work.)

## Residual: `byok-key-handling` test 8, NOT fixed, not in scope

Fails in a full-file run with one captured request carrying `apiKey: ""`; **passes in isolation**, where
all 25 keystroke requests carry the real key (verified). So it is order-dependent, not a plain race.

The strongest candidate is the autosave wipe documented under Item 2 below — the ledger round trip
replaces the settings slice with the server's stored value, which carries no `apiKey`. Test 8 types for
~2.7s against a 600ms debounce, so a wipe landing mid-typing would produce exactly the observed empty
key. **This is NOT confirmed**: the isolation run did not reproduce it, so the trigger in full-file
order is unpinned.

If that mechanism is right, the KNOWN-BAD pin's assertion — *"EVERY one of them carried the real key"* —
has become **premise-stale**, because the product now sometimes drops the key mid-edit. Per this
workstream's own rule that a premise-stale test should be inverted rather than made to pass, re-pinning
it is a judgment call about a security pin and belongs to the owner, not to this dispatch.


---

## Baseline run (run 1, `test-results/a2-keyhandling-1`)

Post-rebuild of `@jini-ai/ui` (Coordinator, this session). 11 tests: **8 passed / 3 failed**, matching
the handoff's count. The three failures are 3, 7, 9 exactly as reported — but **two of the three were
mischaracterised** by the prior session's summary.

| # | test | prior characterisation | actual error |
|---|---|---|---|
| 3 | key sent BYTE-FOR-BYTE, no trim | "byte-for-byte key-trim assertion, possible real product regression" | trailing whitespace missing from the received header value |
| 7 | browser-level: key never shown in UI | "Test connection button stays disabled for 90s" | **wrong** — times out on `input[list="jini-byok-model-options"]`, never reaches the button |
| 9 | SSRF prefix-port listener | "listener gets 0 hits" | correct, but the cause is not any of the routes previously guessed |

---

## Test 9 — SETTLED. Not a security failure; the test was never exercising the protection.

### The observation

```
Error: expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 1   Received: 0
  at byok-key-handling.spec.ts:454  (expect.poll(() => deputyPrefix.hits()))
```

### Enumeration of every route to "listener saw nothing"

The brief required this be enumerated rather than stopping at the first fitting explanation. Each route
below is resolved by **direct observation**, not inference. Evidence came from an instrumented run
(`test-results/a2-keyhandling-2`) that captured the POST body the browser sent and the JSON the server
returned:

```
REQ {"protocol":"anthropic","baseUrl":"http://localhost:6000","apiKey":"sk-ant-PORT-WALK-CANARY"}
RES 200 {"ok":false,"models":[],"message":"No API key — model discovery needs the key from this browser."}
RES 200 {"ok":false,"models":[],"message":"fetch failed"}
RES 200 {"ok":false,"models":[],"message":"invalid x-api-key"}
<<< deputyPrefixHits=0
```

| route | verdict | evidence |
|---|---|---|
| the request was never made | **ruled out** | `REQ` observed, with the real canary key |
| made to a different host/port | **ruled out** | `baseUrl` is exactly `http://localhost:6000` |
| listener bound late | **ruled out** | both deputies bind before `pageLogin`; `listen()` resolved; `lsof` showed 6000 free |
| deputy process died | **ruled out** | server object alive; `close()` ran in `finally` |
| client-side abort | **ruled out** | a `200` with a full body came back |
| the SSRF guard correctly blocked it | **ruled out** | the guard's loopback carve-out allows *any* port, and tests 10/11 in the same file prove loopback ports 6100/6200/6201/6202 all receive the key. A guard rejection would also not read `fetch failed`. |
| **undici / WHATWG-Fetch bad-port blocking** | **CONFIRMED** | below |

### Root cause

`model-catalog.ts:382` (`@jini-ai/agent-runtime`) performs discovery with Node's **global `fetch`**, not
with the package's own `pinnedFetch` (which uses `node:http.request` and would not be affected). Node's
`fetch` implements the WHATWG Fetch spec's **"bad port" blocking**: a request to a port on that list is
turned into a network error *before any socket is opened*.

**Port 6000 (X11) is on that list.** Reproduced standalone, deputy bound on `127.0.0.1` in every case:

```
port 6000 : fetch -> ERROR bad port   deputyHits=0
port 60000: fetch -> status 200       deputyHits=1
port 6100 : fetch -> status 200       deputyHits=1
port 6200 : fetch -> status 200       deputyHits=1
```

and the list itself confirmed: `6000`, `6566`, `6665`, `6697`, `10080` all → `bad port`; `3600`, `36000`
dial normally.

The test picked 6000/60000 solely because `"6000"` is a literal decimal prefix of `"60000"`. That
requirement is real (the test needs a genuine prefix pair), but 6000 is unusable as an endpoint.

### Why this matters more than "the count was zero"

The test is named for the loopback SSRF carve-out and is supposed to demonstrate that a real, unintended
local listener receives the live API key mid-edit. It was demonstrating **nothing of the sort** — it was
measuring an incidental transport restriction in undici. The named protection was never reached.

This is the passing-for-the-wrong-reason risk the brief flagged, in its near-miss form: the test failed
loudly rather than passing, so nothing was silently wrong. But the obvious "make the count non-zero" fix
(relaxing to `>= 0`, or dropping the poll) would have converted it into a green test that asserts nothing.

**The underlying leak is real and still demonstrated** — by test 10 (a listener on 6100 receives the key
and echoes it back) and test 11 (three separate loopback ports each receive the key). The MSG-1 KNOWN-BAD
pin is intact; only this one test's port choice was broken.

### Incidental finding (not the bug, worth recording)

undici's bad-port list means the product's loopback SSRF exposure genuinely *excludes* those ports. That
is a real but incidental mitigation — it comes from the transport, not from any Tovu/Jini guard, and it
would evaporate if discovery ever moved to `pinnedFetch` or `node:http`.

---

## Test 3 — SETTLED. Not a product regression. The observation channel cannot see the property.

### The observation

```
Expected: "Bearer   sk-test-PADDED-KEY-FAKE-NOT-REAL  "
Received: "Bearer   sk-test-PADDED-KEY-FAKE-NOT-REAL"
```

Leading whitespace survives; **trailing whitespace does not**.

### Root cause

Not a trim in the product — a trim in the *receiving HTTP parser*. RFC 7230 requires a recipient to strip
leading and trailing optional whitespace (OWS) from a header field value, and Node's llhttp does exactly
that. Proven with a standalone probe that bypasses Tovu entirely:

```
SENT   value        = "Bearer   sk-test-PADDED-KEY-FAKE-NOT-REAL  "
RECEIVED authorization = "Bearer   sk-test-PADDED-KEY-FAKE-NOT-REAL"
RECEIVED x-api-key     = "sk-test-PADDED-KEY-FAKE-NOT-REAL"
```

Note `x-api-key`: because the padded key is the *entire* field value there, **both** the leading and the
trailing spaces are stripped. In `authorization` the leading spaces survive only because `Bearer ` precedes
them, making them interior bytes rather than leading OWS.

So a `node:http` deputy can **never** observe trailing whitespace on a header value, no matter what the
product sends. The assertion was unfalsifiable-in-the-wrong-direction from the day it was written.

### The spec's own comment is false

`byok-key-handling.spec.ts:162-164` states: *"HTTP header VALUES may carry leading/trailing spaces without
being folded, so this is legible on the wire without any encoding to account for."* That is measurably
wrong for trailing whitespace, and wrong for both ends on a bare-value header. Another instance of this
repo's documented pattern of comments encoding inference as observation.

### The product genuinely does not trim (verified independently of the broken channel)

- `list-models.ts:75-105` — `apiKey` passed through verbatim; `.trim()` appears only in a *presence* test
  (`!apiKey.trim() && useStoredCredential`), never assigned back.
- `model-catalog.ts:254` `authorization: \`Bearer ${apiKey}\`` and `:264` `'x-api-key': apiKey` — verbatim.
- `model-catalog.ts:337` — `!input.apiKey.trim()` again a presence test only.
- `google.ts:43-45` `url.searchParams.set('key', apiKey)` — verbatim.

The property the test exists to pin is therefore **still true**; it just needs a channel that can see it.

---

## Test 7 — root cause identified; owned jointly (see coordination note)

### The observation

```
Test timeout of 90000ms exceeded.
Error: locator.fill: waiting for locator('input[list="jini-byok-model-options"]')
  at byok-key-handling.spec.ts:328
```

The prior characterisation ("Test connection button stays disabled for 90s") is **wrong** — the test never
reaches the button. It hangs on the Model field.

### Root cause

The committed `ByokProviderForm` refactor (`3b5d648d`). In the built bundle:

```js
const showModelPicker = liveModels.length > 0;
...
showModelPicker ? <SearchableModelSelect .../> : null,
!showModelPicker || customModelActive ? <input list={!showModelPicker && suggestions.length > 0 ? modelListId : undefined} .../> : null
```

Test 7 stubs `**/assistant/execution/models` to return `{ ok: true, models: ["stub-model"] }`. Non-empty
`liveModels` ⇒ `showModelPicker` true ⇒ the `SearchableModelSelect` combobox renders and the plain input
carrying `list="jini-byok-model-options"` is **not rendered at all**.

### The spec's comment is now exactly inverted

`byok-key-handling.spec.ts:310-314` justifies the non-empty stub on the grounds that an *empty* `models`
array would strip the `list=` attribute. Post-refactor the opposite holds: **non-empty** is what strips it.
Third stale-comment instance in this file.

### Coordination note

This is the same model-field migration the concurrent `byok-model-field` agent owns across the other
`byok-*.spec.ts` files, landing inside a file I own. Raised with the team lead rather than writing a
competing helper.

---

---

## The file is nondeterministic, and fixing 3 and 9 exposed a second latent defect

### Stability across five full runs of the same commit

`ByokProviderForm.js` mtime was unchanged (10:52) throughout, so the shared Jini bundle never moved
under these runs.

| run | duration | 3 | 7 | 8 | 9 | 11 |
|---|---|---|---|---|---|---|
| baseline | 2.2m | ✘ | ✘ | ✓ | ✘ | ✓ |
| confirm (post-fix) | 1.0m | ✓ | ✓ | ✘ | ✓ | ✘ |
| stability 8 | 51.8s | ✓ | ✓ | ✓ | ✓ | ✘ |
| stability 9 | 56.4s | ✓ | ✓ | ✓ | ✓ | ✘ |
| login probe | 58.6s | ✓ | ✓ | ✘ | ✓ | ✘ |

**Tests 3 and 9 were the only deterministic failures, and both are fixed (4/4 since).** Tests 7 and 8
are races; test 11 is the login defect below.

Test 7 in particular is a race, not the deterministic break it was reported as: at mount, before
discovery resolves, `liveModels` is empty so the plain `list=` input renders; once the stubbed
response lands, `showModelPicker` flips and `SearchableModelSelect` replaces it. Whether `fill()`
wins that race decides the outcome. **That is worse than a hard failure** — it can go green while
asserting against a UI shape that no longer exists. It still needs the locator migration.

### Test 11: `LOGIN_STRICT` — exposed by the speedup, not caused by it

`dev-auth.ts:140-144` — **10 logins / 60s per client IP.** This file performed **11**: six `pageLogin`
plus five `apiLogin`. That fit only while the file was slow enough for the 60s window to roll —
test 7's failure alone burned a 90s timeout. Fixing 3, 7 and 9 dropped the run to ~55s, all 11 logins
landed in one window, and the 11th was rejected.

**Observed, not inferred.** A probe printing every login response status:

```
PROBE-LOGIN status=200   (logins 1-10)
PROBE-LOGIN status=429   (login 11 — test 11)
```

It surfaced as `page.waitForSelector: waiting for locator('.login-card') to be detached` after 15s,
which looks nothing like a rate limit — precisely the shape this suite has historically written off
as infra flake.

### Fix, and one rejected approach

**Rejected: session reuse across the browser tests.** Capturing the first login's cookies and
replaying them fixed test 11 but **destabilised tests 7, 8 and 9** (run 11: 3 failed, incl. test 9
which had been green 4/4). Those tests' mount-time discovery races are sensitive to how long the page
takes to become interactive, and skipping the form made it faster. Reverted.

**Adopted: one shared authenticated `APIRequestContext` for the five API tests.** That is the half of
the budget that collapses with **zero browser-side timing change** — the six UI logins are untouched.
Budget: **6 UI + 1 API = 7 of 10.**

Also added: `pageLogin` now asserts the login response is 200, so a future 429 names itself instead of
presenting as a mystery selector timeout 15 seconds later.

---

## Item 2 — `byok-google-tool-schema`

### Hypothesis from code (NOT yet observed — see caveat)

The deputy likely never receives a request because **the spec never saves the key**, not because the
product fails to send it.

- `AdminByokKeyPanel.tsx:58-60` — the explicit "Save key" control is *"the **ONLY** control on either
  screen that writes the admin's own credential"*, and *"Never fires automatically."*
- `api.ts:1261` from the other side — *"explicit save only — never called from the debounced
  ledger-slice auto-save path a typed key would otherwise ride along with."*
- `SettingsUi.tsx:239` confirms `AdminByokKeyFooter` is mounted in the Execution tab, so the control
  is present and clickable.

`configureGoogleByokAgainstDeputy` fills Base URL / API key / Model and waits for
`.settings-ui-save.is-saved` — the ledger autosave, which by design excludes the key. It never clicks
"Save key". So `credentialPort.resolve()` finds no stored row and `assistant-byok.ts:229` returns
**400 "no usable BYOK credential"** before `runByokProviderTurn` is ever called.

If confirmed, this reclassifies the item from **product bug** to **test gap**, and the fix is a
spec-file change rather than product code.

### CONFIRMED by observation — reclassified from product bug to test gap

`POST /api/admin/v1/assistant/byok-turn`:

```
status=400 {"error":"no usable BYOK credential — supply 'byok' with a supported protocol,
            a non-empty apiKey, and a model, or save one first in Settings",
            "code":"VALIDATION_ERROR"}
```

`runByokProviderTurn` is never called, so the deputy cannot receive anything. **This is not a bug in
the turn path — the turn path was never reached.**

### A real product finding surfaced while fixing it

Adding the "Save key" click was not sufficient: the button was **disabled**. Measured in one run:

```
PROBE-A enabled-right-after-key-fill   = true
PROBE-B enabled-after-model-fill       = true
PROBE-C enabled-after-ledger-autosave  = false
PROBE-D key-field-value                = ""
```

**The ledger autosave's round trip wipes a typed-but-unsaved API key out of the form.** The save
replaces the settings slice with the server's stored value, which by ADR-058's design carries no
`apiKey`, so the typed key is discarded and "Save key" (gated on `hasUsableAdminKey`) goes disabled.

This is an operator-visible defect, not only a test artifact: **type a key, pause ~600ms, and the key
silently vanishes before you can press Save.** Whether that is acceptable is an owner call — flagging,
not fixing, since it lives in `SettingsUi.tsx`/`use-admin-execution-credential.hooks.ts` and is well
outside this dispatch.

### Fix and verification

Ordering in `configureGoogleByokAgainstDeputy` changed to: ledger-owned fields (Base URL, Model)
first → wait for `.settings-ui-save.is-saved` → **then** the key → press Save key inside the debounce
window. Once the save lands, `stored.isSet` is true and a later wipe is harmless because the
credential lives server-side.

**Result: the spec passes (17.6s, reconfirmed 18.7s).** Its real assertions — the recursive
Gemini-schema violation scan and the exact meta-tool set — had almost certainly never executed before,
because the turn had never reached the provider.

Verified the assertions are live by breaking the product and watching one fail, then restoring
(`git diff` on `assistant-byok.ts` confirms zero net change): `tools: toolSurface.metaTools.slice(0, 2)`
→ fails at `byok-google-tool-schema.spec.ts:292`, the exact-meta-tool-set assertion.
