import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCatalogQuery } from "@jini-ai/http-kit";

import { createLiveToolCatalogQuery } from "../tool-catalog-live-query.js";

/**
 * @file `createLiveToolCatalogQuery` — the discovery-side half of federation hot-reload. See that
 * module's own header for why `@jini-ai/http-kit`'s `registerToolCatalogRoutes` needs an object whose
 * IDENTITY never changes even though what it delegates to does.
 */

function stubCatalog(label: string): ToolCatalogQuery {
  return {
    search: (query) => [{ id: `${label}:${query}`, description: label, source: "test", score: 1 }],
    describe: (id) => ({ id: `${label}:${id}`, description: label, source: "test" }),
  };
}

test("query delegates to the initially-bound catalog before any rebind", () => {
  const live = createLiveToolCatalogQuery(stubCatalog("first"));
  assert.deepEqual(live.query.search("q"), [{ id: "first:q", description: "first", source: "test", score: 1 }]);
  assert.deepEqual(live.query.describe("x"), { id: "first:x", description: "first", source: "test" });
});

test("rebind swaps what the SAME query object delegates to — object identity never changes", () => {
  const live = createLiveToolCatalogQuery(stubCatalog("first"));
  const queryReference = live.query;

  live.rebind(stubCatalog("second"));

  assert.equal(live.query, queryReference, "the object handed to registerToolCatalogRoutes must stay the same reference across a rebind");
  assert.deepEqual(live.query.search("q"), [{ id: "second:q", description: "second", source: "test", score: 1 }]);
});

test("multiple rebinds always reflect the MOST RECENT catalog, never an earlier one", () => {
  const live = createLiveToolCatalogQuery(stubCatalog("boot"));
  live.rebind(stubCatalog("reload-1"));
  live.rebind(stubCatalog("reload-2"));

  assert.deepEqual(live.query.describe("x"), { id: "reload-2:x", description: "reload-2", source: "test" });
});
