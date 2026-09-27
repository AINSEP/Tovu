import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createFrontendControl } from "@jini-ai/http-kit";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";
import { FRONTEND_CONTROL_CAPABILITIES } from "../frontend-control-capabilities.js";

/**
 * @file Search-ranking evidence for `admin.publish_content` on "what is waiting to be published".
 * In an admin chat the model searched for a read-only list of pending publish items, found
 * `content_read.database_pending_migration` near the top (its vocabulary is "pending", "not yet
 * applied", "queued but not done"), saw that it is about database migrations, and concluded no
 * tool shows what would be published. `admin.publish_content` does exactly that: it opens the
 * Publish dialog and answers with the dialog's plan, and nothing is published until the person
 * confirms there. Its vocabulary had only the verbs of publishing, none of the words for "pending".
 *
 * Same harness as `tool-search-keywords.fs-files-ranking.test.ts`, plus the frontend capability
 * registrations the daemon adds to the same registry (`agent-daemon-server.ts`).
 */

const CASES: readonly { readonly query: string; readonly expect: string }[] = [
  { query: "list the pending publish items", expect: "admin.publish_content" },
  { query: "what changes haven't been published to the live site yet", expect: "admin.publish_content" },
  { query: "show me what would be published without publishing", expect: "admin.publish_content" },
  { query: "preview unpublished changes waiting to go live", expect: "admin.publish_content" },
];

const SEARCH_LIMIT = 10;
const TOP_N = 3;

async function buildCatalog() {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter })) {
    registry.register(registration);
  }
  const frontendControl = createFrontendControl({ capabilities: FRONTEND_CONTROL_CAPABILITIES, resolveBindToken: () => undefined });
  for (const registration of frontendControl.toolRegistrations) registry.register(registration);
  return buildToolCatalogQuery(registry);
}

test("asking what is waiting to be published finds the Publish dialog capability in the top 3", async () => {
  const catalog = await buildCatalog();
  const misses = CASES.flatMap((c) => {
    const hits = catalog.search(c.query, SEARCH_LIMIT);
    const index = hits.findIndex((hit) => hit.id === c.expect);
    const rank = index === -1 ? null : index + 1;
    return rank !== null && rank <= TOP_N
      ? []
      : [`"${c.query}" -> ${c.expect} rank ${rank ?? "MISS"} (top: ${hits.slice(0, 3).map((h) => h.id).join(", ")})`];
  });
  assert.deepEqual(misses, []);
});

// The new words must not pull the dialog above the tools that own neighbouring questions.
test("the added vocabulary does not displace the static-site dry run or the comment queue", async () => {
  const catalog = await buildCatalog();
  assert.equal(catalog.search("do a dry run before I deploy the static site", SEARCH_LIMIT)[0]?.id, "deployment_preview_static_publish");
  assert.equal(catalog.search("show me comments waiting for approval", SEARCH_LIMIT)[0]?.id, "content_read.comment_moderation_queue");
});
