import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenError, InMemorySettingsRepo } from "@jini-ai/core/settings";
import { createVisitorToolsManagement } from "../visitor-tools-service.js";
import { VisitorToolsRevisionConflictError } from "../visitor-tools-write.js";
import { VisitorToolPolicyValidationError } from "../../../contracts/site-assistant/visitor-tools.js";
import { visitorManagementFixture, readTool, pluginTool, createdTool } from "./visitor-tools-management.fixture.js";
import { ws } from "./visitor-tools.fixture.js";

test("list combines source eligibility, frozen upgrade defaults, configured choices and unavailable entries without enabling them", async () => {
  const f = await visitorManagementFixture();
  const initial = await f.list();
  assert.equal(initial.revisionSeq, 0);
  assert.deepEqual(initial.defaults, { perIpPerHour: 30, perSitePerDay: 1000 });
  assert.equal(initial.callsPerTurn, 4);
  assert.deepEqual(initial.tools.map(t => [t.id, t.mode]), [["list_categories", "auto"], ["plugin_catalog", "off"], ["created_catalog", "off"]]);
  await f.write({ version: 1, tools: { disappeared: { mode: "auto" } } });
  const missing = (await f.list()).tools.find(t => t.id === "disappeared")!;
  assert.equal(missing.source, "unavailable");
  assert.equal(missing.availability.available, false);
  await assert.rejects(f.prepare({ toolId: "disappeared", mode: "auto" }), VisitorToolPolicyValidationError);
  const prepared = await f.prepare({ toolId: "disappeared", mode: "off" });
  assert.equal(prepared.requiresApproval, false);
  const result = await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared });
  assert.equal(result.tools.find(t => t.id === "disappeared")?.mode, "off");
  assert.equal((await f.read())?.tools.disappeared.mode, "off");
});

test("single and site patches preserve other dimensions, merge atomically, and gate mixed source exposure once", async () => {
  const f = await visitorManagementFixture();
  const first = await f.prepare({ toolId: "list_categories", limits: { perIpPerHour: 10 } });
  assert.equal(first.requiresApproval, false);
  const result = await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared: first });
  assert.deepEqual(result.tools[0].limits, { perIpPerHour: 10, perSitePerDay: 1000 });
  assert.equal(result.tools[0].mode, "auto");
  const both = await f.prepare({ toolId: "site", mode: "ask", limits: { perSitePerDay: 20 } });
  assert.equal(both.requiresApproval, true);
  assert.equal(both.changes.length, 3);
  const saved = await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared: both });
  assert.deepEqual(saved.tools.map(t => t.mode), ["ask", "ask", "ask"]);
  assert.equal(saved.tools[0].limits.perIpPerHour, 10);
  assert.equal(saved.tools[1].limits.perIpPerHour, 30);
  assert.deepEqual(await f.read(), both.policy);
  const off = await f.prepare({ toolId: "site", mode: "off" });
  assert.equal(off.requiresApproval, false);
  await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared: off });
  assert.ok((await f.list()).tools.every(t => t.mode === "off"));
});

test("unavailable sources never join site enable; unknown ids and an empty catalog refuse without writes", async () => {
  const f = await visitorManagementFixture();
  f.setCatalog([readTool, { ...pluginTool, availability: { available: false, reason: "disabled" } }]);
  const prepared = await f.prepare({ toolId: "site", mode: "auto" });
  assert.deepEqual(prepared.changes.map(c => c.tool.id), ["list_categories"]);
  await assert.rejects(f.prepare({ toolId: "settings_set_value", mode: "auto" }), /unavailable/);
  await assert.rejects(f.prepare({ toolId: "plugin_catalog", limits: { perIpPerHour: 1 } }), /only be switched Off/);
  const off = await f.prepare({ toolId: "plugin_catalog", mode: "off" });
  assert.equal(off.requiresApproval, false);
  f.setCatalog([]);
  await assert.rejects(f.prepare({ toolId: "site", mode: "auto" }), /unavailable/);
  assert.equal((await f.list()).revisionSeq, 0);
});

test("prepared concurrent edits and catalog changes cannot silently overwrite or retarget an approval", async () => {
  const f = await visitorManagementFixture();
  const a = await f.prepare({ toolId: "plugin_catalog", mode: "auto" });
  const b = await f.prepare({ toolId: "list_categories", mode: "off" });
  await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared: b });
  await assert.rejects(f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared: a }), VisitorToolsRevisionConflictError);
  await assert.rejects(f.prepare({ toolId: "plugin_catalog", mode: "auto", expectedRevisionSeq: 0 }), VisitorToolsRevisionConflictError);
  const next = await f.prepare({ toolId: "plugin_catalog", mode: "auto" });
  f.setCatalog([readTool, { ...pluginTool, sourceRevision: "v2", publication: { ...pluginTool.publication!, endpoint: "https://catalog.example/private" } }, createdTool]);
  await assert.rejects(f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared: next }), /sources changed/);
  assert.equal((await f.list()).tools.find(t => t.id === "plugin_catalog")?.mode, "off");
});

test("permission is fresh on list, prepare and apply; missing definitions remain infrastructure failures", async () => {
  const f = await visitorManagementFixture();
  const prepared = await f.prepare({ toolId: "list_categories", mode: "off" });
  f.grants.clear();
  await assert.rejects(f.list(), ForbiddenError);
  await assert.rejects(f.prepare({ toolId: "list_categories", mode: "off" }), ForbiddenError);
  await assert.rejects(f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared }), ForbiddenError);
  const absent = createVisitorToolsManagement({ deps: { workspaceId: ws, settings: { ...f.deps, repo: new InMemorySettingsRepo() }, ready: Promise.resolve(), listCatalog: async () => [] } });
  f.grants.add("visitor-tools.manage");
  await assert.rejects(absent.list({ callerPrincipalId: "owner" }), /unavailable/);
});

test("catalog bounds reject ambiguous identities; overflow reclaims only unavailable Off entries", async () => {
  const f = await visitorManagementFixture();
  for (const catalog of [[readTool, readTool], [{ ...readTool, id: "site" }], [{ ...readTool, id: "../admin" }], Array.from({ length: 129 }, (_, n) => ({ ...readTool, id: `tool_${n}` }))]) {
    f.setCatalog(catalog);
    await assert.rejects(f.list(), /catalog/);
  }
  await f.write({ version: 1, tools: Object.fromEntries(Array.from({ length: 128 }, (_, n) => [`old_${n}`, { mode: "off" }])) });
  f.setCatalog([readTool]);
  const prepared = await f.prepare({ toolId: "site", mode: "off" });
  assert.deepEqual(Object.keys(prepared.policy.tools), [readTool.id]);
  assert.equal(prepared.requiresApproval, false);
  await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared });
  assert.deepEqual(await f.read(), prepared.policy);
  await f.write({ version: 1, tools: Object.fromEntries(Array.from({ length: 128 }, (_, n) => [`old_${n}`, { mode: "auto" }])) });
  const before = await f.repo.maxRevisionSeq();
  await assert.rejects(f.prepare({ toolId: "site", mode: "off" }), /Turn unavailable entries Off first: old_0,.*old_127/);
  assert.equal(await f.repo.maxRevisionSeq(), before);
});

test("corrupt, future and oversized policies list as invalid/Off and accept only a revisioned site Off repair", async () => {
  const invalidPolicies: import("@jini-ai/core/primitives").JsonObject[] = [{ corrupt: true }, { version: 2, tools: {} },
    { version: 1, tools: Object.fromEntries(Array.from({ length: 129 }, (_, n) => [`old_${n}`, { mode: "off" }])) }];
  for (const valueJson of invalidPolicies) {
    const f = await visitorManagementFixture();
    await f.write();
    const definition = (await f.repo.findActiveDefinition({ namespace: "site.assistant", key: "visitor_tools", workspaceId: ws }))!;
    const row = (await f.repo.getWorkspaceValue({ workspaceId: ws, settingId: definition.settingId }))!;
    await f.repo.saveWorkspaceValue({ ...row, valueJson });
    const current = await f.list();
    assert.equal(current.revisionSeq, row.seq);
    assert.equal(current.policyState, "invalid");
    assert.deepEqual(current.tools.map(t => [t.id, t.mode]), [[readTool.id, "off"], [pluginTool.id, "off"], [createdTool.id, "off"]]);
    const before = await f.repo.maxRevisionSeq();
    for (const input of [{ toolId: "site", mode: "auto" }, { toolId: readTool.id, mode: "off" },
      { toolId: "site", limits: { perIpPerHour: 1 } }, { toolId: "site", mode: "off", limits: { perIpPerHour: 1 } }] as const) {
      await assert.rejects(f.prepare(input), /Stored visitor-tools policy is unreadable; turn all tools Off to reset it\./);
    }
    await assert.rejects(f.prepare({ toolId: "site", mode: "off", expectedRevisionSeq: 0 }), VisitorToolsRevisionConflictError);
    assert.equal(await f.repo.maxRevisionSeq(), before);
    const prepared = await f.prepare({ toolId: "site", mode: "off" });
    assert.equal(prepared.requiresApproval, false);
    const result = await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared });
    assert.equal(result.policyState, undefined);
    assert.ok(result.tools.every(t => t.mode === "off"));
    assert.deepEqual(Object.keys((await f.read())!.tools), [readTool.id, pluginTool.id, createdTool.id]);
    assert.equal(await f.repo.maxRevisionSeq(), before + 1, "repair is recorded by the existing ledger");
    const revisions = await f.repo.listRevisionsSince({ sinceSeq: before, workspaceId: ws, limit: 10 });
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].actor, f.callerPrincipalId);
    assert.equal(revisions[0].op, "set");
    assert.deepEqual(revisions[0].afterJson, prepared.policy);
  }
});

test("invalid policy repair also works when every source has disappeared", async () => {
  const f = await visitorManagementFixture();
  await f.write();
  const definition = (await f.repo.findActiveDefinition({ namespace: "site.assistant", key: "visitor_tools", workspaceId: ws }))!;
  const row = (await f.repo.getWorkspaceValue({ workspaceId: ws, settingId: definition.settingId }))!;
  await f.repo.saveWorkspaceValue({ ...row, valueJson: null });
  f.setCatalog([]);
  const prepared = await f.prepare({ toolId: "site", mode: "off" });
  await f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared });
  assert.deepEqual(await f.read(), { version: 1, tools: {} });
  assert.equal((await f.list()).policyState, undefined);
});

test("overlapping applies on the same prepared revision commit exactly one policy and ledger revision", async () => {
  const f = await visitorManagementFixture();
  const prepared = await f.prepare({ toolId: "site", mode: "off" });
  const before = await f.repo.maxRevisionSeq();
  const results = await Promise.allSettled([
    f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared }),
    f.service.apply({ callerPrincipalId: f.callerPrincipalId, prepared }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.filter(r => r.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof VisitorToolsRevisionConflictError);
  assert.deepEqual(await f.read(), prepared.policy);
  assert.equal(await f.repo.maxRevisionSeq(), before + 1);
  assert.equal((await f.repo.listRevisionsSince({ sinceSeq: before, workspaceId: ws, limit: 10 })).length, 1);
});
