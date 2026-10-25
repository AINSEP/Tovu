import assert from "node:assert/strict";
import test from "node:test";

import { buildToolCatalogQuery, listToolCatalogEntries } from "../tool-catalog-query.js";
import { KEYWORD_MARKER } from "../tool-search-keywords.js";

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
  assert.deepEqual(withCards.describe({ id: "content_read" }), {
    id: "content_read", source: "content",
    description: [
      "Read-card family. Describe a card id below for its inputs, then call that card.",
      "content_read.post — Reads one post.",
      "content_read.media_asset — Read media asset.",
    ].join("\n"),
  });
  const withoutCards = buildToolCatalogQuery({ list: () => [{ id: "forms_update", description: "Updates a form." }] as never });
  assert.equal(withoutCards.describe({ id: "content_read" }), null);
  assert.equal(withoutCards.describe({ id: "no_such_tool" }), null);
});
