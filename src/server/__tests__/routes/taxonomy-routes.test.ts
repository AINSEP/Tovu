import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { registerAdminTaxonomyListRoute } from "../../routes/admin/taxonomy/list.js";
import { registerAdminTaxonomyCreateRoute } from "../../routes/admin/taxonomy/create-taxonomy.js";
import { registerAdminTaxonomyCreateTermRoute } from "../../routes/admin/taxonomy/create-term.js";
import { registerAdminTaxonomyDeleteRoute } from "../../routes/admin/taxonomy/delete-taxonomy.js";
import { registerAdminTaxonomyDeleteTermRoute } from "../../routes/admin/taxonomy/delete-term.js";
import { registerAdminTaxonomyRenameTermRoute } from "../../routes/admin/taxonomy/rename-term.js";
import { registerAdminTaxonomyAssignTermsRoute } from "../../routes/admin/taxonomy/assign-terms.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file design-spec.md §2.8 backend-gap closure — route-level tests for the Categories & Tags
 * HTTP surface (ADR-044), this dispatch.
 *
 * `delete-taxonomy`/`delete-term` tests below are a separate backend-gap closure, dispatched
 * after the fact when the owner found dummy categories/tags created to prove `createTaxonomy`/
 * `createTerm` work with no way to remove them — see those two route files' headers.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminTaxonomyListRoute(app, deps);
  registerAdminTaxonomyCreateRoute(app, deps);
  registerAdminTaxonomyCreateTermRoute(app, deps);
  registerAdminTaxonomyRenameTermRoute(app, deps);
  registerAdminTaxonomyAssignTermsRoute(app, deps);
  registerAdminTaxonomyDeleteRoute(app, deps);
  registerAdminTaxonomyDeleteTermRoute(app, deps);
  return { app, deps };
}

test("taxonomy routes: create taxonomy -> create term -> rename -> list golden path (AC-01/AC-03/AC-15/AC-26)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  assert.equal(taxRes.status, 201);
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };

  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Breakfast" }),
  });
  assert.equal(termRes.status, 201);
  const term = (await termRes.json()) as { term: { id: string; name: string } };
  assert.equal(term.term.name, "Breakfast");

  const renameRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${term.term.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ newName: "Brunch" }),
  });
  assert.equal(renameRes.status, 200);
  const renamed = (await renameRes.json()) as { term: { name: string; version: number } };
  assert.equal(renamed.term.name, "Brunch");
  assert.equal(renamed.term.version, 2);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { items: Array<{ taxonomy: { id: string }; terms: Array<{ name: string }> }> };
  const categoryEntry = listed.items.find((i) => i.taxonomy.id === tax.taxonomy.id);
  assert.deepEqual(
    categoryEntry?.terms.map((t) => t.name),
    ["Brunch"]
  );
});

test("taxonomy routes: assigning a parentId to a term in a non-hierarchical ('tag') taxonomy is rejected VALIDATION_ERROR (ADR-044 §4)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const tagRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "tag", hierarchical: false }),
  });
  const tag = (await tagRes.json()) as { taxonomy: { id: string } };

  const parentRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tag.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "existing" }),
  });
  const parent = (await parentRes.json()) as { term: { id: string } };

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tag.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "child", parentId: parent.term.id }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("taxonomy routes: assign-terms is idempotent per call and returns 204 (AC-17/AC-20/INV-05)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Finding 1 fix (TM-adr041-043-044-045-audit-001): assign-terms now validates the target
  // content actually exists via `postRepo` — seed a real post rather than an arbitrary id.
  await deps.postRepo.save({
    id: "post-1",
    workspaceId: deps.workspaceId,
    title: "Test Post",
    slug: "test-post-assign-terms",
    bodyJson: {},
    status: "published",
    kind: "post",
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Breakfast" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "post", contentId: "post-1", termIds: [term.term.id] }),
  });
  assert.equal(res.status, 204);
});

test("taxonomy routes: assign-terms rejects a nonexistent contentId with 404 (Finding 1 fix, TM-adr041-043-044-045-audit-001)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Breakfast" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "post", contentId: "does-not-exist", termIds: [term.term.id] }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CONTENT_NOT_FOUND");
});

test("taxonomy routes: assign-terms rejects a nonexistent termId (Finding 1 fix)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await deps.postRepo.save({
    id: "post-2",
    workspaceId: deps.workspaceId,
    title: "Test Post 2",
    slug: "test-post-assign-terms-2",
    bodyJson: {},
    status: "published",
    kind: "post",
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "post", contentId: "post-2", termIds: ["does-not-exist"] }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TERM_NOT_FOUND");
});

test("taxonomy routes: assign-terms rejects a content type not on the taxonomy allow-list (Finding 1 fix)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Breakfast" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "product", contentId: "anything", termIds: [term.term.id] }),
  });
  assert.equal(res.status, 400);
  const allowListBody = (await res.json()) as { code: string };
  assert.equal(allowListBody.code, "VALIDATION_ERROR");
});

// ---------------------------------------------------------------------------
// delete-term / delete-taxonomy — guarded delete backend-gap closure (this dispatch, no formal
// AC ids). See `routes/admin/taxonomy/delete-term.ts`/`delete-taxonomy.ts` file headers.
// ---------------------------------------------------------------------------

test("taxonomy routes: delete-term removes an unassigned, childless term and it drops out of list", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Dummy Term" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${term.term.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 200);
  const deleted = (await deleteRes.json()) as { deletedTermId: string };
  assert.equal(deleted.deletedTermId, term.term.id);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, { headers: { cookie } });
  const listed = (await listRes.json()) as { items: Array<{ taxonomy: { id: string }; terms: Array<{ id: string }> }> };
  const categoryEntry = listed.items.find((i) => i.taxonomy.id === tax.taxonomy.id);
  assert.deepEqual(categoryEntry?.terms, []);
});

test("taxonomy routes: delete-term refuses with 409 TERM_HAS_ASSIGNMENTS and the exact assigned count when content is still assigned", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await deps.postRepo.save({
    id: "post-delete-term",
    workspaceId: deps.workspaceId,
    title: "Test Post",
    slug: "test-post-delete-term",
    bodyJson: {},
    status: "published",
    kind: "post",
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Breakfast" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "post", contentId: "post-delete-term", termIds: [term.term.id] }),
  });

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${term.term.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 409);
  const body = (await deleteRes.json()) as { code: string; assignedCount: number };
  assert.equal(body.code, "TERM_HAS_ASSIGNMENTS");
  assert.equal(body.assignedCount, 1);
});

test("taxonomy routes: delete-term refuses with 409 TERM_HAS_CHILDREN and the exact child count when the term still has children", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const parentRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Parent" }),
  });
  const parent = (await parentRes.json()) as { term: { id: string } };
  await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Child", parentId: parent.term.id }),
  });

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${parent.term.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 409);
  const body = (await deleteRes.json()) as { code: string; childCount: number };
  assert.equal(body.code, "TERM_HAS_CHILDREN");
  assert.equal(body.childCount, 1);
});

test("taxonomy routes: delete-term rejects a nonexistent termId with 404 TERM_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/does-not-exist`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TERM_NOT_FOUND");
});

test("taxonomy routes: delete-taxonomy removes the taxonomy and its unassigned member terms in one call, and it drops out of list", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "dummy-tag", hierarchical: false }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Dummy Tag Term" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 200);
  const deleted = (await deleteRes.json()) as { deletedTaxonomyId: string; deletedTermIds: string[] };
  assert.equal(deleted.deletedTaxonomyId, tax.taxonomy.id);
  assert.deepEqual(deleted.deletedTermIds, [term.term.id]);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, { headers: { cookie } });
  const listed = (await listRes.json()) as { items: Array<{ taxonomy: { id: string } }> };
  assert.equal(listed.items.some((i) => i.taxonomy.id === tax.taxonomy.id), false);
});

test("taxonomy routes: delete-taxonomy refuses with 409 TAXONOMY_HAS_ASSIGNMENTS when a member term is still assigned to content", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await deps.postRepo.save({
    id: "post-delete-taxonomy",
    workspaceId: deps.workspaceId,
    title: "Test Post",
    slug: "test-post-delete-taxonomy",
    bodyJson: {},
    status: "published",
    kind: "post",
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Breakfast" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "post", contentId: "post-delete-taxonomy", termIds: [term.term.id] }),
  });

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 409);
  const body = (await deleteRes.json()) as { code: string; assignedCount: number };
  assert.equal(body.code, "TAXONOMY_HAS_ASSIGNMENTS");
  assert.equal(body.assignedCount, 1);
});

test("taxonomy routes: delete-taxonomy rejects a nonexistent taxonomyId with 404 TAXONOMY_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/does-not-exist`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TAXONOMY_NOT_FOUND");
});

// ---------------------------------------------------------------------------
// RBAC at the HTTP layer — coordinator review requirement: the domain-level "unauthorized call is
// rejected" tests in Jini's write-service.test.ts prove `authorizeTaxonomyManage` itself; these
// prove the ROUTE correctly maps that rejection to a 403, same as every other taxonomy route's
// `statusFor` does. A mutation sweep of `delete-term.ts` (development/scripts/mutation-sweep.mjs)
// found this exact branch unproven before these two tests existed — this is the direct fix.
// ---------------------------------------------------------------------------

test("taxonomy routes: delete-term returns 403 FORBIDDEN when the caller is denied admin.taxonomy.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  const termRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Breakfast" }),
  });
  const term = (await termRes.json()) as { term: { id: string } };

  // Denies every permission from this point on — same technique `write-service.test.ts` uses at
  // the domain layer, applied here at the route's own `deps.authorize`.
  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${term.term.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("taxonomy routes: delete-taxonomy returns 403 FORBIDDEN when the caller is denied admin.taxonomy.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };

  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});
