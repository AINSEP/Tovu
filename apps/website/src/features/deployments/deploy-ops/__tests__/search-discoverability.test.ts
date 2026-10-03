import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createToolRegistry } from "@jini-ai/core";
import { createRouteDeps } from "../../../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../../../server/runtime/composition/tool-catalog-manifest.js";

import { buildAssistantToolRegistrations } from "../../../../assistant/tool-registrations.js";
import { buildToolCatalogQuery } from "../../../../assistant/tool-catalog-query.js";
import { DOC2QUERY } from "../../../../assistant/tool-search-doc2query.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};
test("deploy ops owner phrasings rank in the top three of the real full catalog", async () => {
  contributions.contributors.clear({}); installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps(); await deps.identityReady;
  const registry = createToolRegistry({});
  const registrations = buildAssistantToolRegistrations(deps, undefined, { contributions });
  for (const registration of registrations) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  for (const id of ["deployment_ops_status", "deployment_ops_logs", "deployment_ops_wait", "deployment_ops_list_targets"]) {
    assert.equal((DOC2QUERY[id] ?? []).length >= 4, true, `missing questions for ${id}`);
    for (const query of DOC2QUERY[id]!) assert.equal(catalog.search(query, 3).some(hit => hit.id === id), true, `${id}: ${query}: ${JSON.stringify(catalog.search(query, 3).map(h => h.id))}`);
  }
  const hits = catalog.search("is my fly app up", 100).map(h => h.id);
  assert.equal(hits.includes("deployment_ops_status"), true);
  const withoutOps = createToolRegistry({});
  for (const registration of registrations) if (!registration.descriptor.id.startsWith("deployment_ops_")) withoutOps.register(registration);
  const baseline = buildToolCatalogQuery(withoutOps);
  const requests = JSON.parse(readFileSync(path.resolve("apps/website/src/assistant/__tests__/fixtures/tool-search-operator-requests.json"), "utf8")) as Array<{ id: string; query: string; expect: string[] }>;
  const regressions: string[] = [];
  for (const request of requests) {
    const previouslyFound = baseline.search(request.query, 3).some(h => request.expect.includes(h.id));
    const nowFound = catalog.search(request.query, 3).some(h => request.expect.includes(h.id));
    if (previouslyFound && !nowFound) regressions.push(request.id);
  }
  assert.deepEqual(regressions, [], "new deploy ops registrations must not displace existing operator requests");
  const raw = hits.indexOf("custom_credential_make_request");
  assert.equal(raw === -1 || hits.indexOf("deployment_ops_status") < raw, true, hits.join(", "));
});
