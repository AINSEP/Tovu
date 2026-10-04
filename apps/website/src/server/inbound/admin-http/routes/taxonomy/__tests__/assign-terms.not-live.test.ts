import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryTaxonomyRepo, InMemoryTermRepo } from "#src/features/taxonomy/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminTaxonomyAssignTermsRoute } from "../assign-terms.js";
import type { TaxonomyRouteDeps } from "../deps.js";

/**
 * S10 (web-high fix plan, 2026-09-24): assigning terms to a trashed post/page is refused with
 * 409 and the guard's own code, not a 500 or a silent join.
 */
function buildApp(postRepo: TaxonomyRouteDeps["postRepo"]): express.Express {
  const deps: TaxonomyRouteDeps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" } as any,
    idGen: { newId: () => "id-1" } as any,
    outbox: { enqueue: async () => {} } as any,
    taxonomyRepo: new InMemoryTaxonomyRepo(),
    termRepo: new InMemoryTermRepo(),
    entryTermRepo: {} as any,
    taxonomyRevisionRepo: {} as any,
    postRepo,
    entryRepo: {} as any,
    contentTypeRepo: {} as any,
    stampWatermark: async () => {},
  };

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminTaxonomyAssignTermsRoute(app, deps);
  return app;
}

test("assign-terms: a trashed post is refused with 409 ENTITY_IN_TRASH", async (t) => {
  const postRepo = {
    findById: async ({ workspaceId, id }: { workspaceId: string; id: string }) =>
      workspaceId === "ws-1" && id === "p1"
        ? { id, workspaceId, kind: "post", deletedAt: "2026-09-24T00:00:00.000Z" }
        : null,
  } as any;
  const baseUrl = await startTestServer(buildApp(postRepo), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: "post", contentId: "p1", termIds: ["t1"] }),
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, "ENTITY_IN_TRASH");
  assert.equal(body.error, "ENTITY_IN_TRASH: post 'p1' is in the Trash. Restore it from the Trash before changing it.");
});

test("assign-terms: a trashed page is refused with 409 ENTITY_IN_TRASH", async (t) => {
  const postRepo = {
    findById: async ({ workspaceId, id }: { workspaceId: string; id: string }) =>
      workspaceId === "ws-1" && id === "page-1"
        ? { id, workspaceId, kind: "page", deletedAt: "2026-09-24T00:00:00.000Z" }
        : null,
  } as any;
  const baseUrl = await startTestServer(buildApp(postRepo), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy/assign-terms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: "page", contentId: "page-1", termIds: ["t1"] }),
  });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    code: "ENTITY_IN_TRASH",
    error: "ENTITY_IN_TRASH: page 'page-1' is in the Trash. Restore it from the Trash before changing it.",
  });
});
