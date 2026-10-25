/** guide tool adapter: actual registration, caller binding, input rejection and prompt wiring. */
import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySettingsRepo, getEffective } from "@jini-ai/core/settings";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import type { SiteGuideEngine } from "#src/features/site-guide/index";
import { buildBaseSystemOverlay } from "#src/server/inbound/assistant/assistant-system-overlay";
import { SYSTEM_PREAMBLE } from "../modules/assistant-byok.js";
import { SITE_GUIDE_POINTER } from "#src/assistant/site-guide-pointer";
import { buildSiteGuideRegistrations, readSiteGuideInput, siteGuideDerivedRisk } from "../site-guide-tools.js";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import { toolMetadata } from "#src/contracts/core/tool-metadata/site-guide";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { realToolCatalog } from "#src/assistant/__tests__/real-tool-catalog.fixture";
import { createTovuSiteGuide, resolveSiteGuideEngine, TOVU_CAPABILITY_CARDS, type TovuSiteGuideDeps } from "../site-guide.js";

function deps(): TovuSiteGuideDeps {
  return {
    workspaceId: "test-site", authorize: async () => ({ allowed: true, reason: "test" }), clock: { nowIso: () => "2026-10-09T00:00:00Z" },
    postRepo: { list: async () => [] }, themes: [], presentationRepo: { findByWorkspaceId: async () => null },
    settingsRepo: new InMemorySettingsRepo(), getEffective, contentTypeRepo: { listByWorkspace: async () => [] },
    pluginActivationRepo: { listAll: async () => [] }, discoverPlugins: async () => [],
    agentPluginLayout: resolveAgentPluginLayout({ siteDir: "/tmp/guide-unused-test-site", env: {} }),
  };
}
const context = (input: unknown): ToolExecutionContext => ({ executionId: "guide-test", input, principal: { id: "caller-from-context" } as ToolExecutionContext["principal"], run: { id: "test-run" } as ToolExecutionContext["run"], signal: new AbortController().signal });
test("site_guide registers as a read-class tool and binds identity from execution context", async () => {
  const calls: unknown[] = [];
  const engine: SiteGuideEngine = {
    parseGuideTopics: () => ({ ok: true, descriptors: [] }),
    createSiteGuide: ports => { assert.equal(ports.builtInTopics, TOVU_CAPABILITY_CARDS); return { run: async input => { calls.push(input); return { learned: input.topic }; } }; },
  };
  const registrations = buildSiteGuideRegistrations({ deps: deps() }, { engine });
  assert.equal(registrations.length, 1); const registration = registrations[0]!;
  assert.deepEqual(registration.descriptor.metadata, toolMetadata.site_guide);
  assert.equal(registration.descriptor.id, "site_guide"); assert.equal(siteGuideDerivedRisk.get("site_guide"), "none");
  assert.deepEqual(await registration.handler(context({ operation: "explain", topic: "forms" })), { learned: "forms" });
  assert.deepEqual(calls, [{ caller: { principalId: "caller-from-context" }, operation: "explain", topic: "forms" }]);
  await assert.rejects(registration.handler(context({ operation: "overview", principalId: "owner" })), { message: "site_guide accepts only operation and topic." });
});
test("site_guide refuses the assistant-use floor before constructing the engine", async () => {
  const d = deps(); d.authorize = async () => ({ allowed: false, reason: "denied" });
  const engine: SiteGuideEngine = { parseGuideTopics: () => ({ ok: true, descriptors: [] }), createSiteGuide: () => { throw new Error("Engine must not be reached"); } };
  await assert.rejects(buildSiteGuideRegistrations({ deps: d }, { engine })[0]!.handler(context({ operation: "overview" })), { message: "site_guide: this caller may not use the admin assistant." });
});
test("site_guide modes have exact corrective input errors", () => {
  assert.deepEqual(readSiteGuideInput({ input: { operation: "overview" } }), { operation: "overview" });
  assert.throws(() => readSiteGuideInput({ input: { operation: "write" } }), { message: "site_guide: operation must be overview, explain or search." });
  assert.throws(() => readSiteGuideInput({ input: { operation: "explain" } }), { message: "site_guide: explain requires a topic id from overview." });
  assert.throws(() => readSiteGuideInput({ input: { operation: "overview", topic: "forms" } }), { message: "site_guide: topic is only accepted with operation explain or search." });
  assert.throws(() => readSiteGuideInput({ input: { operation: "explain", topic: "../secret" } }), ToolInputError);
});

test("site_guide searches visible topic text with query alias, without reading hidden facts", async () => {
  const { executeRegisteredTool } = await import("../../../../assistant/__tests__/fixtures/execute-registered-tool.js");
  const d = deps();
  d.authorize = async ({ permission }) => ({ allowed: ["admin.assistant.use", "content.read"].includes(permission), reason: "test" });
  d.postRepo.list = async () => assert.fail("search must not load topic facts");
  const registration = buildSiteGuideRegistrations({ deps: d })[0]!;
  for (const input of [{ operation: "search", topic: "CONTENT" }, { operation: "search", query: "content" }]) {
    const result = await executeRegisteredTool({ registration, input });
    assert.equal(result.status, "completed");
    const output = result.output as { operation: string; topics: Array<{ id: string }>; facts: unknown; normalizationNotes?: string[] };
    assert.equal(output.operation, "search");
    assert.ok(output.topics.some(topic => topic.id === "content"));
    assert.ok(output.topics.every(topic => !["members", "plugins"].includes(topic.id)));
    assert.deepEqual(output.facts, {});
    if ("query" in input) assert.ok(output.normalizationNotes?.includes("query→topic"));
  }
  const hidden = await executeRegisteredTool({ registration, input: { operation: "search", query: "members" } });
  assert.equal(hidden.status, "completed");
  assert.deepEqual((hidden.output as { topics: unknown[] }).topics, []);
  for (const input of [{ operation: "search" }, { operation: "search", query: " " }, { operation: "search", topic: "a".repeat(201) },
    { operation: "search", topic: "content", query: "members" }]) {
    assert.equal((await executeRegisteredTool({ registration, input })).errorKind, "validation");
  }
});
test("hidden-topic errors retain their exact message and classify as tool input rejection", async () => {
  const message = "Topic unavailable. Call site_guide with operation overview for topics you may read.";
  const engine: SiteGuideEngine = {
    parseGuideTopics: () => ({ ok: true, descriptors: [] }),
    createSiteGuide: () => ({ run: async () => { const error = new Error(message); error.name = "SiteGuideInputError"; throw error; } }),
  };
  await assert.rejects(buildSiteGuideRegistrations({ deps: deps() }, { engine })[0]!.handler(context({ operation: "explain", topic: "plugins" })), error => error instanceof ToolInputError && error.message === message);
});
test("every admin execution path receives the same vendor-neutral learning pointer", () => {
  for (const overlay of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true), SYSTEM_PREAMBLE]) assert.ok(overlay.startsWith(SITE_GUIDE_POINTER));
  assert.deepEqual(TOVU_CAPABILITY_CARDS.map(card => card.id), ["content", "forms", "widgets", "themes", "members", "seo", "deploy", "backup", "plugins", "jini-packages"]);
});

test("site_guide search metadata reaches the shared projection and the production catalog", async () => {
  assert.deepEqual(nativeToolMetadata.byId.site_guide, toolMetadata.site_guide);
  assert.equal(nativeToolMetadata.keywords.site_guide, toolMetadata.site_guide.search.keywords);
  assert.deepEqual(nativeToolMetadata.queries.site_guide, toolMetadata.site_guide.search.queries);
  const { catalog } = await realToolCatalog();
  assert.ok(catalog.search({ query: "how tovu works site guide" }, { limit: 3 }).some(hit => hit.id === "site_guide"));
});

test("the composed host guide keeps membership enablement unknown even with a wired repo", async () => {
  const d = { ...deps(), memberRepo: {} };
  const engine: SiteGuideEngine = {
    parseGuideTopics: () => ({ ok: true, descriptors: [] }),
    createSiteGuide: ports => ({ run: async input => ports.facts.read({ caller: input.caller, topics: ["members"] }) }),
  };
  assert.deepEqual(await createTovuSiteGuide({ deps: d }, { engine }).run({ caller: { principalId: "editor" }, operation: "explain", topic: "members" }), { members: { status: "unavailable" } });
});

test("an editor sees permitted plugin workflows without plugin-inventory permission", async () => {
  const d = deps(); const grants = new Set(["admin.assistant.use", "admin.forms.manage"]);
  d.authorize = async ({ permission }) => ({ allowed: grants.has(permission), reason: "test grants" });
  const engine = resolveSiteGuideEngine({});
  let reads = 0;
  const topic = { id: "how-tovu-works-forms", title: "Inquiry workflow", summary: "Reuse native forms", explanation: "Reuse a native definition.",
    permissions: ["admin.forms.manage"], pointers: [], workflows: [{ title: "Add an inquiry", steps: ["Inspect the definition"], permissions: ["admin.forms.manage"] }] };
  const loader = createPluginContributionLoader({
    findPackages: async query => { assert.equal(query.workspaceId, "test-site"); assert.equal(query.requireActive, true); return [{ trusted: { pluginId: "how-tovu-works", packageRoot: "/not-read" } }]; },
    readFile: async () => { reads++; return JSON.stringify({ version: 1, topics: [topic] }); },
    importModule: async () => { throw new Error("Guide contributions must remain data-only"); },
  });
  Object.defineProperty(d, "agentPluginLifecycle", { value: { ...createTovuAgentPluginLifecycle({ layout: d.agentPluginLayout }), loadPluginContributions: loader.loadPluginContributions }, enumerable: true });
  const guide = createTovuSiteGuide({ deps: d }, { engine });
  const result = await guide.run({ caller: { principalId: "editor" }, operation: "explain", topic: topic.id }) as { topics: { id: string; source: string; workflows: unknown }[] };
  assert.equal(reads, 1);
  assert.equal(result.topics[0]?.id, topic.id);
  assert.equal(result.topics[0]?.source, "how-tovu-works");
  assert.deepEqual(result.topics[0]?.workflows, [{ title: "Add an inquiry", steps: ["Inspect the definition"] }]);
  grants.delete("admin.forms.manage");
  await assert.rejects(guide.run({ caller: { principalId: "editor" }, operation: "explain", topic: topic.id }), { message: "Topic unavailable. Call site_guide with operation overview for topics you may read." });
});

test('normalization: site guide overview gives the exact HTTPS/dev or desktop listener origin', async () => {
  const { executeRegisteredTool } = await import('../../../../assistant/__tests__/fixtures/execute-registered-tool.js');
  for (const siteOrigin of ['https://localhost:3000', 'http://127.0.0.1:43127']) {
    const engine: SiteGuideEngine = {
      parseGuideTopics: () => ({ ok: true, descriptors: [] }),
      createSiteGuide: () => ({ run: async () => ({ topics: [] }) }),
    };
    const registration = buildSiteGuideRegistrations({ deps: { ...deps(), derivedPublicOrigin: siteOrigin } }, { engine })[0]!;
    const result = await executeRegisteredTool({ registration, input: { operation: 'overview' } });
    assert.equal(result.status, 'completed');
    assert.equal((result.output as { siteOrigin: string }).siteOrigin, siteOrigin);
    assert.match((result.output as { navigationHint: string }).navigationHint, /Preserve this exact scheme, host and port/);
    const ambiguous = await executeRegisteredTool({ registration, input: { operation: 'overview', OPERATION: 'explain' } });
    assert.equal(ambiguous.errorKind, 'validation');
    assert.match(ambiguous.error!, /Send only 'operation'/);
  }
});

test('listener pin uses actual dev TLS, desktop host and selected port before guide composition', async () => {
  const { pinSiteListenerOrigin } = await import('../../boot/site-listener-origin.js');
  for (const [scheme, host, port, expected] of [
    ['https', undefined, 3000, 'https://localhost:3000'],
    ['http', '127.0.0.1', 43127, 'http://127.0.0.1:43127'],
    ['http', '::1', 43128, 'http://[::1]:43128'],
  ] as const) {
    const env = { TOVU_SITE_LISTENER_ORIGIN: 'http://wrong:3000' };
    assert.equal(pinSiteListenerOrigin({ scheme, host, port }, { env }), expected);
    assert.equal(env.TOVU_SITE_LISTENER_ORIGIN, expected);
  }
});

test("backup guide gates source-control pointers and private-backup workflow without reading credentials", async () => {
  const d = deps(); const grants = new Set(["admin.assistant.use", "backup.read"]);
  d.authorize = async ({ permission }) => ({ allowed: grants.has(permission), reason: "test grants" });
  const loader = createPluginContributionLoader({
    findPackages: async () => [], readFile: async () => { throw new Error("No contributions"); },
    importModule: async () => { throw new Error("Guide must remain data-only"); },
  });
  Object.defineProperty(d, "agentPluginLifecycle", { value: { ...createTovuAgentPluginLifecycle({ layout: d.agentPluginLayout }), loadPluginContributions: loader.loadPluginContributions } });
  const guide = createTovuSiteGuide({ deps: d }, { engine: resolveSiteGuideEngine({}) });
  const explain = () => guide.run({ caller: { principalId: "reader" }, operation: "explain", topic: "backup" });
  const restricted = JSON.stringify(await explain());
  assert.match(restricted, /backup_get_capabilities/);
  assert.doesNotMatch(restricted, /source_control_get_capabilities|site_backup_plan|site_backup_push|savedCredentials/);
  grants.add("source-control.read"); grants.add("site-backup.push");
  const allowed = JSON.stringify(await explain());
  for (const tool of ["source_control_get_capabilities", "site_backup_plan", "site_backup_push"]) assert.ok(allowed.includes(tool));
  assert.match(allowed, /private.*full-site|full-site.*private/);
  assert.match(allowed, /rendered static output/i);
});
