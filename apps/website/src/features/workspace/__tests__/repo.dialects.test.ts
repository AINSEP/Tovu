import assert from "node:assert/strict";
import { test } from "node:test";

import type { WorkspaceRepoPort } from "@jini-ai/cms/workspace";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { workspaceRepoFor } from "../repo.js";

/** @file The workspace repo's one Kysely body on SQLite and PGlite (storage plan §4). */

const ACME = { id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z" };
const GLOBEX = { id: "ws-2", name: "Globex", slug: "globex", createdAt: "2026-07-15T00:00:01.000Z" };

describeEachDialect<WorkspaceRepoPort>("workspace repo", { tables: ["workspaces"], make: workspaceRepoFor }, (makeRepo) => {
  test("insert, find by id and slug, list", async () => {
    const repo = makeRepo();
    await repo.insert(ACME);
    await repo.insert(GLOBEX);
    assert.deepEqual(await repo.findById({ id: "ws-1" }), ACME);
    assert.deepEqual(await repo.findBySlug({ slug: "globex" }), GLOBEX);
    assert.equal(await repo.findBySlug({ slug: "ws-1" }), null);
    assert.equal(await repo.findById({ id: "nope" }), null);
    assert.deepEqual((await repo.list()).map((w) => w.id).sort(), ["ws-1", "ws-2"]);
  });

  test("update and delete touch only the targeted row", async () => {
    const repo = makeRepo();
    await repo.insert(ACME);
    await repo.insert(GLOBEX);
    await repo.update({ ...ACME, name: "Acme 2", slug: "acme-2", createdAt: "ignored" });
    assert.deepEqual(await repo.findById({ id: "ws-1" }), { ...ACME, name: "Acme 2", slug: "acme-2" });
    await repo.delete({ id: "ws-1" });
    assert.equal(await repo.findById({ id: "ws-1" }), null);
    assert.deepEqual(await repo.findById({ id: "ws-2" }), GLOBEX);
  });

  test("a duplicate slug is rejected by the database", async () => {
    const repo = makeRepo();
    await repo.insert(ACME);
    await assert.rejects(repo.insert({ ...GLOBEX, slug: "acme" }));
    assert.equal((await repo.list()).length, 1);
  });
});
