import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app";
import { setReadinessSnapshot } from "../../readiness-state";
import { startTestServer } from "../helpers/http-test-server";
import type { BootResult } from "../../boot-lifecycle";

/**
 * @file SPEC-030 (ADR-046 Phase 2) — `/healthz` and `/readyz` route coverage.
 *
 * These share one process-local readiness-state singleton across the whole test run (see
 * `readiness-state.ts`), so each test explicitly sets the snapshot it needs rather than relying
 * on import-time defaults — that keeps the tests order-independent regardless of what other test
 * files in this same process may have already set.
 */

test("/healthz always 200s regardless of readiness state", async (t) => {
  setReadinessSnapshot({ ok: false, modules: [{ name: "settings", owner: "x", criticality: "critical", lifecycle: { status: "failed", reasonCode: "boom", remediationHint: "fix it" } }] });
  const app = createApp(createRouteDeps());
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("/readyz 200s when the readiness snapshot has no critical failures", async (t) => {
  const okResult: BootResult = { ok: true, modules: [{ name: "settings", owner: "x", criticality: "critical", lifecycle: { status: "ready" } }] };
  setReadinessSnapshot(okResult);
  const app = createApp(createRouteDeps());
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/readyz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ready: true });
});

test("/readyz 503s with only critical failures named, when the readiness snapshot has one", async (t) => {
  const failResult: BootResult = {
    ok: false,
    modules: [
      { name: "settings", owner: "features/settings", criticality: "critical", lifecycle: { status: "failed", reasonCode: "seed failed", remediationHint: "should not leak" } },
      { name: "newsletter", owner: "newsletter", criticality: "optional", lifecycle: { status: "failed", reasonCode: "optional failure — must not appear", remediationHint: "n/a" } },
    ],
  };
  setReadinessSnapshot(failResult);
  const app = createApp(createRouteDeps());
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/readyz`);
  assert.equal(res.status, 503);
  const body = (await res.json()) as { ready: boolean; failures: Array<{ name: string; reasonCode: string }> };
  assert.equal(body.ready, false);
  assert.deepEqual(body.failures, [{ name: "settings", reasonCode: "seed failed" }]);
  assert.equal(JSON.stringify(body).includes("should not leak"), false, "remediationHint must not leak through /readyz");
  assert.equal(JSON.stringify(body).includes("optional failure"), false, "optional-module failures must not appear in /readyz's failures list");
});

test("/readyz defaults to 200 when no snapshot was ever set (hermetic test app)", async (t) => {
  setReadinessSnapshot({ ok: true, modules: [] }); // restore the documented default explicitly (see file header)
  const app = createApp(createRouteDeps());
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/readyz`);
  assert.equal(res.status, 200);
});
