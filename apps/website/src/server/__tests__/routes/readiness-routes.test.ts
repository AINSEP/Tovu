import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure, setReadinessSnapshot } from "../../runtime/lifecycle/readiness-state.js";
import { startTestServer } from "../helpers/http-test-server.js";
import type { BootResult } from "../../runtime/lifecycle/boot-lifecycle.js";

/**
 * @file SPEC-030 (ADR-046 Phase 2) — `/healthz` and `/readyz` route coverage.
 *
 * These share one process-local readiness-state singleton across the whole test run (see
 * `readiness-state.ts`), so the default case runs first in this fresh node:test file process, before any setter.
 * Other cases explicitly set the snapshot they need.
 */

test("/readyz defaults to 200 when no snapshot was ever set (hermetic test app)", async (t) => {
  const app = createApp(createRouteDeps());
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/readyz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ready: true });
});

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



test("/readyz stays 200 (ready:true) when the agent daemon is known-failed, but names it as a plain boolean — degraded-boot defect fix", async (t) => {
  setReadinessSnapshot({ ok: true, modules: [] });
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");
  t.after(() => clearAssistantDaemonFailure());
  const app = createApp(createRouteDeps());
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/readyz`);

  assert.equal(res.status, 200, "an optional daemon failure must not make the rest of the app read as not-ready");
  assert.deepEqual(await res.json(), { ready: true, assistantDaemonKnownFailed: true });
});

test("/readyz omits assistantDaemonKnownFailed entirely when nothing has latched — no new key for existing consumers to ignore", async (t) => {
  setReadinessSnapshot({ ok: true, modules: [] });
  const app = createApp(createRouteDeps());
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/readyz`);

  assert.deepEqual(await res.json(), { ready: true });
});


// `runBootLifecycle` computes `ok` as "every critical module ready", so an optional-only failure
// boots with `ok: true` — `{ ok: false }` with no critical failure is not a state boot can produce.
test("/readyz remains ready when only optional modules failed", async (t) => {
  setReadinessSnapshot({ ok: true, modules: [{ name: "newsletter", owner: "newsletter", criticality: "optional", lifecycle: { status: "failed", reasonCode: "optional failure", remediationHint: "n/a" } }] });
  const baseUrl = await startTestServer(createApp(createRouteDeps()), t);
  const res = await fetch(`${baseUrl}/readyz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ready: true });
});
