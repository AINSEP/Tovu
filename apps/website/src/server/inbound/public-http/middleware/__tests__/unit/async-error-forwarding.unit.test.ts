import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { requirePublishTrust } from "#src/server/inbound/admin-http/publish-trust-auth";
import { mintPublishSession } from "#src/features/publish-trust/session";
import { applySiteServingGate } from "../../site-serving-gate.js";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";

/** n09: Express 4 middleware must forward rejected dependencies to its error pipeline. */
test("serving gate forwards a rejected status read exactly once without rejecting its middleware promise", async () => {
  const failure = new Error("database is locked");
  const app = express();
  applySiteServingGate(app, {
    workspaceId: "ws-error",
    siteStatusRepo: { get: async () => { throw failure; }, set: async () => undefined },
  });
  const middleware = app._router.stack.at(-1).handle as RequestHandler;
  const errors: unknown[] = [];
  const response = {} as Response;

  await assert.doesNotReject(async () => {
    await middleware({ path: "/some-page" } as Request, response, ((error) => errors.push(error)) as NextFunction);
  });
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(response, {});
});

test("serving gate completes a rejected status request with 500 through Express's error handler", async () => {
  const failure = new Error("database is locked");
  const app = express();
  applySiteServingGate(app, {
    workspaceId: "ws-error",
    siteStatusRepo: { get: async () => { throw failure; }, set: async () => undefined },
  });
  app.use((_req, res) => res.status(200).json({ reached: true }));
  const errors: unknown[] = [];
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    errors.push(error);
    res.status(500).json({ error: "internal error" });
  });

  assert.deepEqual(await dispatchJsonRequest(app, "GET", "/some-page"), {
    status: 500, body: { error: "internal error" },
  });
  assert.deepEqual(errors, [failure]);
});

test("admin session forwards failed identity initialization instead of dropping its rejected promise", async () => {
  const failure = new Error("identity database unavailable");
  const identityReady = Promise.reject(failure);
  const deps = { identityReady } as unknown as Parameters<typeof requireAdminSession>[0];
  const response = { locals: {} } as Response;
  const errors: unknown[] = [];

  await assert.doesNotReject(async () => {
    await requireAdminSession(deps)(
      { headers: { authorization: "Bearer fixture-key" } } as Request,
      response,
      ((error) => errors.push(error)) as NextFunction
    );
  });
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(response.locals, {});
});

for (const failingSource of ["grants", "revocations"] as const) {
  test(`publishing gate refuses a failed ${failingSource} read without hanging or authenticating`, async () => {
    const keyring = { derive: async () => new Uint8Array(32) } as never;
    const clock = { nowIso: () => "2026-10-01T00:00:00.000Z" };
    const { token } = await mintPublishSession(
      { keyring, clock, workspaceId: "ws-error" },
      { sourceInstallationId: "source", targetInstallationId: "target", capabilities: ["publish_content.read"], generation: 1 }
    );
    const failure = new Error("publishing store unavailable");
    const middleware = requirePublishTrust({
      keyring, clock, workspaceId: "ws-error", targetInstallationId: Promise.resolve("target"),
      grants: async () => {
        if (failingSource === "grants") throw failure;
        throw new Error("grants must not be read after revocation failure");
      },
      revocations: async () => {
        if (failingSource === "revocations") throw failure;
        return { ok: true, revocations: [] };
      },
    });
    const result: { status?: number; body?: unknown } = {};
    const response = {
      locals: {},
      status: (status: number) => { result.status = status; return response; },
      json: (body: unknown) => { result.body = body; return response; },
    } as unknown as Response;
    const nextCalls: unknown[] = [];
    await assert.doesNotReject(() => middleware(
      { method: "GET", originalUrl: "/api/admin/v1/workspaces/ws-error/publish-content/export", headers: { authorization: `Bearer ${token}` } } as Request,
      response,
      ((error) => nextCalls.push(error)) as NextFunction
    ));
    assert.deepEqual(result, { status: 401, body: { error: "unauthenticated", code: "UNAUTHENTICATED" } });
    assert.deepEqual(nextCalls, []);
    assert.deepEqual(response.locals, {});
  });
}
