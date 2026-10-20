import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSurfaceFilesRoute } from "../files.js";

test("T6: per-IP limiting precedes contribution loads, covers unknown paths, and resets with the existing window", async (t) => {
  let now = 0;
  let loads = 0;
  const clock = { nowMs: () => now };
  const app = express();
  registerAdminSurfaceFilesRoute(app, {
    workspaceId: "ws-1", clock,
    agentPluginLifecycle: {
      loadPluginContributions: async () => { loads += 1; return { items: [], refusals: [] }; },
      readTrustedPluginFile: async () => { throw new Error("unknown surfaces must not reach disk"); },
    },
  }, { limiter: createRateLimiter({ clock, profile: { windowSeconds: 60, max: 2, burst: 0 } }) });
  const origin = await startTestServer(app, t);
  const path = `${origin}/api/agent-plugin-surfaces/v1/unknown/settings/index.html`;
  assert.equal((await fetch(path)).status, 404);
  assert.equal((await fetch(path)).status, 404);
  assert.equal(loads, 2);
  const limited = await fetch(path, { headers: { "x-forwarded-for": "spoofed-client" } });
  assert.equal(limited.status, 429, "untrusted forwarded IP cannot bypass the limiter");
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(limited.headers.get("cache-control"), "no-store");
  assert.equal(loads, 2, "denied calls do not scan plugins");
  now = 60_000;
  assert.equal((await fetch(path)).status, 404);
  assert.equal(loads, 3);
});

test("T6: a failed limiter cannot fall through to a contribution load", async (t) => {
  const app = express();
  let loads = 0;
  registerAdminSurfaceFilesRoute(app, {
    workspaceId: "ws-1", clock: { nowMs: () => 0 },
    agentPluginLifecycle: {
      loadPluginContributions: async () => { loads += 1; return { items: [], refusals: [] }; },
      readTrustedPluginFile: async () => "unused",
    },
  }, { limiter: { check: async () => { throw new Error("counter storage unavailable"); } } });
  const origin = await startTestServer(app, t);
  assert.equal((await fetch(`${origin}/api/agent-plugin-surfaces/v1/unknown/settings/index.html`)).status, 404);
  assert.equal(loads, 0);
});
