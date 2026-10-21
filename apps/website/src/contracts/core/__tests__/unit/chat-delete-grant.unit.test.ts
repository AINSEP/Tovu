import assert from "node:assert/strict";
import test from "node:test";
import { chatDeleteRefusal, requireChatDeleteGrant, type ChatDeleteSurfaceDeps } from "../../chat-delete-grant.js";
import { PERMANENT_DELETE_TOOLS, isChatToolAllowed } from "../../../headless/assistant-permanent-deletes-policy.js";

test("delete refusals point to the human admin screen when one exists", () => {
  assert.equal(chatDeleteRefusal({ toolId: "trash_empty" }, {}).message,
    "trash_empty: permanent deletes from chat are disabled. Open /admin/trash to delete it as a human. Nothing was deleted.");
});

for (const toolId of ["deployment_ops_unset_secret", "unknown_delete"]) {
  test(`${toolId} refusal honestly says there is no admin screen`, () => {
    assert.equal(chatDeleteRefusal({ toolId }).message,
      `${toolId}: permanent deletes from chat are disabled. There is no Tovu admin screen for this operation. Nothing was deleted.`);
  });
}

test("ordinary tools need no delete grant and never call the grant reader", async () => {
  await requireChatDeleteGrant({ toolId: "trash_list_items", surfaces: {
    assertChatDeleteAllowed: async () => { assert.fail("ordinary reads must not request a delete grant"); },
  } as unknown as ChatDeleteSurfaceDeps }, {});
});

test("eligible deletes fail closed when the grant reader is missing", async () => {
  await assert.rejects(requireChatDeleteGrant({ toolId: "trash_empty", surfaces: {} as ChatDeleteSurfaceDeps }), {
    name: "ToolInputError",
    message: "trash_empty: permanent deletes from chat are disabled. Open /admin/trash to delete it as a human. Nothing was deleted.",
  });
});

test("eligible deletes await a fresh grant on every call and propagate a later revocation", async () => {
  let reads = 0;
  let release!: () => void;
  const approval = new Promise<void>(resolve => { release = resolve; });
  const revoked = new Error("the owner revoked permanent deletes");
  const surfaces = { assertChatDeleteAllowed: async (required: { toolId: string }) => {
    assert.deepEqual(required, { toolId: "trash_empty" });
    if (++reads > 1) throw revoked;
    await approval;
  } } as ChatDeleteSurfaceDeps;
  let authorized = false;
  const pending = requireChatDeleteGrant({ surfaces, toolId: "trash_empty" }).then(() => { authorized = true; });
  await Promise.resolve();
  assert.equal(authorized, false);
  release();
  await pending;
  assert.equal(authorized, true);
  await assert.rejects(requireChatDeleteGrant({ surfaces, toolId: "trash_empty" }), error => error === revoked);
  assert.equal(reads, 2);
});

test("each eligible permanent delete needs both the enabled switch and its own grant", () => {
  for (const { id: toolId } of PERMANENT_DELETE_TOOLS) {
    assert.equal(isChatToolAllowed({ toolId, policy: { enabled: false, allowedToolIds: [toolId] } }, {}), false);
    assert.equal(isChatToolAllowed({ toolId, policy: { enabled: true, allowedToolIds: [] } }), false);
    assert.equal(isChatToolAllowed({ toolId, policy: { enabled: true, allowedToolIds: [toolId] } }), true);
  }
});

for (const toolId of ["workspace_delete", "collections_execute_cleanup"]) {
  test(`${toolId} stays forbidden even when explicitly listed in an enabled policy`, () => {
    assert.equal(isChatToolAllowed({ toolId, policy: { enabled: true, allowedToolIds: [toolId] } }), false);
  });
}

test("ordinary tools stay visible when permanent deletes are disabled", () => {
  assert.equal(isChatToolAllowed({ toolId: "trash_list_items", policy: { enabled: false, allowedToolIds: [] } }), true);
});

test("eligible deletes forward the acting principal to the grant reader when one is known", async () => {
  const reads: Array<{ toolId: string; principalId?: string }> = [];
  const surfaces = { assertChatDeleteAllowed: async (required: { toolId: string; principalId?: string }) => { reads.push(required); } } as ChatDeleteSurfaceDeps;
  await requireChatDeleteGrant({ surfaces, toolId: "trash_empty", principalId: "user-42" });
  assert.deepEqual(reads, [{ toolId: "trash_empty", principalId: "user-42" }]);
});
