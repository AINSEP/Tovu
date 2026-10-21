import assert from "node:assert/strict";
import test from "node:test";

import type { ToolRegistration } from "@jini-ai/core";
import { ALL_MANIFESTS } from "@jini-ai/ui/interactive-ui/manifests";

import { buildComponentCatalogRegistrations, DESCRIBE_COMPONENT_TOOL_ID, SEARCH_COMPONENTS_TOOL_ID } from "../component-catalog-tool.js";

/**
 * @file `search_components`/`describe_component` handler round trips over the real manifest set:
 * the `limit` hint is clamped (never rejected) to [1, 25] with a default of 10, and an unknown id
 * is a thrown error rather than a null result the model could misread as an empty component.
 */

function handlerFor(toolId: string): ToolRegistration["handler"] {
  const registration = buildComponentCatalogRegistrations(undefined, undefined).find((r) => r.descriptor.id === toolId);
  assert.ok(registration, `${toolId} must be wired`);
  return registration.handler;
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
const BROAD_QUERY = ALL_MANIFESTS.map((manifest) => manifest.id.split(".")[0]).join(" ");

test("search_components defaults to 10 hits, clamps a low limit up to 1 and a high one down to 25", async () => {
  const search = handlerFor(SEARCH_COMPONENTS_TOOL_ID);
  const total = (await call(search, { query: BROAD_QUERY, limit: 1000 }) as unknown[]).length;
  assert.equal(total, Math.min(25, ALL_MANIFESTS.length));
  assert.equal((await call(search, { query: BROAD_QUERY }) as unknown[]).length, Math.min(10, total));
  assert.equal((await call(search, { query: BROAD_QUERY, limit: 0 }) as unknown[]).length, 1);
  assert.equal((await call(search, { query: BROAD_QUERY, limit: 2.9 }) as unknown[]).length, Math.min(2, total));
});

test("describe_component returns a known entry and throws for an unknown id", async () => {
  const describe = handlerFor(DESCRIBE_COMPONENT_TOOL_ID);
  const [first] = ALL_MANIFESTS;
  assert.ok(first);
  assert.equal((await call(describe, { id: first.id }) as { id: string }).id, first.id);
  await assert.rejects(() => call(describe, { id: "no.such-component" }), /component 'no.such-component' was not found/);
});
