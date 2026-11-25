import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import { registerAdminFsFilesCustomRootRoutes } from "../custom-root.js";
import { registerAdminFsFilesFolderPickerRoutes } from "../folder-picker.js";

/**
 * @file Uncaught-error dispatch on the custom-root GET/DELETE and folder-picker mounts (rv1124e FIX 4).
 * The hand-written routes ran under `asyncRoute`, so an error nothing caught reached Express's
 * `next(error)`: the app's error middleware chose the status (a 4xx `status` passed through),
 * redacted the body and set `res.locals.routeError`. These tests mount the real routes behind an
 * error middleware shaped like `captureRouteError` and pin that the middleware still sees the error.
 */

const WORKSPACE_ID = "ws";
const CUSTOM_ROOT = `/api/admin/v1/workspaces/${WORKSPACE_ID}/fs-files/custom-root`;
const PICKER = `/api/admin/v1/workspaces/${WORKSPACE_ID}/fs-files/folder-picker`;

type Observed = { error: unknown; locals: Response["locals"] }[];

/** An error middleware like `captureRouteError`: records the error on `res.locals.routeError`,
 *  passes a 4xx `status` through, redacts everything else to a fixed 500. */
function errorMiddleware(observed: Observed) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.locals.routeError = error;
    observed.push({ error, locals: res.locals });
    const status = (error as { status?: number }).status;
    const passthrough = typeof status === "number" && status >= 400 && status < 500;
    res.status(passthrough ? status : 500).json({ error: passthrough ? "client error" : "Something went wrong" });
  };
}

function appWith(register: (app: express.Express) => void, observed: Observed): express.Express {
  const app = express();
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "admin-1" };
    res.locals.authCredentialKind = "session";
    next();
  });
  register(app);
  app.use(errorMiddleware(observed));
  return app;
}

function failingStoreDeps(error: unknown) {
  return testSiteLayoutContext({
    workspaceId: WORKSPACE_ID,
    authorize: async () => { throw error; },
  });
}

const boom = () => Object.assign(new Error("secret /home/owner/path"), { code: "EBOOM" });
const clientError = () => Object.assign(new Error("bad input"), { status: 422 });

for (const [name, method] of [["GET", "GET"], ["DELETE", "DELETE"]] as const) {
  test(`custom-root ${name}: an uncaught error reaches next(error) with a redacted 500`, async (t) => {
    const observed: Observed = [];
    const error = boom();
    const app = appWith((a) => registerAdminFsFilesCustomRootRoutes({ app: a, deps: failingStoreDeps(error) }), observed);
    const res = await fetch(`${await startTestServer(app, t)}${CUSTOM_ROOT}`, { method });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.equal(text.includes("secret"), false);
    assert.equal(observed.length, 1);
    assert.equal(observed[0]?.error, error);
    assert.equal(observed[0]?.locals.routeError, error);
  });

  test(`custom-root ${name}: an uncaught error carrying a 4xx status keeps its status`, async (t) => {
    const observed: Observed = [];
    const error = clientError();
    const app = appWith((a) => registerAdminFsFilesCustomRootRoutes({ app: a, deps: failingStoreDeps(error) }), observed);
    const res = await fetch(`${await startTestServer(app, t)}${CUSTOM_ROOT}`, { method });
    assert.equal(res.status, 422);
    assert.equal(observed[0]?.error, error);
  });
}

function pickerDeps(overrides: { authorize?: () => Promise<never>; pick?: () => Promise<string | null> }) {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: overrides.authorize ?? (async () => ({ allowed: true, reason: "pin" })),
    localHost: true,
    folderPicker: { available: true, pick: overrides.pick ?? (async () => "/picked") },
  } as Parameters<typeof registerAdminFsFilesFolderPickerRoutes>[0]["deps"];
}

/** `fetch` cannot set `Host`, so the loopback test server's own origin is the same-origin the local-request check needs. */
const localHeaders = (baseUrl: string) => ({ origin: new URL(baseUrl).origin });

test("folder-picker: an uncaught authorize crash reaches next(error), not the generic 500 writer", async (t) => {
  const observed: Observed = [];
  const error = boom();
  const app = appWith((a) => registerAdminFsFilesFolderPickerRoutes({ app: a, deps: pickerDeps({ authorize: async () => { throw error; } }) }), observed);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PICKER}`, { method: "POST", headers: localHeaders(baseUrl) });
  assert.equal(res.status, 500);
  assert.equal((await res.text()).includes("secret"), false);
  assert.equal(observed[0]?.error, error);
  assert.equal(observed[0]?.locals.routeError, error);
});

test("folder-picker: an uncaught 4xx-status error keeps its status", async (t) => {
  const observed: Observed = [];
  const error = clientError();
  const app = appWith((a) => registerAdminFsFilesFolderPickerRoutes({ app: a, deps: pickerDeps({ authorize: async () => { throw error; } }) }), observed);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PICKER}`, { method: "POST", headers: localHeaders(baseUrl) });
  assert.equal(res.status, 422);
  assert.equal(observed[0]?.error, error);
});

test("folder-picker: the chooser's own failure stays the handler-local redacted picker-failed 500 (middleware not reached)", async (t) => {
  const observed: Observed = [];
  const app = appWith((a) => registerAdminFsFilesFolderPickerRoutes({ app: a, deps: pickerDeps({ pick: async () => { throw boom(); } }) }), observed);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PICKER}`, { method: "POST", headers: localHeaders(baseUrl) });
  assert.equal(res.status, 500);
  assert.equal((await res.text()).includes("secret"), false);
  assert.equal(observed.length, 0);
});
