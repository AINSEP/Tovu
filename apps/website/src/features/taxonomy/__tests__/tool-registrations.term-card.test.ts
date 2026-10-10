import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { buildTaxonomyRegistrations, type TaxonomyToolDeps } from "../tool-registrations.js";

test("term card owns a single-item read with the taxonomy permission and full term view", async () => {
  const term = { id: "t", taxonomyId: "tax", parentId: null, name: "News", status: "active", version: 3, updatedAt: "now" };
  let reads = 0;
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }),
    termRepo: { findByIdFull: async ({ id }: { id: string }) => { reads++; return id === "t" ? term : null; } } } as unknown as TaxonomyToolDeps;
  const card = () => deriveContentReadRegistrations(buildTaxonomyRegistrations(deps)).find(r => r.descriptor.id === "content_read.term")!;
  assert.ok(card());
  assert.deepEqual(await card().handler({ input: { termId: "t" }, principal: { id: "owner" } } as ToolExecutionContext), { term });
  await assert.rejects(card().handler({ input: { termId: "gone" }, principal: { id: "owner" } } as ToolExecutionContext),
    { message: "term 'gone' was not found — call content_read.taxonomy to list valid terms" });
  deps.authorize = async () => ({ allowed: false, reason: "denied" });
  await assert.rejects(card().handler({ input: { termId: "t" }, principal: { id: "owner" } } as ToolExecutionContext), ToolInputError);
  assert.equal(reads, 2);
});
