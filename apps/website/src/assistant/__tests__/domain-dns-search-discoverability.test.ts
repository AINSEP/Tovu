import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";

import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

import { domainDnsAgentToolCatalog } from "../../features/domain-dns/tools.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

async function realCatalog() {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter }, undefined, { contributions })) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  for (const definition of domainDnsAgentToolCatalog) assert.equal(catalog.describe(definition.name)?.id, definition.name);
  return catalog;
}

const CASES = {
  domain_lookup_dns: ["look up DNS records for my domain", "show MX and TXT records", "what are the nameservers", "dig A AAAA CNAME for this hostname", "check DNS propagation", "look up ACME challenge CNAME DNS records", "show DKIM and DMARC TXT records"],
  domain_check_dns: ["does my custom domain point at its host", "compare domain DNS against hosting address", "is the www domain pointing to the deploy target", "check domain host mismatch", "verify apex DNS against publish destination"],
  domain_tls_status: ["is my domain TLS certificate valid", "check SSL certificate status", "is HTTPS trusted", "check expired certificate", "verify certificate hostname"],
};
test("domain diagnostics rank in the top three of the real production catalog", async () => {
  const catalog = await realCatalog();
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(CASES)) {
    for (const query of queries) {
      const hits = catalog.search(query, 3).map(hit => hit.id);
      if (!hits.includes(id)) misses.push(`${id}: ${query} -> ${hits.join(", ")}`);
    }
  }
  assert.deepEqual(misses, [], `queries missing top three: ${misses.join("\n")}`);
});
