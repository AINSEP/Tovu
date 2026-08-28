import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";
import { startTestServer } from "../helpers/http-test-server.js";
import type { ObservabilityPort, RequestTrackingInput, RequestTrackingOutcome } from "#src/platform/observability/index";

/**
 * @file Proves `createApp()`'s request-tracking middleware actually runs against BOTH `RouteDeps`
 * sources this task's dispatch identified as the real "two boot paths" risk
 * (`ADS-memory/.local-artifacts/metrics/2026-08-28-observability-groundwork.md` §1-2):
 *
 * - `createRouteDeps()` (this file, in-memory) — what `src/index.ts` builds in its `useMemory`
 *   branch.
 * - `createSqliteRouteDeps()` (`runtime/composition/deps.ts`, real SQLite) — what `src/index.ts`
 *   builds in its non-memory branch AND what `cli/commands/serve.ts`'s `tovu serve` builds (grep
 *   confirms both call sites: `index.ts:273`/`290`, `serve.ts:84`/`93`).
 *
 * Both ultimately call the SAME `createApp()` function (`runtime/composition/app.ts`), so a test
 * proving the middleware runs for requests built from EITHER `RouteDeps` source is a direct proof
 * that neither real boot path can silently miss it — the failure mode the groundwork report
 * specifically warned an `index.ts`-only instrumentation plan would produce. This intentionally
 * does not ALSO spawn the real `tovu` CLI binary (that heavier, process-spawn-tier proof lives in
 * `cli/__tests__/integration/serve-command.integration.test.ts`, alongside every other real
 * `tovu serve` behavior this repo certifies that way) — `createApp()` itself is the shared
 * chokepoint, and both spawn-tier and this composition-root-tier test exercise it identically.
 */

function createSpyObservabilityPort(): {
  port: ObservabilityPort;
  calls: Array<{ input: RequestTrackingInput; outcome: RequestTrackingOutcome }>;
} {
  const calls: Array<{ input: RequestTrackingInput; outcome: RequestTrackingOutcome }> = [];
  const port: ObservabilityPort = {
    trackRequest(input) {
      return {
        end(outcome) {
          calls.push({ input, outcome });
        },
      };
    },
  };
  return { port, calls };
}

test("createApp(createRouteDeps()) — the in-memory composition root src/index.ts's `useMemory` branch builds — records inbound requests through RouteDeps.observability", async (t) => {
  const { port: spy, calls } = createSpyObservabilityPort();
  const deps = createRouteDeps();
  deps.observability = spy;
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.method, "GET");
  assert.equal(calls[0].outcome.statusCode, 200);
});

test("createApp(createSqliteRouteDeps()) — the REAL SQLite composition root both src/index.ts's non-memory branch AND cli/commands/serve.ts's `tovu serve` build RouteDeps from — records inbound requests through RouteDeps.observability", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-observability-wiring-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const { port: spy, calls } = createSpyObservabilityPort();
  // No `uploadsDir`/`themesDir` overrides — mirrors `create-sqlite-route-deps-overrides.
  // integration.test.ts`'s own precedent (a fresh temp `dbPath`, default everything else).
  const deps = createSqliteRouteDeps(path.join(dir, "content.db"));
  // Mutate in place, not a spread copy — `routes/types.ts`'s `RouteDeps` doc (the "TEST GOTCHA"
  // note on `exportSiteBound`/`createSiteApp`) documents this as the general-safe override style
  // for this composition root's returned object; `observability` is a plain data field (not one of
  // the closure-bound fields that note is actually about), but mutating in place costs nothing and
  // keeps this test consistent with that documented convention rather than being a special case.
  deps.observability = spy;
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.method, "GET");
  assert.equal(calls[0].outcome.statusCode, 200);
});

test("createSqliteRouteDeps() defaults RouteDeps.observability to the no-op port (Constitution Article VIII coverage does not silently require an operator to configure OTEL_EXPORTER_OTLP_ENDPOINT just to boot) when OTEL_EXPORTER_OTLP_ENDPOINT is unset", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-observability-wiring-default-"));
  const originalEnv = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  try {
    const deps = createSqliteRouteDeps(path.join(dir, "content.db"));
    // Behavioral proof, not an identity/type check: the no-op port's own contract test
    // (`platform/observability/__tests__/unit/noop.unit.test.ts`) already proves repeated calls
    // return the SAME tracker instance — a property only the no-op adapter has (the OTel adapter
    // allocates one span per call). That is the observable difference this assertion checks for
    // without importing `createNoopObservabilityPort` and comparing by reference, which would
    // couple this integration test to `deps.ts`'s internal choice of factory function rather than
    // to the behavior that choice is supposed to produce.
    const first = deps.observability.trackRequest({ method: "GET", path: "/a" });
    const second = deps.observability.trackRequest({ method: "GET", path: "/b" });
    assert.equal(first, second, "the default (no exporter configured) port must be the no-op adapter's shared, allocation-free tracker");
  } finally {
    if (originalEnv === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
