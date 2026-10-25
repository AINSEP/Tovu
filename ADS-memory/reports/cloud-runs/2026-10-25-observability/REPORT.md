# REPORT — observability adapter prototype (run 1, 2026-10-25)

Brief: `BRIEF.md` (this folder). Run log: `RUN-LOG.md`. Gap map: `GAP-MAP.md`. Plan: `OBSERVABILITY-PLAN.md`.
Prototype only: nothing is merged, no PR was opened, no real DSN or key was used, and nothing was sent to Sentry or a collector.

## What changed

**Jini** `cloud/observability-1025-jini` (base `3e2fbae8`)
| Commit | Step | Change |
|---|---|---|
| `0b413aed` | 2 | `diagnostics/observability/ports.ts`: `trackOperation` (feature-level unit of work: fixed `name`, id/label attributes, `end({ outcome, failed })`) and `reportError({ error, context })`. `noop.ts`: same frozen shared tracker plus an empty reporter (zero allocation). `hooks.ts`: pass-through. `otel.ts` (Jini's SDK-free lifecycle): an operation becomes an internal span with `operation.outcome`, and a failure sets error status and `error.type`. `reportError` adds a type-only `exception` event to the active span, or creates its own ended root span. It never throws. New `errors.ts` `describeReportedError`: redacted (`redactSecretShapes`, built on core `SECRET_SHAPE_PATTERNS`) and capped type/message/stack for error trackers. 8 new tests. |
| `e9f64d43` | 3 | `daemon/tool-recovery/observability.ts` `withToolCallObservability`: each `ToolExecutor.execute` becomes one `tool.call` operation (`tool.id`, `agent.run.id`, outcome = settled status, `tool.error_kind` validation/internal). Timeouts, internal failures and non-input throws are `reportError`ed inside the operation's scope. Validation failures and unknown tool ids are counted but not reported. The port is taken structurally, so the daemon gains no dependency. 6 tests. |
| `a0206790` | 4 | `diagnostics/observability/fanout.ts` `combineObservabilityPorts`: noop-only returns the noop, one live port is returned as-is, and n ports share nested scopes. A throwing reporter never skips the others. 2 tests. |

**Tovu** `cloud/observability-1025-tovu` (base `496776d4`)
| Commit | Step | Change |
|---|---|---|
| `c1d6…`→ see `git log` | 1 | `GAP-MAP.md` |
| `15f08a9b` | 3 | `assistant/tool-recovery-preset.ts` `withToolCallObservability`, which returns the executor itself for the noop port. Wired into BYOK (`byok-tool-surface.ts` option `observability`, fed by `assistant-byok.ts`). Scenario fixture: real delegated-tool route + real Tovu executor stack. Fake-port tests. |
| `d0b96360` | — | merge of owner's `ac08e110` (BRIEF-2.md) that landed on the branch mid-run |
| `51a19f1d` | 4 | `platform/observability/sentry.ts` (lazy, private `NodeClient`). `config.ts` `resolveSentryConfig`. `index.ts` selection + fan-out. `deps.ts` passes Sentry config. `@sentry/node` pinned to `11.6.0`. Boundary allow-list adds `./sentry.js`. Swap-proof test. Config tests. |
| `8201ad2e` | 5 | `OBSERVABILITY-PLAN.md` |
| latest | 3 fix | daemon server: `const toolExecutor = withFederatedRefusalDiagnosis(` restored verbatim (source-anchored tests pin it). The new `observedToolExecutor` feeds the delegated-tool route. |

## The feature, before / after

The feature is the assistant tool-call path: `POST /api/delegated-tool-calls` → `ToolExecutor.execute` (daemon), and the BYOK surface executor.
- **Before:** a tool call had no observability signal of its own. Failures went to `console.error` (`[tool-failure] ERR-… tool=…`, `tool-recovery-preset.ts` `failurePorts`).
- **After:** one decorator, composed outermost, on the injected `routeDeps.observability`. No SDK import anywhere in the feature. Feature-side diff in `agent-daemon-server.ts`: one `const observedToolExecutor = …` line plus the route deps using it. In `byok-tool-surface.ts`: an optional `observability` option plus a 1-line wrap.
- Classification:

| Status | Outcome | Failed? | Reported? |
|---|---|---|---|
| completed | `completed` | no | no |
| denied / confirmation-denied / cancelled | as named | no | no |
| failed, validation | `failed` + `tool.error_kind=validation` | yes | **no** (model input mistake) |
| failed, internal | `failed` + `tool.error_kind=internal` | yes | yes |
| timed-out | `timed-out` | yes | yes |
| throw, `ToolInputError` (unknown tool) | `threw` + `tool.error_kind=validation` | yes | no |
| throw, anything else | `threw` + `tool.error_kind=internal` | yes | yes (then rethrown) |

## Swap proof

`apps/website/src/assistant/__tests__/tool-call-observability.swap.test.ts` runs one scenario: 4 calls
(success, validation error, a handler crash carrying a Stripe-shaped secret, an unknown tool). They go
through the real route and the real Tovu executor stack. The same scenario runs against:
1. a fake port;
2. the **real OpenTelemetry SDK** (`InMemorySpanExporter`, `SimpleSpanProcessor`);
3. the **real Sentry SDK 11.6.0**, with a recording transport and a dummy `.invalid` DSN (no network);
4. OTel + Sentry together through the fan-out.

Each adapter's output is normalized back to `{ name, toolId, outcome, failed, errorKind, reported[] }` and
**deep-equals the same `EXPECTED_OPERATIONS`** in every case. In Sentry, the error event is linked to its
operation's span (`contexts.trace.span_id`). The secret appears in no span and no envelope. A 5th test
reports a raw secret-bearing error straight to the Sentry adapter, which proves adapter-side redaction
on its own. Result: **5/5 pass.**

**Both configured:** fan-out (`combineObservabilityPorts`). OTel receives every signal, and Sentry
receives operations and errors (the other signals are noop in its adapter). Fan-out is the simplest
choice that serves the real combination (traces + incidents). It costs nothing for a single adapter,
because that adapter is returned as-is.

## Numbers (all measured this run, Node 24.22.0, 4 cores)

- **Jini tsc --noEmit:** diagnostics 0 errors, daemon 0, http-kit 0.
- **Jini vitest:** diagnostics full suite **46 files / 780 tests pass**. daemon `src/tool-recovery` + `http/__tests__/delegated-tools` + `read-only-tools`: **9 files / 156 pass**. The rest of the daemon suite was not run.
- **Tovu `tsc -p tsconfig.json`:** 0 errors.
- **Tovu `tsc -p tsconfig.tests.json`:** 344 errors, **0 in any file this run touched or added** (grep for observab/sentry/tool-call/trackOperation/reportError). I ran no baseline for this typecheck, so the claim that the 344 are pre-existing is **unverified**.
- **Tovu new tests:** feature 3/3, swap 5/5, Sentry config/selection 4/4.
- **Tovu touched + existing tests:** every test file mentioning observability / tool-recovery-preset / byok-tool-surface / agent-daemon-server (final run below). `agent-daemon-server` source-scan unit tests: 18 files / **163/163**.
- **Complexity:** `eslint --rule 'complexity: ["error", 10]'` reports 0 errors on all touched files. The only warnings are pre-existing sonarjs warnings in Jini `otel.ts`, plus 1 warning each in `errors.ts` and `index.ts`.
- **Cost:** noop tool call 0.96 µs (= bare executor; the decorator is identity). Enabled per call: OTel ~45 µs, Sentry ~25–30 µs (micro-bench, pessimistic in-memory exporter). SDK load: OTel ~155 ms / +21 MB RSS; Sentry ~465 ms / +40 MB RSS (`require` delta, 3 runs each).

FINAL_TEST_RUN_PLACEHOLDER

## Concerns (pushback)

1. **Breaking port change.** `trackOperation` and `reportError` are required methods, so every
   hand-written `ObservabilityPort` must add them. In this tree that was only Jini's own noop, hooks
   and otel. Tovu fakes all spread the noop, and Tovu tsc is clean. Downstream hosts would need a minor
   bump. I chose required over optional because optional methods make every call site branch.
2. **Tracker shape, not callback.** The brief suggested `trackOperation({ name, attributes }, fn)`. I
   followed the codebase's existing `trackX(input) → { run, end }` shape instead. The tool outcome comes
   from the result, the noop reuses one frozen tracker, and all four existing signals already use this
   shape (`GAP-MAP.md`).
3. **Source-anchored wiring tests resist composition changes.** Two tests pin exact source lines in
   `agent-daemon-server.ts`. My first wiring broke them (`federation runtime wiring (S3)`, `executable
   plugin tools … exchange store`). I fixed this by leaving those lines verbatim and adding
   `observedToolExecutor`. As a consequence, **the MCP-UI callback route is not observed yet.**
4. Sentry 11 dropped `sendDefaultPii` and replaced it with `dataCollection`, so I verified the option
   against the installed type definitions rather than from memory. `@sentry/node` 11.9.0 was the latest
   release but only 2 days old, so I pinned 11.6.0 (17 days old).

## Pre-existing failures seen (reproduced with this run's Tovu diff reverted: `git checkout 496776d4 -- apps/website/src`)

- `assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` "every surfaceExchanges.open(...) call names a toolId constant…" (`visitor-confirmations.ts:42`, `oidc-login.ts:170,229`).
- `assistant/__tests__/tool-search-keywords.operator-requests.test.ts` "every operator request with a tool finds it in the top 3".
- `server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts` "no OTLP endpoint … left undecorated" (probe count 2 vs 1).
- `server/__tests__/assistant-chat-recovery-bounds.unit.test.ts` **hangs** after 3/4 tests pass. The process never exits (timeout 124 on baseline too). I killed it by pid in the broad run.

All four reproduce on the baseline Tovu tree. The Jini link still carried this run's additive Jini
changes during that check, but `instrumentation.ts` and the other files those tests touch were unchanged.

## Open questions for the owner (top 3)

1. **Sentry at all, or PostHog for errors?** Sentry costs +40 MB RSS and ~0.5 s of load when enabled,
   and it is a second vendor next to OTel. Run 2 introduces PostHog, which also does error tracking.
   One error tracker would be cheaper to run and to keep consistent. Which one?
2. **E-mails and hostnames in error messages.** `redactSecretShapes` removes secrets but not personal
   data. Should error trackers get type-only (like OTel today), or messages with an added e-mail/host
   scrubber? This needs a consent/PII decision.
3. **Validation errors as incidents?** This prototype counts them on the operation but does not report
   them, because they are the model's input mistakes. If you want an "the assistant keeps calling tools
   wrong" signal, it belongs on a metric (the spanmetrics connector derives it from `tool.error_kind`)
   rather than as error-tracker issues. Agree?

## What this does NOT cover

- The provider-plugin move. The owner decided it (BRIEF-2) and it is run 2's step 2; `OBSERVABILITY-PLAN.md` §4 covers it.
- The MCP-UI callback route and the visitor (site) executor.
- Features other than tool calls.
- Metrics instruments. Log/trace-id correlation.
- Browser-side SDKs.
- Flushing the Sentry client and the OTel provider on graceful shutdown.
- The `observability-status` route reporting Sentry.
- The full Tovu suite. Only files related to observability or the touched code ran (counts above).
- Swap-proof limits: it checks the adapters' *outputs* in their in-process forms (OTel `ReadableSpan`s, Sentry envelopes). It does not check that a real Sentry project or collector accepts them; no network was allowed.

DONE_LINE_PLACEHOLDER
