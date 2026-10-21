import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminTaxonomyCreateTermRoute } from "../create-term.js";
import { registerAdminTaxonomyDeleteRoute } from "../delete-taxonomy.js";
import { registerAdminTaxonomyDeleteTermRoute } from "../delete-term.js";

/**
 * Direct-invoke route contracts for the taxonomy term-write routes, with hand-written fakes for the
 * repos/ports each route hands to its service function — no HTTP listener, no database.
 */
const allow = async () => ({ allowed: true, reason: "matched" });
function harness(overrides: Record<string, unknown>) {
  const app = express();
  const deps = {
    workspaceId: "ws-7", authorize: allow, clock: { nowIso: () => "2026-10-21T00:00:00.000Z" }, idGen: { newId: () => "term-new" },
    outbox: { enqueue: async () => {} }, postRepo: {}, ...overrides,
  } as any;
  registerAdminTaxonomyCreateTermRoute(app, deps);
  registerAdminTaxonomyDeleteRoute(app, deps);
  registerAdminTaxonomyDeleteTermRoute(app, deps);
  return async (method: "post" | "delete", path: string, req: { params: Record<string, string>; body?: unknown }) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-7" };
    await extractRouteHandler(app, method, path)(req, res);
    return capture;
  };
}
const createPath = "/api/admin/v1/taxonomy/:taxonomyId/terms";

test("create-term rejects an absent or non-string name with 400 before touching the service", async () => {
  const invoke = harness({ taxonomyRepo: { findById: async () => { throw new Error("must not read"); } } });
  for (const body of [undefined, null, { name: 7 }]) {
    assert.deepEqual(await invoke("post", createPath, { params: { taxonomyId: "tax-1" }, body }), {
      statusCode: 400, jsonBody: { error: "'name' (string) is required", code: "VALIDATION_ERROR" },
    });
  }
});

test("create-term maps a denied admin.taxonomy.manage to 403 FORBIDDEN", async () => {
  const invoke = harness({ authorize: async (input: unknown) => {
    assert.deepEqual(input, { principalId: "principal-7", permission: "admin.taxonomy.manage", workspaceId: "ws-7" });
    return { allowed: false, reason: "no grant" };
  } });
  assert.deepEqual(await invoke("post", createPath, { params: { taxonomyId: "tax-1" }, body: { name: "News" } }), {
    statusCode: 403, jsonBody: { error: "principal 'principal-7' is not authorized for 'admin.taxonomy.manage' (no grant)", code: "FORBIDDEN" },
  });
});

test("create-term maps a missing taxonomy to 404 TAXONOMY_NOT_FOUND", async () => {
  const invoke = harness({ taxonomyRepo: { findById: async (input: unknown) => { assert.deepEqual(input, { id: "tax-404" }); return null; } } });
  assert.deepEqual(await invoke("post", createPath, { params: { taxonomyId: "tax-404" }, body: { name: "News" } }), {
    statusCode: 404, jsonBody: { error: "taxonomy 'tax-404' was not found", code: "TAXONOMY_NOT_FOUND" },
  });
});

test("create-term maps a parent on a flat taxonomy to 400 VALIDATION_ERROR", async () => {
  const invoke = harness({
    taxonomyRepo: { findById: async () => ({ id: "tax-1", hierarchical: false }) },
    termRepo: { findById: async () => ({ id: "parent-1", taxonomyId: "tax-1" }), insert: async () => { throw new Error("must not insert"); } },
  });
  const capture = await invoke("post", createPath, { params: { taxonomyId: "tax-1" }, body: { name: "Child", parentId: "parent-1" } });
  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { code: string }).code, "VALIDATION_ERROR");
});

test("create-term maps a non-Error throw to a generic 500", async () => {
  const invoke = harness({ taxonomyRepo: { findById: async () => { throw "storage offline"; } } });
  assert.deepEqual(await invoke("post", createPath, { params: { taxonomyId: "tax-1" }, body: { name: "News" } }), {
    statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" },
  });
});

test("create-term passes an Error's own message through on an unexpected 500", async () => {
  const invoke = harness({ taxonomyRepo: { findById: async () => { throw new Error("db closed"); } } });
  assert.deepEqual(await invoke("post", createPath, { params: { taxonomyId: "tax-1" }, body: { name: "News" } }), {
    statusCode: 500, jsonBody: { error: "db closed", code: "INTERNAL_ERROR" },
  });
});

test("delete-taxonomy and delete-term answer 409 TRASH_VERSION_CHANGED when the Trash write loses its version check", async () => {
  const removed: unknown[] = [];
  const invoke = harness({
    taxonomyRepo: { findForTrash: async () => ({ id: "tax-1", name: "Topics", version: 3 }) },
    termRepo: { findForTrash: async () => ({ id: "term-1", name: "News", taxonomyName: "Topics", version: 4 }) },
    removeTaxonomy: async (input: unknown) => { removed.push(input); return { ok: false, reason: "version-changed" }; },
    removeTerm: async (input: unknown) => { removed.push(input); return { ok: false, reason: "version-changed" }; },
  });
  assert.deepEqual(await invoke("delete", "/api/admin/v1/taxonomy/:id", { params: { id: "tax-1" } }), {
    statusCode: 409, jsonBody: { error: "taxonomy 'tax-1' changed while it was being deleted", code: "TRASH_VERSION_CHANGED" },
  });
  assert.deepEqual(await invoke("delete", "/api/admin/v1/taxonomy/terms/:id", { params: { id: "term-1" } }), {
    statusCode: 409, jsonBody: { error: "term 'term-1' changed while it was being deleted", code: "TRASH_VERSION_CHANGED" },
  });
  assert.deepEqual(removed.map((input) => (input as { expectedVersion: number }).expectedVersion), [3, 4]);
});

test("delete-taxonomy and delete-term hide storage failures behind a generic 500", async () => {
  const fail = async () => { throw new Error("private storage detail"); };
  const invoke = harness({ taxonomyRepo: { findForTrash: fail }, termRepo: { findForTrash: fail } });
  for (const path of ["/api/admin/v1/taxonomy/:id", "/api/admin/v1/taxonomy/terms/:id"]) {
    assert.deepEqual(await invoke("delete", path, { params: { id: "x-1" } }), {
      statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" },
    });
  }
});
