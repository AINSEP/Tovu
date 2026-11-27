import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_MARKER_TYPE, EMBED_MARKER_TARGET_KEYS, parseGalleryConfig } from "@jini-ai/cms/widgets/markers";
import { otherEmbedTypesText } from "#src/contracts/core/page-html";
import { pagesAgentToolCatalog } from "#src/features/pages/tool-host";

test("every registered embed marker type except collection reaches the page writers' contract", () => {
  const text = otherEmbedTypesText({ targetKeys: EMBED_MARKER_TARGET_KEYS });
  for (const type of Object.keys(EMBED_MARKER_TARGET_KEYS)) {
    if (type === COLLECTION_MARKER_TYPE) assert.ok(!text.includes(`{"type":"${type}"`), "collection is documented on its own");
    else assert.ok(text.includes(`{"type":"${type}"`), `${type} must be listed`);
  }
  const writer = pagesAgentToolCatalog.find((entry) => entry.name === "pages_write_html");
  assert.ok(writer?.description.includes(text), "the derived list is what the write tool teaches");
});

test("a type registered without a placeholder or a note is still listed, with a generic <key> target and no note", () => {
  const text = otherEmbedTypesText({ targetKeys: { [COLLECTION_MARKER_TYPE]: ["id"], "future-type": ["ref"], widget: ["id"] } });
  assert.equal(text, '`{"type":"future-type","ref":"<ref>"}`, `{"type":"widget","id":"<widget id or slug>"}` (a saved widget)');
});

test("a type with no target key is listed with its type alone", () => {
  assert.equal(otherEmbedTypesText({ targetKeys: { "keyless-type": [] } }), '`{"type":"keyless-type"}`');
});

test("the page writer's legacy Gallery example still validates with layout and accessible image text intact", () => {
  const writer = pagesAgentToolCatalog.find(entry => entry.name === "pages_write_html");
  const example = writer?.description.match(/data-embed-config='(\{"type":"gallery","images":.*?\})'/)?.[1];
  assert.ok(example, "model-facing instructions must include a copyable legacy Gallery example");
  const parsed = parseGalleryConfig({ config: JSON.parse(example) });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.config?.layout, "grid");
  assert.equal(parsed.config?.columns, 3);
  assert.deepEqual(parsed.config?.images, [{ mediaId: "asset-1", alt: "Description", caption: "Optional caption" }]);
});
