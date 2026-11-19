import assert from "node:assert/strict";
import test from "node:test";
import type { TransformDefinitionRecord } from "@jini-ai/cms/media";
import { freshSqliteContentKernel } from "../../kernel/__tests__/dialect-matrix.js";
import { SqlTransformDefinitionRepo } from "../media-repo.js";

const record: TransformDefinitionRecord = { id: "t1", workspaceId: "ws", name: "thumb", version: 1, params: { format: "webp" }, owner: "system", createdAt: "2026-01-01T00:00:00Z" };
for (const code of ["SQLITE_CONSTRAINT_UNIQUE", "23505", "EIO"]) test(`transform insert ${code} keeps the storage cause`, async t => {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  const cause = Object.assign(new Error("storage canary"), { code });
  t.mock.method(kernel, "run", async () => { throw cause; });
  const repo = new SqlTransformDefinitionRepo(kernel);
  await assert.rejects(repo.insert(record), error => {
    if (code === "EIO") return error === cause;
    assert.ok(error instanceof Error);
    assert.equal(error.cause, cause);
    assert.match(error.message, /already exists — append-only violation/);
    return true;
  });
});
