# byok-key-handling: root cause of tests 3, 7, 9 (+ byok-google-tool-schema)

Agent: QA/E2E (Execution). Repo `/Users/la/Programming/Tovu`, branch `refactor/jini-admin-extraction`, HEAD `d4d8f5b`.
Run discipline: `BYOK_E2E_PORT_BASE=7661`, unique `--output` per run, `workers:1`, no orphans before/after.

Status: **IN PROGRESS** — written incrementally.

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

## Item 2 — `byok-google-tool-schema`

Not yet started.
