import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/**
 * @file The request-shape and unknown-bundle answers of the publish-content import ceremony
 * (`import/plan`, `import/confirm`, `import/execute`). `publish-content-import-routes.test.ts`
 * covers the happy path, staleness, replay and authz; nothing asserted what a caller gets for a
 * missing required field or a bundle id this site never staged — so the `BUNDLE_NOT_FOUND` mapping
 * collapsing into a 500, or a dropped `typeof` guard letting `undefined` reach the gateway, shipped
 * green.
 */

const WORKSPACE = "workspace-local";
const IMPORT = `/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import`;

async function post(baseUrl: string, cookie: string, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  return { status: res.status, body: JSON.parse(raw) as unknown };
}

test("import/plan: a missing or non-string bundleId is 400 VALIDATION_ERROR with the exact text", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(createRouteDeps()), t);
  for (const body of [{}, { bundleId: 42 }, { bundleId: null }]) {
    const res = await post(baseUrl, cookie, `${IMPORT}/plan`, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { error: "'bundleId' (string) is required", code: "VALIDATION_ERROR" });
  }
});

test("import/plan: a bundle id this site never staged is 404 BUNDLE_NOT_FOUND, not a 500", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(createRouteDeps()), t);
  const res = await post(baseUrl, cookie, `${IMPORT}/plan`, { bundleId: "bundle-that-was-never-staged" });
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal((res.body as { code: string }).code, "BUNDLE_NOT_FOUND");
});

test("import/confirm: planId and planHash are both required strings", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(createRouteDeps()), t);
  for (const body of [{}, { planId: "p" }, { planHash: "h" }, { planId: "p", planHash: 7 }]) {
    const res = await post(baseUrl, cookie, `${IMPORT}/confirm`, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
  }
});

test("import/execute: bundleId and confirmationToken are both required strings", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(createRouteDeps()), t);
  for (const body of [{}, { bundleId: "b" }, { confirmationToken: "c" }, { bundleId: 1, confirmationToken: "c" }]) {
    const res = await post(baseUrl, cookie, `${IMPORT}/execute`, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { error: "'bundleId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" });
  }
});

test("import routes: a workspace id that is not this site's is 404 on plan, confirm, execute and run status", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(createRouteDeps()), t);
  const other = "/api/admin/v1/workspaces/other-workspace/publish-content";
  assert.equal((await post(baseUrl, cookie, `${other}/import/plan`, { bundleId: "b" })).status, 404);
  assert.equal((await post(baseUrl, cookie, `${other}/import/confirm`, { planId: "p", planHash: "h" })).status, 404);
  assert.equal((await post(baseUrl, cookie, `${other}/import/execute`, { bundleId: "b", confirmationToken: "c" })).status, 404);
  assert.equal((await fetch(`${baseUrl}${other}/runs/run-1`, { headers: { cookie } })).status, 404);
});
