/**
 * @file `executeMetaTool`'s dispatch — the layer that stands between free-form model output and
 * `ToolExecutor`.
 *
 * The end-to-end "a real tool actually runs and returns a real result" property is covered by
 * `server/__tests__/assistant-byok-routes.test.ts`, through the real route against real deps. What
 * is covered HERE is everything that happens when the model gets it wrong — which, with a meta-tool
 * set, stops being an edge case: the tool id is now free-form model output rather than a name
 * picked from a list it was handed, so a hallucinated id, a misremembered one, or an argument in
 * the wrong shape are all ordinary events on the happy path of normal use.
 *
 * The load-bearing one is `execute_delegated_tool` with an unknown id. `ToolExecutor.execute`
 * THROWS for that case rather than returning a status, and an uncaught throw inside `executeTool`
 * aborts the whole turn's SSE stream — so the difference between catching it and not is the
 * difference between one recoverable tool call and a dead conversation.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryToolAttemptAuditSink } from "../../features/tool-audit/repo.memory.js";
import { META_TOOL_DESCRIPTORS, createByokToolSurface, type ByokToolSurfaceDeps } from "../byok-tool-surface.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";

// `surface()` below calls `createByokToolSurface` directly (not through `createAssistantByokModule`,
// which installs first-party contributors itself) — so this file must, or the `comments`/
// `newsletter` tools would be silently absent from the catalog it searches. See
// `tool-contribution-registry.ts`'s header. (`post`, this file's own "search 'post'" test's subject,
// is unaffected either way — it stayed on the static `DOMAIN_SLICES` seam; see
// `features/post/tool-registrations.ts`'s trailing comment for why.)
resetToolContributorsForTests();
installFirstPartyToolContributors();

const PRINCIPAL = { id: "principal-meta-tool" };
const RUN = { id: "run-meta-tool" };

/** Wide enough to BUILD every domain's registrations; no handler is invoked by these tests. Mirrors
 *  `tool-registrations.contracts.test.ts`'s own `fakeRouteDeps`. Typed `ByokToolSurfaceDeps` (not
 *  `RouteDeps`) because that is what `createByokToolSurface` actually declares it needs as of the
 *  double-cast removal — see that function's own doc. */
function fakeRouteDeps(): ByokToolSurfaceDeps {
  const deps = {
    workspaceId: "ws-meta-tool",
    clock: { nowIso: () => "2026-08-05T00:00:00.000Z" },
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

function surface() {
  return createByokToolSurface(fakeRouteDeps());
}

function call(name: string, input: unknown) {
  return { name, input };
}

test("the published meta-tool set is exactly the 3 staged-discovery tools, and nothing else reaches the provider", () => {
  assert.deepEqual(
    META_TOOL_DESCRIPTORS.map((tool) => tool.id),
    ["search_tools", "describe_tool", "execute_delegated_tool"],
  );
  assert.equal(surface().metaTools, META_TOOL_DESCRIPTORS);
});

test("search_tools finds a real tool in the real catalog, and every hit it returns is one describe_tool can then resolve", async () => {
  const s = surface();
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "workspace" }));

  assert.notEqual(result.isError, true);
  const { hits } = JSON.parse(result.content) as { hits: ReadonlyArray<{ id: string }> };
  assert.ok(hits.length > 0, "expected at least one hit for 'workspace'");

  // The non-drift property `buildToolCatalogQuery` exists for: search is seeded from the same
  // registry the executor resolves against, so a discoverable id is always a describable one.
  for (const hit of hits) {
    const described = await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: hit.id }));
    assert.notEqual(described.isError, true, `describe_tool could not resolve the id search_tools returned: ${hit.id}`);
  }
});

test("search_tools clamps an out-of-range limit instead of spending a turn refusing it", async () => {
  const s = surface();
  const tooMany = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "post", limit: 999 }));
  const { hits } = JSON.parse(tooMany.content) as { hits: readonly unknown[] };
  assert.ok(hits.length <= 25, `expected the limit clamped to 25, got ${hits.length} hits`);

  const tooFew = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "post", limit: 0 }));
  const parsed = JSON.parse(tooFew.content) as { hits: readonly unknown[] };
  assert.equal(parsed.hits.length, 1, "expected a 0 limit clamped up to 1, not treated as 'no results'");
});

test("search_tools with a missing or empty query is a readable error, not an empty result set", async () => {
  const s = surface();
  for (const input of [{}, { query: "" }, { query: "   " }, { query: 42 }, null]) {
    const result = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", input));
    assert.equal(result.isError, true, `expected an error for input ${JSON.stringify(input)}`);
    assert.match(result.content, /'query' is required/);
  }
});

test("a query that matches nothing reports that it matched nothing, rather than looking like a broken tool", async () => {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "zzzzqqqwwwnothingmatchesthis" }));
  assert.notEqual(result.isError, true);
  const parsed = JSON.parse(result.content) as { hits: readonly unknown[]; note?: string };
  assert.equal(parsed.hits.length, 0);
  assert.match(String(parsed.note), /No tool matched/);
});

test("describe_tool returns a real tool's input schema, and refuses an unknown id with a next step", async () => {
  const s = surface();
  const found = await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "workspace_get" }));
  assert.notEqual(found.isError, true);
  assert.match(found.content, /workspace_get/);

  const missing = await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "workspace_get_but_invented" }));
  assert.equal(missing.isError, true);
  assert.match(missing.content, /No tool with id/);
  assert.match(missing.content, /search_tools/, "an error the model can act on should name the tool that fixes it");
});

test("execute_delegated_tool with a HALLUCINATED tool id returns a recoverable error — it does not throw and kill the turn", async () => {
  const s = surface();
  // `ToolExecutor.execute` throws `unknown tool "..."` here. Unhandled, that propagates out of
  // `executeTool`, out of the provider adapter's loop, and aborts the SSE stream mid-turn.
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "definitely_not_a_real_tool", input: {} }));
  assert.equal(result.isError, true);
  assert.match(result.content, /unknown tool/i);
  assert.match(result.content, /search_tools/);
});

test("execute_delegated_tool requires a toolId, and says so", async () => {
  const s = surface();
  for (const input of [{}, { toolId: "" }, { toolId: 7 }]) {
    const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", input));
    assert.equal(result.isError, true);
    assert.match(result.content, /'toolId' is required/);
  }
});

test("execute_delegated_tool accepts a JSON-ENCODED input string — the observed provider behavior that would otherwise make every input-taking tool uncallable", async () => {
  const s = surface();
  // Reaches the executor (so the id resolves and the string was parsed into a real object); the
  // handler then fails on its own terms against these fake deps. What matters is that it is NOT
  // rejected at the argument-shape gate — that is the regression this guards.
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "workspace_get", input: '{"unused":true}' }));
  assert.doesNotMatch(result.content, /must be a JSON object/, "a JSON-encoded object string must be parsed, not refused");
});

test("execute_delegated_tool refuses an input that is neither an object nor JSON-parseable, naming what is wrong", async () => {
  const s = surface();
  const plain = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "workspace_get", input: "just some prose" }));
  assert.equal(plain.isError, true);
  assert.match(plain.content, /must be a JSON object/);

  const array = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "workspace_get", input: [1, 2] }));
  assert.equal(array.isError, true);
  assert.match(array.content, /an array/);
});

test("execute_delegated_tool treats an empty-string input the same as omitted — no input, not a parse error", async () => {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "workspace_get", input: "" }));
  assert.doesNotMatch(result.content, /must be a JSON object/, "an empty string must resolve to 'no input', not be refused as unparseable");
});

test("execute_delegated_tool refuses a non-object, non-array, non-string input (e.g. a bare number), naming the actual type", async () => {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "workspace_get", input: 42 }));
  assert.equal(result.isError, true);
  assert.match(result.content, /not number\./);
});

// Every Tovu tool registration's OWN handler is the sole authorization evaluator — the
// ToolRegistration's `ToolPolicy` (what `ToolExecutor`'s own internal `authorize()` step consults)
// is always a pass-through 'allow' (see mcp-federation.registrations.test.ts's identical finding
// for federated tools; the same is true of every first-party domain's registrations). So a denied
// `deps.authorize()` never produces `ToolExecutor`'s own `status: 'denied'` here — the handler
// throws `ForbiddenError` itself, mid-execution, which `ToolExecutor` catches the same way it
// catches any other handler exception: `status: 'failed'`, carrying the thrown message verbatim.
// This closes `mapToolExecutionResult`'s `case "failed"` for real (previously untested) — it does
// NOT and cannot close `case "denied"` through this call path; see this file's own test-certification
// notes / the coverage report for that one.
test("execute_delegated_tool maps a real tool's own thrown ForbiddenError (from ITS internal authorize check, not ToolPolicy) to a readable 'failed' error, not an uncaught throw", async () => {
  const deniedDeps = { ...fakeRouteDeps(), authorize: async () => ({ allowed: false, reason: "no grant" }) };
  const s = createByokToolSurface(deniedDeps);
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "workspace_get", input: {} }));
  assert.equal(result.isError, true);
  assert.match(result.content, /not authorized/);
});

test("execute_delegated_tool maps an already-aborted signal to a readable 'cancelled' error", async () => {
  const controller = new AbortController();
  controller.abort();
  const s = surface();
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "workspace_get", input: {} }), controller.signal);
  assert.equal(result.isError, true);
  assert.match(result.content, /was cancelled/);
});

test("a model that calls a REAL tool id as the tool NAME is told how to reach it, not just that it failed", async () => {
  // The most likely model mistake by far: it saw `workspace_get` in a search hit and called it
  // directly, because the meta-set is the only thing it was actually offered.
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, call("workspace_get", {}));
  assert.equal(result.isError, true);
  assert.match(result.content, /execute_delegated_tool with toolId: "workspace_get"/);
});

/**
 * INCIDENT FIX (2026-09-01): `search_tools`/`describe_tool` never reached `ToolExecutor`, so
 * `withToolAttemptAudit` never recorded them — an agent's `search_tools` miss on
 * `custom_credential_verify` left no query, limit, or hit-id trail to diagnose after the fact. Unlike
 * the Local CLI path (`tool-catalog-audit.test.ts`'s `withToolCatalogAudit`, which has no real
 * per-call identity to record), `executeMetaTool` already has the real `principal`/`run` for every
 * call — these tests assert that real identity, not a placeholder, lands in the row.
 */
test("INCIDENT FIX: a search_tools call through executeMetaTool is recorded with the caller's real principal/run and the exact query, limit, and ranked hit ids", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { toolAttemptAudit: { sink, workspaceId: "ws-meta-tool" } });

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "workspace", limit: 5 }));
  const { hits } = JSON.parse(result.content) as { hits: ReadonlyArray<{ id: string }> };

  assert.equal(sink.events.length, 1);
  const [event] = sink.events;
  assert.equal(event.toolId, "search_tools");
  assert.equal(event.workspaceId, "ws-meta-tool");
  assert.equal(event.runId, RUN.id);
  assert.equal(event.principalId, PRINCIPAL.id);
  assert.deepEqual(JSON.parse(String(event.detail)), { query: "workspace", limit: 5, resultIds: hits.map((h) => h.id), resultCount: hits.length });
});

test("a describe_tool call through executeMetaTool is recorded with the requested id and whether it resolved", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { toolAttemptAudit: { sink, workspaceId: "ws-meta-tool" } });

  await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "workspace_get" }));
  await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "workspace_get_but_invented" }));

  assert.equal(sink.events.length, 2);
  assert.deepEqual(JSON.parse(String(sink.events[0].detail)), { id: "workspace_get", found: true });
  assert.deepEqual(JSON.parse(String(sink.events[1].detail)), { id: "workspace_get_but_invented", found: false });
});

test("without a toolAttemptAudit option, search_tools/describe_tool behave exactly as before and log nothing", async () => {
  const s = surface(); // no toolAttemptAudit — the default this file's other tests already exercise
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "workspace" }));
  assert.notEqual(result.isError, true, "omitting the audit option must not change ordinary behavior");
});
