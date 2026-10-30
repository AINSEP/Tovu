import assert from "node:assert/strict";
import test from "node:test";
import { toolCatalogDescribeRoute } from "@jini-ai/daemon/http";

import { buildToolCatalogQuery, listToolCatalogEntries } from "../tool-catalog-query.js";
import { KEYWORD_MARKER } from "../tool-search-keywords.js";
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
