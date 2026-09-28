import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { resolveWorkspace } from "../../resolve-workspace.js";

/**
 * @file `resolveWorkspace`'s one Kysely read on SQLite and PGlite (R1b): the selector contract
 * (`resolve-workspace.unit.test.ts`) holds on every dialect the content kernel drives.
 */

async function insertWorkspace(kernel: ContentKernel, id: string, createdAt: string): Promise<void> {
  await kernel.run((db) => db.insertInto("workspaces").values({ id, name: id, slug: id, created_at: createdAt }).execute());
}

describeEachDialect("resolveWorkspace", { tables: ["workspaces"], make: (kernel: ContentKernel) => kernel }, (make) => {
  test("zero rows reject with SiteCorruptError", async () => {
    await assert.rejects(resolveWorkspace({ kernel: make() }), { name: "SiteCorruptError" });
  });

  test("the oldest row wins without a selector; an explicit id wins over it; an unknown id rejects", async () => {
    const kernel = make();
    await insertWorkspace(kernel, "ws-newer", "2026-07-28T00:00:01.000Z");
    await insertWorkspace(kernel, "ws-older", "2026-07-28T00:00:00.000Z");

    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      assert.deepEqual(await resolveWorkspace({ kernel }), {
        id: "ws-older",
        name: "ws-older",
        slug: "ws-older",
        createdAt: "2026-07-28T00:00:00.000Z",
      });
    } finally {
      console.warn = originalWarn;
    }
    assert.equal((await resolveWorkspace({ kernel }, { workspaceId: "ws-newer" })).id, "ws-newer");
    await assert.rejects(resolveWorkspace({ kernel }, { workspaceId: "missing" }), { name: "ValidationError" });
  });
});
