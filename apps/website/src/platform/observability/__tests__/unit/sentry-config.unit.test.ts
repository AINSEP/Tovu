import assert from "node:assert/strict";
import test from "node:test";

import { createObservabilityPort, isNoopObservabilityPort, resolveSentryConfig } from "../../index.js";

/** @file Sentry is opt-in by `SENTRY_DSN`, errors-only by default, and absent config keeps the noop. */

test("disabled (safe default): no SENTRY_DSN, or a blank one", () => {
  assert.deepEqual(resolveSentryConfig({ env: {} as NodeJS.ProcessEnv }), { enabled: false });
  assert.deepEqual(resolveSentryConfig({ env: { SENTRY_DSN: "  " } as NodeJS.ProcessEnv }), { enabled: false });
});

test("enabled: traces default to 0 (errors only); a sample rate is clamped to [0, 1]; garbage is 0", () => {
  const dsn = "https://public@sentry.example.invalid/1";
  assert.deepEqual(resolveSentryConfig({ env: { SENTRY_DSN: dsn } as NodeJS.ProcessEnv }), { enabled: true, dsn, tracesSampleRate: 0 });
  assert.equal((resolveSentryConfig({ env: { SENTRY_DSN: dsn, SENTRY_TRACES_SAMPLE_RATE: "7" } as NodeJS.ProcessEnv }) as { tracesSampleRate: number }).tracesSampleRate, 1);
  assert.equal((resolveSentryConfig({ env: { SENTRY_DSN: dsn, SENTRY_TRACES_SAMPLE_RATE: "abc" } as NodeJS.ProcessEnv }) as { tracesSampleRate: number }).tracesSampleRate, 0);
  assert.deepEqual(resolveSentryConfig({ env: { SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: " staging " } as NodeJS.ProcessEnv }), { enabled: true, dsn, tracesSampleRate: 0, environment: "staging" });
});

test("neither OTLP nor Sentry configured: createObservabilityPort returns the noop port (zero-cost default)", () => {
  assert.ok(isNoopObservabilityPort(createObservabilityPort({ config: { enabled: false } }, { sentry: { enabled: false } })));
  assert.ok(isNoopObservabilityPort(createObservabilityPort({ config: { enabled: false } })));
});

test("only Sentry configured: a live port (the Sentry adapter alone, not wrapped by the fan-out)", () => {
  const port = createObservabilityPort({ config: { enabled: false } }, { sentry: { enabled: true, dsn: "https://public@sentry.example.invalid/1", tracesSampleRate: 0 } });
  assert.ok(!isNoopObservabilityPort(port));
  assert.equal(typeof port.reportError, "function");
});
