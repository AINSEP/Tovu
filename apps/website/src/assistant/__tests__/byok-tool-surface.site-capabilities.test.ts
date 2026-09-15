import assert from "node:assert/strict";
import test from "node:test";

import { createByokToolSurface, type ByokToolSurfaceDeps } from "../byok-tool-surface.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";

/**
 * @file The BYOK composition root's half of `site_describe_capabilities`' registry wiring. Run through
 * `execute_delegated_tool`, its `tools` section must come back `ok` and list exactly what this
 * surface's own `describe_tool` resolves — the property that makes it an overview of the one catalog
 * rather than a second one. The daemon's half is
 * `server/inbound/assistant/__tests__/agent-daemon-server.site-capabilities-registry-wiring.unit.test.ts`.
 */

// `createByokToolSurface` is called directly (not through `createAssistantByokModule`, which installs
// first-party contributors itself), so this file must install them — see `byok-tool-surface.test.ts`.
resetToolContributorsForTests();
installFirstPartyToolContributors();

const PRINCIPAL = { id: "principal-site-capabilities" };
const RUN = { id: "run-site-capabilities" };

/** Same wide-enough-to-build fake `byok-tool-surface.test.ts` uses; `authorize` allows everything. */
function fakeRouteDeps(): ByokToolSurfaceDeps {
  const deps = {
    workspaceId: "ws-site-capabilities",
    clock: { nowIso: () => "2026-09-15T00:00:00.000Z" },
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
  };
  return deps as unknown as ByokToolSurfaceDeps;
}

interface ToolsSection {
  status: string;
  reason?: string;
  data?: { total: number; domains: { domain: string; tools: { id: string }[] }[] };
}

async function describeCapabilitiesTools(surface: ReturnType<typeof createByokToolSurface>): Promise<ToolsSection> {
  const result = await surface.executeMetaTool(PRINCIPAL, RUN, {
    name: "execute_delegated_tool",
    input: { toolId: "site_describe_capabilities", input: { sections: ["tools"] } },
  });
  assert.notEqual(result.isError, true, result.content);
  const parsed = JSON.parse(result.content) as { sections: { tools: ToolsSection } };
  return parsed.sections.tools;
}

test("BYOK: site_describe_capabilities lists every tool this surface's describe_tool resolves, and only those", async () => {
  const surface = createByokToolSurface(fakeRouteDeps());
  const tools = await describeCapabilitiesTools(surface);

  assert.equal(tools.status, "ok", `tools section was ${tools.status}/${tools.reason ?? ""} — the surface did not wire its registry reader`);
  const ids = (tools.data?.domains ?? []).flatMap((domain) => domain.tools.map((tool) => tool.id));
  assert.equal(ids.length, tools.data?.total);
  assert.ok(ids.includes("site_describe_capabilities"), "the tool must see itself in the registry it reads");
  // The whole registry, not just ids that resolve: a reader bound to a subset of it passes every
  // other assertion in this test.
  assert.deepEqual([...ids].sort(), surface.registry.list().map((descriptor) => descriptor.id).sort());

  for (const id of ids) {
    const described = await surface.executeMetaTool(PRINCIPAL, RUN, { name: "describe_tool", input: { id } });
    assert.notEqual(described.isError, true, `site_describe_capabilities listed '${id}' but describe_tool cannot resolve it`);
  }
});

test("BYOK: a caller-supplied listCatalogTools cannot replace the surface's own registry reader", async () => {
  const deps = { ...fakeRouteDeps(), listCatalogTools: () => [] } as unknown as ByokToolSurfaceDeps;
  const surface = createByokToolSurface(deps);
  const tools = await describeCapabilitiesTools(surface);

  assert.equal(tools.status, "ok");
  assert.equal(
    tools.data?.total,
    surface.registry.list().length,
    "the surface must read its own registry, not a reader smuggled in through routeDeps",
  );
});
