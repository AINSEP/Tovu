import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/core/primitives";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { createProjectKeys } from "../service.js";
import { buildProjectKeyRegistrations } from "../tools.js";
import { fakeAttachments, vaultRow } from "./helpers.js";

async function fixture() {
  const vault = new InMemoryVaultRepo({}); const attachments = fakeAttachments();
  await vault.put({ record: vaultRow(), expectedRevision: null });
  const inputs = { vault, attachments, siteId: "uuid-a", siteName: "A", transaction: async <T>({ run }: { run: () => Promise<T> }) => run(), reapply: async () => "now" as const };
  return { vault, attachments, inputs, keys: createProjectKeys(inputs) };
}
test("save asks once, explicit attach changes only this site, and detach leaves the saved row", async () => {
  const { keys, inputs } = await fixture();
  assert.deepEqual(await keys.savedResult({ result: { created: true, credential: { id: "key-a" } }, label: "Production" }), { created: true, credential: { id: "key-a" }, keyId: "key-a", usedByThisSite: false, usedBy: [], ask: "Apply this Production key to A?" });
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
  assert.deepEqual(permissions, ["custom-credentials.write"]);
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
  const tools = buildProjectKeyRegistrations({ surfaces: { surfaceExchanges }, restart: { requestRestart() { restarts++; } }, loadCards: async () => [], authorize: async () => {} });
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
    assert.equal((result as { restarted: boolean }).restarted, decision === "confirm");
  }
  assert.equal(restarts, 1);
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
