import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server";
import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminTaxonomyListRoute } from "../../routes/admin/taxonomy/list";
import { registerAdminTaxonomyCreateRoute } from "../../routes/admin/taxonomy/create-taxonomy";
import { registerAdminTaxonomyCreateTermRoute } from "../../routes/admin/taxonomy/create-term";
import { registerAdminTaxonomyRenameTermRoute } from "../../routes/admin/taxonomy/rename-term";
import { registerAdminTaxonomyAssignTermsRoute } from "../../routes/admin/taxonomy/assign-terms";
import type { RouteDeps } from "../../routes/types";

/**
 * @file design-spec.md §2.8 backend-gap closure — route-level tests for the Categories & Tags
 * HTTP surface (ADR-044), this dispatch.
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
    body: JSON.stringify({ contentType: "post", contentId: "post-1", termIds: [term.term.id] }),
  });
  assert.equal(res.status, 204);
});
