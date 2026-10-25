import assert from "node:assert/strict";
import test from "node:test";
import { readChatPermanentDeletesPolicy, type PermanentDeleteSettingsDeps } from "../permanent-delete-settings.js";
import { createChatDeleteScope, ALL_CHAT_DELETE_TOOLS } from "../permanent-delete-tool-gate.js";
import { isChatToolAllowed } from "../../contracts/headless/assistant-permanent-deletes-policy.js";

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

// L11 Stryker: the stored-grant shape checks (length cap, duplicates, unknown ids, `.some` vs
// `.every`) had no negative test. Each malformed value must read as the OFF policy.
import { readAssistantPermanentDeletesPolicy } from "../permanent-delete-settings.js";
import { ASSISTANT_PERMANENT_DELETES_KEY, ASSISTANT_PERMANENT_DELETES_NAMESPACE, PERMANENT_DELETE_TOOLS } from "../../contracts/headless/assistant-permanent-deletes-policy.js";

function stored(value: unknown) {
  const calls: unknown[] = [];
  const deps = {
    workspaceId: "site-7", settingsReady: Promise.resolve(), settingsRepo: {} as PermanentDeleteSettingsDeps["settingsRepo"],
    getEffective: (async (required: unknown, optional: unknown) => { calls.push([required, optional]); return value === undefined ? null : { value, sourceLayer: "workspace", defVersion: 1 }; }) as unknown as PermanentDeleteSettingsDeps["getEffective"],
  };
  return { deps, calls };
}
const allIds = PERMANENT_DELETE_TOOLS.map(tool => tool.id);
const OFF = { enabled: false, allowedToolIds: [] };

test("a valid stored grant is returned as a copy, read from this workspace's own setting", async () => {
  const value = { enabled: true, allowedToolIds: ["trash_empty", "media_purge_asset"] };
  const f = stored(value);
  const policy = await readAssistantPermanentDeletesPolicy(f.deps);
  assert.deepEqual(policy, value);
  assert.notEqual(policy.allowedToolIds, value.allowedToolIds);
  assert.deepEqual(f.calls, [[{ repo: f.deps.settingsRepo }, { namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key: ASSISTANT_PERMANENT_DELETES_KEY, scopeContext: { workspaceId: "site-7" } }]]);
  assert.deepEqual(await readAssistantPermanentDeletesPolicy(stored({ enabled: true, allowedToolIds: allIds }).deps), { enabled: true, allowedToolIds: allIds }, "every supported id at once is valid");
  assert.deepEqual(await readAssistantPermanentDeletesPolicy(stored({ enabled: false, allowedToolIds: ["trash_empty"] }).deps), { enabled: false, allowedToolIds: ["trash_empty"] });
});

test("absent or malformed stored grants deny", async () => {
  for (const value of [
    undefined, null, "on", { allowedToolIds: [] }, { enabled: "true", allowedToolIds: [] }, { enabled: true },
    { enabled: true, allowedToolIds: "trash_empty" },
    { enabled: true, allowedToolIds: [...allIds, "trash_empty"] },
    { enabled: true, allowedToolIds: ["trash_empty", "trash_empty"] },
    { enabled: true, allowedToolIds: ["workspace_delete", "trash_empty", "media_purge_asset"] },
    { enabled: true, allowedToolIds: ["trash_empty", "workspace_delete", "media_purge_asset"] },
    { enabled: true, allowedToolIds: ["trash_empty", "media_purge_asset", "workspace_delete"] },
  ]) {
    assert.deepEqual(await readAssistantPermanentDeletesPolicy(stored(value).deps), OFF, JSON.stringify(value));
  }
});

test("settings that are not ready propagate instead of granting", async () => {
  const f = stored({ enabled: true, allowedToolIds: ["trash_empty"] });
  await assert.rejects(readAssistantPermanentDeletesPolicy({ ...f.deps, settingsReady: Promise.reject(new Error("settings not ready")) }), /settings not ready/);
  assert.equal(f.calls.length, 0);
});
