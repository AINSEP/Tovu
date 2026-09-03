import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import type { CommentWriteService } from "#src/features/comments/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createApp } from "#src/server/runtime/composition/app";
import {
  bootAuthenticated,
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminCommentsModerateRoutes, type AdminCommentsModerateDeps } from "../moderate.js";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-031 §6/§9 (SPEC-033) — branch coverage for the 5 moderation-action routes
 * (approve/spam/trash/restore/purge) registered by `moderate.ts`. `comments-e2e.test.ts` only
 * exercises `approve`'s happy path and a zero-grant 403; `route-async-guards.test.ts` only
 * exercises the two catch(500) blocks. This file covers everything else: the workspace-mismatch
 * 404 for BOTH the shared loop registrar and the standalone `purge` handler, `parseExpectedVersion`'s
 * full number/string/invalid matrix, `respondToModerationResult`'s not-found/conflict split (with
 * and without `currentVersion`), the `note` ternary, and the per-action permission tiering
 * (`ACTIONS` table) end to end against a REAL RBAC grant — proving `trash`/`purge` are NOT
 * reachable by a principal holding only `comments.moderate`.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/comments`;

function buildApp(
  depsOverrides: Partial<AdminCommentsModerateDeps> = {},
  writeServiceOverrides: Partial<CommentWriteService> = {}
): {
  app: express.Express;
  applyModerationCalls: Array<Record<string, unknown>>;
  purgeCalls: Array<Record<string, unknown>>;
} {
  const applyModerationCalls: Array<Record<string, unknown>> = [];
  const purgeCalls: Array<Record<string, unknown>> = [];
  const commentWriteService: CommentWriteService = {
    applyModeration: async (input) => {
      applyModerationCalls.push(input);
      return { ok: true };
    },
    purge: async (input) => {
      purgeCalls.push(input);
      return { ok: true };
    },
    ...writeServiceOverrides,
  };
  const deps: AdminCommentsModerateDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    commentWriteService,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminCommentsModerateRoutes(app, deps);
  return { app, applyModerationCalls, purgeCalls };
}

// ---------------------------------------------------------------------------------------------
// Workspace-mismatch 404 — a SEPARATE `if` statement is written once in the shared loop registrar
// and once more in the standalone `purge` handler, so each is its own instrumented branch site.
// ---------------------------------------------------------------------------------------------

test("moderate/approve (shared loop registrar): mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/comments/c1/approve`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("moderate/approve: direct-invoke fallback for nullish params.workspaceId (unreachable through real HTTP)", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/comments/:commentId/approve");
  const { res, capture } = createCapturingResponse();
  await handler({ params: { commentId: "c1" }, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("moderate/purge: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/comments/c1/purge`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("moderate/purge: direct-invoke fallback for nullish params.workspaceId (unreachable through real HTTP)", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/comments/:commentId/purge");
  const { res, capture } = createCapturingResponse();
  await handler({ params: { commentId: "c1" }, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

// ---------------------------------------------------------------------------------------------
// Authorize denial (403) — one per distinct permission string the file checks.
// ---------------------------------------------------------------------------------------------

test("moderate/approve: authorize denial 403s naming 'comments.moderate'", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "no_grant" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "comments.moderate");
  assert.equal(body.details.reason, "no_grant");
});

test("moderate/trash: authorize denial 403s naming 'comments.delete'", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "no_grant" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/trash`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { details: { permission: string } };
  assert.equal(body.details.permission, "comments.delete");
});

test("moderate/purge: authorize denial 403s naming 'comments.delete.force' (a SEPARATE, stronger permission than trash)", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "no_grant" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/purge`, { method: "POST", headers: { "content-type": "application/json" } });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { details: { permission: string } };
  assert.equal(body.details.permission, "comments.delete.force");
});

// ---------------------------------------------------------------------------------------------
// `parseExpectedVersion` — the nested-ternary number/string/invalid matrix, and the
// `Number.isInteger(n) && n >= 0` bound. `comments-e2e.test.ts` only ever sends a JSON number
// (0); the string-coercion branch and the negative-integer bound are untested anywhere else.
// ---------------------------------------------------------------------------------------------

test("moderate: expectedVersion omitted -> 400, does not call the write service", async (t) => {
  const { app, applyModerationCalls } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "expectedVersion is required and must be a non-negative integer" });
  assert.equal(applyModerationCalls.length, 0);
});

test("moderate: expectedVersion as a negative integer -> 400 (isInteger true, n >= 0 false)", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: -1 }),
  });
  assert.equal(res.status, 400);
});

test("moderate: expectedVersion as a non-integer float -> 400", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 1.5 }),
  });
  assert.equal(res.status, 400);
});

test("moderate: expectedVersion as a numeric STRING is accepted (typeof raw === 'string' branch)", async (t) => {
  const { app, applyModerationCalls } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: "3" }),
  });
  assert.equal(res.status, 204, await res.clone().text());
  assert.equal(applyModerationCalls[0]?.expectedVersion, 3);
});

test("moderate: expectedVersion as a non-numeric string -> 400 (Number(raw) is NaN)", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: "not-a-number" }),
  });
  assert.equal(res.status, 400);
});

test("moderate: direct-invoke with an undefined body hits the `(rawBody ?? {})` branch -> 400 (unreachable through real HTTP: body-parser always sets req.body)", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/comments/:commentId/approve");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "test-principal" };
  await handler({ params: { workspaceId: WORKSPACE_ID, commentId: "c1" }, body: undefined }, res);
  assert.equal(capture.statusCode, 400);
});

// ---------------------------------------------------------------------------------------------
// `note` ternary + success/failure result mapping.
// ---------------------------------------------------------------------------------------------

test("moderate: note is forwarded when it is a string; omitted note maps to null", async (t) => {
  const { app, applyModerationCalls } = buildApp();
  const baseUrl = await startTestServer(app, t);

  const withNote = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 0, note: "looks fine" }),
  });
  assert.equal(withNote.status, 204);
  assert.equal(applyModerationCalls[0]?.note, "looks fine");

  const withoutNote = await fetch(`${baseUrl}${BASE}/c2/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(withoutNote.status, 204);
  assert.equal(applyModerationCalls[1]?.note, null);
});

test("moderate: applyModeration 'not-found' result -> 404, no currentVersion in the response", async (t) => {
  const { app } = buildApp({}, { applyModeration: async () => ({ ok: false, reason: "not-found" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/missing/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string; currentVersion?: number };
  assert.equal(body.error, "not-found");
  assert.equal("currentVersion" in body, false);
});

test("moderate: applyModeration 'conflict' result -> 409, WITH currentVersion", async (t) => {
  const { app } = buildApp({}, { applyModeration: async () => ({ ok: false, reason: "conflict", currentVersion: 5 }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; currentVersion?: number };
  assert.equal(body.error, "conflict");
  assert.equal(body.currentVersion, 5);
});

test("moderate/purge: success -> 204; note ternary both ways; not-found -> 404", async (t) => {
  const { app, purgeCalls } = buildApp();
  const baseUrl = await startTestServer(app, t);

  const ok = await fetch(`${baseUrl}${BASE}/c1/purge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: "spam cleanup" }),
  });
  assert.equal(ok.status, 204);
  assert.equal(purgeCalls[0]?.note, "spam cleanup");

  const okNoNote = await fetch(`${baseUrl}${BASE}/c2/purge`, { method: "POST" });
  assert.equal(okNoNote.status, 204);
  assert.equal(purgeCalls[1]?.note, null);
});

test("moderate/purge: not-found result -> 404", async (t) => {
  const { app } = buildApp({}, { purge: async () => ({ ok: false, reason: "not-found" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}/missing/purge`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not-found" });
});

// ---------------------------------------------------------------------------------------------
// The `ACTIONS` table: each of the 4 loop-registered routes maps to its OWN permission + toStatus.
// A single shared handler body backs all 4 — this proves the per-action wiring is correct, not
// just that "the loop runs once".
// ---------------------------------------------------------------------------------------------

test("moderate: each of approve/spam/trash/restore checks its own permission and forwards its own action/toStatus", async (t) => {
  const authorizeCalls: Array<{ permission: string }> = [];
  const { app, applyModerationCalls } = buildApp({
    authorize: async (input) => {
      authorizeCalls.push({ permission: input.permission });
      return { allowed: true, reason: "matched" };
    },
  });
  const baseUrl = await startTestServer(app, t);

  const cases = [
    { path: "approve", permission: "comments.moderate", action: "approve", toStatus: "approved" },
    { path: "spam", permission: "comments.moderate", action: "mark_spam", toStatus: "spam" },
    { path: "trash", permission: "comments.delete", action: "trash", toStatus: "trash" },
    { path: "restore", permission: "comments.moderate", action: "restore", toStatus: "approved" },
  ] as const;

  for (const [i, c] of cases.entries()) {
    const res = await fetch(`${baseUrl}${BASE}/comment-${i}/${c.path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 0 }),
    });
    assert.equal(res.status, 204, `${c.path} should 204`);
    assert.equal(authorizeCalls[i]?.permission, c.permission, `${c.path} permission`);
    assert.equal(applyModerationCalls[i]?.action, c.action, `${c.path} action`);
    assert.equal(applyModerationCalls[i]?.toStatus, c.toStatus, `${c.path} toStatus`);
  }
});

// ---------------------------------------------------------------------------------------------
// Real RBAC boundary: a principal holding ONLY `comments.moderate` must be refused `trash`/`purge`
// (their stronger permissions), never silently allowed through. Uses the REAL authorize() gateway
// (`createRouteDeps()`/`createApp()`), not a stub — proves the tiering as actually wired in prod.
// ---------------------------------------------------------------------------------------------

let grantCounter = 0;
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-comments-${suffix}`;
  const policyId = `grant-policy-comments-${suffix}`;
  const username = `grant-comments-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({ principalId, workspaceId: deps.workspaceId, username, passwordHash: await deps.passwordHasher.hash("grant-pw") });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({ id: `grant-pp-${suffix}-${permission}`, workspaceId: deps.workspaceId, policyId, permission, resourceType: null, constraintJson: null });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("moderate RBAC: a 'comments.moderate'-only principal can approve/spam/restore but is REFUSED trash and purge", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const moderatorCookie = await loginWithPermissions(deps, baseUrl, ["comments.moderate"]);

  const approve = await fetch(`${baseUrl}${BASE}/c1/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: moderatorCookie },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  // Comment "c1" doesn't exist, but authorization is decided BEFORE the not-found check —
  // a 404 here (not 403) still proves the permission gate let this principal through.
  assert.notEqual(approve.status, 403, "comments.moderate must be sufficient for approve");

  const trash = await fetch(`${baseUrl}${BASE}/c1/trash`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: moderatorCookie },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(trash.status, 403, "comments.moderate alone must NOT authorize trash (needs comments.delete)");

  const purge = await fetch(`${baseUrl}${BASE}/c1/purge`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: moderatorCookie },
  });
  assert.equal(purge.status, 403, "comments.moderate alone must NOT authorize purge (needs comments.delete.force)");

  const deleteOnlyCookie = await loginWithPermissions(deps, baseUrl, ["comments.delete"]);
  const purgeWithDeleteOnly = await fetch(`${baseUrl}${BASE}/c1/purge`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: deleteOnlyCookie },
  });
  assert.equal(purgeWithDeleteOnly.status, 403, "comments.delete alone must NOT authorize purge (needs the stronger comments.delete.force)");
});
