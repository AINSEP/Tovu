/** guide enrichment contract: bundled manifest, new seam, lifecycle gate and safe core fallback. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { loadSiteGuideContributions, SITE_GUIDE_FILENAME } from "../plugin-contributions.js";
import { resolveSiteGuideEngine, TOVU_CAPABILITY_CARDS } from "#src/server/runtime/composition/site-guide";

test("How Tovu works uses stable manifest identity and valid main topics with real workflow gates", async () => {
  const root = resolve("content/agent-plugins/how-tovu-works");
  const manifest = JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"));
  assert.equal(manifest.extensions.tovu.id, "tovu/how-tovu-works"); assert.deepEqual(manifest.extensions.tovu.provides, ["site-guide"]);
  assert.ok(manifest.keywords.includes("forms")); assert.ok(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("how-tovu-works"));
  const parsed = resolveSiteGuideEngine({}).parseGuideTopics({ raw: await readFile(resolve(root, SITE_GUIDE_FILENAME), "utf8") });
  if (!parsed.ok) throw new Error(parsed.reason);
  assert.equal(parsed.ok, true);
  // 4df4bbed1 adds a core-only backup card; enrichment topics remain independently authored.
  assert.deepEqual(parsed.descriptors.map(topic => topic.id), [
    "content", "forms", "widgets", "themes", "members", "seo", "deploy", "plugins", "jini-packages",
  ].map(id => `how-tovu-works-${id}`));
  const coreIds = new Set(TOVU_CAPABILITY_CARDS.map(card => card.id));
  assert.ok(parsed.descriptors.every(topic => !coreIds.has(topic.id)), "plugins must never replace core cards");
  const form = parsed.descriptors.find(topic => topic.id === "how-tovu-works-forms")!;
  assert.ok(form.workflows[0]?.steps.some(step => step.includes("widget")));
  assert.ok(form.workflows[0]?.permissions.includes("widgets.create"));
  // 2026-10-12 deploy split: the shared static-publish procedure moved here out of the deploy plugin's skill.
  const deploy = parsed.descriptors.find(topic => topic.id === "how-tovu-works-deploy")!;
  assert.ok(deploy.pointers.some(pointer => pointer.tool === "deployment_get_static_publish_capabilities"));
  assert.ok(deploy.pointers.every(pointer => pointer.tool !== "agent_plugin_deploy"));
  assert.ok(deploy.workflows[0]?.steps.some(step => step.includes("deployment_execute_static_publish")));
  assert.ok(deploy.workflows[0]?.permissions.includes("deployments.publish"));
});
test("site-guide seam delegates active bundled-package admission to lifecycle and never imports modules", async () => {
  const root = resolve("content/agent-plugins/how-tovu-works"); const engine = resolveSiteGuideEngine({});
  let active = true; let reads = 0;
  const loader = createPluginContributionLoader({
    findPackages: async query => {
      assert.equal(query.workspaceId, "test-site"); assert.equal(query.requireActive, true); assert.equal(query.filename, SITE_GUIDE_FILENAME);
      return active ? [{ trusted: { pluginId: "how-tovu-works", packageRoot: root } }] : [];
    },
    readFile: async input => { reads++; return readFile(resolve(input.plugin.packageRoot, input.filename), "utf8"); },
    importModule: async () => { throw new Error("Data-only guide must never import a module"); },
  });
  const loadContributions: LoadPluginContributions = loader.loadPluginContributions;
  const enriched = await loadSiteGuideContributions({ workspaceId: "test-site", loadContributions, engine });
  assert.equal(enriched.items.length, 1); assert.equal(enriched.items[0]?.pluginId, "how-tovu-works"); assert.equal(enriched.items[0]?.topics.length, 9);
  active = false;
  assert.deepEqual(await loadSiteGuideContributions({ workspaceId: "test-site", loadContributions, engine }), { items: [], refusals: [] });
  assert.equal(reads, 1);
});
test("malformed contribution refuses its file without running code or echoing plugin bytes", async () => {
  const engine = resolveSiteGuideEngine({});
  const loader = createPluginContributionLoader({
    findPackages: async () => [{ trusted: { pluginId: "bad-guide", packageRoot: "/not-read" } }],
    readFile: async () => "PRIVATE_CANARY",
    importModule: async () => { throw new Error("Must never import"); },
  });
  const result = await loadSiteGuideContributions({ workspaceId: "test-site", loadContributions: loader.loadPluginContributions, engine });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.refusals, ["site guide topics from 'bad-guide' were not loaded: tovu-site-guide.json is invalid: site-guide manifest must be valid JSON"]);
});
