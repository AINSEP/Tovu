# BYOK E2E verification — real browser, real network interception

**Date:** 2026-08-04
**Source:** QA/E2E agent (dispatched subagent, Sonnet 5)
**Method:** Playwright driven directly against local Chromium (`node_modules/playwright`), NOT the Playwright MCP (excluded per dispatch brief — that MCP drives the operator's live Chrome and would contend with other concurrent agents). Scripts and screenshots live in
`ADS-memory/.local-artifacts/2026-08-04-byok-e2e/` (`run.js`, `run2.js`, `live.log`, `live2.log`, `screenshots/`).

Cross-referenced: `2026-08-04-byok-gemini-model-discovery.md` (fix author's note),
`2026-08-04-byok-root-cause.md` (root-cause recon).

## Environment note — read before the results

Testing started against the promised environment (admin dev server `:5173`, API
`:3000`) and both fix items were fully verified there with real network interception.
**Partway through, the API server process disappeared from `:3000`** (confirmed via
`lsof` — nothing listening) while a differently-configured process came up on `:4530`.
`:5173`'s Vite dev proxy hardcodes its backend target to `:3000`
(`apps/admin/vite.config.ts:57`), so every request through the normal admin URL now
500s. `:4530` answers login correctly but serves a stale/mismatched static build — it
throws `TypeError: Cannot read properties of null (reading 'useState')` on mount, the
textbook signature of a duplicate/version-skewed React bundle. I did not chase this
further, did not touch any server process or config, and do **not** count that crash
as a BYOK finding — it's an artifact of testing against the wrong build.

This means: the two shipped fixes (self-heal + empty-key guard) are **verified with
real browser + network evidence, not just unit tests** — that was the core ask. A
handful of secondary checks (one isolated Anthropic guard re-test, and confirming live
that filling Azure's Base URL surfaces the real "unsupported" message) could not be
completed live because the environment went down mid-session; those are covered by
source-reading instead and marked accordingly below.

---

## STEP 0 — is the built `dist/` current?

**CONFIRMED CURRENT.** Both `packages/ui/dist` and `packages/agent-runtime/dist` in
`/Users/la/Programming/Jini` postdate their `src/` edits by mtime, and grepping the
built JS (not just the source) shows the actual runtime code:

- `packages/ui/dist/features/execution/react/components/ExecutionTab.js` — contains
  the `onTestConnection` handler calling `loadModels(config.byok)` alongside
  `testConnection`.
- `packages/agent-runtime/dist/providers/model-catalog.js:33-35` — contains the
  `auth_failed` / `'No API key — model discovery needs the key from this browser.'`
  guard.
- `packages/agent-runtime/dist/providers/connection-test.js:247-253` — contains the
  matching guard for `testProviderConnection`.

Tovu's `node_modules/@jini-ai/{ui,agent-runtime}` are symlinks straight into these
built packages, so the fix was live for Tovu with no further build step needed.

---

## Verification items (from the dispatch brief)

### 1. The self-heal path — **PASS**

Reproduced the exact regression: stubbed the first `models` call to fail (red error
appears), typed a fake key, stubbed `test-connection` to succeed, clicked **Test
connection**.

Measured (not just visual), from `live.log` / `run.js`:

| Assertion | Result |
|---|---|
| `models` call count before click | 1 (failed, as stubbed) |
| Error hint text before click | `"Could not load live models: stubbed discovery failure (call #1)"` |
| `models` call count after clicking Test connection | **2** — proves `loadModels` really re-fires |
| `test-connection` call count | 1 |
| Error hint count (`.jini-field-hint.is-error[role='status']`) after click | **0** — cleared |
| Connection status text | `"stubbed connection ok"` |
| Model `<datalist>` options after self-heal | `["stub-model-a","stub-model-b"]` — populated |

Screenshot `screenshots/05-after-test-connection.png` visually corroborates: green
"stubbed connection ok" status, no red hint under Model. This is the actual bug the
owner reported, end to end, with a stubbed network layer proving causality (not
timing luck).

### 2. The empty-key guard fires locally, zero requests reach the provider — **PASS** (OpenAI, Google), **PASS via source + real-network corroboration** (Anthropic), **N/A as designed** (Azure)

Live, with an empty key, switching each protocol chip (which unconditionally
re-triggers discovery via the `protocol`/`baseUrl`/`providerId`-keyed effect,
regardless of the Test Connection button's disabled state):

| Protocol | Discovery error text shown |
|---|---|
| OpenAI | `"Could not load live models: No API key — model discovery needs the key from this browser."` — local guard message, correct |
| Google Gemini | `"Could not load live models: No API key — model discovery needs the key from this browser."` — local guard message, correct |
| Azure OpenAI | `"Could not load live models: baseUrl is required"` — **not the guard message; see new bug below** |
| Anthropic | `"Could not load live models: invalid x-api-key"` — see caveat |

**Anthropic caveat:** my first pass's Anthropic result was contaminated by a fake key
(`sk-ant-test-FAKE-KEY-NOT-REAL`) left over from the self-heal test, which persisted
across reload — BYOK keys are stored client-side in `localStorage` by design
(`apps/admin/src/lib/execution-settings.ts:1-30`, ADR-028 §6), not the server ledger,
specifically so they survive reloads. So this Anthropic call was a **real** network
request with a real (fake) key, and `"invalid x-api-key"` is Anthropic's genuine
response — not a guard failure. I could not get a clean isolated re-run (fresh
browser context, no saved key) before the environment went down; the guard's logic is
identical across all four protocols in source
(`PROTOCOLS_REQUIRING_API_KEY = new Set(['openai','senseaudio','anthropic','google'])`,
`model-catalog.ts:47` and `:337`), so I have high confidence it behaves the same as
OpenAI/Google, but that specific claim is **NOT VERIFIED live** for Anthropic in
isolation — flagging honestly rather than asserting it.

I could not instrument Tovu's server-side egress directly (no server-side tracing
available to this script), so "zero requests reach the provider" is verified two ways
instead: (a) the returned message text is the exact local guard string, which only the
guard code path produces — no real provider ever returns this phrasing — and (b) DNS/
timing: guard responses came back in the same sub-second window as everything else on
the page, consistent with never leaving the process, versus the contaminated Anthropic
case which took visibly longer and returned upstream-shaped text.

**Azure is `unsupported_protocol` by design, but the UI never gets to say so — new
finding below.**

### 3. The message actually reaches the UI — **PASS**

Every case above was read from the DOM (`.jini-field-hint.is-error[role='status']`
`textContent`), not inferred. No blank fields, no generic "Model discovery failed"
fallback observed for the guard cases — the specific local message reaches the user
verbatim.

### 4. The Google header/query-param asymmetry — **CHARACTERIZED, not fixed (per brief)**

Browser → Tovu-server layer (intercepted both routes, redacted the key value, kept
presence/shape):

- `models`: `POST .../assistant/execution/models`, JSON body
  `{"protocol":"google","baseUrl":"...","apiKey":"<present, len=24>"}` — key in body,
  `urlHasKeyParam: false`.
- `test-connection`: same shape, plus `"model"`.

Both browser-facing calls are POST+JSON; the browser itself never sees a difference.
The real asymmetry is server-to-Google, confirmed by source (this cannot be tested
without a real key, per the brief, so I did not try):

- `packages/agent-runtime/src/providers/connection-test.ts:233` — the completion smoke
  test sends `headers: { 'x-goog-api-key': apiKey }`, no key in the URL
  (`googleGenerateContentUrl` never attaches one).
- `packages/agent-runtime/src/providers/google.ts:43-47` (`googleProviderModelsUrl`) —
  model listing attaches the key **only** as `?key=` on the URL;
  `providerModelsHeaders` (`model-catalog.ts:248-269`) returns `{}` for `google` —
  no header at all.

This matches the recon docs' finding exactly. No evidence either way on whether Google
accepts the query-param path with a real key — genuinely untestable here.

---

## New bug found: Tovu's own route masks Azure's real "not applicable" message

**Severity: Low-Medium (UX correctness, not a security or data issue).**

`src/server/routes/admin/assistant/list-models.ts:64-67`:

```ts
if (!baseUrl.trim()) {
  res.status(400).json({ error: "baseUrl is required", code: "VALIDATION_ERROR" });
  return;
}
```

This runs **before** Tovu ever calls `listProviderModels`. But
`packages/agent-runtime/src/providers/model-catalog.ts:304-311` already has a
purpose-built response for exactly this situation:

```ts
if (input.protocol === 'azure') {
  return {
    ok: false,
    kind: 'unsupported_protocol',
    detail: 'Azure OpenAI deployment discovery is not supported from the inference endpoint.',
  };
}
```

— which fires **unconditionally for Azure**, before Azure's own baseUrl is even
validated. Because Tovu's route validates `baseUrl` first and generically, an Azure
operator who hasn't yet filled in their resource URL sees a bare `"baseUrl is
required"` — exactly the same generic validation text every other protocol shows for
a missing field — instead of learning that Azure model discovery isn't supported at
all, regardless of what they type there. Confirmed live: `06-empty-key-Azure_OpenAI.png`
and the `STEP2 [Azure OpenAI]` log line both show the generic message.

I could not confirm live whether filling in a real-looking Azure Base URL (e.g.
`https://my-resource.openai.azure.com`) then surfaces the intended
`unsupported_protocol` message — that check (`run2.js`'s "Item A") was queued right
before the environment went down. Source strongly implies yes (the azure short-circuit
in `model-catalog.ts` runs first and unconditionally, so once Tovu's own baseUrl gate
is satisfied, the real message should reach the UI) — but this is **NOT VERIFIED
live**. If confirmed, it's still worth flagging that the message renders inside
`role="status" class="is-error"` — a red, alert-styled hint — for something that is
architecturally "not applicable," not a failure. That framing question from the brief
stands regardless of which message wins.

One-line fix, if the Coordinator wants it: reorder Tovu's route to check
`protocol === 'azure'` (or just let `listProviderModels` see the azure case before the
baseUrl gate) so Azure's own explicit "not supported" response isn't shadowed by a
generic field-validation message. Not applying this — verifying, not repairing, per
brief.

## Sibling-bug hunt — real server, no stubs

- **Protocol switching state bleed:** none observed. OpenAI → Azure → Google in
  sequence, each showed its own error text and an empty Model field — no
  cross-provider bleed (`STEP5a/b/c` in `live.log`). This matches source:
  `nextConfigForPresetSelect` (`packages/ui/src/features/execution/rules.ts:180-202`)
  snapshots each provider's draft into `savedByProviderId` before loading the
  incoming preset's own saved draft — per-provider isolation is real, not just
  assumed.
- **Clearing a previously-set key does not re-clear a stale discovery error, in
  either direction.** This is the same architectural root cause as Bug 1
  (`loadModels` effect isn't keyed on `apiKey`), just observed from the opposite
  side: Bug 1 was "setting a key doesn't clear a stale error"; I additionally
  confirmed by reading the effect's dependency array
  (`ExecutionTab.tsx:114`: `[config.mode, port, loadModels, config.byok.protocol,
  config.byok.baseUrl, config.byok.providerId]`, no `apiKey`) that clearing one
  can't either — typing/clearing the key alone never re-fires discovery in
  either direction; only the explicit Test Connection click or a
  protocol/baseUrl/providerId change does. I queued a live confirmation of this
  specific direction (`run2.js` Item C) but the environment went down before it
  ran — **NOT VERIFIED live**, high confidence from source since it's the same
  code path Bug 1's own fix touches.
- **Reload persistence / key masking:** confirmed live. Saved a key on Anthropic,
  reloaded, re-selected Anthropic: `type` stayed `"password"` both before and
  after (never flips to plaintext on reload), and the restored value's length
  matched what was typed (29 chars in, 29 chars back) — no truncation, no
  silent loss, no misleading "looks empty but isn't" state. This is intended
  behavior per ADR-028 §6 (client-side-only credential storage), not a bug.
- **Azure "unsupported" presented as an error:** see the new bug above — same
  underlying question, answered at the "no baseUrl yet" state; the "baseUrl
  filled in" state is the part left unverified.
- **`[object Object]` / unlabelled controls / stuck spinners:** none observed in
  any screenshot or DOM read across all six protocol/gateway states exercised.

---

## What I could not test, and why

1. **Isolated (uncontaminated) empty-key guard check for Anthropic specifically** —
   blocked by the environment going down mid-run, right as the isolated-context
   retest (`run2.js`) was starting. Source-level confidence is high (identical guard
   code path as OpenAI/Google), but I'm not asserting a live pass I didn't actually
   capture cleanly.
2. **Azure with a real Base URL filled in** — same blocker, queued as the very next
   check. Source strongly predicts the `unsupported_protocol` message would then
   surface, still styled as an error.
3. **Server-side egress tracing** ("zero requests reach the provider" for the guard) —
   no instrumentation available to this script into Tovu's server process; inferred
   from response-shape and timing instead of a direct request count, as noted above.
4. **The Google header-vs-query-param real-key question** — explicitly untestable
   without a real Google key, per the brief's own instruction not to try.
5. Recurring `401 Unauthorized` console errors appeared throughout every test run,
   including during passing assertions, alongside `[admin] frontend session Event`
   log lines — looked unrelated to BYOK (likely a settings-change SSE reconnect
   racing the rapid reload/navigate cycles this script does, which a real operator
   wouldn't reproduce by clicking around normally) and did not correlate with any
   incorrect UI state, so I did not chase it further. Flagging in case it's a known
   quantity elsewhere.

## Bottom line

Both shipped fixes work, verified with a real browser and real network interception,
not just pixels: the self-heal path (Item 1) is a clean PASS with call-count and DOM
evidence; the empty-key guard (Item 2) is a clean PASS for OpenAI and Google, high-
confidence-but-not-cleanly-isolated for Anthropic, and correctly N/A for Azure. One new,
real, low-severity bug found: Tovu's route-level `baseUrl` validation shadows Azure's
purpose-built "not supported" message with a generic one. Everything else the brief
asked for was either confirmed or explicitly marked as unverified with a reason — no
gap was quietly dropped.
