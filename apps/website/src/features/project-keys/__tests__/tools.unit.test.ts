import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/core/primitives";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { createProjectKeys } from "../service.js";
import { buildProjectKeyRegistrations } from "../tools.js";
import { fakeAttachments, vaultRow } from "./helpers.js";
import { saveProviderSettings } from "#src/server/runtime/composition/provider-settings-save";
import { buildCredentialSaveRegistrations } from "#src/features/custom-credentials/credential-save-tool";
import { attachedOnlyVault } from "../attached-vault.js";

async function fixture() {
  const vault = new InMemoryVaultRepo({}); const attachments = fakeAttachments();
  await vault.put({ record: vaultRow(), expectedRevision: null });
  const providerUsage = async ({ pluginId }: { pluginId: string }) => {
    const users = await attachments.usersOf({ keyId: `plugin-state:${pluginId}:provider.config` });
    return { store: "project" as const, usedByThisSite: users.some(user => user.siteId === "uuid-a"), usedBy: users.map(user => user.siteName) };
  };
  const inputs = { vault, attachments, providerUsage, siteId: "uuid-a", siteName: "A", transaction: async <T>({ run }: { run: () => Promise<T> }) => run(), reapply: async () => "now" as const };
  return { vault, attachments, inputs, keys: createProjectKeys(inputs) };
}
test("save attaches to this site immediately, and detach leaves the saved row", async () => {
  const { keys, inputs } = await fixture();
  assert.deepEqual(await keys.savedResult({ result: { created: true, credential: { id: "key-a" } }, label: "Production" }), { created: true, credential: { id: "key-a" }, keyId: "key-a", usedByThisSite: true, usedBy: ["A"], appliesAt: "now" });
  assert.deepEqual(await keys.use({ keyId: "key-a", use: true }), { keyId: "key-a", usedByThisSite: true, usedBy: ["A"], appliesAt: "now" });
  const b = createProjectKeys({ ...inputs, siteId: "uuid-b", siteName: "B" });
  assert.deepEqual(await b.list({}), [{ keyId: "key-a", name: "Production", kind: "vendor", usedByThisSite: false, usedBy: ["A"] }]);
  await b.use({ keyId: "key-a", use: true });
  await keys.use({ keyId: "key-a", use: false });
  assert.deepEqual(await b.list({}), [{ keyId: "key-a", name: "Production", kind: "vendor", usedByThisSite: true, usedBy: ["B"] }]);
  await assert.rejects(createProjectKeys({ ...inputs, siteId: "" }).use({ keyId: "key-a", use: true }), { message: "This site has no id yet; restart it." });
});

test("tool authorization precedes mutation, malformed input is refused and restart without supervisor does nothing", async () => {
  const { keys } = await fixture(); const permissions: string[] = [];
  let denied = true;
  const tools = buildProjectKeyRegistrations({ keys, surfaces: {} as never, restart: null, loadCards: async () => [], authorize: async ({ permission }) => { permissions.push(permission); if (denied && permission === "custom-credentials.write") throw new Error("denied"); } });
  const use = tools.find(tool => tool.descriptor.id === "project_key_use")!;
  const ctx = { executionId: "use", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal, input: { keyId: "key-a", use: true } };
  await assert.rejects(use.handler(ctx), { message: "denied" });
  assert.equal((await keys.list({}))[0]!.usedByThisSite, false);
  assert.deepEqual(permissions, ["custom-credentials.read", "custom-credentials.write"]);
  denied = false;
  await use.handler(ctx);
  assert.equal((await keys.list({}))[0]!.usedByThisSite, true);
  await assert.rejects(use.handler({ ...ctx, input: { ...ctx.input, secret: "refused" } }), { message: "project_key_use requires keyId and use (true or false)." });
  const restart = tools.find(tool => tool.descriptor.id === "site_restart")!;
  assert.deepEqual(await restart.handler({ ...ctx, input: {} }), { restarted: false, message: "Restart the site from the Sites list" });
});


test("restart is fail-closed without a human channel, cancellation keeps the site running, and confirmation requests one supervisor restart", async () => {
  let restarts = 0; let exchanges = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `restart-${++exchanges}` }, defaultChannel: "mcp-ui" });
  const tools = buildProjectKeyRegistrations({ surfaces: { surfaceExchanges }, restart: { async requestRestart(input, options) {
    assert.deepEqual(input, { reason: "provider-settings-live-apply" });
    assert.deepEqual(options, { awaitAcceptance: true });
    restarts++; return { accepted: true };
  } }, loadCards: async () => [], authorize: async () => {} });
  const tool = tools.find(tool => tool.descriptor.id === "site_restart")!;
  const ctx = { executionId: "restart", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal, input: {} };
  await assert.rejects(tool.handler(ctx), /no interactive confirmation channel/);
  assert.equal(restarts, 0);
  for (const decision of ["cancel", "confirm"]) {
    const result = await tool.handler(ctx, { emitSurface: async surface => {
      const text = JSON.stringify(surface);
      assert.match(text, /Unsaved work and running chats will be lost/);
      surfaceExchanges.deliver({ exchangeId: `restart-${exchanges}`, principalId: "owner", params: { decision } }, { toolId: "site_restart" });
    } });
    if (decision === "confirm") assert.deepEqual(result, { restartRequested: true, message: "The dev supervisor accepted the restart request." });
    else assert.equal((result as { restarted: boolean }).restarted, false);
  }
  assert.equal(restarts, 1);
});

test("site_restart returns the supervisor refusal and never claims an unacknowledged success", async () => {
  let exchanges = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `refused-${++exchanges}` }, defaultChannel: "mcp-ui" });
  const reason = "Site is open in Desktop. The current API is still running.";
  for (const decision of [{ accepted: false as const, reason }, undefined]) {
    const tools = buildProjectKeyRegistrations({ surfaces: { surfaceExchanges }, restart: { requestRestart: async () => decision }, loadCards: async () => [], authorize: async () => {} });
    const tool = tools.find(tool => tool.descriptor.id === "site_restart")!;
    const result = await tool.handler({ executionId: "refused", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal, input: {} }, {
      emitSurface: async () => { surfaceExchanges.deliver({ exchangeId: `refused-${exchanges}`, principalId: "owner", params: { decision: "confirm" } }, { toolId: "site_restart" }); },
    });
    assert.deepEqual(result, { restarted: false, reason: decision?.reason ?? "The dev supervisor did not confirm the restart request." });
  }
});

test("provider inventory uses manifest labels and live-apply fallback returns restart without losing the attachment", async () => {
  const { inputs, vault } = await fixture();
  const keyId = "plugin-state:analytics-example:provider.config";
  await vault.put({ record: { ...vaultRow({ id: keyId, kind: "api-connection" }), isDefault: false, label: "internal-row" }, expectedRevision: null });
  const calls: string[] = [];
  const keys = createProjectKeys({ ...inputs, reapply: async ({ pluginId }) => { calls.push(pluginId); return "restart"; } });
  assert.equal(await keys.permissionFor({ keyId }), "admin.plugins.enable");
  const result = await keys.use({ keyId, use: true });
  assert.deepEqual(result, { keyId, usedByThisSite: true, usedBy: ["A"], appliesAt: "restart" });
  assert.deepEqual(calls, ["analytics-example"]);
  const rows = await keys.list({ cards: [{ providerId: "example", label: "Example", title: "Connect Example", category: "ops", baseUrl: "", saveKind: "provider-settings", saveTarget: "analytics-example" }] });
  assert.equal(rows.find(row => row.keyId === keyId)?.name, "Example");
});

test("a site override shadows an attached project provider in use results and inventory", async () => {
  const { inputs, vault } = await fixture();
  const keyId = "plugin-state:analytics-example:provider.config";
  await vault.put({ record: { ...vaultRow({ id: keyId, kind: "api-connection" }), isDefault: false }, expectedRevision: null });
  const keys = createProjectKeys({ ...inputs, providerUsage: async () => ({ store: "site", usedByThisSite: true, usedBy: [] }) });
  assert.deepEqual(await keys.use({ keyId, use: true }), { keyId, usedByThisSite: false, usedBy: ["A"], appliesAt: "now" });
  assert.equal((await keys.list({})).find(row => row.keyId === keyId)?.usedByThisSite, false);
  assert.equal(await inputs.attachments.isAttached({ keyId, siteId: "uuid-a" }), true);
});

test("a committed provider save attaches immediately and retains the restart outcome", async () => {
  const { inputs, vault } = await fixture();
  const keys = createProjectKeys({ ...inputs, reapply: async () => "restart" });
  const pluginId = "analytics-example", keyId = `plugin-state:${pluginId}:provider.config`;
  const token = ["private", "fixture", "value"].join("-");
  let writes = 0;
  const saved = await saveProviderSettings({ pluginId, fields: [{ name: "token", label: "Token", required: true, secret: true }], values: { token },
    reapply: async () => "restart",
    config: { scope: "project", usage: inputs.providerUsage, read: async () => null, readSettings: async () => null,
      write: async () => {
        writes++;
        await vault.put({ record: { ...vaultRow({ id: keyId, kind: "api-connection" }), isDefault: false }, expectedRevision: null });
      } },
  });
  assert.deepEqual(saved, { saved: true, configured: false, store: "project", usedByThisSite: false, usedBy: [], appliesAt: "restart" });
  assert.deepEqual(await keys.savedResult({ result: { ...saved, keyId }, label: "Example" }), {
    ...saved, keyId, usedByThisSite: true, usedBy: ["A"],
  });
  assert.equal(writes, 1);
  assert.deepEqual(await inputs.attachments.usersOf({ keyId }), [{ siteId: "uuid-a", siteName: "A" }]);
  assert.equal(JSON.stringify(saved).includes(token), false);
});

for (const kind of ["publish-host", "source-control", "provider-settings", "plugin-provider"] as const) {
  test(`${kind} uses the common save-result attachment path and becomes visible on reload`, async () => {
    const { keys, inputs, vault, attachments } = await fixture();
    const keyId = kind.includes("provider") ? "plugin-state:analytics-example:provider.config" : "saved-key";
    const save = async () => {
      await vault.put({ record: { ...vaultRow({ id: keyId, kind: kind.includes("provider") ? "api-connection" : "vendor" }), label: kind, isDefault: false }, expectedRevision: null });
      return kind.includes("provider") ? { saved: true, keyId, store: "project" } : { saved: true, credentialId: keyId };
    };
    const unused = async () => assert.fail("unexpected save adapter");
    const tool = buildCredentialSaveRegistrations({ adapters: {
      apiCreate: unused, apiRotate: unused, mediaProvider: unused, agentPluginToken: unused,
      publishHost: save, sourceControl: save, providerSettings: save, pluginProvider: unused,
    }, loadPluginCredentialCards: async () => [{ providerId: "analytics", label: "Analytics", title: "Analytics", category: "ops", baseUrl: "",
      saveKind: "provider-settings", saveTarget: "analytics-example" }], authorizePluginProvider: async () => {},
      savedResult: input => keys.savedResult(input),
    })[0]!;
    const target = kind === "plugin-provider" ? "analytics" : "analytics-example";
    const result = await tool.handler({ executionId: kind, principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal, input: { kind, target } }) as { usedByThisSite: boolean; ask?: string };
    assert.equal(result.usedByThisSite, true);
    assert.equal(result.ask, undefined);
    assert.equal(await attachments.isAttached({ siteId: inputs.siteId, keyId }), true);
    assert.equal(await attachments.isAttached({ siteId: "uuid-b", keyId }), false);
    assert.equal((await attachedOnlyVault({ vault, attachments, siteId: inputs.siteId }).find({ workspaceId: "project", id: keyId }))?.id, keyId);
  });
}

test("site-only media saves, failed saves and site overrides never acquire project attachments", async () => {
  const { keys, attachments } = await fixture();
  for (const result of [{ saved: true, provider: "openai", configured: true }, { saved: false, credentialId: "key-a" },
    { saved: true, keyId: "key-a", store: "site" }]) {
    assert.equal(await keys.savedResult({ result }), result);
  }
  assert.deepEqual(await attachments.usersOf({ keyId: "key-a" }), []);
});
