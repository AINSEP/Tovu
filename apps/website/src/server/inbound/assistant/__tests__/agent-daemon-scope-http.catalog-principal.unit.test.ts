import assert from "node:assert/strict";
import test from "node:test";
import type { Principal } from "@jini-ai/core";

/**
 * @file The daemon's mounted discovery statement (`mountDiscoveryRoutes` in
 * `agent-daemon-scope-http.ts`) scopes `/api/tools/search` and `/api/tools/:id` by the live run's
 * principal: a full caller discovers and describes every tool, a read-only caller only read-only
 * tools, and a caller whose bearer names no live run is refused without the catalog.
 */
async function mounted() {
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createInMemoryToolAttemptAuditSink } = await import("@jini-ai/diagnostics/tool-audit/repo.memory");
  const { constrainPrincipalToReadOnlyTools } = await import("#src/assistant/read-only-tool-constraint");
  const { mountDaemonCatalog } = await import("./helpers/daemon-catalog.js");
  const registry = createToolRegistry({});
  for (const [id, readOnly] of [["orbit_read", true], ["orbit_write", false]] as const) {
    registry.register({ descriptor: { id, readOnly, description: `orbitarium ${id}`, inputSchema: { type: "object" } }, handler: async () => "ok", policy: { authorize: () => "allow" } });
  }
  const principals = new Map<string, Principal>([["tok-full", { id: "p-full" }], ["tok-reader", constrainPrincipalToReadOnlyTools({ id: "p-reader" })]]);
  return mountDaemonCatalog(registry, createInMemoryToolAttemptAuditSink(), { principals });
}

const searchIds = (body: { hits?: { id: string }[] }) => (body.hits ?? []).map(hit => hit.id).sort();

test("mounted search: a full caller finds read and write tools, a read-only caller only read tools, in either order", async t => {
  const catalog = await mounted();
  t.after(catalog.dispose);
  for (const token of ["tok-reader", "tok-full", "tok-reader", "tok-full"]) {
    const { status, body } = await catalog.request("/api/tools/search", { q: "orbitarium" }, {}, { token });
    assert.deepEqual([token, status, searchIds(body)], [token, 200, token === "tok-full" ? ["orbit_read", "orbit_write"] : ["orbit_read"]]);
  }
});

test("mounted describe: a write tool is 404 for a read-only caller and 200 for a full one", async t => {
  const catalog = await mounted();
  t.after(catalog.dispose);
  for (const token of ["tok-full", "tok-reader", "tok-full"]) {
    const write = await catalog.request("/api/tools/:id", {}, { id: "orbit_write" }, { token });
    const read = await catalog.request("/api/tools/:id", {}, { id: "orbit_read" }, { token });
    assert.deepEqual([token, write.status, read.status], [token, token === "tok-full" ? 200 : 404, 200]);
  }
});

test("mounted search and describe refuse a caller with no live run and never leak the catalog", async t => {
  const catalog = await mounted();
  t.after(catalog.dispose);
  for (const token of [null, "tok-stranger"]) {
    const search = await catalog.request("/api/tools/search", { q: "orbitarium" }, {}, { token });
    const describe = await catalog.request("/api/tools/:id", {}, { id: "orbit_write" }, { token });
    for (const { status, body } of [search, describe]) {
      assert.ok(status >= 400, `${String(token)} must be refused, got ${status}`);
      assert.ok(!JSON.stringify(body).includes("orbit_"), `${String(token)} must not see any tool`);
    }
  }
});
