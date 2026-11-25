import assert from "node:assert/strict";
import test from "node:test";

import type { ToolRegistration } from "@jini-ai/core";
import type { AdminChartProviderSnapshot } from "@jini-ai/core/contracts/headless/chart-providers";

import { chartCatalogManifests } from "../component-catalog-query.js";
import { buildComponentCatalogRegistrations, DESCRIBE_COMPONENT_TOOL_ID, SEARCH_COMPONENTS_TOOL_ID } from "../component-catalog-tool.js";

/**
 * @file `search_components`/`describe_component` handler round trips over the real manifest set:
 * the `limit` hint is clamped (never rejected) to [1, 25] with a default of 10, and an unknown id
 * is a thrown error rather than a null result the model could misread as an empty component.
 * Chart entries come from the host's live snapshot, so these metadata fixtures inject a static one.
 */

/** A fixed test snapshot: one admitted provider drawing bars, the site default. */
const STATIC_TEST_SNAPSHOT: AdminChartProviderSnapshot = { generation: "test:1", siteProvider: "charts.example",
  providers: [{ id: "charts.example", kinds: ["bar"], javascript: "/providers/example.js" }] };
const MANIFESTS = chartCatalogManifests({ snapshot: STATIC_TEST_SNAPSHOT });

function registrationFor(registrations: ToolRegistration[], toolId: string): ToolRegistration["handler"] {
  const registration = registrations.find((r) => r.descriptor.id === toolId);
  assert.ok(registration, `${toolId} must be wired`);
  return registration.handler;
}

function handlerFor(toolId: string): ToolRegistration["handler"] {
  return registrationFor(buildComponentCatalogRegistrations({ readChartSnapshot: async () => STATIC_TEST_SNAPSHOT }), toolId);
}

function call(handler: ToolRegistration["handler"], input: unknown) {
  return handler({
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as Parameters<typeof handler>[0]);
}

// A query term every manifest's haystack contains, so the hit count is bounded only by the limit.
const BROAD_QUERY = MANIFESTS.map((manifest) => manifest.id.split(".")[0]).join(" ");

test("search_components defaults to 10 hits, clamps a low limit up to 1 and a high one down to 25", async () => {
  const search = handlerFor(SEARCH_COMPONENTS_TOOL_ID);
  const total = (await call(search, { query: BROAD_QUERY, limit: 1000 }) as unknown[]).length;
  assert.equal(total, Math.min(25, MANIFESTS.length));
  assert.equal((await call(search, { query: BROAD_QUERY }) as unknown[]).length, Math.min(10, total));
  assert.equal((await call(search, { query: BROAD_QUERY, limit: 0 }) as unknown[]).length, 1);
  assert.equal((await call(search, { query: BROAD_QUERY, limit: 2.9 }) as unknown[]).length, Math.min(2, total));
});

test("describe_component returns a known entry and throws for an unknown id", async () => {
  const describe = handlerFor(DESCRIBE_COMPONENT_TOOL_ID);
  const [first] = MANIFESTS;
  assert.ok(first);
  assert.equal((await call(describe, { id: first.id }) as { id: string }).id, first.id);
  await assert.rejects(() => call(describe, { id: "no.such-component" }), /component 'no.such-component' was not found/);
});

test("search and describe follow a provider becoming unavailable without rebuilding registrations", async () => {
  let current: AdminChartProviderSnapshot | Error = STATIC_TEST_SNAPSHOT;
  const registrations = buildComponentCatalogRegistrations({ readChartSnapshot: async () => {
    if (current instanceof Error) throw current;
    return current;
  } });
  const search = registrationFor(registrations, SEARCH_COMPONENTS_TOOL_ID);
  const describe = registrationFor(registrations, DESCRIBE_COMPONENT_TOOL_ID);
  const providerIds = async () => (await call(search, { query: "charts.example", limit: 25 }) as { id: string }[]).map(hit => hit.id);
  assert.ok((await providerIds()).includes("charts.example.bar-chart"));
  assert.equal((await call(describe, { id: "charts.example.bar-chart" }) as { id: string }).id, "charts.example.bar-chart");

  current = { generation: "test:2", siteProvider: "charts.example", providers: [] };
  assert.ok(!(await providerIds()).includes("charts.example.bar-chart"), "a disabled provider leaves search");
  await assert.rejects(() => call(describe, { id: "charts.example.bar-chart" }), /component 'charts.example.bar-chart' was not found/);

  // A failed live read is reported, never answered from a catalog that might name a disabled provider.
  current = new Error("chart providers unavailable");
  await assert.rejects(() => call(search, { query: "chart" }), /chart providers unavailable/);
  await assert.rejects(() => call(describe, { id: "chart.spec" }), /chart providers unavailable/);
});

test("catalog registration reads no chart snapshot during metadata construction", async () => {
  let reads = 0;
  const registrations = buildComponentCatalogRegistrations({ readChartSnapshot: async () => { reads++; return STATIC_TEST_SNAPSHOT; } });
  assert.deepEqual(registrations.map(r => r.descriptor.id).sort(), [DESCRIBE_COMPONENT_TOOL_ID, SEARCH_COMPONENTS_TOOL_ID].sort());
  assert.equal(reads, 0, "building metadata must not touch the live chart registry");
  await call(registrationFor(registrations, SEARCH_COMPONENTS_TOOL_ID), { query: "chart" });
  await call(registrationFor(registrations, DESCRIBE_COMPONENT_TOOL_ID), { id: "chart.spec" });
  assert.equal(reads, 2, "each request reads its own snapshot; nothing is cached across requests");
});
