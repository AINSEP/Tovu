import assert from "node:assert/strict";
import test from "node:test";
import "../../../../apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts";
import { realToolCatalog } from "../../../../apps/website/src/assistant/__tests__/real-tool-catalog.fixture.ts";
import { buildToolCatalogQuery } from "../../../../apps/website/src/assistant/tool-catalog-query.ts";

test("vendor requests retain discovery in the production catalog", async () => {
  const { registry } = await realToolCatalog();
  const catalog = buildToolCatalogQuery(registry);
  const cases = [
    ["credential_save", "my GitHub token changed"],
    ["credential_save", "connect GitHub token for commits"],
    ["skills_install", "install a skill from github"],
    ["site_backup_plan", "back up my site to a private GitHub repository"],
  ];
  for (const [id, query] of cases) {
    const hits = catalog.search({ query }, { limit: 3 }).map(hit => hit.id);
    assert.ok(hits.includes(id), `${query}: expected ${id}, got ${hits.join(", ")}`);
  }
});
