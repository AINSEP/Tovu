import assert from "node:assert/strict";
import test from "node:test";
import { createChatDeleteScope, filterChatDeleteCatalog } from "../permanent-delete-tool-gate.js";
import { PERMANENT_DELETE_TOOLS, type AssistantPermanentDeletesPolicy } from "../../contracts/headless/index.js";
import { isChatToolAllowed } from "../assistant-permanent-deletes-policy.js";
const entries = [...PERMANENT_DELETE_TOOLS.map(tool => ({ id: tool.id, description: tool.label, source: "site", score: 1 })), { id: "trash_list_items", description: "List Trash", source: "site", score: 0 }];
const catalog = { search: (_required: { query: string }, optional: { limit?: number } = {}) => entries.slice(0, optional.limit), describe: ({ id }: { id: string }) => entries.find(entry => entry.id === id) ?? null };
test("OFF and unchecked deletes are hidden from search and describe; checked results retain their rank", () => {
  for (const policy of [{ enabled: false, allowedToolIds: ["trash_empty"] }, { enabled: true, allowedToolIds: [] }]) {
    const gated = filterChatDeleteCatalog({ catalog, policy: () => policy });
    assert.deepEqual(gated.search({ query: "delete" }, { limit: 1 }).map(row => row.id), ["trash_list_items"]);
    assert.equal(gated.describe({ id: "trash_empty" }), null);
  }
  const gated = filterChatDeleteCatalog({ catalog, policy: () => ({ enabled: true, allowedToolIds: ["trash_empty"] }) });
  assert.deepEqual(gated.search({ query: "delete" }, { limit: 2 }).map(row => row.id), ["trash_empty", "trash_list_items"]);
  assert.ok(gated.describe({ id: "trash_empty" }));
  for (const toolId of ["workspace_delete", "collections_execute_cleanup"]) assert.equal(isChatToolAllowed({ toolId, policy: { enabled: true, allowedToolIds: [toolId] } }), false);
});
test("per-request fresh reads isolate concurrent runs and a revoked grant on the next call", async () => {
  let policy: AssistantPermanentDeletesPolicy = { enabled: true, allowedToolIds: ["trash_empty"] };
  let reads = 0;
  const scope = createChatDeleteScope({ readPolicy: async () => { reads++; return structuredClone(policy); } });
  const gated = scope.catalog({ catalog });
  assert.equal(gated.describe({ id: "trash_empty" }), null);
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const on = scope.fresh({ run: async () => { await wait; assert.ok(gated.describe({ id: "trash_empty" })); } });
  await Promise.resolve();
  policy = { enabled: false, allowedToolIds: ["trash_empty"] };
  await scope.fresh({ run: () => assert.equal(gated.describe({ id: "trash_empty" }), null) });
  release(); await on;
  assert.equal(reads, 2);
});
