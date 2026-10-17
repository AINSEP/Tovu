import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

test("owner replacement requests find the in-place tool among the competing upload and metadata tools", async () => {
  const { catalog } = await realToolCatalog();
  for (const query of ["replace this image in place", "replace media file from https URL", "change image bytes keep same media id", "replace existing photo from local file"]) {
    const hits = catalog.search({ query }, { limit: 3 });
    assert.ok(hits.some(hit => hit.id === "media_replace_file"), `${query}: ${hits.map(hit => hit.id).join(', ')}`);
  }
  const tool = catalog.describe({ id: "media_replace_file" });
  assert.ok(tool);
  assert.match(tool.description, /Keeps its id, slug/);
  assert.match(tool.description, /increments its version/);
  assert.match(tool.description, /url or root plus path/);
  const metadata = catalog.describe({ id: "media_update_metadata" });
  assert.ok(metadata);
  assert.doesNotMatch(metadata.description, /cannot be changed by this or any tool|upload a new asset/);
});
