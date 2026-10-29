import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ForbiddenError } from "@jini-ai/core/settings";
import { ToolInputError, type SurfaceEmission, type ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { buildVisitorToolsRegistrations, contributeVisitorTools } from "../visitor-tools-registrations.js";
import { visitorManagementFixture, readTool, pluginTool, createdTool } from "./visitor-tools-management.fixture.js";
import { nativeToolMetadata } from "../../../contracts/core/tool-metadata/index.js";

async function harness(t: TestContext) {
  const f = await visitorManagementFixture();
  let cardId = 0, memoryCalls = 0;
  const controller = new AbortController();
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: { nowMs: () => Date.now() }, idGenerator: { newId: () => `visitor-card-${++cardId}` }, defaultChannel: "mcp-ui" }, { idleTtlMs: 100, maxLifetimeMs: 1000 });
  // An unrelated saved plugin-escalation grant is deliberately present; this adapter must never use it.
  const deps = { visitorToolsManagement: f.service, nativeApprovalMemory: { has: async () => { memoryCalls++; return true; }, grant: async () => { memoryCalls++; } } };
  const surfaces = { surfaceExchanges: store };
  const registrations = buildVisitorToolsRegistrations({ deps, surfaces });
  const context = (input: unknown): ToolExecutionContext => ({ executionId: "execution-1", principal: { id: "owner" }, run: { id: "run-1" }, signal: controller.signal, input });
  const handler = (id: string) => registrations.find(r => r.descriptor.id === id)!.handler;
  const configure = async (input: Record<string, unknown>) => handler("visitor_tool_configure")(context({ expectedRevisionSeq: (await f.list()).revisionSeq, ...input }));
  const hold = async (input: Record<string, unknown>) => {
    const emissions: SurfaceEmission[] = [];
    let emitted!: () => void;
    const seen = new Promise<void>(resolve => { emitted = resolve; });
    const mutable: Record<string, unknown> = { expectedRevisionSeq: (await f.list()).revisionSeq, ...input };
    const pending = handler("visitor_tool_configure")(context(mutable), { emitSurface: async emission => { emissions.push(emission); emitted(); } });
    await seen;
    const exchangeId = `visitor-card-${cardId}`;
    return { pending, emissions, mutable, answer: (decision: string) => store.deliver({ exchangeId, principalId: "owner", params: { decision } }, { toolId: "visitor_tool_configure" }) };
  };
  t.after(() => { controller.abort(); t.mock.timers.tick(1000); });
  return { ...f, registrations, surfaces, handler, context, configure, hold, store, controller, memoryCalls: () => memoryCalls };
}

test("exactly four closed category tools expose metadata and the configure callback uses the existing redemption channel", async t => {
  const h = await harness(t);
  assert.deepEqual(h.registrations.map(r => r.descriptor.id), ["visitor_tools_list", "visitor_tool_configure", "visitor_tool_save", "visitor_tool_delete"]);
  for (const r of h.registrations) {
    assert.equal((r.descriptor.inputSchema as { additionalProperties: boolean }).additionalProperties, false);
    assert.equal(r.descriptor.metadata?.approval, nativeToolMetadata.approvals[r.descriptor.id]);
  }
  assert.equal(nativeToolMetadata.redeemableIds.has("visitor_tool_configure"), true);
  const contribution = contributeVisitorTools();
  assert.equal(contribution.domain, "visitor-tools");
  const contributed = contribution.build({ visitorToolsManagement: h.service } as Parameters<typeof contribution.build>[0], h.surfaces);
  assert.deepEqual(await contributed[0].handler(h.context({})), await h.list());
  assert.deepEqual(await h.handler("visitor_tools_list")(h.context({})), await h.list());
  assert.equal(h.store.size(), 0);
});

test("built-in read mode changes, external Off, restoring defaults and reductions need no card or emitter", async t => {
  const h = await harness(t);
  for (const mode of ["off", "ask", "auto"]) {
    await h.configure({ toolId: "list_categories", mode });
    assert.equal((await h.read())?.tools.list_categories.mode, mode);
  }
  await h.write({ version: 1, tools: { plugin_catalog: { mode: "auto", limits: { perIpPerHour: 50, perSitePerDay: 2000 } } } });
  await h.configure({ toolId: "plugin_catalog", limits: { perIpPerHour: 40, perSitePerDay: 1500 } });
  assert.deepEqual((await h.read())?.tools.plugin_catalog.limits, { perIpPerHour: 40, perSitePerDay: 1500 });
  await h.configure({ toolId: "plugin_catalog", mode: "ask" });
  assert.equal((await h.read())?.tools.plugin_catalog.mode, "ask");
  await h.configure({ toolId: "plugin_catalog", mode: "off" });
  await h.configure({ toolId: "list_categories", limits: { perIpPerHour: 20 } });
  await h.configure({ toolId: "list_categories", limits: { perIpPerHour: 30 } });
  assert.equal(h.store.size(), 0);
  assert.equal(h.memoryCalls(), 0);
});

test("every external enable and above-default increase shows one fresh, non-rememberable card with exact publication disclosure", async t => {
  const h = await harness(t);
  for (const input of [{ toolId: "plugin_catalog", mode: "ask" }, { toolId: "plugin_catalog", mode: "auto" }, { toolId: "created_catalog", mode: "auto" }, { toolId: "list_categories", limits: { perIpPerHour: 31 } }, { toolId: "site", limits: { perSitePerDay: 1001 } }]) {
    const before = await h.repo.maxRevisionSeq();
    const held = await h.hold(input);
    assert.equal(held.emissions.length, 1);
    assert.equal(await h.repo.maxRevisionSeq(), before, "no write before the human decision");
    const html = JSON.stringify(held.emissions[0].payload);
    assert.match(html, /never remembered/);
    assert.doesNotMatch(html, /Allow for this chat|Remember this/);
    if (input.toolId === "plugin_catalog") {
      assert.match(html, /catalog\.example\/public/);
      assert.match(html, /opaque-public-reader/);
      assert.match(html, /Sends requests to/);
      assert.match(html, /Uses credential/);
      assert.match(html, /Shares fields/);
      assert.match(html, /name, price/);
      assert.match(html, input.mode === "ask" ? /Off → Ask/ : /Ask → Auto/);
    }
    if (input.toolId === "list_categories") assert.match(html, /30\/hour → 31\/hour/);
    if (input.toolId === "site") assert.match(html, /1,000\/day → 1,001\/day/);
    assert.doesNotMatch(html, /sourceRevision|returnedFields|perIpPerHour|perSitePerDay/);
    assert.deepEqual(held.answer("confirm"), { ok: true });
    const result = await held.pending;
    assert.deepEqual(result, await h.list());
    assert.ok(await h.repo.maxRevisionSeq() > before);
    assert.equal(h.store.size(), 0);
  }
  assert.equal(h.memoryCalls(), 0);
});

test("chat can list and repair an unreadable policy without any confirmation channel", async t => {
  const h = await harness(t);
  await h.write();
  const definition = (await h.repo.findActiveDefinition({ namespace: "site.assistant", key: "visitor_tools", workspaceId: h.input.workspaceId }))!;
  const row = (await h.repo.getWorkspaceValue({ workspaceId: h.input.workspaceId, settingId: definition.settingId }))!;
  await h.repo.saveWorkspaceValue({ ...row, valueJson: { version: 2 } });
  const listed = await h.handler("visitor_tools_list")(h.context({})) as Awaited<ReturnType<typeof h.list>>;
  assert.equal(listed.policyState, "invalid");
  assert.ok(listed.tools.every(tool => tool.mode === "off"));
  await assert.rejects(h.configure({ toolId: "plugin_catalog", mode: "auto" }), /turn all tools Off to reset it/);
  const repaired = await h.configure({ toolId: "site", mode: "off" }) as Awaited<ReturnType<typeof h.list>>;
  assert.equal(repaired.policyState, undefined);
  assert.ok(repaired.tools.every(tool => tool.mode === "off"));
  assert.equal(h.store.size(), 0);
  assert.equal(h.memoryCalls(), 0);
});

test("cancellation, expiration, abort and missing interactive channel never publish", async t => {
  const h = await harness(t);
  const before = await h.repo.maxRevisionSeq();
  const declined = await h.hold({ toolId: "plugin_catalog", mode: "auto" });
  declined.answer("cancel");
  assert.equal((await declined.pending as { changed: boolean }).changed, false);
  const expired = await h.hold({ toolId: "plugin_catalog", mode: "auto" });
  t.mock.timers.tick(100);
  assert.equal((await expired.pending as { reason: string }).reason, "expired");
  await assert.rejects(h.configure({ toolId: "plugin_catalog", mode: "auto" }), /NO_CONFIRMATION_CHANNEL/);
  const aborted = await h.hold({ toolId: "plugin_catalog", mode: "auto" });
  h.controller.abort();
  assert.equal((await aborted.pending as { changed: boolean }).changed, false);
  assert.equal(await h.repo.maxRevisionSeq(), before);
  assert.equal(h.store.size(), 0);
});

test("model input mutations and forged confirmation fields cannot substitute a different publication", async t => {
  const h = await harness(t);
  const held = await h.hold({ toolId: "plugin_catalog", mode: "auto" });
  held.mutable.toolId = "created_catalog";
  held.mutable.mode = "off";
  held.answer("confirm");
  await held.pending;
  assert.equal((await h.read())?.tools.plugin_catalog.mode, "auto");
  assert.equal((await h.list()).tools.find(t => t.id === "created_catalog")?.mode, "off");
  await assert.rejects(h.configure({ toolId: "created_catalog", mode: "auto", confirmed: true }), ToolInputError);
});

test("a competing page edit while a card is open returns a reload result; no approved overwrite", async t => {
  const h = await harness(t);
  const held = await h.hold({ toolId: "plugin_catalog", mode: "auto" });
  await h.write({ version: 1, tools: { list_categories: { mode: "off" } } });
  held.answer("confirm");
  assert.deepEqual(await held.pending, { changed: false, code: "VISITOR_TOOLS_REVISION_CONFLICT", reload: true, note: "Visitor tools changed. List them again before retrying." });
  assert.equal((await h.read())?.tools.plugin_catalog, undefined);
  assert.equal((await h.read())?.tools.list_categories.mode, "off");
  const stale = await h.handler("visitor_tool_configure")(h.context({ toolId: "site", mode: "off", expectedRevisionSeq: 0 }));
  assert.equal((stale as { reload: boolean }).reload, true);
});

test("revoked permission and mutated source contracts are checked again after the click", async t => {
  const h = await harness(t);
  const held = await h.hold({ toolId: "plugin_catalog", mode: "auto" });
  h.grants.clear();
  const rejected = assert.rejects(held.pending, ForbiddenError);
  held.answer("confirm");
  await rejected;
  h.grants.add("visitor-tools.manage");
  const mutablePlugin = { ...pluginTool };
  const catalog = [readTool, mutablePlugin, createdTool];
  h.setCatalog(catalog);
  const changed = await h.hold({ toolId: "plugin_catalog", mode: "auto" });
  mutablePlugin.sourceRevision = "retargeted-v2";
  changed.answer("confirm");
  assert.equal((await changed.pending as { reload: boolean }).reload, true);
  assert.equal((await h.read())?.tools.plugin_catalog, undefined);
});

test("deferred save/delete check permissions and refuse unknown fields without writing; invalid input and missing composition are actionable", async t => {
  const h = await harness(t);
  const before = await h.repo.maxRevisionSeq();
  for (const [id, input] of [["visitor_tool_save", {}], ["visitor_tool_delete", { toolId: "created_catalog" }]] as const) {
    assert.deepEqual(await h.handler(id)(h.context(input)), { available: false, code: "VISITOR_TOOLS_T4_REQUIRED" });
    await assert.rejects(h.handler(id)(h.context({ ...input, approved: true })), ToolInputError);
    h.grants.clear();
    await assert.rejects(h.handler(id)(h.context(input)), ForbiddenError);
    h.grants.add("visitor-tools.manage");
  }
  for (const input of [{}, { toolId: 1 }, { toolId: " " }]) await assert.rejects(h.handler("visitor_tool_delete")(h.context(input)), ToolInputError);
  await assert.rejects(h.handler("visitor_tools_list")(h.context({ bogus: true })), ToolInputError);
  const unwired = buildVisitorToolsRegistrations({ deps: {}, surfaces: h.surfaces });
  await assert.rejects(unwired[0].handler(h.context({})), /unavailable in this server/);
  const broken = buildVisitorToolsRegistrations({ deps: { visitorToolsManagement: { ...h.service, list: async () => { throw new Error("storage down"); } } }, surfaces: h.surfaces });
  await assert.rejects(broken[0].handler(h.context({})), /storage down/);
  assert.equal(await h.repo.maxRevisionSeq(), before);
});
