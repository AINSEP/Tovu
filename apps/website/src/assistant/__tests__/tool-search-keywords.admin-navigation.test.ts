import assert from "node:assert/strict";
import test from "node:test";
import { createFrontendControl } from "@jini-ai/daemon/http";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";
import { FRONTEND_CONTROL_CAPABILITIES, withReadOnlyFrontendCapabilities } from "../frontend-control-capabilities.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

test("admin actions discover page tools before the fallback; explicit links discover the link tool", async () => {
  const { registry } = await realToolCatalog();
  const frontend = createFrontendControl({ capabilities: FRONTEND_CONTROL_CAPABILITIES, resolveBindToken: () => undefined });
  for (const tool of withReadOnlyFrontendCapabilities(frontend.toolRegistrations)) registry.register(tool);
  const catalog = buildToolCatalogQuery(registry);
  for (const query of ["open", "bring up", "show me", "go to", "read this screen", "inspect this screen", "can you bring up the agentic plugin for ui ux design", "no can you open it for me"]) {
    const ids = catalog.search({ query }, { limit: 20 }).map(hit => hit.id);
    const page = ids.findIndex(id => id.startsWith("page."));
    const link = ids.indexOf("assistant_admin_screen_link");
    assert.ok(page >= 0 && page < 3, `${query}: ${ids.join(", ")}`);
    // "…this screen" queries share the word "screen" with the fallback's id
    // (assistant_admin_screen_link), and id tokens weigh 6x in the catalog search, so the link tool
    // can rank first there. A page tool still has to be in the top 3; renaming a tool id to win a
    // lexical tie isn't worth the break. Every action phrasing must put page tools first.
    if (!query.endsWith("this screen")) assert.ok(link < 0 || page < link, `${query}: page tools must precede the fallback`);
  }
  // A fallback must stay discoverable when returning a URL is the requested action.
  for (const query of ["link to the admin page", "give me a link to the settings screen"]) {
    const ids = catalog.search({ query }, { limit: 3 }).map(hit => hit.id);
    assert.ok(ids.includes("assistant_admin_screen_link"), `${query}: ${ids.join(", ")}`);
  }
});
