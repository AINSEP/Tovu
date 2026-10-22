import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCatalogQuery } from "@jini-ai/daemon/http";

import { createLiveToolCatalogQuery } from "../tool-catalog-live-query.js";

/**
 * @file `createLiveToolCatalogQuery` — the discovery-side half of federation hot-reload. See that
 * module's own header for why `@jini-ai/http-kit`'s `registerToolCatalogRoutes` needs an object whose
 * IDENTITY never changes even though what it delegates to does.
 */

function stubCatalog(label: string): ToolCatalogQuery {
  return {
    search: ({ query }) => [{ id: `${label}:${query}`, description: label, source: "test", score: 1 }],
    describe: ({ id }) => ({ id: `${label}:${id}`, description: label, source: "test" }),
  };
}

test("query delegates to the initially-bound catalog before any rebind", () => {
  const live = createLiveToolCatalogQuery(stubCatalog("first"));
  assert.deepEqual(live.query.search({ query: "q" }), [{ id: "first:q", description: "first", source: "test", score: 1 }]);
  assert.deepEqual(live.query.describe({ id: "x" }), { id: "first:x", description: "first", source: "test" });
});

test("rebind swaps what the SAME query object delegates to — object identity never changes", () => {
  const live = createLiveToolCatalogQuery(stubCatalog("first"));
  const queryReference = live.query;

  live.rebind(stubCatalog("second"));

  assert.equal(live.query, queryReference, "the object handed to registerToolCatalogRoutes must stay the same reference across a rebind");
  assert.deepEqual(live.query.search({ query: "q" }), [{ id: "second:q", description: "second", source: "test", score: 1 }]);
});

test("multiple rebinds always reflect the MOST RECENT catalog, never an earlier one", () => {
  const live = createLiveToolCatalogQuery(stubCatalog("boot"));
  live.rebind(stubCatalog("reload-1"));
  live.rebind(stubCatalog("reload-2"));

  assert.deepEqual(live.query.describe({ id: "x" }), { id: "reload-2:x", description: "reload-2", source: "test" });
});

test("search preserves an explicit limit before and after rebind", () => {
  const catalog = (prefix: string): ToolCatalogQuery => ({
    ...stubCatalog(prefix),
    search: (_query, { limit = 3 } = {}) => [1, 2, 3].slice(0, limit).map((n) => ({
      id: `${prefix}-${n}`, description: prefix, source: "test", score: 1,
    })),
  });
  const live = createLiveToolCatalogQuery(catalog("first"));
  assert.deepEqual(live.query.search({ query: "q" }, { limit: 1 }).map(({ id }) => id), ["first-1"]);
  live.rebind(catalog("second"));
  assert.deepEqual(live.query.search({ query: "q" }, { limit: 2 }).map(({ id }) => id), ["second-1", "second-2"]);
});

// F2.3: the actual daemon onAdmitted callback must rebind the object already mounted.
test("daemon admission updates the mounted query while retaining boot tools", async () => {
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createInMemoryToolAttemptAuditSink } = await import("../../features/tool-audit/repo.memory.js");
  const { mountDaemonCatalog } = await import("../../server/inbound/assistant/__tests__/helpers/daemon-catalog.js");
  const registry = createToolRegistry({});
  const registration = (id: string) => ({ descriptor: { id, description: "reload discovery probe" }, handler: async () => "ok", policy: { authorize: () => "allow" as const } });
  registry.register(registration("boot_probe"));
  const sink = createInMemoryToolAttemptAuditSink();
  const mounted = await mountDaemonCatalog(registry, sink);
  assert.equal((await mounted.request("/api/tools/:id", {}, { id: "admitted_probe" })).status, 404);
  registry.register(registration("admitted_probe"));
  mounted.onAdmitted({ newlyAdmittedConnectionIds: ["probe"], reports: [], connectFailures: [] });
  const search = await mounted.request("/api/tools/search", { q: "reload discovery probe" });
  assert.equal(search.status, 200);
  assert.deepEqual(search.body.hits.map((hit: { id: string }) => hit.id).sort(), ["admitted_probe", "boot_probe"]);
  for (const id of ["boot_probe", "admitted_probe"]) {
    const described = await mounted.request("/api/tools/:id", {}, { id });
    assert.equal(described.status, 200);
    assert.equal(described.body.id, id);
  }
  assert.equal(sink.events.filter((event) => event.toolId === "search_tools").length, 1, "the rebound snapshot must still be audited");
});

test("the daemon describe route exposes the read family and refreshes its registered cards", async () => {
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createInMemoryToolAttemptAuditSink } = await import("../../features/tool-audit/repo.memory.js");
  const { mountDaemonCatalog } = await import("../../server/inbound/assistant/__tests__/helpers/daemon-catalog.js");
  const registry = createToolRegistry({});
  const registration = ({ id, description }: { id: string; description: string }, _options = {}) => ({ descriptor: { id, description, readOnly: true }, handler: async () => "ok", policy: { authorize: () => "allow" as const } });
  registry.register(registration({ id: "content_read.media_asset", description: "Lists media assets." }));
  const mounted = await mountDaemonCatalog(registry, createInMemoryToolAttemptAuditSink());
  const before = await mounted.request("/api/tools/:id", {}, { id: "content_read" });
  assert.equal(before.status, 200);
  assert.match(before.body.description, /content_read\.media_asset — Lists media assets\./);
  assert.doesNotMatch(before.body.description, /content_read\.theme/);
  assert.equal(registry.has({ toolId: "content_read" }), false, "the description must not create an executable parent tool");
  registry.register(registration({ id: "content_read.theme", description: "Reads themes." }));
  mounted.onAdmitted({ newlyAdmittedConnectionIds: ["read-card-probe"], reports: [], connectFailures: [] });
  const after = await mounted.request("/api/tools/:id", {}, { id: "content_read" });
  assert.equal(after.status, 200);
  assert.match(after.body.description, /content_read\.media_asset — Lists media assets\./);
  assert.match(after.body.description, /content_read\.theme — Reads themes\./);
  assert.equal((await mounted.request("/api/tools/:id", {}, { id: "content_read.missing" })).status, 404);
});
