import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file SPEC-033 AC-05 — an end-to-end route test: a public submission reaches `pending`, an
 * operator with `comments.moderate` can approve it (queue count moves), and a principal without
 * that grant gets 403. Seeds a real entry directly via `entryRepo.save()` (the live dev seed data
 * only seeds legacy `posts`, not ADR-022 `entries` — Comments attaches to entries, per ADR-031 §2).
 */

async function seedEntry(deps: RouteDeps): Promise<string> {
  const now = deps.clock.nowIso();
  await deps.entryRepo.save({
    id: "entry-e2e-1",
    workspaceId: deps.workspaceId,
    type: "post",
    slug: "e2e-test-entry",
    status: "published",
    title: "E2E Test Entry",
    bodyJson: null,
    fieldsJson: {},
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    version: 0,
  });
  return "entry-e2e-1";
}

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-comments-e2e";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-comments-e2e",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-comments-e2e", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("comments end-to-end: public submit -> pending -> operator approves -> queue moves; an unauthorized principal is refused", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const entryId = await seedEntry(deps);

  const submitRes = await fetch(`${baseUrl}/api/site/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entryId, authorName: "Jane", body: "Great post, thanks for sharing!" }),
  });
  assert.equal(submitRes.status, 201);
  const submitted = (await submitRes.json()) as { id: string; status: string };
  assert.equal(submitted.status, "pending");

  const queueBefore = await deps.commentRepo.listModerationQueue({ workspaceId: deps.workspaceId, status: "pending", limit: 10 });
  assert.equal(queueBefore.items.some((c) => c.id === submitted.id), true);

  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const deniedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/${submitted.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(deniedRes.status, 403);

  const approveRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/comments/${submitted.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ expectedVersion: 0 }),
  });
  assert.equal(approveRes.status, 204);

  const queueAfter = await deps.commentRepo.listModerationQueue({ workspaceId: deps.workspaceId, status: "pending", limit: 10 });
  assert.equal(queueAfter.items.some((c) => c.id === submitted.id), false, "the approved comment left the pending queue");

  const approvedQueue = await deps.commentRepo.listModerationQueue({ workspaceId: deps.workspaceId, status: "approved", limit: 10 });
  assert.equal(approvedQueue.items.some((c) => c.id === submitted.id), true, "and now shows up under approved");
});
