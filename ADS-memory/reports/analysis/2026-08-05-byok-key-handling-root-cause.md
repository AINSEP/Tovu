# byok-key-handling: root cause of tests 3, 7, 9 (+ byok-google-tool-schema)

Agent: QA/E2E (Execution). Repo `/Users/la/Programming/Tovu`, branch `refactor/jini-admin-extraction`, HEAD `d4d8f5b`.
Run discipline: `BYOK_E2E_PORT_BASE=7661`, unique `--output` per run, `workers:1`, no orphans before/after.

Status: **COMPLETE** for the assigned scope. Commits `e77b50f`, `8cb4545`, `4634e08`, `667e357`, `809a51f`.

---

# THE HEADLINE: every premise this dispatch was given was wrong

Six fixes landed, but they are not the finding. **The finding is that this suite's failure *descriptions*
have been less reliable than its failures.** Every characterisation handed to this dispatch — each one
carried across one or more prior sessions — turned out to be false on contact with the actual error:

| what the brief said | what was true |
|---|---|
| test 9: a security test observing nothing; the SSRF guard may be failing | The guard was never reached. Node's global `fetch` refuses port 6000 outright (WHATWG bad-port list). The leak it names is real and was being demonstrated by tests 10 and 11 the whole time. |
| test 3: a byte-for-byte key-trim assertion, possible real product regression | No product trim exists. RFC 7230 recipients strip OWS and Node's llhttp does, so the channel physically cannot observe the property. |
| test 7: the "Test connection" button stays disabled for 90s | The button is never reached. It times out on the Model field, two steps earlier. |
| test 7: a deterministic failure | A *race*. It passed unmodified in 3 of 8 runs — worse than a hard failure, because it can go green while asserting against a UI shape that no longer exists. |
| `byok-google-tool-schema`: a real, known, pre-existing **product** bug | A test gap. HTTP 400 at the credential gate; the turn path was never entered, so the bug "in the turn path" could not have been observed. |
| test 9 has a cause | It had **two**, stacked and independent — a blocked port, and cross-test provider leakage. Fixing the first exposed the second. |

Two further defects were not in any brief at all and were only exposed by *fixing* the above: the
`LOGIN_STRICT` budget breach, and the autosave key-wipe.

**The transferable lesson:** in this suite, reading the actual error before theorising is not a
nicety — it inverted or materially corrected the conclusion in every row of the table above, without
exception. A failure description that has survived
several handoffs is evidence about the handoffs, not about the failure. And one symptom ("the listener
saw nothing") was reachable by at least three unrelated routes here, so matching a symptom to a
remembered cause is close to worthless.

This dispatch also produced **one false claim of its own** — see the retraction section — which is the
same defect class, committed by the agent cataloguing it. That is included deliberately.

---

## Final state

| test | before | after | verdict |
|---|---|---|---|
| `byok-key-handling` 3 | ✘ | ✓ | test-premise error — unobservable channel, not a product regression |
| `byok-key-handling` 7 | ✘ (flaky) | ✓ | model-picker refactor; adopted the shared `byok-model-field.ts` helper |
| `byok-key-handling` 9 | ✘ | ✓ | WHATWG bad-port list, then cross-test provider leakage |
| `byok-key-handling` 11 | ✘ | ✓ | `LOGIN_STRICT` budget breach (out of scope, fixed as fallout) |
| `byok-key-handling` 8 | ✘ | ✘ | **cause CONFIRMED** — the autosave key-wipe; fix deferred pending the product change |
| `byok-google-tool-schema` | ✘ | ✓ | test gap, not the product bug it was filed as |

`npx tsc --noEmit`: **0 errors** at the end of this dispatch.

Mid-dispatch it reported one error surfacing at `src/server/app.ts(368,3)` — `pagesHtmlStore` missing
from `NewsletterRouteDeps`. I flagged it as possibly introduced by concurrent work; the Coordinator
verified otherwise and the correction is recorded here: **`app.ts` is committed and clean and was not
modified this session.** The error originated in the *uncommitted* `src/server/deps.ts` (the Pages HTML
workstream), one of the ~299 pre-existing dirty paths. It is a **tree condition, not a regression** —
no commit from this session touches it, and a clean `tsc` depends on the state of an unrelated
workstream's working copy.

## OPEN ITEMS AT SESSION END — read this if you are picking the work up

Nothing here is blocked on understanding the rest of this report; each item says where to go.

| # | item | state | where |
|---|---|---|---|
| 1 | **`byok-key-handling` test 8** — the only failing test in either owned file | Cause **confirmed** (the autosave key-wipe). Fix deliberately **not** applied: it was gated on a product change that did not land this session. | "test 8" section — includes a **ready-to-apply** change spec |
| 2 | **DO NOT invert test 8's pin.** | Settled conclusion, contested and resolved. Its current assertion should pass **unmodified** once the wipe fix lands — verify that before touching it. | same section, "CONCLUSION" |
| 3 | **The autosave key-wipe** (operator-visible data loss: type a key, pause ~600ms, it vanishes) | Product defect, measured. A separate `programmer-autosave` agent was dispatched to fix it; **outcome unknown at session end.** | Item 2 section, PROBE-A/B/C/D evidence |
| 4 | **Is the wipe pinned by any test?** | **UNCONFIRMED — assume not.** Asked the Programmer explicitly; no answer received. If no product-side test exists, keep a wipe assertion in `byok-key-handling.spec.ts`. | "OPEN HOLE" subsection |
| 5 | **SSRF pin discarded on 2 of 7 paths** | Real finding, severity calibrated Low-to-Medium. Routed to the owner as a **Jini** decision; not made. | "FINDING — the SSRF guard's strength…" |
| 6 | **BYOK panel calls api.anthropic.com at mount**; the admin config's "hermetic" claim is false as written | Recorded, not fixed, not urgent | "FINDING — the BYOK panel makes a live third-party request…" |
| 7 | Which of 4 `publishSettingsRefresh` call sites triggers the wipe | **Unverified.** Not a loose end — never traced, and deliberately not guessed. | "Why the 26th request exists" |

**Owned files (the only ones this agent may edit):** `development/e2e/byok-key-handling.spec.ts`,
`development/e2e/byok-google-tool-schema.spec.ts`. Both are committed and byte-clean. **No product code
was modified** — product files were edited only to demonstrate that assertions detect regressions, and
every one was restored (`git diff` verified empty each time).

**Commits, in order:** `e77b50f`, `8cb4545`, `4634e08`, `667e357`, `809a51f`, `b1f26e0`, `fbabcf3`,
`b1207e1`.

**Run discipline used, for anyone reproducing:** `BYOK_E2E_PORT_BASE=7661` only, a unique
`--output=test-results/a2-<spec>-<n>` on every run, one spec per run, config
`development/playwright.admin.config.ts`. 24 runs, `lsof` clean on 766x before and after each, zero
orphans throughout.

---

# CORRECTION — a false mechanism I published, now retracted

An earlier version of this report, and the doc comment on `fillApiKeyAndAwaitCommit`, stated that
`ExecutionTab.tsx`'s discovery effect *"lists only `config.byok.baseUrl` as a dependency"* and therefore
*"never re-fires for that URL"*. **That was inference presented as observation, and it is false.** The
Coordinator caught it; I then read the committed source and confirmed the correction.

The actual dependency array (`ExecutionTab.tsx`, the `useEffect` following the `hasApiKey` derivation):

```
[config.mode, port, loadModels, config.byok.protocol, config.byok.baseUrl, config.byok.providerId, hasApiKey]
```

`hasApiKey` is in it deliberately. Its own doc says it is keyed on the boolean *"specifically so the
effect below re-runs exactly once on the `false -> true` transition — a saved key hydrating from storage
after first paint, or an operator finishing entry — and NOT once per character."* The effect's own
comment calls `hasApiKey` *"what makes this effect self-healing"* and describes the exact bug it fixed.

**What was actually measured, and remains true:** an edit made before React commits the typed key fires
a discovery request carrying an empty `apiKey` (observed on the wire twice), and the server
short-circuits an empty key before any outbound call. The fix — waiting on a React-derived enabled
state — is correct either way. Only the explanation was wrong.

This is recorded rather than quietly edited because it is precisely the defect class this report
catalogues three times over, committed by me. The commit message of `8cb4545` contains the same false
claim and cannot be rewritten; this section is the correction of record.

---

# FINDING — the SSRF guard's strength depends on which code path you enter

Answering the Coordinator's bounded question: **`pinnedFetch` is about DNS-rebinding TOCTOU, not
connection reuse.** Its own doc in `connection-guard.ts` is explicit:

> *"A validator that only checks and returns pass/fail has a gap: `fetch` (or any transport) then
> resolves the hostname AGAIN, independently, when it dials. Between those two resolutions the answer
> can change — a DNS rebinding attacker returns a public address to this check and a private one to the
> connection. No amount of re-checking closes that on its own; the request has to dial the exact address
> that was approved."*

`validateBaseUrlResolved` resolves once and returns the approved address as `pinnedAddress`, to be fed
to `pinnedFetch`, which dials it directly.

**Seven call sites resolve. Five pin. Two discard the pin.**

| path | validates | transport | pinned? |
|---|---|---|---|
| `anthropic-messages.ts` (turn) | yes | `pinnedFetch` | **yes** |
| `google-messages.ts` (turn) | yes | `pinnedFetch` | **yes** |
| `openai-chat.ts` (turn) | yes | `pinnedFetch` | **yes** |
| `ollama-chat.ts` (turn) | yes | `pinnedFetch` | **yes** |
| `azure-chat.ts` (turn) | yes | forwards `pinnedAddress` on to the OpenAI runner | **yes** |
| **`model-catalog.ts` (model discovery)** | yes | global `fetch` | **NO** |
| **`connection-test.ts` (Test connection)** | yes | global `fetch` | **NO** |

Verified that the discard is real and not indirection: neither `model-catalog.ts` nor
`connection-test.ts` references `validated.pinnedAddress` anywhere — both read only `.error`,
`.forbidden`, `.parsed`. So both call the resolving validator, receive the approved address, throw it
away, and let undici re-resolve at dial time. That is exactly the window `pinnedFetch` exists to close.

**Severity: Low-to-Medium, defence-in-depth — not Critical, and the guard's own doc says why.** `baseUrl`
here is operator-configured provider config, not attacker-supplied input, and the doc states plainly
that *"pinning is defence-in-depth rather than the primary trust boundary."* The redirect half of the
surface is also closed on the discovery path — `model-catalog.ts:387` does pass `redirect: 'error'`.

**Why it is still worth recording:** the same `validateBaseUrlResolved` call gives two different security
postures depending on which function you entered, with nothing at either call site marking the
difference. Someone reading "the SSRF guard runs on this path" — as `list-models.ts`'s own header
comment says — will reasonably assume the guard behaves identically everywhere. It does not.

**Not fixed. Status: routed to the owner as a Jini decision, not yet made.** All files referenced in this
section live in a *different repo* from this report: `/Users/la/Programming/Jini/packages/agent-runtime/
src/providers/` (`connection-guard.ts`, `model-catalog.ts`, `connection-test.ts`, and the five provider
adapters). Changing them also requires a `@jini-ai/ui` / agent-runtime rebuild before Tovu sees any
effect, since Tovu consumes these packages via `dist`.

---

# FINDING — the BYOK panel makes a live third-party request at mount, and the config's "hermetic" claim is false

Observed during instrumentation, not sought: `RES {"ok":false,"models":[],"message":"invalid x-api-key"}`
— a real response from **api.anthropic.com**, reached during a run of the suite whose config header
describes it as *"hermetic"* and *"never a real provider."*

**Mechanism (product, not test):** `ExecutionTab`'s discovery effect fires as soon as BYOK mode is
selected, against the preset's *default* provider endpoint, before any base URL is typed and before any
credential exists. The empty-`apiKey` discovery call documented above and this outbound request are the
same event seen from two sides.

So **an admin merely opening the Execution panel emits a request to a third-party provider.** In this
suite it carries a canary key and is harmless. In production it is an unsolicited outbound call to
Anthropic triggered by opening a settings screen. Not urgent, not this dispatch's to fix, but far
cheaper to notice now than to discover later.

**The config's own header comment is now false as written.** `development/playwright.admin.config.ts`
describes the harness as *"hermetic, two-process boot"* and *"never a real provider or the shared dev
server."* The first half is true; the claim about never reaching a real provider is not. Same defect
class as the three stale comments this report already catalogues.

---

## `byok-key-handling` test 8 — CONFIRMED cause, fix deferred pending the product change

Owner ruled this in scope after the initial report. Diagnosis is now **observed, not inferred**.

### Reproduced minimally: tests 7 → 8 alone

Instrumenting test 8's key field and every captured discovery request:

```
keyFieldAtEnd=""
""                                -> apiKey="sk-ant-KEYSTROKE-LEAK-CANARY"
"h" … "http://ab.cd.ef.example"   -> apiKey="sk-ant-KEYSTROKE-LEAK-CANARY"   (25 requests, all keyed)
"http://ab.cd.ef.example"         -> apiKey=""            <-- a 26th, for the SAME url
```

Two facts settle it:

1. **`keyFieldAtEnd=""` — the key field is genuinely wiped during test 8**, the same defect measured
   under Item 2.
2. **A 26th request fires for the same final URL carrying an empty key.** That is what fails the pin.
   None of the 25 keystroke requests does — every one carries the live key, so the MSG-1 leak is intact
   and still fully demonstrated.

### Why the 26th request exists — and why it vindicates the retraction above

The wipe flips `hasApiKey` from `true` to `false`. `hasApiKey` **is** in the discovery effect's
dependency array, so the effect re-runs and fires once more, now with no key. The earlier (retracted)
claim that the key was not a dependency would have predicted no such request. The correction is what
makes this observable behaviour explicable.

Order-dependence follows: in isolation there is no wipe, hence no 26th request, hence the pin holds.

**Still unverified, held as such:** which of the four `publishSettingsRefresh` call sites fires the
refresh (two in `AssistantDock.tsx`, two in `settings-events.ts`). Reproduction pins the wipe, not the
publisher.

### CONCLUSION: DO NOT INVERT THIS TEST

Stated as a conclusion because it was contested and settled, and because the next agent will otherwise
re-derive the wrong answer from the phrase "premise-stale" in the older notes.

"Premise-stale" would mean the product's real security behaviour changed, so the assertion is now untrue
of the system. **That is not what happened, and the test must not be inverted.** The leak is unchanged:
all 25 keystroke requests carry the live key to every intermediate host, genuine strict prefixes
included. What changed is that a *separate defect* — the autosave key-wipe, being fixed independently —
injects one unrelated 26th request.

**Once the wipe fix lands, test 8's existing assertion should pass UNMODIFIED.** Verify that before
changing anything. Inverting it would pin behaviour that is about to be deleted.

(Reviewed and adopted by the Coordinator, who had originally proposed inverting it.)

### READY-TO-APPLY CHANGE (specified, deliberately not applied)

Not applied because it was gated on the product fix, which did not land in this session. Apply it
**after** the wipe fix, and only after confirming the test passes unmodified first.

**File:** `development/e2e/byok-key-handling.spec.ts`, the test at the `mechanism: typing into Base URL
re-sends the real saved API key…` case (test 8, inside the MSG-1 `KNOWN-BAD` describe).

**Keep unchanged:**
- KNOWN-BAD #1 — `expect(captured.length).toBeGreaterThan(1)` (no debounce)
- KNOWN-BAD #3 — the `hasGenuinePrefix` assertion (at least one strict-prefix baseUrl)

**Replace KNOWN-BAD #2** — currently `for (const call of captured) expect(call.apiKey).toBe(canaryKey)` —
with these two clauses:

1. **Every request carrying a non-empty key carried exactly the canary.** No credential other than the
   expected one ever leaves. (Filter `captured` to `c.apiKey !== ""`, assert each equals `canaryKey`.)
2. **At least one strict-prefix request carried the canary.** The leak genuinely reaches hosts the
   operator never intended. (The intersection of the #3 prefix predicate and `apiKey === canaryKey`.)

**Why — this is a ROBUSTNESS change, not a weakening.** Both KNOWN-BAD properties survive intact and
still flip the instant MSG-1 is really fixed. The replaced clause is *stronger* on MSG-1's actual
subject: a **different** credential leaving would now fail, which the census form could never
distinguish — it only ever asked "was this the canary", never "did some other key leak". What it drops
is a census over unrelated traffic, which is what made the test fail for a reason that had nothing to do
with its subject.

### OPEN HOLE — the wipe may be pinned by nobody. NOT confirmed.

The replacement lets an empty-key request pass silently, so **test 8 will no longer catch a regression of
the autosave key-wipe.** That is the right division of labour — test 8's subject is a key *leak*, not key
*data loss* — but only if the wipe is pinned on the product side.

**I asked `programmer-autosave` directly and explicitly whether its regression test pins "a typed key
survives a settings-slice refresh that returns no key", and I never received an answer before the session
ended. Treat this as UNCONFIRMED, not as covered.**

**Action for whoever picks this up:** before applying the change above, verify that a test exists which
fails against pre-fix code for the wipe specifically. If it does not, keep a wipe assertion in
`byok-key-handling.spec.ts` instead — the commitment made to the Coordinator was that this file retains
one if the product side does not.

Two pointers already passed to the Programmer, repeated here so they are not lost: `loadExecutionConfig()`
(`apps/admin/src/lib/execution-settings.ts:229`) already returns `byok.apiKey: ""` unconditionally, so no
mock is needed; and `publishSettingsRefresh(["core.execution"])` drives `refresh()` directly — no SSE, no
browser, milliseconds.


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

### Fix, and one rejected approach — **the rejected half is the more useful result**

**REJECTED: session reuse across the browser tests. Record this before the fix that was kept.**
Capturing the first login's cookies and replaying them into later contexts is the obvious fix, and it
is a trap. It fixed test 11 and **destabilised tests 7, 8 and 9** — run 11 went from 1 failure to 3,
including test 9, which had been green 4/4 immediately before. Skipping the login form makes the page
interactive sooner, which feeds the mount-time discovery races. **It traded one deterministic failure
for three flaky ones**, so it was reverted rather than shipped.

The generalisable point: in this suite, *making a test faster is not a neutral change.* Two separate
defects here (this one, and the `LOGIN_STRICT` breach itself) were caused or exposed purely by removing
latency.

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

**Result: the spec passes (17.6s, reconfirmed 18.7s, 13.4s).**

### The headline is not the fix — it is that this test had never exercised its subject

Its real assertions — the recursive Gemini-schema violation scan (`collectGoogleSchemaViolations`, the
whole reason the file exists) and the exact meta-tool set — **had never executed**, because the turn was
rejected at the credential gate before any provider call. Everything downstream of
`expect.poll(() => deputy.streamRequests().length).toBeGreaterThan(0)` was unreachable.

**A test can be failing for months and still never have run its own subject.** This one is the proof.
The failure was even attributed to the thing the test guards — "the deputy never receives a request" was
read as evidence about the turn path — when it was evidence that the turn path was never entered. A red
test invites the assumption that its assertions ran and one of them lost; here none of them ran at all.

Verified the assertions are live by breaking the product and watching one fail, then restoring
(`git diff` on `assistant-byok.ts` confirms zero net change): `tools: toolSurface.metaTools.slice(0, 2)`
→ fails at `byok-google-tool-schema.spec.ts:292`, the exact-meta-tool-set assertion.
