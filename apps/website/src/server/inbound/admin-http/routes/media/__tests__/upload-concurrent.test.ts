import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlMediaRepo } from "#src/platform/db/repos/media-repo";
import type { MediaRouteDeps } from "../deps.js";
import { registerAdminMediaUploadRoute } from "../upload.js";

// Capture the registered handler: exercise the route with DI ports without a listening server.
function uploadAction({ deps }: { deps: MediaRouteDeps }, _optional: Record<string, never> = {}) {
  let handler!: (req: Request, res: Response) => Promise<void>;
  const app = { post(_path: string, action: typeof handler) { handler = action; } } as unknown as Express;
  registerAdminMediaUploadRoute(app, deps);
  return async () => {
    const result = { status: 200, body: {} as Record<string, unknown> };
    const res = {
      locals: { principal: { id: "test-principal" } },
      status(status: number) { result.status = status; return this; },
      json(body: Record<string, unknown>) { result.body = body; return this; },
    } as unknown as Response;
    const req = {
      params: { workspaceId: deps.workspaceId },
      body: {
        filename: "pixel.png", contentType: "image/png",
        dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      },
    } as unknown as Request;
    await handler(req, res);
    return result;
  };
}

test("concurrent upload: a real SQLite slug race returns 409 with the exact conflict, not 500", async (t) => {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  const repo = new SqlMediaRepo(kernel);
  // Both callers observe the same free slug before either saves it. The actual database
  // unique constraint decides the winner; no fake constraint error or module mock.
  const findBySlug = repo.findBySlug.bind(repo);
  let lookups = 0;
  let release!: () => void;
  const bothLooked = new Promise<void>((resolve) => { release = resolve; });
  repo.findBySlug = async (input) => {
    const found = await findBySlug(input);
    if (++lookups === 2) release();
    await bothLooked;
    return found;
  };
  const base = createRouteDeps();
  const action = uploadAction({ deps: { ...base, mediaRepo: repo, authorize: async () => ({ allowed: true, reason: "matched" }) } });
  const results = await Promise.all([action(), action()]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.deepEqual(results.find((result) => result.status === 409)?.body, {
    error: "slug 'pixel' is already used by another media asset in this workspace",
  });
  const stored = await repo.list({ workspaceId: base.workspaceId });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].slug, "pixel");
});

test("upload: an unexpected persistence error remains a redacted 500", async () => {
  const base = createRouteDeps();
  base.mediaRepo.save = async () => { throw new Error("private database details"); };
  const action = uploadAction({ deps: { ...base, authorize: async () => ({ allowed: true, reason: "matched" }) } });
  assert.deepEqual(await action(), { status: 500, body: { error: "internal error" } });
});
