Code Inspection(Review): Code Inspection + Security personas, chosen for contract correctness, test integrity, and secret handling.

Reviewed the specified branch snapshots. **Six findings; no tests, servers, or file changes.**

1. **High — secrets bypass redaction through tool IDs.**  
   Jini `packages/daemon/src/tool-recovery/observability.ts:59` (`e9f64d43`); diagnostics `observability/otel.ts:111`; Tovu `apps/website/src/platform/observability/sentry.ts:65`.  
   Scenario: a delegated request supplies a secret-shaped unknown `toolId`. Observation starts before registry validation, handing that string directly to both SDKs as `tool.id`; the eventual validation error does not remove it.  
   Smallest fix: redact attribute strings before SDK calls, and use a fixed label for unregistered tool IDs. Add this case to the swap scenario.

2. **High — error type remains an unsanitized secret channel.**  
   Jini `packages/diagnostics/src/observability/errors.ts:24` and `otel.ts:123` (`0b413aed`); Tovu `apps/website/src/platform/observability/sentry.ts:37`.  
   Scenario: `reportError` receives an Error whose writable `name` contains a token. Message and stack are scrubbed, but `type` is returned unchanged, then exported as Sentry’s exception type and OTel’s exception/status text.  
   Smallest fix: redact and cap the type label before either adapter receives it. Test a secret-bearing `Error.name`.

3. **Med — fan-out stops settling trackers after the first exception.**  
   Jini `packages/diagnostics/src/observability/fanout.ts:10` (`a0206790`).  
   Scenario: adapter A’s `end()` throws after a tool successfully changes state. Adapter B never ends, and the exception escapes `withToolCallObservability`, turning the completed action into a failed request. Tracker creation at line 31 similarly stops at the first throwing adapter.  
   Smallest fix: isolate each adapter’s tracker creation and completion; substitute a noop tracker for failed creation. The existing test covers only throwing reporters.

4. **Med — independent Sentry operations reuse the ambient trace.**  
   Tovu `apps/website/src/platform/observability/sentry.ts:60` and `:65` (`51a19f1d9`).  
   Scenario: independent calls created from the same ambient scope inherit its trace ID and sampling context. `forceTransaction` creates a transaction but does not reset propagation context. The swap normalizer discards trace IDs, so it passes despite unrelated operations sharing a trace. [SDK scope cloning](https://raw.githubusercontent.com/getsentry/sentry-javascript/11.6.0/packages/core/src/scope.ts), [root-span creation](https://raw.githubusercontent.com/getsentry/sentry-javascript/11.6.0/packages/core/src/tracing/trace.ts).  
   Smallest fix: start a fresh trace when the adapter has no parent operation; retain explicit parenting for nested operations. Assert independent trace IDs.

5. **Med — “private” Sentry initialization changes process-wide context handling.**  
   Tovu `apps/website/src/platform/observability/sentry.ts:58` (`51a19f1d9`).  
   Scenario: a host already uses Sentry’s OTel context strategy. Calling this adapter’s `NodeClient.init()` selects Sentry’s ALS strategy globally, disrupting the existing context integration despite avoiding `Sentry.init()`. The constructor also registers runtime diagnostics-channel hooks by default. [SDK implementation](https://raw.githubusercontent.com/getsentry/sentry-javascript/11.6.0/packages/node/src/sdk/client.ts).  
   Smallest fix: make runtime initialization host-owned and reuse it; adapter creation must not replace the host’s strategy. Disable runtime channel injection for this manual adapter.

6. **Med — Sentry clients survive site teardown.**  
   Tovu `apps/website/src/platform/observability/sentry.ts:51`; `apps/website/src/server/runtime/composition/deps.ts:1138` (`51a19f1d9`).  
   Scenario: repeatedly opening and closing sites with Sentry enabled creates clients that remain retained by SDK `beforeExit` listeners. The factory exposes no close hook, and site teardown cannot release them. SDK `close()` removes those listeners. [SDK lifecycle](https://raw.githubusercontent.com/getsentry/sentry-javascript/11.6.0/packages/node/src/sdk/client.ts).  
   Smallest fix: return an adapter disposal hook and register it with site teardown. Carry that lifecycle into run 2’s provider plugins.

**Clean commits:** Tovu `15f08a9be` — no finding in its wiring/tests. Tovu `685f2fc17` — no finding; the MCP-UI exclusion is explicitly documented prototype scope.

The swap tests exercise real SDKs. No finding in the noop hot-path claim, config parsing, or overbuild. Beyond initialization and disposal ownership above, no additional obstacle to the provider-plugin move was found.
