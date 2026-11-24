import assert from "node:assert/strict";
import test from "node:test";

/**
 * @file Host integration of the rebindable discovery catalog (`createLiveToolCatalogQuery`, owned and
 * unit-tested by `@jini-ai/registry/tool-catalog-builder`): federation admission must rebind the
 * object `toolCatalogRoutes` already holds, so the next run discovers admitted tools without losing
 * the boot tools.
 */

// F2.3: the actual daemon onAdmitted callback must rebind the object already mounted.
test("server admission refreshes the next daemon run while retaining boot tools", async t => {
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createInMemoryToolAttemptAuditSink } = await import("../../features/tool-audit/repo.memory.js");
  const { mountDaemonCatalog } = await import("../../server/inbound/assistant/__tests__/helpers/daemon-catalog.js");
  const registry = createToolRegistry({});
  const registration = (id: string) => ({ descriptor: { id, description: "reload discovery probe" }, handler: async () => "ok", policy: { authorize: () => "allow" as const } });
  registry.register(registration("boot_probe"));
  const sink = createInMemoryToolAttemptAuditSink();
  const mounted = await mountDaemonCatalog(registry, sink);
  t.after(mounted.dispose);
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

test("the daemon describe route exposes the read family and refreshes its registered cards", async t => {
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createInMemoryToolAttemptAuditSink } = await import("../../features/tool-audit/repo.memory.js");
  const { mountDaemonCatalog } = await import("../../server/inbound/assistant/__tests__/helpers/daemon-catalog.js");
  const registry = createToolRegistry({});
  const registration = ({ id, description }: { id: string; description: string }, _options = {}) => ({ descriptor: { id, description, readOnly: true }, handler: async () => "ok", policy: { authorize: () => "allow" as const } });
  registry.register(registration({ id: "content_read.media_asset", description: "Lists media assets." }));
  const mounted = await mountDaemonCatalog(registry, createInMemoryToolAttemptAuditSink());
  t.after(mounted.dispose);
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
