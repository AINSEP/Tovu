import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { InMemoryContentTypeRepo } from "../../features/content-types";
import type { ContentTypeRevisionInput } from "../../features/content-types";
import { buildAssistantToolRegistrations } from "../../assistant/tool-registrations";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { createContentTypesModule } from "../modules/content-types";
import type { RouteDeps } from "../routes/types";
import { startTestServer } from "./helpers/http-test-server";

/**
 * @file Audit-trail provenance on the `content_types` write chokepoint (ADR-022 §1/§4's
 * single-write-chokepoint + same-transaction revision-recording pattern).
 *
 * The question this exists to make answerable: *"was this content-type change made by a human
 * admin or by the AI assistant, and which one?"* `actor_id` alone could never answer it — the
 * assistant runs under the very same human principal id (Tovu's proxy reads it from the browser
 * session and stamps it into the run's `contextRef`; `server/modules/assistant.ts`), so both paths
 * record an identical `actorId`. The distinguishing fact is the actor CLASS, which now rides the
 * existing revision row as `principal_kind`.
 *
 * The two halves are deliberately driven the way production drives them:
 * - the human half goes over real HTTP through `requireAdminSession`, so the principal under test
 *   is whatever that middleware really resolved from the session cookie — the assertion compares
 *   the recorded kind against the principal record read back from the repo, never against a
 *   hardcoded `"user"`;
 * - the agent half goes through `buildAssistantToolRegistrations`, the same registrations the
 *   daemon's `ToolRegistry` executes.
 */

const CONTENT_TYPE_MANAGE = "admin.collections.manage";

function buildApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createContentTypesModule(deps).registerRoutes?.(app);
  return { app, deps };
}

/**
 * Creates a real principal of the requested `kind` holding `admin.collections.manage`, then logs
 * in as it. Returns the session cookie AND the principal id so the test can read the stored
 * principal record back and compare against what the revision recorded.
 */
let counter = 0;
async function loginAsPrincipal(
  deps: RouteDeps,
  baseUrl: string,
  kind: "user" | "agent" | "api_key" | "system"
): Promise<{ cookie: string; principalId: string }> {
  await deps.identityReady;
  const suffix = `${++counter}`;
  const principalId = `provenance-principal-${suffix}`;
  const policyId = `provenance-policy-${suffix}`;
  const username = `provenance-user-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind,
    displayName: `Provenance ${suffix}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("provenance-pw"),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `provenance-${suffix}`, isBuiltin: false, isFrozen: false });
  await deps.policyPermissionRepo.save({
    id: `provenance-pp-${suffix}`,
    workspaceId: deps.workspaceId,
    policyId,
    permission: CONTENT_TYPE_MANAGE,
    resourceType: null,
    constraintJson: null,
  });
  await deps.principalPolicyRepo.save({ id: `provenance-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "provenance-pw" }),
  });
  assert.equal(login.status, 200);
  return { cookie: login.headers.get("set-cookie")?.split(";")[0] ?? "", principalId };
}

function revisionsOf(deps: RouteDeps): ContentTypeRevisionInput[] {
  return (deps.contentTypeRepo as InMemoryContentTypeRepo).listRevisions();
}

const FIELDS = [{ name: "title", kind: "text", required: true, queryable: false }];

test("a human admin HTTP write records that session's REAL principal — its id and its stored kind, not a hardcoded default", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const { cookie, principalId } = await loginAsPrincipal(deps, baseUrl, "user");

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: FIELDS }),
  });
  assert.equal(res.status, 201);

  const revisions = revisionsOf(deps);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].op, "register");
  assert.equal(revisions[0].actorId, principalId, "the revision must name whoever requireAdminSession resolved");

  // The load-bearing assertion: compare against the principal record actually stored, so this
  // cannot pass by coincidence if the route ever started hardcoding a kind.
  const stored = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: principalId });
  assert.ok(stored);
  assert.equal(revisions[0].principalKind, stored.kind);
});

test("a non-'user' principal kind is carried through verbatim — the route reads the principal, it does not assume humans", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const { cookie, principalId } = await loginAsPrincipal(deps, baseUrl, "api_key");

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ key: "invoice", label: "Invoice", fields: FIELDS }),
  });
  assert.equal(res.status, 201);

  const stored = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: principalId });
  assert.equal(revisionsOf(deps)[0].principalKind, "api_key");
  assert.equal(revisionsOf(deps)[0].principalKind, stored?.kind);
});

test("the human update-fields and lifecycle routes stamp provenance too, not just create", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const { cookie, principalId } = await loginAsPrincipal(deps, baseUrl, "user");
  const headers = { cookie, "content-type": "application/json" };

  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers,
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: FIELDS }),
  });
  const updated = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ fields: [...FIELDS, { name: "servings", kind: "integer", required: false, queryable: true }], expectedVersion: 1 }),
  });
  assert.equal(updated.status, 200);
  const deprecated = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/lifecycle`, {
    method: "POST",
    headers,
    body: JSON.stringify({ op: "deprecate", expectedVersion: 2 }),
  });
  assert.equal(deprecated.status, 200);

  const revisions = revisionsOf(deps);
  assert.equal(revisions.length, 3, "register + field-change + deprecate each append one revision");
  for (const revision of revisions) {
    assert.equal(revision.actorId, principalId);
    assert.equal(revision.principalKind, "user");
  }
});

test("an agent-tool write records principalKind 'agent' while carrying the SAME principal id — the exact distinction the audit trail needs", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const { cookie, principalId } = await loginAsPrincipal(deps, baseUrl, "user");

  // 1. The human clicks through the admin UI.
  const created = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: FIELDS }),
  });
  assert.equal(created.status, 201);

  // 2. The SAME human asks the assistant to make the next change. The daemon executes the tool
  //    under the principal Tovu's proxy stamped into the run — the same principal id as above.
  const registration = buildAssistantToolRegistrations(deps).find(
    (r) => r.descriptor.id === "collections_content_type_update_fields"
  );
  assert.ok(registration);
  await registration.handler({
    executionId: "exec-1",
    principal: { id: principalId },
    run: { id: "run-1" },
    input: { key: "recipe", fields: [...FIELDS, { name: "servings", kind: "integer", required: false, queryable: true }], expectedVersion: 1 },
    signal: new AbortController().signal,
  });

  const [humanRevision, agentRevision] = revisionsOf(deps);
  assert.equal(humanRevision.actorId, principalId);
  assert.equal(agentRevision.actorId, principalId, "both writes genuinely share one principal id");
  assert.equal(
    humanRevision.actorId,
    agentRevision.actorId,
    "actorId alone is therefore useless for this question — which is why principalKind exists"
  );
  assert.equal(humanRevision.principalKind, "user");
  assert.equal(agentRevision.principalKind, "agent");
});

test("every agent tool stamps 'agent' — deprecate/reactivate/tombstone included, not just the write-service pair", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const { cookie, principalId } = await loginAsPrincipal(deps, baseUrl, "user");
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: FIELDS }),
  });

  const byId = new Map(buildAssistantToolRegistrations(deps).map((r) => [r.descriptor.id, r]));
  const ctx = (input: Record<string, unknown>) => ({
    executionId: "exec-1",
    principal: { id: principalId },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  });

  await byId.get("collections_content_type_deprecate")!.handler(ctx({ key: "recipe", expectedVersion: 1 }));
  await byId.get("collections_content_type_reactivate")!.handler(ctx({ key: "recipe", expectedVersion: 2 }));
  await byId.get("collections_content_type_deprecate")!.handler(ctx({ key: "recipe", expectedVersion: 3 }));
  await byId.get("collections_content_type_tombstone")!.handler(ctx({ key: "recipe", expectedVersion: 4 }));

  const agentRevisions = revisionsOf(deps).slice(1);
  assert.equal(agentRevisions.length, 4);
  for (const revision of agentRevisions) {
    assert.equal(revision.principalKind, "agent");
    assert.equal(revision.actorId, principalId);
  }
});
