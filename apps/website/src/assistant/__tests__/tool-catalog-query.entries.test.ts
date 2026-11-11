import assert from "node:assert/strict";
import test from "node:test";
import { toolCatalogDescribeRoute } from "@jini-ai/daemon/http";
import { constrainPrincipalToReadOnlyTools, filterReadOnlyToolCatalog } from "@jini-ai/daemon/read-only-tools";

import { buildToolCatalogQuery, listToolCatalogEntries } from "../tool-catalog-query.js";
import { KEYWORD_MARKER } from "../tool-search-keywords.js";
import { filterChatDeleteCatalog } from "../permanent-delete-tool-gate.js";
import { DEFAULT_PERMANENT_DELETES_POLICY } from "../../contracts/headless/index.js";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

/**
 * @file `listToolCatalogEntries` — the live-registry reader `site_describe_capabilities` is handed.
 * Pins the two properties that make it an overview of the catalog `search_tools` reads rather than a
 * second index: it reads `registry.list()` on every call, and each entry's `source`/`description`
 * equal what `describe_tool` returns for the same id.
 */

test("listToolCatalogEntries: each entry's source and description equal describe_tool's for the same id", () => {
  const descriptors = [
    { id: "identity_user_create", description: "Creates a new human operator user.", inputSchema: { type: "object" } },
    { id: "forms_update_definition", description: "Updates an existing form definition." },
    // A registered description that ALREADY carries a folded keyword tail (`content_read.<resource>`
    // cards are built that way) — the entry must strip it exactly as describe_tool does.
    { id: "content_read.post", description: `Reads one post or lists posts.${KEYWORD_MARKER}blog article entry` },
  ];
  const registry = { list: () => descriptors };
  const catalog = buildToolCatalogQuery(registry);

  const entries = listToolCatalogEntries(registry);

  assert.deepEqual(
    entries.map((entry) => entry.id),
    descriptors.map((descriptor) => descriptor.id),
  );
  for (const entry of entries) {
    const described = catalog.describe({ id: entry.id });
    assert.ok(described, `describe_tool must resolve ${entry.id}`);
    assert.equal(entry.source, described.source);
    assert.equal(entry.description, described.description);
  }
  assert.equal(entries.find((entry) => entry.id === "content_read.post")?.description, "Reads one post or lists posts.");
});

test("listToolCatalogEntries: reads the registry on every call, so a tool registered later is included", () => {
  const descriptors: { id: string; description?: string }[] = [{ id: "forms_update_definition", description: "Updates a form." }];
  const registry = { list: () => descriptors };
  assert.equal(listToolCatalogEntries(registry).length, 1);

  descriptors.push({ id: "media_list_assets" });

  assert.deepEqual(listToolCatalogEntries(registry).at(-1), { id: "media_list_assets", source: "media", description: "" });
});

for (const [id, currentId, purpose] of [
  ["content_read.content_region", "content_read.widget_region", /\bregion\b/i],
  ["content_read.form", "content_read.form_definition", /\bform\b/i],
] as const) {
  test(`describe_tool: ${id} only points to a registered ${currentId} and never becomes a callable search hit`, () => {
    const catalog = buildToolCatalogQuery({ list: () => [{ id: currentId, description: "Reads a record.", inputSchema: { type: "object" } }] });
    const entry = catalog.describe({ id });
    assert.ok(entry);
    assert.ok(entry.description.includes(currentId));
    assert.equal(entry.inputSchema, undefined);
    assert.ok(catalog.search({ query: "record" }).every(hit => hit.id !== id));
    assert.equal(buildToolCatalogQuery({ list: () => [] }).describe({ id }), null);
    assert.equal(catalog.describe({ id: "content_read.unknown" }), null);
  });

  test(`describe_tool HTTP path: ${id} describes the sub-read or points to ${currentId}`, async () => {
    const { catalog } = await realToolCatalog();
    const current = catalog.describe({ id: currentId });
    assert.ok(current?.inputSchema, `${currentId} must be registered in the real catalog`);

    // MCP describe_tool calls this GET route. Keep its parser and the host's real catalog;
    // a mocked daemon response would hide the NOT_FOUND that agents currently receive.
    const parsed = toolCatalogDescribeRoute.parse({ body: {}, query: {}, params: { id } });
    assert.ok(parsed.ok);
    const result = await toolCatalogDescribeRoute.handle({ input: parsed.value, deps: { catalog } });

    assert.ok(result.ok, `describe_tool(${id}) must return actionable guidance, got ${JSON.stringify(result)}`);
    if (result.value.inputSchema != null) {
      assert.deepEqual(result.value.inputSchema, current.inputSchema);
      assert.match(result.value.description, purpose);
    } else {
      // 238f6ba46 made content_read a namespace: the pointer must name the exact card.
      assert.ok(result.value.description.includes(currentId), `guidance must name ${currentId}`);
    }
  });
}

// Bug class: catalog guidance is not a tool, so a read-only caller (peer/cross-site read) can only
// be shown it when the guidance names its targets. Every guidance entry this host produces must
// declare targetToolIds, and the overview must list only the cards the caller may use.
test("describe_tool guidance declares its target tools so a read-only caller sees only read-only targets", () => {
  const descriptors = [
    { id: "content_read.widget_region", description: "Reads a widget region.", readOnly: true, inputSchema: { type: "object" } },
    { id: "content_read.form_definition", description: "Reads a form definition.", readOnly: false, inputSchema: { type: "object" } },
    { id: "content_read.post", description: "Reads one post.", readOnly: true, inputSchema: { type: "object" } },
  ];
  const registry = { list: () => descriptors };
  const catalog = buildToolCatalogQuery(registry);
  const alias = catalog.describe({ id: "content_read.content_region" });
  const guidance = catalog.describe({ id: "content_read" });
  assert.ok(alias && "targetToolIds" in alias);
  assert.ok(guidance && "targetToolIds" in guidance);
  assert.deepEqual(alias.targetToolIds, ["content_read.widget_region"]);
  assert.deepEqual(guidance.targetToolIds, descriptors.map(descriptor => descriptor.id));

  // The BYOK chain: read-only filter over the permanent-delete gate over this host's catalog.
  const principal = constrainPrincipalToReadOnlyTools({ principal: { id: "peer", roles: ["operator"] } });
  const visible = filterReadOnlyToolCatalog({ principal, registry, catalog: filterChatDeleteCatalog({ catalog, policy: () => DEFAULT_PERMANENT_DELETES_POLICY }) });
  assert.ok(visible.describe({ id: "content_read.content_region" })?.description.includes("content_read.widget_region"));
  assert.equal(visible.describe({ id: "content_read.form" }), null, "an alias to a writing card must not reach a read-only caller");
  const overview = visible.describe({ id: "content_read" });
  assert.ok(overview && "targetToolIds" in overview);
  assert.deepEqual(overview.targetToolIds, ["content_read.widget_region", "content_read.post"]);
  assert.ok(!overview?.description.includes("content_read.form_definition"), "the overview must not list a writing card");
});

// L11 Stryker: the source classifier's fallback and the content_read family synthesis survived.
test("source is the id's first `_` segment, falling back to tovu for an id with no prefix", () => {
  const entries = listToolCatalogEntries({ list: () => [
    { id: "forms_update", description: "x" }, { id: "_hidden", description: "x" }, { id: "single", description: "x" },
  ] as never });
  assert.deepEqual(entries.map(entry => [entry.id, entry.source]), [["forms_update", "forms"], ["_hidden", "tovu"], ["single", "single"]]);
});

test("describe('content_read') synthesizes the card family only when cards exist, naming each card's first sentence", () => {
  const withCards = buildToolCatalogQuery({ list: () => [
    { id: "content_read.post", description: "Reads one post. Lists posts too." },
    { id: "content_read.media_asset", description: "" },
    { id: "forms_update", description: "Updates a form." },
  ] as never });
  // Main 238f6ba46 (content_read is a namespace) and 7ab029266 (guidance names its target tools).
  assert.deepEqual(withCards.describe({ id: "content_read" }), {
    id: "content_read", source: "content",
    description: [
      "content_read is a namespace, not a tool; do not invent ids such as content_read.page. Describe a card id below for its inputs, then call that exact id without a resource argument.",
      "content_read.post — Reads one post.",
      "content_read.media_asset — Read media asset.",
    ].join("\n"),
    targetToolIds: ["content_read.post", "content_read.media_asset"],
  });
  const withoutCards = buildToolCatalogQuery({ list: () => [{ id: "forms_update", description: "Updates a form." }] as never });
  assert.equal(withoutCards.describe({ id: "content_read" }), null);
  assert.equal(withoutCards.describe({ id: "no_such_tool" }), null);
});
