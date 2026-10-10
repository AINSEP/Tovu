/** guide anonymous contract: only published capabilities, no private fact ports or permissions. */
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPostRepo, listPublishedPosts } from "#src/features/post/index";
import { createSiteCapabilityRegistry } from "#src/assistant/site/capability-registry";
import { SITE_GUIDE_SCHEMA } from "../site-guide-tools.js";
import { SYSTEM_PREAMBLE as VISITOR_SYSTEM_PREAMBLE } from "../modules/site-assistant.js";
import { runPublicSiteGuide } from "../public-site-guide.js";

test("anonymous guide exposes public content only, using the real Jini filtering shell", async () => {
  const result = await runPublicSiteGuide({ input: { operation: "overview" } }) as { topics: { id: string }[]; facts: unknown; callerPermissions: string[] };
  assert.deepEqual(result.topics.map(topic => topic.id), ["content"]);
  assert.deepEqual(result.facts, {});
  assert.deepEqual(result.callerPermissions, []);
  await assert.rejects(runPublicSiteGuide({ input: { operation: "explain", topic: "plugins" } }), { message: "Topic unavailable. Call site_guide with operation overview for topics you may read." });
  const explained = await runPublicSiteGuide({ input: { operation: "explain", topic: "content" } }) as { facts: unknown };
  assert.deepEqual(explained.facts, { content: { status: "ok", data: { visibility: "published-only", administration: false } } });
  assert.ok(!JSON.stringify(explained).includes("content_post_create"));
  assert.ok(!JSON.stringify(explained).includes("/admin/"));
});
test("visitor registry grants only the explicitly injected guide and still denies unknown names/callers", async () => {
  const deps = { workspaceId: "public-site", postRepo: new InMemoryPostRepo(), listPublishedPosts };
  const without = createSiteCapabilityRegistry(deps);
  assert.ok(!without.schemas.some(schema => schema.name === "site_guide"));
  let calls = 0;
  const registry = createSiteCapabilityRegistry(deps, { siteGuide: { inputSchema: SITE_GUIDE_SCHEMA, run: async () => { calls++; return { public: true }; } } });
  assert.ok(registry.schemas.some(schema => schema.name === "site_guide"));
  assert.deepEqual(await registry.invoke({ name: "site_guide", input: { operation: "overview" }, caller: "anonymous-visitor" }), { kind: "ok", result: { public: true }, directive: undefined });
  assert.equal((await registry.invoke({ name: "site_guide", input: {}, caller: "operator" as "anonymous-visitor" })).kind, "refused");
  assert.equal((await registry.invoke({ name: "plugins_list", input: {}, caller: "anonymous-visitor" })).kind, "refused");
  assert.equal(calls, 1);
});

test("visitor preamble points directly to the public guide without admin-only discovery or delegation", () => {
  assert.ok(VISITOR_SYSTEM_PREAMBLE.startsWith('For this website’s published capabilities, call site_guide with operation "overview", then "explain" with a returned topic id.'));
  assert.ok(!VISITOR_SYSTEM_PREAMBLE.includes("execute_readonly_delegated_tool"));
  assert.ok(!VISITOR_SYSTEM_PREAMBLE.includes("search_tools"));
  assert.ok(!VISITOR_SYSTEM_PREAMBLE.includes("planning or building"));
});
