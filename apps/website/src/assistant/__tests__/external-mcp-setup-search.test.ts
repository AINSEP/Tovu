import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

const QUERIES: Record<string, string[]> = {
  "content_read.external_mcp": ["list configured external mcp servers", "which external mcp servers are enabled", "show external mcp connection status", "what external mcp servers have I connected"],
  external_mcp_save: ["add an mcp server", "configure an external mcp server", "connect a new external mcp integration", "change my external mcp server settings"],
  external_mcp_probe_connection: ["probe my hosted mcp server", "test live external mcp reachability", "list tools advertised by my remote mcp server", "check my hosted mcp endpoint connection"],
  external_mcp_get_admissions: ["show external mcp admissions", "which external mcp tools were actually admitted", "why are configured mcp tools missing from the live roster", "which external mcp tools did the assistant refuse"],
};

test("External MCP setup and live diagnostics rank in the top 3 of the production catalog", async () => {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const deps = createRouteDeps();
  await deps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  const registry = createToolRegistry();
  for (const r of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter })) registry.register(r);
  const catalog = buildToolCatalogQuery(registry);
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(QUERIES)) for (const query of queries) {
    const hits = catalog.search(query, 3).map(h => h.id);
    if (!hits.includes(id)) misses.push(`${id}: ${query} -> ${hits.join(", ")}`);
  }
  assert.deepEqual(misses, []);
});
