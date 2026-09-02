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

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import { createInMemoryToolAttemptAuditSink } from "../../features/tool-audit/repo.memory.js";
import { META_TOOL_DESCRIPTORS, createByokToolSurface, type ByokToolSurfaceDeps } from "../byok-tool-surface.js";
import { TOOL_FAILURE_RECOVERY_TOOL_ID } from "../tool-failure-recovery.js";
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

/**
 * INCIDENT FIX (2026-09-02): the fix above (2026-09-01) covers `search_tools`/`describe_tool` only —
 * `executor` itself (the thing `execute_delegated_tool` actually calls, one line below the
 * `catalogAudit` dispatch) was built bare (`createToolExecutor({ registry })`, no
 * `withToolAttemptAudit`), so every REAL tool a BYOK-mode model ran — `custom_credential_list`,
 * `custom_credential_verify`, `custom_credential_set_token`, all of them — left no durable trail at
 * all, while the search that found them logged fine. Live-reproduced against the admin chat
 * (Google Gemini / BYOK): the assistant genuinely listed and verified two saved credentials, but
 * `agent_tool_attempts` held only the `search_tools`/`describe_tool` rows for that run, nothing for
 * either credential call. `withToolAttemptAudit` (`tool-executor-audit.ts`) is the exact mechanism
 * `agent-daemon-server.ts` already wraps its own executor with for this reason; this closes the
 * matching gap on the BYOK composition site.
 */
test("INCIDENT FIX: an execute_delegated_tool call through executeMetaTool is durably recorded — not just the search that found it", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { toolAttemptAudit: { sink, workspaceId: "ws-meta-tool" } });

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "definitely_not_a_real_tool", input: {} }));
  assert.equal(result.isError, true, "sanity: still the same recoverable-error behavior, unchanged by adding audit");

  assert.equal(sink.events.length, 2, "expected a 'requested' row before delegating and a final-phase row after");
  const [requested, final] = sink.events;
  assert.equal(requested.toolId, "definitely_not_a_real_tool");
  assert.equal(requested.phase, "requested");
  assert.equal(requested.workspaceId, "ws-meta-tool");
  assert.equal(requested.runId, RUN.id);
  assert.equal(requested.principalId, PRINCIPAL.id);
  assert.equal(final.phase, "unknown-tool", "ToolExecutor.execute throws 'unknown tool' for an id it does not know");
});

// ---------------------------------------------------------------------------
// INCIDENT FIX (2026-09-02): the ask -> apply -> retry-once tool-failure-recovery loop
// (`tool-failure-recovery.ts`) was wired into the Local CLI path's executor
// (`agent-daemon-server.ts:448-450`) but never into this file's — `execute_delegated_tool`'s real
// executor was built bare/audit-only, so a BYOK-mode diagnostic (`{hint, remedyToolId}`, e.g. from
// `custom_credential_verify`) reached the model as a dead-end failure instead of the self-healing
// loop the Local CLI path already gets. `withToolFailureRecovery`'s own correctness (the structural
// one-cycle guard, every BAIL/SILENCE/DECLINE shape) is certified directly in
// `tool-failure-recovery.test.ts` — these tests are deliberately narrower: they exist to prove this
// file's COMPOSITION reaches that loop at all, in the right order relative to the audit decorator,
// through the real `createByokToolSurface`-built registry/executor rather than a fake stand-in.
// ---------------------------------------------------------------------------

/** A minimal, always-allow `ToolRegistration` for a fake tool this section registers directly on
 *  `surface.registry` (the real `@jini-ai/core` registry `createByokToolSurface` builds and exposes)
 *  — the same technique `tool-registrations.contracts.test.ts` uses to probe registry mechanics
 *  without needing a full domain deps bag. `handler` is supplied per-test. */
function fakeAllowedRegistration(id: string, handler: (ctx: ToolExecutionContext) => Promise<unknown>, inputSchema?: unknown): ToolRegistration {
  return {
    descriptor: { id, inputSchema },
    policy: { authorize: () => "allow" },
    handler,
  };
}

/** Pulls the exchange id out of an emitted mcp-ui recovery surface — mirrors
 *  `tool-failure-recovery.test.ts`'s own `exchangeIdFromSurface`, duplicated here (not imported)
 *  because that helper is private to its own test file. */
function exchangeIdFromSurface(emittedSurface: unknown): string {
  const html = (emittedSurface as { payload: { resource: UIResource } }).payload.resource.resource.text as string;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the recovery surface must carry its exchange id");
  return match[1]!;
}

const RECOVERY_REMEDY_SCHEMA = { type: "object", required: ["value"], properties: { value: { type: "string", description: "The value to fix" } } };

test("WIRING: a diagnostic-carrying execute_delegated_tool result goes through ask -> apply -> retry, and the FINAL result is the retry's own — not the diagnostic", async () => {
  const s = surface(); // bare — no toolAttemptAudit — proving recovery does not depend on that option
  let originalCallCount = 0;
  let remedyInputSeen: unknown;

  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_original", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return { executed: false, hint: "needs a value", remedyToolId: "fake_recoverable_remedy" };
      return { fixed: true };
    }),
  );
  s.registry.register(
    fakeAllowedRegistration(
      "fake_recoverable_remedy",
      async (ctx) => {
        remedyInputSeen = ctx.input;
        return { saved: true };
      },
      RECOVERY_REMEDY_SCHEMA,
    ),
  );

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (emission) => void emitted.push(emission);

  const pending = s.executeMetaTool(
    PRINCIPAL,
    RUN,
    call("execute_delegated_tool", { toolId: "fake_recoverable_original", input: {} }),
    undefined,
    emitSurface,
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(emitted.length, 1, "expected the recovery surface to be raised exactly once before the call settles");
  const exchangeId = exchangeIdFromSurface(emitted[0]);

  const delivered = s.surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { value: "the-fix" } });
  assert.deepEqual(delivered, { ok: true }, "the recovery exchange must be reachable off the SAME surfaceExchanges store this surface exposes");

  const result = await pending;
  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(result.content), { fixed: true }, "the final result must be the RETRY's own output, not the original diagnostic");
  assert.equal(originalCallCount, 2, "the original tool must run exactly twice: the failing call, then the retry — never more");
  assert.deepEqual(remedyInputSeen, { value: "the-fix" }, "the human's answer must reach the remedy tool's own input");
});

test("WIRING: a successful first call is never retried and raises no recovery surface", async () => {
  const s = surface();
  let callCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_success", async () => {
      callCount += 1;
      return { fixed: true };
    }),
  );

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (emission) => void emitted.push(emission);
  const result = await s.executeMetaTool(
    PRINCIPAL,
    RUN,
    call("execute_delegated_tool", { toolId: "fake_recoverable_success", input: {} }),
    undefined,
    emitSurface,
  );

  assert.deepEqual(JSON.parse(result.content), { fixed: true });
  assert.equal(callCount, 1, "a call that never carries a diagnostic must run exactly once");
  assert.equal(emitted.length, 0, "no recovery surface should ever be raised for a hint-free result");
});

test("WIRING: no second recovery cycle — a retry whose OWN result also carries a fresh hint+remedyToolId is returned as-is, not looped on again", async () => {
  const s = surface();
  let originalCallCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_original_double", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return { hint: "first problem", remedyToolId: "fake_recoverable_remedy_double" };
      // The retry's own output ALSO looks diagnostic-shaped — this must not trigger a second ask.
      return { hint: "second problem", remedyToolId: "fake_recoverable_remedy_double" };
    }),
  );
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_remedy_double", async () => ({ saved: true }), RECOVERY_REMEDY_SCHEMA),
  );

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (emission) => void emitted.push(emission);
  const pending = s.executeMetaTool(
    PRINCIPAL,
    RUN,
    call("execute_delegated_tool", { toolId: "fake_recoverable_original_double", input: {} }),
    undefined,
    emitSurface,
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(emitted.length, 1, "exactly one recovery surface for the FIRST diagnostic");
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  s.surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { value: "fix-1" } });

  const result = await pending;
  assert.deepEqual(
    JSON.parse(result.content),
    { hint: "second problem", remedyToolId: "fake_recoverable_remedy_double" },
    "the retry's own diagnostic-shaped output must reach the model untouched — no second cycle",
  );
  assert.equal(emitted.length, 1, "still exactly one surface ever — no retry storm");
  assert.equal(originalCallCount, 2, "the original tool ran exactly twice: the failing call and the one retry");
});

test("WIRING: declining the recovery surface returns the ORIGINAL failure untouched, and the remedy tool is never called", async () => {
  const s = surface();
  let originalCallCount = 0;
  let remedyCallCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_decline", async () => {
      originalCallCount += 1;
      return { executed: false, status: 401, hint: "needs a value", remedyToolId: "fake_recoverable_decline_remedy" };
    }),
  );
  s.registry.register(
    fakeAllowedRegistration(
      "fake_recoverable_decline_remedy",
      async () => {
        remedyCallCount += 1;
        return { saved: true };
      },
      RECOVERY_REMEDY_SCHEMA,
    ),
  );

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (emission) => void emitted.push(emission);
  const pending = s.executeMetaTool(
    PRINCIPAL,
    RUN,
    call("execute_delegated_tool", { toolId: "fake_recoverable_decline", input: {} }),
    undefined,
    emitSurface,
  );
  await new Promise((resolve) => setImmediate(resolve));

  const exchangeId = exchangeIdFromSurface(emitted[0]);
  s.surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { __dismissed: true } });

  const result = await pending;
  assert.deepEqual(
    JSON.parse(result.content),
    { executed: false, status: 401, hint: "needs a value", remedyToolId: "fake_recoverable_decline_remedy" },
    "a decline must hand back the exact original diagnostic, verbatim",
  );
  assert.equal(originalCallCount, 1, "declining must never trigger a retry");
  assert.equal(remedyCallCount, 0, "declining must never call the remedy tool");
});

test("WIRING: a headless call (no emitSurface) with a diagnostic-carrying result returns it untouched instead of hanging", async () => {
  const s = surface();
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_headless", async () => ({ hint: "needs a value", remedyToolId: "fake_recoverable_headless_remedy" })),
  );

  // No emitSurface passed — the synthetic/headless caller shape this loop's own doc says must never guess.
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "fake_recoverable_headless", input: {} }));

  assert.deepEqual(JSON.parse(result.content), { hint: "needs a value", remedyToolId: "fake_recoverable_headless_remedy" });
  assert.equal(s.surfaceExchanges.size(), 0, "no exchange should be left open with no channel to answer through");
});

test("WIRING: the failed retry still returns a coherent, exact error to the model", async () => {
  const s = surface();
  let originalCallCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_retry_fails", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return { hint: "needs a value", remedyToolId: "fake_recoverable_retry_fails_remedy" };
      throw new Error("still broken after the fix");
    }),
  );
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_retry_fails_remedy", async () => ({ saved: true }), RECOVERY_REMEDY_SCHEMA),
  );

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (emission) => void emitted.push(emission);
  const pending = s.executeMetaTool(
    PRINCIPAL,
    RUN,
    call("execute_delegated_tool", { toolId: "fake_recoverable_retry_fails", input: {} }),
    undefined,
    emitSurface,
  );
  await new Promise((resolve) => setImmediate(resolve));

  const exchangeId = exchangeIdFromSurface(emitted[0]);
  s.surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { value: "fix-1" } });

  const result = await pending;
  assert.equal(result.isError, true);
  assert.equal(result.content, "still broken after the fix", "the retry's own failure message must reach the model verbatim, not be swallowed");
});

test("WIRING: recovery composes OUTSIDE audit — original, remedy, and retry are each their own audited attempt (2 rows apiece), none lost or duplicated", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { toolAttemptAudit: { sink, workspaceId: "ws-recovery-audit" } });
  let originalCallCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_audited", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return { hint: "needs a value", remedyToolId: "fake_recoverable_audited_remedy" };
      return { fixed: true };
    }),
  );
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_audited_remedy", async () => ({ saved: true }), RECOVERY_REMEDY_SCHEMA),
  );

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (emission) => void emitted.push(emission);
  const pending = s.executeMetaTool(
    PRINCIPAL,
    RUN,
    call("execute_delegated_tool", { toolId: "fake_recoverable_audited", input: {} }),
    undefined,
    emitSurface,
  );
  await new Promise((resolve) => setImmediate(resolve));

  const exchangeId = exchangeIdFromSurface(emitted[0]);
  s.surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { value: "fix-1" } });
  await pending;

  // 3 real `inner.execute` calls (original, remedy, retry) x 2 audit rows each (requested + final phase).
  assert.equal(sink.events.length, 6, "expected 6 audit rows: requested+completed for each of the original call, the remedy call, and the retry");
  const toolIdSequence = sink.events.map((e) => `${e.toolId}:${e.phase}`);
  assert.deepEqual(toolIdSequence, [
    "fake_recoverable_audited:requested",
    "fake_recoverable_audited:completed",
    "fake_recoverable_audited_remedy:requested",
    "fake_recoverable_audited_remedy:completed",
    "fake_recoverable_audited:requested",
    "fake_recoverable_audited:completed",
  ]);
});
