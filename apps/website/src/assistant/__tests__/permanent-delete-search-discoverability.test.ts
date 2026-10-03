import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";

import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/** Owner n01: real FTS catalog competition, including softer Trash and disable tools. */
const QUERIES: Record<string, string[]> = {
  trash_empty: ["empty the trash", "clear the recycle bin permanently", "purge everything in trash", "permanently remove all deleted items"],
  trash_purge_item: ["permanently delete one trashed item", "purge this trash item", "remove a deleted post forever", "permanently remove a deleted page"],
  media_purge_asset: ["permanently delete a media file", "purge a media asset", "remove this image forever", "permanently erase a photo"],
  comments_purge_comment: ["permanently delete a comment", "purge this comment", "erase spam comments forever", "remove a comment permanently"],
  identity_user_delete: ["permanently delete a user", "purge this user account", "remove a user forever", "erase a trashed user permanently"],
  external_mcp_delete: ["delete an external MCP server", "permanently remove an MCP connection", "remove an external MCP integration", "erase the saved MCP server"],
  custom_credential_delete: ["delete a saved custom credential", "remove a custom provider token", "erase a custom API key", "permanently delete a custom provider credential"],
  deployment_delete_provider_credential: ["delete a publish host credential", "remove a saved hosting token", "erase a deployment provider credential", "permanently remove a publishing credential"],
  source_control_delete_credential: ["delete a source control credential", "remove a saved git token", "erase a source control API key", "permanently remove a repository credential"],
};

test("permanent deletes rank in the top three for owner vocabulary", async () => {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = createToolRegistry({});
  for (const r of buildAssistantToolRegistrations(deps, undefined, { contributions })) registry.register(r);
  const catalog = buildToolCatalogQuery(registry);
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(QUERIES)) {
    for (const query of queries) {
      const hits = catalog.search({ query: query }, { limit: 3 }).map(h => h.id);
      if (!hits.includes(id)) misses.push(`${id}: ${query} -> ${hits.join(", ")}`);
    }
  }
  assert.deepEqual(misses, [], `Permanent-delete discovery misses:\n${misses.join("\n")}`);
});
