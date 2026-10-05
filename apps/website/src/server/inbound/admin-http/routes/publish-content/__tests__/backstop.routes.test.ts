import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerPublishBackstopRoutes } from "../backstop.js";
import type { PublishContentRouteDeps } from "../deps.js";
import { registerAdminPolicyWritePermissionRoute } from "../../users/write-policy-permission.js";
import type { UsersRouteDeps } from "../../users/deps.js";
import { isKnownPermission } from "@jini-ai/user-management";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";

// Composition registers publish.backstop in the library catalog (no longer an import side effect).
createAppPermissionGrants({});

test("the catalog lists publish.backstop, but role.manage cannot grant it", async (t) => {
  assert.equal(isKnownPermission({ id: "publish.backstop" }), true);
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminPolicyWritePermissionRoute(app, { workspaceId: "ws" } as UsersRouteDeps);
  const server = await startTestServer(app, t);
  const response = await fetch(`${server}/api/admin/v1/workspaces/ws/policies/custom/permissions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ permission: "publish.backstop" }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Manual publishing is reserved for the owner and built-in admins; it cannot be granted to another role.", code: "FORBIDDEN" });
});

test("an editor gets exact 403 before any send or audit read", async (t) => {
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "editor" }; res.locals.authCredentialKind = "session"; next(); });
  registerPublishBackstopRoutes(app, { workspaceId: "ws", authorize: async () => ({ allowed: false, reason: "editor" }) } as unknown as PublishContentRouteDeps);
  const server = await startTestServer(app, t);
  const response = await fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/backstop`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Only the owner and built-in admins can send items by hand.", code: "FORBIDDEN" });
});

test("machine credentials cannot send or undo even with an owner principal", async (t) => {
  let authorizationCalls = 0;
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    res.locals.principal = { id: "owner" };
    res.locals.authCredentialKind = req.get("x-test-credential-kind");
    next();
  });
  registerPublishBackstopRoutes(app, { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => { authorizationCalls++; return { allowed: true, reason: "owner" }; },
  } as unknown as PublishContentRouteDeps);
  const server = await startTestServer(app, t);
  for (const kind of ["api_key", "publish_key"]) {
    for (const suffix of ["backstop", "runs/run/undo-backstop"]) {
      const response = await fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/${suffix}`, {
        method: "POST", headers: { "content-type": "application/json", "x-test-credential-kind": kind }, body: "{}",
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "Only the owner and built-in admins can send items by hand.", code: "FORBIDDEN",
        details: { permission: "publish.backstop", reason: "credential_kind_not_permitted" },
      });
    }
  }
  assert.equal(authorizationCalls, 0);
});

test("wrong typed address gets exact 400 before dialing the destination", async (t) => {
  let called = false;
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerPublishBackstopRoutes(app, { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"), authorize: async () => ({ allowed: true, reason: "owner" }),
    publishContentPeerRepo: { findById: async () => ({ id: "peer", baseUrl: "https://live.example" }) },
    publishContentPeerHttpClient: { send: async () => { called = true; throw new Error("must not dial"); } },
  } as unknown as PublishContentRouteDeps);
  const server = await startTestServer(app, t);
  const response = await fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/backstop`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ peerId: "peer", action: "plan", reason: "Emergency footer fix", typedHost: "wrong.example", rows: [{ table: "p_widgets", pk: { id: "x" } }] }) });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Type live.example to confirm where this send will go.", code: "VALIDATION_ERROR" });
  assert.equal(called, false);
});
