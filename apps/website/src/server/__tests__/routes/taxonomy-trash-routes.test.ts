import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminTaxonomyListRoute } from "../../inbound/admin-http/routes/taxonomy/list.js";
import { registerAdminTaxonomyCreateRoute } from "../../inbound/admin-http/routes/taxonomy/create-taxonomy.js";
import { registerAdminTaxonomyCreateTermRoute } from "../../inbound/admin-http/routes/taxonomy/create-term.js";
import { registerAdminTaxonomyDeleteRoute } from "../../inbound/admin-http/routes/taxonomy/delete-taxonomy.js";
import { registerAdminTaxonomyDeleteTermRoute } from "../../inbound/admin-http/routes/taxonomy/delete-term.js";
import { registerAdminTaxonomyAssignTermsRoute } from "../../inbound/admin-http/routes/taxonomy/assign-terms.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file T6 (trash parallel plan §2, owner decision 5) — `delete-term`/`delete-taxonomy` now move
 * rows to the Trash (`trashTerm`/`trashTaxonomy`, `features/taxonomy/trash-term.ts`) instead of
 * Jini's guarded hard delete. Against the REAL SQLite composition
 * (`createSqliteRouteDeps(":memory:")`, same pattern as `newsletter-routes.test.ts`/
 * `settings-principal-check.test.ts`), not the hermetic one `taxonomy-routes.test.ts` uses: the
 * hermetic in-memory taxonomy/term repos have no `findForTrash` implementation yet (T6b handoff
 * item 4, a separate dispatch — `composition/app.ts` binds an inert always-not-found stub there
 * meanwhile, see its own comment), so these cases can only be proven for real here. These 5 tests
 * replace `taxonomy-routes.test.ts`'s former hard-delete golden-path/TERM_HAS_ASSIGNMENTS/
 * TERM_HAS_CHILDREN/TAXONOMY_HAS_ASSIGNMENTS assertions (removed there — see that file's own note).
 * The 403/404-not-found delete-term/delete-taxonomy cases stay in `taxonomy-routes.test.ts`: they
 * never reach `findForTrash`, so the hermetic composition still proves them validly.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createSqliteRouteDeps(":memory:");
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminTaxonomyListRoute(app, deps);
  registerAdminTaxonomyCreateRoute(app, deps);
  registerAdminTaxonomyCreateTermRoute(app, deps);
  registerAdminTaxonomyAssignTermsRoute(app, deps);
  registerAdminTaxonomyDeleteRoute(app, deps);
  registerAdminTaxonomyDeleteTermRoute(app, deps);
  return { app, deps };
}

test("taxonomy trash routes: delete-term moves an unassigned, childless term to the Trash (200 {trashed,id,version}) and it drops out of list", async (t) => {
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
  assert.equal(deleteRes.status, 200, await deleteRes.clone().text());
  const deleted = (await deleteRes.json()) as { trashed: boolean; id: string; version: number | null };
  assert.equal(deleted.trashed, true);
  assert.equal(deleted.id, term.term.id);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, { headers: { cookie } });
  const listed = (await listRes.json()) as { items: Array<{ taxonomy: { id: string }; terms: Array<{ id: string }> }> };
  const categoryEntry = listed.items.find((i) => i.taxonomy.id === tax.taxonomy.id);
  assert.deepEqual(categoryEntry?.terms, []);
});

test("taxonomy trash routes: delete-term now trashes a term that is still assigned to content (owner decision 5 — no more TERM_HAS_ASSIGNMENTS refusal)", async (t) => {
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

  const assignRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "post", contentId: "post-delete-term", termIds: [term.term.id] }),
  });
  assert.equal(assignRes.status, 204, await assignRes.clone().text());

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${term.term.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 200, await deleteRes.clone().text());
  const deleted = (await deleteRes.json()) as { trashed: boolean; id: string };
  assert.equal(deleted.trashed, true);
  assert.equal(deleted.id, term.term.id);
});

test("taxonomy trash routes: delete-term refuses with 409 TERM_HAS_CHILDREN and the exact child count when the term still has children", async (t) => {
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
  assert.equal(deleteRes.status, 409, await deleteRes.clone().text());
  const body = (await deleteRes.json()) as { code: string; count: number };
  assert.equal(body.code, "TERM_HAS_CHILDREN");
  assert.equal(body.count, 1);
});

test("taxonomy trash routes: delete-taxonomy moves the taxonomy to the Trash (200 {trashed,id,version}) and it drops out of list", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const taxRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "dummy-tag", hierarchical: false }),
  });
  const tax = (await taxRes.json()) as { taxonomy: { id: string } };
  await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Dummy Tag Term" }),
  });

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 200, await deleteRes.clone().text());
  const deleted = (await deleteRes.json()) as { trashed: boolean; id: string };
  assert.equal(deleted.trashed, true);
  assert.equal(deleted.id, tax.taxonomy.id);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, { headers: { cookie } });
  const listed = (await listRes.json()) as { items: Array<{ taxonomy: { id: string } }> };
  assert.equal(listed.items.some((i) => i.taxonomy.id === tax.taxonomy.id), false);
});

test("taxonomy trash routes: delete-taxonomy now trashes a taxonomy whose member term is still assigned to content (owner decision 5 — no more TAXONOMY_HAS_ASSIGNMENTS refusal)", async (t) => {
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

  const assignRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ contentType: "post", contentId: "post-delete-taxonomy", termIds: [term.term.id] }),
  });
  assert.equal(assignRes.status, 204, await assignRes.clone().text());

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${tax.taxonomy.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 200, await deleteRes.clone().text());
  const deleted = (await deleteRes.json()) as { trashed: boolean; id: string };
  assert.equal(deleted.trashed, true);
  assert.equal(deleted.id, tax.taxonomy.id);
});
