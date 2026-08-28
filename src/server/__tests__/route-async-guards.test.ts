import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";
import type { RouteDeps } from "../routes/types.js";
import type { PublishCredentialSetRepoPort } from "../../features/deployments/publish-credentials/index.js";
import type { SourceControlCredentialSetRepoPort } from "../../features/source-control/types.js";
import type { CommentIngressPolicy, CommentWriteService } from "#src/features/comments/index";
import { registerPaymentsWebhookRoute } from "../routes/site/payments-webhook.js";
import type { LipayApi } from "#src/features/plugins/lipay/lipay-plugin";

/**
 * @file Regression coverage for the "unguarded async Express handler" bug class — an async
 * `app.<verb>()` handler with no `try`/`catch` anywhere in its body. Express 4.22.2 (this repo's
 * version) does not catch an async handler's own rejection, so an unguarded handler that throws
 * never sends a response at all: the request just hangs until the CLIENT's own timeout, not a
 * fast 500. This was found and fixed once already in `publish-credentials.ts`'s `POST .../:id/
 * verify` (`650b92f6`); an AST scan over every `app.<verb>()` registration in
 * `src/server/routes/**` (`ADS-memory/reports/2026-08-16-server-routes-coverage-complexity-audit.md`,
 * re-derived independently for this pass) found 21 more occurrences of the same shape across 15
 * files. This file covers all 21, fixed across four commits in severity order — credential CRUD
 * (decrypts/touches secrets), the publish/export trigger+status routes (start a background run),
 * dockerfile-source/comments-moderate/payments-webhook, then the remaining plain reads plus the
 * one public route (`comments-submit.ts`) — see `ADS-memory/reports/2026-08-16-route-async-guards.md`
 * for the full list and how each was derived and ranked.
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

// ---------------------------------------------------------------------------------------------
// dockerfile-source.ts — both GET and PUT had no try/catch. Same `deps.authorize`-throws probe as
// publish-site.ts/export-site.ts above; PUT never reaches the real filesystem write in this test
// since the throw happens at the authorize step, before the `If-Match` check or the write call.
// ---------------------------------------------------------------------------------------------

test("dockerfile-source: GET responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("dockerfile-source: PUT responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "if-match": '"anything"' },
    body: JSON.stringify({ contents: "FROM node:20" }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

// ---------------------------------------------------------------------------------------------
// comments/moderate.ts — the shared loop registrar (approve/spam/trash/restore, all 4 routes
// registered from the SAME source line, which is why the AST scan's 21-handler count lists this
// file once for that line) and the standalone purge route both had no try/catch. Probed via
// `deps.commentWriteService` throwing — the one awaited call each handler reaches after auth.
// ---------------------------------------------------------------------------------------------

function withThrowingCommentWriteService(deps: RouteDeps): RouteDeps {
  const broken: CommentWriteService = {
    applyModeration: async () => {
      throw new Error("simulated comment write-service failure");
    },
    purge: async () => {
      throw new Error("simulated comment write-service failure");
    },
  };
  return { ...deps, commentWriteService: broken };
}

test("comments/moderate: POST .../approve (the shared loop registrar) responds 500 (not a hang) when commentWriteService.applyModeration throws", async (t) => {
  const deps = withThrowingCommentWriteService(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/some-comment-id/approve`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 0 }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("comments/moderate: POST .../purge responds 500 (not a hang) when commentWriteService.purge throws", async (t) => {
  const deps = withThrowingCommentWriteService(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/some-comment-id/purge`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

// ---------------------------------------------------------------------------------------------
// site/payments-webhook.ts — the one handler had no try/catch. Built as a standalone Express app
// around `registerPaymentsWebhookRoute` directly (not the full `createApp()`): this route's real
// composition path resolves a real, DB-backed lipay instance at request time, and this repo's
// hermetic `createRouteDeps()` fixture has no lipay activated at all (always `resolveLipay() =>
// null`, per this route file's own header) — that would only ever exercise the 503
// PAYMENTS_UNAVAILABLE branch, never reach the code this test targets. `resolveLipay` is exactly
// the seam the route itself defines for this; a minimal fake exercises it directly.
// ---------------------------------------------------------------------------------------------

test("payments-webhook: POST responds 500 (not a hang) when lipay.handleWebhook throws", async (t) => {
  const brokenLipay = {
    handleWebhook: async () => {
      throw new Error("simulated lipay failure");
    },
  } as unknown as LipayApi;

  const app = express();
  registerPaymentsWebhookRoute(app, { resolveLipay: () => brokenLipay });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/payments/webhook/lipay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "test.event" }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

// ---------------------------------------------------------------------------------------------
// Final batch — the remaining 7 of the 21 unguarded handlers found by the AST scan, all plain
// GET reads gated only by `deps.authorize` (probed the same way as publish-site.ts/export-site.ts
// above) except `comments-submit.ts`, the one PUBLIC unauthenticated route in the whole 21-handler
// list — probed instead via `deps.commentIngressPolicy` throwing, the one awaited call it reaches.
// ---------------------------------------------------------------------------------------------

test("analytics/recent-hits: GET responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/analytics/recent-hits`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("comments/moderation-queue: GET responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/queue`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("commerce/status: GET responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/commerce/status`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("deployments/list: GET responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/deployments`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("system/deployment-overview: GET responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/deployment-overview`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("system/module-status: GET responds 500 (not a hang) when deps.authorize throws", async (t) => {
  const deps = withThrowingAuthorize(createRouteDeps());
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/module-status`, {
    headers: { cookie },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});

test("site/comments-submit: POST responds 500 (not a hang) when commentIngressPolicy.submit throws — the one PUBLIC route in this file", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const brokenIngressPolicy: CommentIngressPolicy = {
    submit: async () => {
      throw new Error("simulated ingress-policy failure");
    },
  };
  deps.commentIngressPolicy = brokenIngressPolicy;
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  // No cookie at all — this route is deliberately unauthenticated (this file's own header).
  const res = await fetch(`${baseUrl}/api/site/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entryId: "some-entry", authorName: "Visitor", body: "hello" }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});
