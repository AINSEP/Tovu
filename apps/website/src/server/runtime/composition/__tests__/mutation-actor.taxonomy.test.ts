import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createContributionRegistry, type DerivedToolContributor, type ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { bootAuthenticated } from "../../../__tests__/helpers/http-test-server.js";
import { registerAuthRoutes, requireAdminSession } from "../../../inbound/admin-http/dev-auth.js";
import { createRouteDeps } from "../app.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";
import {
  registerAdminTaxonomyAssignTermsRoute,
  registerAdminTaxonomyCreateRoute,
  registerAdminTaxonomyCreateTermRoute,
} from "../modules/taxonomy.js";

/**
 * P10-H2.T: the taxonomy writer stamps whatever trusted actor its channel hands it, so the kind is
 * decided where the channel is composed. This drives the real composed admin route registrar and the
 * real assistant contributor `installFirstPartyToolContributors` installs, for the SAME principal,
 * and reads the kinds back off the stored outbox events. An assistant acting for an owner does not
 * turn the action into an owner click.
 */

/** The taxonomy contributor exactly as the composition root installs it for the assistant. */
function composedTaxonomyContributor() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find(candidate => candidate.domain === "taxonomy");
  assert.ok(contributor, "the composition root installs the taxonomy contributor");
  return contributor;
}

async function postJson(url: string, cookie: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  assert.ok(res.ok, `${url} -> ${res.status} ${await res.clone().text()}`);
  return res.status === 204 ? undefined : await res.json() as Record<string, { id: string }>;
}

test("the same owner's admin taxonomy edit and assistant taxonomy edit persist different kinds", async t => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminTaxonomyCreateRoute({ app, deps });
  registerAdminTaxonomyCreateTermRoute({ app, deps });
  registerAdminTaxonomyAssignTermsRoute({ app, deps });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const api = `${baseUrl}/api/admin/v1/taxonomy`;

  const { taxonomy } = (await postJson(api, cookie, { name: "Attribution", hierarchical: false }))!;
  const { term: adminTerm } = (await postJson(`${api}/${taxonomy!.id}/terms`, cookie, { name: "Admin tag" }))!;
  const { term: assistantTerm } = (await postJson(`${api}/${taxonomy!.id}/terms`, cookie, { name: "Assistant tag" }))!;
  await postJson(`${api}/assign-terms`, cookie, { contentType: "post", contentId: "post-home", termIds: [adminTerm!.id] });

  const assigned = async () => (await deps.outbox.claimPending({ batchSize: 1000, nowIso: "2999-01-01T00:00:00.000Z" }))
    .map(record => record.event).filter(event => event.name === "taxonomy.terms_assigned");
  const [adminEvent] = await assigned();
  const ownerId = adminEvent?.actorId;
  assert.ok(ownerId, "the admin assignment recorded its acting owner");

  const tool = composedTaxonomyContributor().build(deps as never, undefined as never).find(r => r.descriptor.id === "taxonomy_assign_terms");
  assert.ok(tool, "the assistant offers taxonomy_assign_terms");
  await tool.handler({ executionId: "e1", principal: { id: ownerId }, run: { id: "r1" }, signal: new AbortController().signal,
    input: { contentType: "post", contentId: "post-home", termIds: [assistantTerm!.id] } });
  const [assistantEvent] = await assigned();

  assert.deepEqual(adminEvent?.actor, { id: ownerId, kind: "user" });
  assert.deepEqual(assistantEvent?.actor, { id: ownerId, kind: "agent" });
});
