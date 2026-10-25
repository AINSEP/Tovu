/**
 * @file The Sentry adapter for `ObservabilityPort` — the ONLY file under `platform/observability/`
 * that imports `@sentry/*`, and loaded the same lazy way `otel.ts` is (see its header): `index.ts`
 * reaches it through `createRequire(import.meta.url)("./sentry.js")` only when `SENTRY_DSN` is set,
 * so an install without Sentry never loads the SDK. No first-party runtime import, for the same
 * reason `otel.ts` has none (`no-first-party-require.boundary.test.ts`).
 *
 * Sentry is an error tracker, not a tracing backend: this adapter maps the two feature-level signals
 * (`trackOperation` → a Sentry span, a transaction when it is a root; `reportError` →
 * `captureException`) and leaves request/DB/outbound/agent-run signals to the OpenTelemetry adapter
 * (no-op here). When both are configured, `index.ts` fans out to both.
 *
 * A private `NodeClient`, never `Sentry.init()`: init installs a process-wide client and default
 * integrations (global handlers, auto-instrumentation) — the same "never take over process-wide
 * registration" rule `otel.ts` follows for the tracer provider. Measured with @sentry/node 11.6.0:
 * a private client plus a forked scope sends both transactions and exception events, and registers
 * no global OpenTelemetry provider.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { NodeClient, captureException, defaultStackParser, makeNodeTransport, startInactiveSpan, withActiveSpan, withScope, type NodeOptions, type Span } from "@sentry/node";
import { createNoopObservabilityPort, describeReportedError, type ObservabilityPort } from "@jini-ai/diagnostics/observability";

export interface SentryConfigEnabled { enabled: true; dsn: string; environment?: string; tracesSampleRate: number; }

/** Test seam: a transport that records envelopes instead of sending them. */
export interface SentryAdapterOptions { transport?: NodeOptions["transport"]; }

// Sentry span status codes: 1 ok, 2 error (`@sentry/core` SPAN_STATUS_*).
const SPAN_STATUS_OK = 1;
const SPAN_STATUS_ERROR = 2;

/** The redacted error an error tracker may see: type, capped message and stack with secret shapes blanked. */
function sanitizedError(error: unknown): Error {
  const { type, message, stack } = describeReportedError({ error });
  const sanitized = new Error(message);
  sanitized.name = type;
  sanitized.stack = stack ?? `${type}: ${message}`;
  return sanitized;
}

/**
 * Builds the Sentry-backed port over one private client.
 * @param required Enabled Sentry configuration (DSN, environment, traces sample rate).
 * @param options Optional transport override for tests; production uses the SDK's Node transport.
 * @returns A port whose operations become Sentry spans and whose error reports become events.
 * @throws SDK initialization errors (an invalid DSN) during setup.
 * @complexity O(1) per signal, excluding the SDK's own buffered send.
 */
export function createSentryObservabilityPort({ config }: { config: SentryConfigEnabled }, options: SentryAdapterOptions = {}): ObservabilityPort {
  const client = new NodeClient({
    dsn: config.dsn, environment: config.environment, tracesSampleRate: config.tracesSampleRate,
    // No default integrations: they patch globals. Collect nothing personal (Sentry 11's successor to
    // sendDefaultPii): no user/IP, cookies, headers, query strings, bodies or local variable values.
    integrations: [], stackParser: defaultStackParser, transport: options.transport ?? makeNodeTransport,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, urlQueryParams: false, httpBodies: [], stackFrameVariables: false },
  });
  client.init();
  const active = new AsyncLocalStorage<Span>();
  const inClient = <T>(fn: () => T): T => withScope((scope) => { scope.setClient(client); return fn(); });
  return {
    ...createNoopObservabilityPort({}),
    trackOperation({ name, attributes = {} }) {
      const parentSpan = active.getStore();
      const span = inClient(() => startInactiveSpan({ name, op: name, attributes: { ...attributes }, ...(parentSpan ? { parentSpan } : { forceTransaction: true }) }));
      let ended = false;
      return {
        run: (fn) => active.run(span, fn),
        end({ outcome, failed, attributes: settled = {} }) {
          if (ended) return; ended = true;
          span.setAttributes({ ...settled, "operation.outcome": outcome });
          span.setStatus(failed ? { code: SPAN_STATUS_ERROR, message: outcome } : { code: SPAN_STATUS_OK });
          span.end();
        },
      };
    },
    reportError({ error, context }) {
      try {
        const span = active.getStore();
        const capture = () => captureException(sanitizedError(error), { tags: { operation: context.operation }, contexts: { operation: { ...context.attributes } } });
        inClient(() => (span ? withActiveSpan(span, capture) : capture()));
      } catch {
        // Best-effort, as in every adapter: a broken SDK must not turn a handled failure into a crash.
      }
    },
  };
}
