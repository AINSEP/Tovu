import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../app";
import { bootAuthenticated } from "./helpers/http-test-server";
import type { RouteDeps } from "../routes/types";
import type { PublishCredentialSetRepoPort } from "../../features/deployments/publish-credentials/types";
import type { SourceControlCredentialSetRepoPort } from "../../features/source-control/types";

/**
 * @file Regression coverage for the "unguarded async Express handler" bug class — an async
 * `app.<verb>()` handler with no `try`/`catch` anywhere in its body. Express 4.22.2 (this repo's
 * version) does not catch an async handler's own rejection, so an unguarded handler that throws
 * never sends a response at all: the request just hangs until the CLIENT's own timeout, not a
 * fast 500. This was found and fixed once already in `publish-credentials.ts`'s `POST .../:id/
 * verify` (`650b92f6`); an AST scan over every `app.<verb>()` registration in
 * `src/server/routes/**` (`ADS-memory/reports/2026-08-16-server-routes-coverage-complexity-audit.md`,
 * re-derived independently for this pass) found 21 more occurrences of the same shape across 15
 * files. This file covers the 9 highest-severity ones fixed in this pass — credential CRUD
 * (decrypts/touches secrets) and the publish/export trigger+status routes (start a background
 * run) — see `ADS-memory/reports/2026-08-16-route-async-guards.md` for the full 21-handler list,
 * which ones remain open, and why.
 *
 * Every test below is written to assert the FIXED (current) behavior — a real error status,
 * never a hang. To prove RED before each fix, the corresponding `try`/`catch` was manually
 * removed from the route file and the affected test(s) re-run: with no `try`/`catch`, the same
 * assertions below fail because the bounded `fetch` itself throws/aborts on `AbortSignal.timeout`
 * before ever reaching `assert.equal(res.status, ...)` — never a fast 500. See the accompanying
 * report for the captured RED output.
 *
 * `AbortSignal.timeout(3000)` bounds every request in this file for the same reason
 * `publish-credentials-route.test.ts`'s own root-key-missing test documents: an unguarded async
 * handler that rejects with nothing calling `res.json()`/`res.status()` leaves the client hanging
 * with no response, not a quick error — a regression here must fail in seconds, never hang the
 * whole suite.
 */

const PUBLISH_CREDENTIALS_PATH = "system/publish/credentials";
const SOURCE_CONTROL_CREDENTIALS_PATH = "system/source-control/credentials";
const PUBLISH_PATH = "system/publish";
const EXPORT_PATH = "system/export";

/**
 * Wraps a real port implementation so specific methods throw a plain, UNTYPED `Error` instead of
 * doing their real work — stands in for a class of failure none of these routes' typed error
 * classes model (e.g. the repo/DB itself being unreachable), which is exactly the shape that used
 * to escape an unguarded handler. A `Proxy` over the real in-memory repo (rather than a
 * hand-rolled class implementing the full port) so every OTHER method keeps its real, working
 * behavior — only the named methods are broken, matching how a real partial outage would look
 * (e.g. reads fail, nothing else about the process is wrong).
 */
function withThrowingMethods<T extends object>(real: T, brokenMethodNames: readonly string[]): T {
  const broken = new Set(brokenMethodNames);
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && broken.has(prop)) {
        return async () => {
          throw new Error(`simulated repo failure in ${prop}`);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}

// ---------------------------------------------------------------------------------------------
// publish-credentials.ts — GET (list) and DELETE had NO try/catch at all (§2 of the audit).
// ---------------------------------------------------------------------------------------------

test("publish-credentials: GET responds 500 (not a hang) when the repo throws an untyped error", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  deps.publishCredentialSetRepo = withThrowingMethods(deps.publishCredentialSetRepo as PublishCredentialSetRepoPort, ["listByWorkspace"]);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_CREDENTIALS_PATH}`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("publish-credentials: DELETE responds 500 (not a hang) when the repo throws an untyped error", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  deps.publishCredentialSetRepo = withThrowingMethods(deps.publishCredentialSetRepo as PublishCredentialSetRepoPort, ["delete"]);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_CREDENTIALS_PATH}/some-id`, {
    method: "DELETE",
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

/**
 * Bonus fix beyond the scan's 21-handler list, same file: `sendStoreError` used to `throw err` for
 * any error outside its four typed classes — from INSIDE the caller's own `catch (err) {
 * sendStoreError(res, err); }` block, so the re-thrown error escaped that "guarded" handler too.
 * `POST` structurally has a `try`/`catch` (the AST scan's "guarded" bucket) but was just as exposed
 * as `GET`/`DELETE` for this one error shape. Proven here via `insert` (POST's own write call)
 * throwing an untyped error.
 */
test("publish-credentials: POST responds 500 (not a hang) when the store throws an error none of the four typed classes match", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  deps.publishCredentialSetRepo = withThrowingMethods(deps.publishCredentialSetRepo as PublishCredentialSetRepoPort, ["insert"]);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_CREDENTIALS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", connection: { providerId: "vercel", token: "t" } }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

// ---------------------------------------------------------------------------------------------
// source-control-credentials.ts — structurally identical to publish-credentials.ts; same gap.
// ---------------------------------------------------------------------------------------------

test("source-control-credentials: GET responds 500 (not a hang) when the repo throws an untyped error", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  deps.sourceControlCredentialSetRepo = withThrowingMethods(deps.sourceControlCredentialSetRepo as SourceControlCredentialSetRepoPort, [
    "listByWorkspace",
  ]);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${SOURCE_CONTROL_CREDENTIALS_PATH}`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("source-control-credentials: DELETE responds 500 (not a hang) when the repo throws an untyped error", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  deps.sourceControlCredentialSetRepo = withThrowingMethods(deps.sourceControlCredentialSetRepo as SourceControlCredentialSetRepoPort, ["delete"]);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${SOURCE_CONTROL_CREDENTIALS_PATH}/some-id`, {
    method: "DELETE",
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

// ---------------------------------------------------------------------------------------------
// publish-site.ts — all three handlers had NO try/catch. `deps.authorize` throwing stands in for
// any failure in the permission backend (e.g. its own DB read) — the one awaited call every one
// of these three handlers reaches before doing anything else. Deliberately triggered BEFORE the
// run-slot is ever touched (the auth check runs first in all three handlers), so these tests never
// start a real publish run and cannot disturb `static-publish/publish-run.ts`'s shared process-
// local slot that OTHER test files in this suite depend on being idle.
// ---------------------------------------------------------------------------------------------

function withThrowingAuthorize(deps: RouteDeps): RouteDeps {
  return { ...deps, authorize: async () => { throw new Error("simulated authorize backend failure"); } };
}

test("publish-site: POST (trigger) responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "netlify", projectName: "p" }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("publish-site: GET (status poll) responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("publish-site: GET .../preview responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=netlify`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

// ---------------------------------------------------------------------------------------------
// export-site.ts — same shape as publish-site.ts's trigger+status pair, same `deps.authorize`
// failure mode, triggered before `export-run.ts`'s own shared run slot is ever touched.
// ---------------------------------------------------------------------------------------------

test("export-site: POST (trigger) responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("export-site: GET (status poll) responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});
