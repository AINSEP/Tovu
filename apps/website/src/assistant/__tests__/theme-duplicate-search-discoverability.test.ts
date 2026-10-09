import assert from "node:assert/strict";
import test from "node:test";

import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor, DerivedToolContributor } from "../index.js";
import { createByokToolSurface, type ByokToolSurfaceDeps } from "../byok-tool-surface.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

/**
 * @file `theme_duplicate` is reachable the way every non-Claude-Code assistant reaches a tool: through
 * search_tools' FTS5/BM25 ranking over the REAL first-party catalog. Before this tool, "make a new
 * theme from X" had nothing to find, and the nearest hits (`theme_copy_file`, `theme_write_file`)
 * only touch files inside a theme that already exists — so landing on them reproduces the gap.
 *
 * The BYOK test drives the 3 published meta-tools themselves (search_tools → describe_tool), since
 * that is the only surface a BYOK provider sees.
 */

const OPERATOR_PHRASINGS = [
  "duplicate theme",
  "copy theme",
  "new theme from existing",
  "make a new theme based on the current one",
  "clone the active theme so I can redesign it",
];

test("theme_duplicate is registered in the real catalog and ranks top-3 for operator phrasings", async () => {
  const { registry, catalog } = await realToolCatalog();
  assert.ok(registry.has({ toolId: "theme_duplicate" }), "theme_duplicate must be in the real assistant registry");
  for (const query of OPERATOR_PHRASINGS) {
    const hits = catalog.search({ query }, { limit: 3 }).map((hit) => hit.id);
    assert.ok(hits.includes("theme_duplicate"), `'${query}': expected theme_duplicate in top-3; got ${hits.join(", ") || "(none)"}`);
  }
});

/** Wide enough to BUILD every domain's registrations; nothing is executed. Mirrors
 *  `byok-tool-surface.test.ts`'s `fakeRouteDeps`. */
function fakeRouteDeps(): ByokToolSurfaceDeps {
  return {
    workspaceId: "ws-theme-duplicate-byok",
    clock: { nowMs: () => Date.parse("2026-10-08T00:00:00.000Z"), nowIso: () => "2026-10-08T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentTypeRepo: {
      save: async () => {},
      appendRevision: async () => {},
      findByKey: async () => null,
      listByWorkspace: async () => [],
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {},
      applyFieldIndexTransitions: async () => {},
      tearDownAllIndexesForContentType: async () => {},
    },
    outbox: { enqueue: async () => {} },
    seoDeps: { dispatch: async () => { throw new Error("SEO is outside this fixture"); } },
  } as unknown as ByokToolSurfaceDeps;
}

function textOf(result: { readonly content: unknown }): string {
  if (typeof result.content !== "string") assert.fail(`expected a text tool result, got ${JSON.stringify(result.content)}`);
  return result.content;
}

test("BYOK: search_tools finds theme_duplicate and describe_tool returns its registered schema", async () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const surface = createByokToolSurface(fakeRouteDeps(), { installExtensions: false, contributions });
  const principal = { id: "principal-theme-duplicate" };
  const run = { id: "run-theme-duplicate" };

  for (const query of ["duplicate theme", "copy theme", "new theme from existing"]) {
    const found = await surface.executeMetaTool(principal, run, { name: "search_tools", input: { query, limit: 3 } });
    const { hits } = JSON.parse(textOf(found)) as { hits: ReadonlyArray<{ id: string }> };
    assert.ok(hits.some((hit) => hit.id === "theme_duplicate"), `'${query}': expected theme_duplicate; got ${hits.map((hit) => hit.id).join(", ")}`);
  }
  const described = await surface.executeMetaTool(principal, run, { name: "describe_tool", input: { id: "theme_duplicate" } });
  assert.notEqual(described.isError, true);
  assert.deepEqual(
    JSON.parse(textOf(described)).inputSchema,
    surface.registry.list({}).find((tool) => tool.id === "theme_duplicate")?.inputSchema
  );
});
