import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { nativeToolMetadata } from "../../../../contracts/core/tool-metadata/index.js";
import type { ContentTypeFieldDef, ContentTypeRecord } from "../../../content-types/index.js";
import { parseCollectionListConfig } from "../../../entries/public-list.js";
import { renderEntryList, type EntryListItem } from "../../../theme/entry-list-render.js";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } from "../../bundled-catalog.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { createTovuAgentPluginLifecycle } from "../../lifecycle.js";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { loadInstalledAgentPluginToolSources } from "../../tool-registrations.js";
import { forceRemove } from "../fixtures/force-remove.js";

/** Contract tests for the shipped Phase A/C instructions, installation and real collection renderer.
 * No store is contacted and no commerce implementation is substituted for the host's own renderer. */
const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PACKAGE_ROOT = path.join(CONTENT_ROOT, "shopify");
const SKILL_ROOT = path.join(PACKAGE_ROOT, "skills/shopify");
const REFERENCES = ["catalog-sync.md", "domains.md", "live-storefront.md", "storefront-snippets.md"];

test("shopify manifest is valid, discoverable and disabled by default without Admin promises", async () => {
  const value = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "plugin.json"), "utf8"));
  const parsed = parseAgentPluginManifest({ value });
  assert.ok(parsed.ok);
  assert.equal(parsed.manifest.name, "shopify");
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(value.extensions.tovu.provides, ["commerce:shopify"]);
  for (const keyword of ["shopify", "ecommerce", "checkout", "products", "cart", "commerce:shopify"]) {
    assert.ok(parsed.manifest.keywords?.includes(keyword), keyword);
  }
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("shopify"), false);
  assert.doesNotMatch(`${value.description}\n${value.extensions.tovu.summary}`, /Admin|edit products|see orders|seeing orders|connect.*app/i);
});

test("shopify declares no MCP servers or Phase B credential contribution", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: JSON.parse(await readFile(path.join(PACKAGE_ROOT, "mcp.json"), "utf8")) });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.config.serverIds, []);
  assert.deepEqual((await readdir(PACKAGE_ROOT)).sort(), ["mcp.json", "plugin.json", "skills"]);
});

test("a fresh site seeds shopify disabled and enabling exposes its one eponymous skill", async (t) => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-shopify-seed-"));
  t.after(() => forceRemove(siteDir));
  const workspaceId = "workspace-local";
  const layout = resolveAgentPluginLayout({ siteDir, env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout });
  const workspaceRoot = layout.forWorkspace(workspaceId).root;
  const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId, sourceRoot: CONTENT_ROOT });
  assert.equal(seeded.ledgerFailure, undefined);
  assert.equal(seeded.outcomes.find((item) => item.pluginId === "shopify")?.status, "seeded");
  const activation = (await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins.shopify;
  assert.equal(activation?.enabled, false);
  assert.equal(activation?.updatedBy, "system:seed");
  const inactive = await loadInstalledAgentPluginToolSources({ workspaceId, agentPluginLayout: layout });
  assert.deepEqual(inactive.filter((source) => source.pluginId === "shopify"), []);

  await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: "shopify", enabled: true, actor: "test:operator" });
  const sources = (await loadInstalledAgentPluginToolSources({ workspaceId, agentPluginLayout: layout }))
    .filter((source) => source.pluginId === "shopify");
  assert.equal(sources.length, 1);
  assert.equal(sources[0]!.id, "agent_plugin_shopify");
  assert.equal(sources[0]!.defaultSkillName, "shopify");
  assert.deepEqual(sources[0]!.skills.map((skill) => skill.name), ["shopify"]);
  assert.equal(sources[0]!.skills[0]!.markdown, await readFile(path.join(SKILL_ROOT, "SKILL.md"), "utf8"));
});

test("shopify instructions retain bounded fetching, untrusted data and all Phase A/C references", async () => {
  const skill = await readFile(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: shopify\ndescription: /);
  assert.ok(skill.split("\n").length < 170);
  for (const text of ["/meta.json", "/products.json?limit=50&page=", 'format:"raw"', "maxChars:200000", "truncated", "halve", "media_import_from_url", "collections_entry_unpublish", "assistant_ask_choice", "untrusted data", "shop_domain", "^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$"]) {
    assert.ok(skill.includes(text), text);
  }
  assert.doesNotMatch(skill, /X-Shopify-Access-Token|admin-api\.md|custom_credential_|credential_save/);
  assert.deepEqual((await readdir(path.join(SKILL_ROOT, "references"))).sort(), REFERENCES);
  for (const reference of REFERENCES) assert.ok(skill.includes(`references/${reference}`), reference);
});

test("catalog guidance preserves mapping, media and revision idempotency", async () => {
  const catalog = await readFile(path.join(SKILL_ROOT, "references/catalog-sync.md"), "utf8");
  for (const text of ["<handle>-<variant_id>", "2–10", "past 10", "#sold-out", "Buy now", "Sold out", "image_source", "ONLY when", "mapped value differs", "expectedVersion", "aren't published", "Never delete", "300 characters", "fieldsJson:{ext:{site:"]) {
    assert.ok(catalog.includes(text), text);
  }
  const domains = await readFile(path.join(SKILL_ROOT, "references/domains.md"), "utf8");
  const primaryStep = domains.indexOf("make it **Primary**");
  const moveStep = domains.indexOf("Point the main domain at Tovu");
  assert.ok(primaryStep >= 0);
  assert.ok(moveStep > primaryStep);
  for (const text of ["shops.myshopify.com", "Wait until", "settings/domains", "password"]) assert.ok(domains.includes(text), text);
});

test("the documented schema and snippet parse and render real Buy, sold-out and unsafe links", async () => {
  const catalog = await readFile(path.join(SKILL_ROOT, "references/catalog-sync.md"), "utf8");
  // Build the content type from the shipped table so changing a field or kind changes the test input.
  const rows = [...catalog.matchAll(/^\| `([a-z_]+)` \| (text|real|boolean) \| (true|false) \| (true|false) \|$/gm)];
  assert.equal(rows.length, 15);
  const fields: ContentTypeFieldDef[] = rows.map((row) => ({
    name: row[1]!, kind: row[2] as ContentTypeFieldDef["kind"], required: row[3] === "true", queryable: row[4] === "true",
  }));
  const contentType: ContentTypeRecord = { workspaceId: "workspace-local", key: "product", label: "Products", status: "active", version: 1, fields };
  const snippets = await readFile(path.join(SKILL_ROOT, "references/storefront-snippets.md"), "utf8");
  const marker = snippets.match(/data-embed-config='([^']+)'[^>]*>\s*<template>([\s\S]*?)<\/template>/);
  assert.ok(marker, "the reference must supply a real collection template");
  const config = JSON.parse(marker[1]!);
  assert.equal(config.type, "collection");
  assert.equal(config.id, contentType.key);
  const parsed = parseCollectionListConfig(config, contentType);
  assert.ok(parsed.ok);
  assert.equal(parsed.query.limit, 24);
  assert.equal(parsed.display.columns, 3);
  assert.equal(parsed.display.layout, "cards");
  const inStock = parseCollectionListConfig({ ...config, where: { available: true } }, contentType);
  assert.ok(inStock.ok);
  assert.deepEqual(inStock.query.where, [{ field: "available", value: true }]);

  const values = [
    { buy_url: "https://demo-shop.myshopify.com/cart/47950829748460:1", buy_label: "Buy now", price_label: "$1.99" },
    { buy_url: "#sold-out", buy_label: "Sold out", price_label: "$1.99" },
    { buy_url: "javascript:alert(1)", buy_label: "Unsafe", price_label: "$1.99" },
  ];
  const items: EntryListItem[] = values.map((value) => ({
    title: "Sample <product>", href: null, dateIso: "", dateLabel: "",
    fields: fields.map((field) => ({
      name: field.name, label: field.name, kind: field.kind,
      value: ({ ...value, summary: "<script>alert(1)</script>", image_url: "/media/sample.jpg", image_alt: "Sample" } as Record<string, unknown>)[field.name] ?? "",
    })),
  }));
  const html = renderEntryList(items, { template: marker[2]!, columns: parsed.display.columns, layout: parsed.display.layout, typeKey: config.id });
  assert.ok(html);
  for (const text of ['href="https://demo-shop.myshopify.com/cart/47950829748460:1"', ">Buy now</a>", 'href="#sold-out"', ">Sold out</a>", 'href="#"', "$1.99", "Sample &lt;product&gt;", "&lt;script&gt;alert(1)&lt;/script&gt;"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /javascript:|<script>/);
  assert.ok(snippets.includes("Products coming soon."));
});

test("live storefront retains the tokenless cart snippet and public-token distinction", async () => {
  const live = await readFile(path.join(SKILL_ROOT, "references/live-storefront.md"), "utf8");
  for (const text of ["https://cdn.shopify.com/storefront/web-components.js", "addLine(event).showModal()", "buyNow(event)", "It's public by design and sits in page HTML as `public-access-token`. It doesn't go in the vault.", "Never nest", "report-only", "theme partial"]) {
    assert.ok(live.includes(text), text);
  }
});

test("every cited tool resolves to native metadata or an existing bundled plugin skill", async () => {
  const declared = new Set(Object.keys(nativeToolMetadata.byId));
  const unknown: string[] = [];
  let count = 0;
  for (const relativePath of ["SKILL.md", ...REFERENCES.map((name) => `references/${name}`)]) {
    const markdown = await readFile(path.join(SKILL_ROOT, relativePath), "utf8");
    // Restrict to tool families: the same Markdown also names snake_case product fields.
    const citedToolIds = new Set([...markdown.matchAll(/\b(?:agent_plugin|assistant|collections|content|fs|media|menus|pages|redirects|theme|web)_[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)?\b/g)].map((match) => match[0]));
    count += citedToolIds.size;
    for (const id of citedToolIds) {
      if (id === "agent_plugin_shopify" || id === "agent_plugin_ui_ux_design") continue;
      if (!declared.has(id)) unknown.push(`${relativePath}: ${id}`);
    }
  }
  assert.ok(count >= 12, "the procedure must cite the tools it uses");
  assert.deepEqual(unknown, []);
});
