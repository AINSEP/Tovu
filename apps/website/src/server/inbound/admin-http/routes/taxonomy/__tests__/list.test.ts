import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { SqliteTaxonomyRepo, SqliteTermRepo } from "#src/features/taxonomy/repo.sqlite";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminTaxonomyListRoute } from "../list.js";
import type { TaxonomyRouteDeps } from "../deps.js";

/** The same SQLite adapters `createRouteDeps` composes, over a private in-memory database. (The CMS
 *  package's `InMemoryTaxonomyRepo`/`InMemoryTermRepo` lack the host's trash/publish reads —
 *  `findForTrash`/`findAnyById` — so they no longer satisfy `TaxonomyRouteDeps`.) */
function createTaxonomyRepos(): Pick<TaxonomyRouteDeps, "taxonomyRepo" | "termRepo"> {
  const db = openContentDb(":memory:");
  return {
    taxonomyRepo: new SqliteTaxonomyRepo({ db, workspaceId: "ws-1" }),
    termRepo: new SqliteTermRepo({ db, workspaceId: "ws-1" }),
  };
}

function buildApp(depsOverrides: Partial<TaxonomyRouteDeps> = {}): express.Express {
  const { taxonomyRepo, termRepo } = createTaxonomyRepos();

  // Composed defaults for every seam this route never reads (outbox, revisions, removers, ...);
  // the seams it does read are overridden below.
  const deps: TaxonomyRouteDeps = {
    ...createRouteDeps(),
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowMs: () => Date.parse("2026-01-01T00:00:00Z"), nowIso: () => "2026-01-01T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    taxonomyRepo,
    termRepo,
    stampWatermark: async () => {},
    ...depsOverrides,
  };

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminTaxonomyListRoute(app, deps);
  return app;
}

test("list: returns 200 with taxonomies and terms when authorized", async (t) => {
  const { taxonomyRepo, termRepo } = createTaxonomyRepos();
  await taxonomyRepo.insert({
    id: "tax-1",
    name: "Categories",
    hierarchical: true,
    status: "active",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  });

  const app = buildApp({ taxonomyRepo, termRepo });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(Array.isArray(body.items));
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].taxonomy.id, "tax-1");
  assert.equal(body.items[0].taxonomy.name, "Categories");
});

test("list: returns 403 when principal is not authorized", async (t) => {
  const app = buildApp({
    authorize: async () => ({ allowed: false, reason: "permission denied" }),
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy`);
  assert.equal(res.status, 403);

  const body = await res.json();
  assert.equal(body.code, "FORBIDDEN");
  assert.ok(body.error.includes("is not authorized for 'admin.taxonomy.manage'"));
  assert.equal(body.details.permission, "admin.taxonomy.manage");
  assert.equal(body.details.reason, "permission denied");
});

test("list: returns 500 when error is an instance of Error", async (t) => {
  const app = buildApp({
    taxonomyRepo: {
      list: async () => {
        throw new Error("db connection broken");
      },
    } as any,
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy`);
  assert.equal(res.status, 500);

  const body = await res.json();
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "db connection broken");
});

test("list: returns 500 when a non-Error is thrown", async (t) => {
  const app = buildApp({
    taxonomyRepo: {
      list: async () => {
        throw "something unexpected";
      },
    } as any,
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy`);
  assert.equal(res.status, 500);

  const body = await res.json();
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "internal error");
});
