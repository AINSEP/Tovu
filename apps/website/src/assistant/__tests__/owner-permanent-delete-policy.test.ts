import assert from "node:assert/strict";
import test from "node:test";
import { readChatPermanentDeletesPolicy, type PermanentDeleteSettingsDeps } from "../permanent-delete-settings.js";
import { createChatDeleteScope, ALL_CHAT_DELETE_TOOLS } from "../permanent-delete-tool-gate.js";
import { isChatToolAllowed } from "../assistant-permanent-deletes-policy.js";

function fixture() {
  let reads = 0;
  const deps = {
    workspaceId: "site", ownerPrincipalId: Promise.resolve("owner"), settingsReady: Promise.resolve(),
    settingsRepo: {} as PermanentDeleteSettingsDeps["settingsRepo"],
    getEffective: async () => { reads++; return { value: { enabled: false, allowedToolIds: [] }, sourceLayer: "workspace", defVersion: 1 }; },
  } as PermanentDeleteSettingsDeps & { ownerPrincipalId: Promise<string> };
  return { deps, reads: () => reads };
}

test("the authenticated owner sees every supported permanent delete even when the site grant is off", async () => {
  const f = fixture();
  const policy = await readChatPermanentDeletesPolicy({ ...f.deps, principalId: "owner" });
  assert.deepEqual(policy, ALL_CHAT_DELETE_TOOLS);
  for (const toolId of ["media_purge_asset", "trash_empty", "identity_user_delete", "identity_role_delete", "custom_credential_delete", "external_mcp_delete", "deployment_ops_unset_secret"]) {
    assert.equal(isChatToolAllowed({ toolId, policy }), true, toolId);
  }
  assert.equal(f.reads(), 0);
  for (const toolId of ["workspace_delete", "collections_execute_cleanup"]) assert.equal(isChatToolAllowed({ toolId, policy }), false);
});

test("non-owners and missing identities retain the explicit grant and cannot inherit an owner run", async () => {
  const f = fixture();
  const scope = createChatDeleteScope({ readPolicy: input => readChatPermanentDeletesPolicy({ ...f.deps, ...input }) });
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const owner = scope.fresh({ principalId: "owner", run: async () => { await wait; assert.equal(scope.policy().enabled, true); } });
  for (const principalId of ["admin", undefined]) {
    await scope.fresh({ principalId, run: () => assert.equal(scope.policy().enabled, false) });
  }
  release(); await owner;
  assert.equal(scope.policy().enabled, false);
  assert.equal(f.reads(), 2);
});

test("owner lookup errors fail closed instead of granting deletion", async () => {
  const f = fixture();
  await assert.rejects(readChatPermanentDeletesPolicy({ ...f.deps, principalId: "owner", ownerPrincipalId: Promise.reject(new Error("owner unavailable")) }), /owner unavailable/);
});
