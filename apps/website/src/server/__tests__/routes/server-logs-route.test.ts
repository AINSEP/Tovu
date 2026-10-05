import assert from "node:assert/strict";
import test from "node:test";

import { getServerLogBuffer } from "#src/platform/server-logs/index";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file `GET /api/admin/v1/workspaces/:workspaceId/system/server-logs` (gap A-04), through the real
 * composition root. Lines are appended to the real process buffer (the same one boot's console tee
 * writes to); the hermetic root never installs the tee, so `capturing` is false here.
 */

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-server-logs";
  await deps.principalRepo.save({ id: bareId, workspaceId: deps.workspaceId, kind: "user", displayName: "No Grants", status: "active", createdAt: deps.clock.nowIso() });
  await deps.userRepo.save({ principalId: bareId, workspaceId: deps.workspaceId, username: "bare-server-logs", passwordHash: await deps.passwordHasher.hash({ password: "bare-pw" }) });
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-server-logs", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const marker = `server-logs-route-${process.pid}`;

test("server-logs: an unauthorized principal (no grants) gets 403", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/server-logs`, { headers: { cookie } });
  assert.equal(res.status, 403);
});

test("server-logs: the owner gets filtered, redacted lines", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const fakeKey = "ghp_" + "a1".repeat(18);
  getServerLogBuffer().append({ level: "info", source: "server", message: `${marker} started` });
  getServerLogBuffer().append({ level: "error", source: "server", message: `${marker} provider failed with ${fakeKey}` });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/server-logs?level=error&contains=${marker}&limit=10`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json() as { entries: Array<{ level: string; source: string; message: string }>; matched: number; capturing: boolean };
  assert.deepEqual(body.entries.map(e => [e.level, e.source, e.message]), [["error", "server", `${marker} provider failed with [REDACTED:credential]`]]);
  assert.equal(body.matched, 1);
  assert.equal(body.capturing, false);
});

test("server-logs: an unusable filter is a 400 naming the field", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/server-logs?level=fatal`, { headers: { cookie } });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "level must be one of debug, info, warn, error", code: "VALIDATION_ERROR" });
});

test("server-logs: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/server-logs`, { headers: { cookie } });
  assert.equal(res.status, 404);
});
