/** guide contract: live site facts reuse Site Inspection and gate each registry read. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySettingsRepo, getEffective } from "@jini-ai/core/settings";
import { readSiteGuideFacts, type SiteGuideFactsDeps } from "../facts.js";

function fixture() {
  const reads: string[] = []; const grants = new Set(["theme.set", "admin.plugins.read", "admin.collections.read", "admin.forms.manage", "widgets.read", "member.manage"]);
  let widgetTypes = ["contact-form"]; let enabled = false;
  const theme = { manifest: { id: "test-theme", name: "Test", version: "1.0.0", tier: "static", privateField: "PRIVATE_CANARY" }, source: "site", status: "valid", errors: [], dir: "PRIVATE_CANARY" };
  const deps: SiteGuideFactsDeps = {
    workspaceId: "site-a", authorize: async input => { assert.equal(input.workspaceId, "site-a"); assert.equal(input.principalId, "editor"); return { allowed: grants.has(input.permission), reason: "test decision" }; },
    clock: { nowIso: () => "2026-10-09T00:00:00Z" }, postRepo: { list: async () => { throw new Error("Unrequested content body read"); } },
    themes: [theme], presentationRepo: { findByWorkspaceId: async () => ({ activeThemeId: "test-theme" }) },
    settingsRepo: new InMemorySettingsRepo(), getEffective,
    contentTypeRepo: { listByWorkspace: async () => [{ key: "planner", label: "Planner", version: 1, status: "active", fields: [{ hidden: "PRIVATE_CANARY" }] }] },
    discoverPlugins: async () => { reads.push("site-plugins"); return [{ id: "word-count", name: "Word Count", version: "1.0.0", source: "site", status: "valid" }]; },
    pluginActivationRepo: { listAll: async () => [{ pluginId: "word-count", workspaceId: "site-a", enabled: false }, { pluginId: "word-count", workspaceId: "other-site", enabled: true }] },
    listWidgetTypes: () => { reads.push("widgets"); return widgetTypes; }, listFormFieldTypes: () => { reads.push("forms"); return ["text", "email"]; },
    listMarkers: () => { reads.push("markers"); return ["form", "widget"]; }, listLayouts: () => ["pages", "render/pages"],
    readMembersEnabled: async () => { reads.push("members"); return enabled; },
    readAgentPlugins: async () => { reads.push("agent-plugins"); return [{ id: "tovu/how-tovu-works", name: "How Tovu works", version: "0.1.0", enabled: true }]; },
  };
  return { deps, reads, grants, setWidgets: (next: string[]) => { widgetTypes = next; }, setMembers: (next: boolean) => { enabled = next; } };
}
const caller = { principalId: "editor" };
test("guide facts expose supported fields/types, markers/layouts, configured theme and activation for THIS site", async () => {
  const f = fixture(); const facts = await readSiteGuideFacts({ deps: f.deps, caller, topics: ["content", "forms", "widgets", "themes", "plugins", "members"] });
  assert.deepEqual(facts.forms, { status: "ok", data: { fieldTypes: ["text", "email"] } });
  assert.deepEqual(facts.widgets, { status: "ok", data: { types: ["contact-form"] } });
  assert.deepEqual(facts.members, { status: "ok", data: { enabled: false } });
  assert.equal(facts.themes?.status, "ok"); assert.equal(facts.plugins?.status, "ok");
  const pluginData = (facts.plugins as { data: { profile: { enabled: boolean }[]; registry: unknown } }).data;
  assert.equal(pluginData.profile[0]?.enabled, false); // Another site's activation must not win.
  assert.deepEqual(pluginData.registry, { agentPlugins: [{ id: "tovu/how-tovu-works", name: "How Tovu works", version: "0.1.0", enabled: true }] });
  assert.ok(!JSON.stringify(facts).includes("PRIVATE_CANARY"));
});
test("guide facts deny before reading registries or installed plugins", async () => {
  const f = fixture(); f.grants.clear();
  const facts = await readSiteGuideFacts({ deps: f.deps, caller, topics: ["forms", "widgets", "themes", "plugins", "members"] });
  assert.deepEqual(facts, { themes: { status: "forbidden" }, plugins: { status: "forbidden" }, widgets: { status: "forbidden" }, forms: { status: "forbidden" }, members: { status: "forbidden" } });
  assert.deepEqual(f.reads, []);
});
test("guide facts stay live and a failing membership read stays unknown", async () => {
  const f = fixture();
  await readSiteGuideFacts({ deps: f.deps, caller, topics: ["widgets", "members"] });
  f.setWidgets(["text", "contact-form"]); f.setMembers(true);
  assert.deepEqual(await readSiteGuideFacts({ deps: f.deps, caller, topics: ["widgets", "members"] }), { widgets: { status: "ok", data: { types: ["text", "contact-form"] } }, members: { status: "ok", data: { enabled: true } } });
  const failed = await readSiteGuideFacts({ deps: { ...f.deps, readMembersEnabled: async () => { throw new Error("PRIVATE_CANARY"); } }, caller, topics: ["members"] });
  assert.deepEqual(failed, { members: { status: "unavailable" } });
});
test("guide facts read only requested topics", async () => {
  const f = fixture(); const facts = await readSiteGuideFacts({ deps: f.deps, caller, topics: ["forms"] });
  assert.deepEqual(Object.keys(facts), ["forms"]); assert.deepEqual(f.reads, ["forms"]);
});

test("a host without a membership toggle reports unavailable rather than enabled or disabled", async () => {
  const f = fixture();
  assert.deepEqual(await readSiteGuideFacts({ deps: { ...f.deps, readMembersEnabled: async () => null }, caller, topics: ["members"] }), { members: { status: "unavailable" } });
});

test("guide facts omit unknown and unrequested topics without reading any registry", async () => {
  const f = fixture();
  assert.deepEqual(await readSiteGuideFacts({ deps: f.deps, caller, topics: ["unknown"] }, {}), {});
  assert.deepEqual(f.reads, []);
});

test("authorization failures hide their details and never read the requested registry", async () => {
  const f = fixture();
  const deps = { ...f.deps, authorize: async () => { throw new Error("PRIVATE_CANARY"); } };
  assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: ["widgets"] }), { widgets: { status: "unavailable" } });
  assert.deepEqual(f.reads, []);
});

for (const topic of ["themes", "plugins"] as const) {
  test(`${topic} facts stay unavailable when the profile read fails but the registry succeeds`, async () => {
    const f = fixture();
    const fail = async (): Promise<never> => { throw new Error("PRIVATE_CANARY"); };
    const deps = topic === "themes" ? { ...f.deps, presentationRepo: { findByWorkspaceId: fail } }
      : { ...f.deps, discoverPlugins: fail };
    assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: [topic] }), { [topic]: { status: "unavailable" } });
    assert.ok(f.reads.includes(topic === "themes" ? "markers" : "agent-plugins"));
  });

  test(`${topic} facts stay unavailable when the registry read fails after a successful profile`, async () => {
    const f = fixture();
    const fail = () => { throw new Error("PRIVATE_CANARY"); };
    const deps = topic === "themes" ? { ...f.deps, listMarkers: fail }
      : { ...f.deps, readAgentPlugins: async () => fail() };
    assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: [topic] }), { [topic]: { status: "unavailable" } });
  });

  test(`${topic} facts report forbidden when only the second permission check denies access`, async () => {
    const f = fixture();
    let decisions = 0;
    const deps = { ...f.deps, authorize: async () => ({ allowed: ++decisions === 1, reason: "test decision" }) };
    assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: [topic] }), { [topic]: { status: "forbidden" } });
    assert.equal(decisions, 2);
    assert.equal(f.reads.includes(topic === "themes" ? "markers" : "agent-plugins"), false);
  });
}

test("guide facts deduplicate topics and preserve profile-first key and registry read order", async () => {
  const f = fixture();
  const facts = await readSiteGuideFacts({ deps: f.deps, caller, topics: ["members", "plugins", "forms", "content", "themes", "widgets", "plugins", "unknown"] });
  assert.deepEqual(Object.keys(facts), ["themes", "plugins", "content", "widgets", "forms", "members"]);
  assert.deepEqual(f.reads, ["site-plugins", "widgets", "forms", "members", "markers", "agent-plugins"]);
  assert.deepEqual(facts.content, { status: "ok", data: [{ key: "planner", label: "Planner", version: 1, status: "active", fieldCount: 1 }] });
});

test("guide registry caps preserve the first 256 entries and do not cap layouts", async () => {
  const f = fixture();
  const values = Array.from({ length: 257 }, (_, index) => `type-${index}`);
  const agentPlugins = values.map(id => ({ id, name: id, version: null, enabled: null }));
  const deps: SiteGuideFactsDeps = { ...f.deps, listWidgetTypes: () => values, listFormFieldTypes: () => values,
    listMarkers: () => values, listLayouts: () => values, readAgentPlugins: async () => agentPlugins };
  const facts = await readSiteGuideFacts({ deps, caller, topics: ["themes", "plugins", "widgets", "forms"] });
  assert.deepEqual(facts.widgets, { status: "ok", data: { types: values.slice(0, 256) } });
  assert.deepEqual(facts.forms, { status: "ok", data: { fieldTypes: values.slice(0, 256) } });
  assert.equal(facts.themes?.status, "ok");
  if (facts.themes?.status === "ok") {
    const data = facts.themes.data as { registry: unknown };
    assert.deepEqual(data.registry, { markers: values.slice(0, 256), layouts: values });
  }
  assert.equal(facts.plugins?.status, "ok");
  if (facts.plugins?.status === "ok") {
    const data = facts.plugins.data as { registry: unknown };
    assert.deepEqual(data.registry, { agentPlugins: agentPlugins.slice(0, 256) });
  }
});

for (const topic of ["themes", "plugins"] as const) {
  test(`${topic} profile denial wins even if the second permission check allows the registry`, async () => {
    const f = fixture();
    let decisions = 0;
    const deps = { ...f.deps, authorize: async () => ({ allowed: ++decisions === 2, reason: "test decision" }) };
    assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: [topic] }), { [topic]: { status: "forbidden" } });
    assert.equal(decisions, 2);
    assert.deepEqual(f.reads, [topic === "themes" ? "markers" : "agent-plugins"]);
  });
}

test("content failure and denial expose only their status", async () => {
  const f = fixture();
  f.grants.clear();
  assert.deepEqual(await readSiteGuideFacts({ deps: f.deps, caller, topics: ["content"] }), { content: { status: "forbidden" } });
  const deps = { ...f.deps, authorize: async () => { throw new Error("PRIVATE_CANARY"); } };
  assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: ["content"] }), { content: { status: "unavailable" } });
});
