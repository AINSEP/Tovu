import assert from "node:assert/strict";
import test from "node:test";
import type { RouteHostContext } from "@jini-ai/core/contracts/server";
import { defineRawRoute } from "@jini-ai/http-kit";

import { mountAdminRawRoute, mountPublicRawRoute } from "../admin-raw-route-ports.js";
import { fakeAdminApp, listen } from "./fixtures/port-harness.js";

/**
 * rv1123l T5: a raw spec with `requireSameOrigin: true` needs the host's origin context. The Tovu
 * wrappers forward the host-supplied one to http-kit, and refuse at registration a guarded mount
 * without it — never a per-request 500 after the workspace/session gates have run.
 */
type Deps = { workspaceId: string; authorize: (input: unknown) => Promise<{ allowed: boolean; reason: string }> };
const SITE = "http://site.test";
const origin: RouteHostContext = { originPolicy: { isSameOrigin: ({ req }) => req.headers.origin === undefined || req.headers.origin === SITE } };
const visitor = { operation: "probe:public-raw-origin", visitorError: "The site couldn’t load the probe." };

function guardedSpec(path: string, calls: string[]) {
  return defineRawRoute<Deps, { id: string }>({
    method: "post", path,
    handle: async () => { calls.push(path); return new Response("ok", { status: 200 }); },
  }, { requireSameOrigin: true });
}

async function guardedServers() {
  const calls: string[] = [];
  const app = fakeAdminApp();
  const deps: Deps = { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) };
  mountAdminRawRoute({ app, spec: guardedSpec("/api/admin/v1/workspaces/:workspaceId/guarded", calls) as never, deps, origin });
  mountPublicRawRoute({ app, spec: guardedSpec("/public/guarded", calls) as never, deps, failure: visitor, origin });
  const server = await listen({ app });
  const post = (path: string, from?: string) => fetch(`${server.base}${path}`, { method: "POST", headers: from === undefined ? {} : { origin: from } });
  return { ...server, post, calls };
}

test("a guarded raw mount without an origin context is refused at registration (admin and public)", () => {
  const deps: Deps = { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) };
  assert.throws(() => mountAdminRawRoute({ app: fakeAdminApp(), spec: guardedSpec("/api/admin/v1/workspaces/:workspaceId/guarded", []) as never, deps }), /requireSameOrigin.*origin context/);
  assert.throws(() => mountPublicRawRoute({ app: fakeAdminApp(), spec: guardedSpec("/public/guarded", []) as never, deps, failure: visitor }), /requireSameOrigin.*origin context/);
});

test("the wrappers forward the host origin context: same-origin reaches the handler, cross-origin is a 403", async (t) => {
  const s = await guardedServers();
  t.after(s.close);
  for (const path of ["/api/admin/v1/workspaces/local/guarded", "/public/guarded"]) {
    const same = await s.post(path, SITE);
    assert.deepEqual({ status: same.status, body: await same.text() }, { status: 200, body: "ok" }, path);
    const cross = await s.post(path, "http://evil.test");
    assert.equal(cross.status, 403, path);
    await cross.body?.cancel();
  }
  assert.deepEqual(s.calls, ["/api/admin/v1/workspaces/:workspaceId/guarded", "/public/guarded"]);
});
