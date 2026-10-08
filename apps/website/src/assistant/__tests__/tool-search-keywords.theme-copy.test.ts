import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

/** Production ranking for the dedicated theme_copy_file tool added since the original
 * compose-read/write workflow; it replaces that workflow's literal vocabulary drift guard. */

// F1.4/F2.4: pin a live registered id and execute production search against its competitors.
test("'copy this theme file' ranks the actual theme_copy_file tool first in the full catalog", async () => {
  const { registry, catalog } = await realToolCatalog();
  assert.ok(registry.has({ toolId: 'theme_copy_file' }));
  const hits = catalog.search({ query: 'copy this theme file' }, { limit: 10 });
  assert.equal(hits[0]?.id, 'theme_copy_file', `got ${hits.map(hit => hit.id).join(', ')}`);
});
