import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
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

import { SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createInMemoryToolAttemptAuditSink } from "../../features/tool-audit/repo.memory.js";
import { META_TOOL_DESCRIPTORS, createByokToolSurface, type ByokToolSurfaceDeps } from "../byok-tool-surface.js";
import type { ByokToolResultBlock } from "../byok-provider-turn.js";
import { TOOL_FAILURE_RECOVERY_TOOL_ID } from "../tool-recovery-preset.js";
import { constrainPrincipalToReadOnlyTools } from "../read-only-tool-constraint.js";
import { TOOL_ERROR_ID_PATTERN } from "../tool-recovery-preset.js";

import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { issueToolFailureDiagnostic } from "../../contracts/core/tool-failure-diagnostics.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { saveExternalMcpServer } from "../external-mcp-store.js";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

// `surface()` below calls `createByokToolSurface` directly (not through `createAssistantByokModule`,
// which installs first-party contributors itself) — so this file must, or the `comments`/
// `newsletter` tools would be silently absent from the catalog it searches. See
// `tool-contribution-registry.ts`'s header. (`post`, this file's own "search 'post'" test's subject,
// is unaffected either way — it stayed on the static `DOMAIN_SLICES` seam; see
// `features/post/tool-registrations.ts`'s trailing comment for why.)
contributions.contributors.clear({});
installFirstPartyToolContributors({ contributions });

const PRINCIPAL = { id: "principal-meta-tool" };
const RUN = { id: "run-meta-tool" };

/** Wide enough to BUILD every domain's registrations; no handler is invoked by these tests. Mirrors
 *  `tool-registrations.contracts.test.ts`'s own `fakeRouteDeps`. Typed `ByokToolSurfaceDeps` (not
 *  `RouteDeps`) because that is what `createByokToolSurface` actually declares it needs as of the
 *  double-cast removal — see that function's own doc. */
function fakeRouteDeps(): ByokToolSurfaceDeps {
  const deps = {
    workspaceId: "ws-meta-tool",
    clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => "2026-08-05T00:00:00.000Z" },
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
    // Catalog construction binds the SEO host port; these cases never execute SEO.
    seoDeps: { dispatch: async () => { throw new Error("SEO is outside this fixture"); } },
  };
  return deps as unknown as ByokToolSurfaceDeps;
}

// `installExtensions: false` — `fakeRouteDeps()` above is a bare `AssistantToolRegistryDeps` unit-test
// double with no `discoverPlugins`/`postRepo`/`pluginActivationRepo`; the installed-extension-tools
// pass is fail-open regardless (`installed-extension-tools.ts`), so omitting this would still pass
// every test here, just with a swallowed `console.warn` and a real (empty) disk read on every call.
function surface() {
  return createByokToolSurface(fakeRouteDeps(), { ...( { installExtensions: false }), contributions });
}

function call(name: string, input: unknown) {
  return { name, input };
}

/** Every meta-tool result these tests read is plain text; image blocks only come from a tool's own
 *  image output (`byok-image-tool-results.test.ts`), so a block array here is itself a failure. */
function textOf(result: { readonly content: string | readonly ByokToolResultBlock[] }): string {
  if (typeof result.content !== "string") assert.fail(`expected a text tool result, got ${JSON.stringify(result.content)}`);
  return result.content;
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
  const { hits } = JSON.parse(textOf(result)) as { hits: ReadonlyArray<{ id: string }> };
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
  const { hits } = JSON.parse(textOf(tooMany)) as { hits: readonly unknown[] };
  assert.ok(hits.length <= 25, `expected the limit clamped to 25, got ${hits.length} hits`);

  const tooFew = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "post", limit: 0 }));
  const parsed = JSON.parse(textOf(tooFew)) as { hits: readonly unknown[] };
  assert.equal(parsed.hits.length, 1, "expected a 0 limit clamped up to 1, not treated as 'no results'");
});

// Retrieval percentages depend on the current catalog/keywords and belong in measured eval reports.
// Prompt text should describe what to do on a miss. Pin the essential retry guidance instead of
// an entire paragraph, so wording changes do not obscure the contract being tested.
test("search_tools' limit description tells the model a miss at the default cutoff is weak evidence, not proof no tool exists, and to retry before giving up", () => {
  const searchTools = META_TOOL_DESCRIPTORS.find((tool) => tool.id === "search_tools");
  assert.ok(searchTools, "expected a search_tools descriptor in META_TOOL_DESCRIPTORS");
  const schema = searchTools!.inputSchema as { properties: { limit: { description: string } } };
  const description = schema.properties.limit.description;
  assert.match(description, /search again with a HIGHER limit/);
  assert.match(description, /different phrasing/);
  assert.match(description, /weak evidence, not proof/);
  assert.match(description, /say you could not find a matching tool rather than assuming none exists/);
});

test("search_tools' limit description names no coverage percentage — a hardcoded number here is the exact shape of the defect this fixes, regardless of whether the number happens to be true today", () => {
  const searchTools = META_TOOL_DESCRIPTORS.find((tool) => tool.id === "search_tools");
  const schema = searchTools!.inputSchema as { properties: { limit: { description: string } } };
  assert.doesNotMatch(schema.properties.limit.description, /\d+%/);
});

test("search_tools with a missing or empty query is a readable error, not an empty result set", async () => {
  const s = surface();
  for (const input of [{}, { query: "" }, { query: "   " }, { query: 42 }, null]) {
    const result = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", input));
    assert.equal(result.isError, true, `expected an error for input ${JSON.stringify(input)}`);
    assert.match(textOf(result), /'query' is required/);
  }
});

test("a query that matches nothing reports that it matched nothing, rather than looking like a broken tool", async () => {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "zzzzqqqwwwnothingmatchesthis" }));
  assert.notEqual(result.isError, true);
  const parsed = JSON.parse(textOf(result)) as { hits: readonly unknown[]; note?: string };
  assert.equal(parsed.hits.length, 0);
  assert.match(String(parsed.note), /No tool matched/);
});

// 2026-10-08: only the Claude Code CLI had its own WebFetch; BYOK reaches `web_fetch_page` through these
// three meta-tools. The execute leg uses a loopback IP literal, so the PRODUCTION guarded client the
// manifest wires refuses it with no DNS lookup and no socket.
test("BYOK can find, describe and run web_fetch_page, and the wired client refuses a private address", async () => {
  const s = surface();
  const found = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "fetch a web page" }));
  const { hits } = JSON.parse(textOf(found)) as { hits: ReadonlyArray<{ id: string }> };
  assert.ok(hits.some(hit => hit.id === "web_fetch_page"), `expected web_fetch_page; got ${hits.map(hit => hit.id).join(", ")}`);
  const described = await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "web_fetch_page" }));
  assert.deepEqual(JSON.parse(textOf(described)).inputSchema, s.registry.list({}).find(tool => tool.id === "web_fetch_page")?.inputSchema);
  const refused = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "web_fetch_page", input: { url: "http://127.0.0.1/admin" } }));
  assert.equal(refused.isError, true);
  assert.match(textOf(refused), /web_fetch_page: egress to '127\.0\.0\.1' rejected: resolved address is loopback\. Only public internet pages can be fetched\./);
});

test("describe_tool returns a real tool's input schema, and refuses an unknown id with a next step", async () => {
  const s = surface();
  const found = await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "content_read.workspace" }));
  assert.notEqual(found.isError, true);
  assert.match(textOf(found), /content_read\.workspace/);
  const registered = s.registry.list({}).find((tool) => tool.id === "content_read.workspace");
  assert.ok(registered?.inputSchema);
  assert.deepEqual(JSON.parse(textOf(found)).inputSchema, registered.inputSchema);

  const missing = await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "content_read.workspace_but_invented" }));
  assert.equal(missing.isError, true);
  assert.match(textOf(missing), /No tool with id/);
  assert.match(textOf(missing), /search_tools/, "an error the model can act on should name the tool that fixes it");
});

test("execute_delegated_tool with a HALLUCINATED tool id returns a recoverable error — it does not throw and kill the turn", async () => {
  const s = surface();
  // `ToolExecutor.execute` throws `unknown tool "..."` here. Unhandled, that propagates out of
  // `executeTool`, out of the provider adapter's loop, and aborts the SSE stream mid-turn.
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "definitely_not_a_real_tool", input: {} }));
  assert.equal(result.isError, true);
  assert.match(textOf(result), /unknown tool/i);
  assert.match(textOf(result), /search_tools/);
});

test("execute_delegated_tool requires a toolId, and says so", async () => {
  const s = surface();
  for (const input of [{}, { toolId: "" }, { toolId: 7 }]) {
    const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", input));
    assert.equal(result.isError, true);
    assert.match(textOf(result), /'toolId' is required/);
  }
});

test("execute_delegated_tool accepts a JSON-ENCODED input string — the observed provider behavior that would otherwise make every input-taking tool uncallable", async () => {
  const s = surface();
  let received: unknown;
  s.registry.register(fakeAllowedRegistration("probe_encoded_input", async (ctx) => {
    received = ctx.input;
    return { received: ctx.input };
  }));
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "probe_encoded_input", input: '{"unused":true}' }));
  assert.doesNotMatch(textOf(result), /must be a JSON object/, "a JSON-encoded object string must be parsed, not refused");
  assert.notEqual(result.isError, true);
  assert.deepEqual(received, { unused: true });
  assert.deepEqual(JSON.parse(textOf(result)), { received: { unused: true } });
});

test("execute_delegated_tool refuses an input that is neither an object nor JSON-parseable, naming what is wrong", async () => {
  const s = surface();
  const plain = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "content_read.workspace", input: "just some prose" }));
  assert.equal(plain.isError, true);
  assert.match(textOf(plain), /must be a JSON object/);

  const array = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "content_read.workspace", input: [1, 2] }));
  assert.equal(array.isError, true);
  assert.match(textOf(array), /an array/);
});

test("execute_delegated_tool treats an empty-string input the same as omitted — no input, not a parse error", async () => {
  const s = surface();
  const received: unknown[] = [];
  s.registry.register(fakeAllowedRegistration("probe_empty_input", async (ctx) => {
    received.push(ctx.input);
    return { noInput: ctx.input === undefined };
  }));
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "probe_empty_input", input: "" }));
  assert.doesNotMatch(textOf(result), /must be a JSON object/, "an empty string must resolve to 'no input', not be refused as unparseable");
  const omitted = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "probe_empty_input" }));
  assert.notEqual(result.isError, true);
  assert.notEqual(omitted.isError, true);
  assert.deepEqual(received, [undefined, undefined]);
  assert.deepEqual(result, omitted);
  assert.deepEqual(JSON.parse(textOf(result)), { noInput: true });
});

test("execute_delegated_tool refuses a non-object, non-array, non-string input (e.g. a bare number), naming the actual type", async () => {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "content_read.workspace", input: 42 }));
  assert.equal(result.isError, true);
  assert.match(textOf(result), /not number\./);
});

// Every Tovu tool registration's OWN handler is the sole authorization evaluator — the
// ToolRegistration's `ToolPolicy` (what `ToolExecutor`'s own internal `authorize()` step consults)
// is always a pass-through 'allow' (see mcp-federation.registrations.test.ts's identical finding
// for federated tools; the same is true of every first-party domain's registrations). So a denied
// `deps.authorize()` never produces `ToolExecutor`'s own `status: 'denied'` here — the handler
// throws `ForbiddenError` itself, mid-execution, which `ToolExecutor` catches the same way it
// catches any other handler exception: `status: 'failed'`, carrying the thrown message verbatim.
// This closes `mapToolExecutionResult`'s `case "failed"` for real — it does
// NOT and cannot close `case "denied"` through this call path; see this file's own test-certification
// notes / the coverage report for that one.
test("execute_delegated_tool maps a real tool's own thrown ForbiddenError (from ITS internal authorize check, not ToolPolicy) to a readable 'failed' error, not an uncaught throw", async () => {
  const deniedDeps = { ...fakeRouteDeps(), authorize: async () => ({ allowed: false, reason: "no grant" }) };
  const s = createByokToolSurface(deniedDeps, { ...( { installExtensions: false }), contributions });
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "content_read.workspace", input: {} }));
  assert.equal(result.isError, true);
  assert.match(textOf(result), /not authorized/);
});

test("execute_delegated_tool maps an already-aborted signal to a readable 'cancelled' error", async () => {
  const controller = new AbortController();
  controller.abort();
  const s = surface();
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "content_read.workspace", input: {} }), controller.signal);
  assert.equal(result.isError, true);
  assert.match(textOf(result), /was cancelled/);
});

test("a model that calls a REAL tool id as the tool NAME is told how to reach it, not just that it failed", async () => {
  // The most likely model mistake by far: it saw `content_read.workspace` in a search hit and called it
  // directly, because the meta-set is the only thing it was actually offered.
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, call("content_read.workspace", {}));
  assert.equal(result.isError, true);
  assert.match(textOf(result), /execute_delegated_tool with toolId: "content_read\.workspace"/);
});

// ---------------------------------------------------------------------------
// READ-ONLY PARITY (2026-09-06): `read-only-tool-constraint.composition.test.ts` proves the daemon's
// `createAssistantToolExecutor` stack refuses a read-only-constrained principal's write dispatch —
// but that stack is composed ONCE, in `tool-executor-stack.ts`, and this file's own `surface()` used
// to hand-assemble a SECOND, independent composition that never wrapped `withReadOnlyToolConstraint`
// at all. Nothing sets the wire-level `requireReadOnly` flag for BYOK today (see
// `assistant-byok.ts`'s `resolveTurnInputsOrRespond`, which always builds a plain, unconstrained
// `{id: authed.id}` principal) — so this was not a live exploit, but the very gap the daemon's own
// `1bb6fa67` fix was written to close as a CLASS, not an instance, of defect. The two tests below
// assert the missing half of that parity directly against `executeMetaTool`, the real BYOK dispatch
// path, using a locally-registered fake tool rather than a real domain's classification so the
// assertion does not depend on any other domain's own risk wiring.
// ---------------------------------------------------------------------------

test("READ-ONLY PARITY: a read-only-constrained principal cannot dispatch a write tool via execute_delegated_tool — the handler must never run", async () => {
  const s = surface();
  let writeCalls = 0;
  s.registry.register({
    descriptor: { id: "fake_write_tool_readonly_probe", readOnly: false, inputSchema: { type: "object" } },
    policy: { authorize: () => "allow" },
    handler: async () => {
      writeCalls += 1;
      return { wrote: true };
    },
  });

  const readOnlyPrincipal = constrainPrincipalToReadOnlyTools(PRINCIPAL);
  const result = await s.executeMetaTool(readOnlyPrincipal, RUN, call("execute_delegated_tool", { toolId: "fake_write_tool_readonly_probe", input: {} }));

  // `mapToolExecutionResult`'s `case "denied"` collapses every denial reason (ToolPolicy or this
  // gate) into one generic client-facing string rather than echoing `ToolExecutionResult.error` — a
  // pre-existing, deliberate choice unrelated to this fix, so this asserts the status this dispatch
  // maps to `isError` from (`denied`), not the daemon path's own literal refusal text.
  assert.equal(result.isError, true, "BYOK's dispatch must refuse a write tool for a read-only-constrained principal, same as the daemon stack");
  assert.match(textOf(result), /was denied for this caller/);
  assert.equal(writeCalls, 0, "the gate must refuse BEFORE the handler runs, not merely report failure after a real write");
});

test("READ-ONLY PARITY: the identical dispatch from an UNCONSTRAINED principal is unaffected — byte-identical to before this gate existed", async () => {
  const s = surface();
  let writeCalls = 0;
  s.registry.register({
    descriptor: { id: "fake_write_tool_unconstrained_probe", readOnly: false, inputSchema: { type: "object" } },
    policy: { authorize: () => "allow" },
    handler: async () => {
      writeCalls += 1;
      return { wrote: true };
    },
  });

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "fake_write_tool_unconstrained_probe", input: {} }));

  assert.notEqual(result.isError, true, "an ordinary, unconstrained BYOK call must be completely untouched by the new gate");
  assert.equal(writeCalls, 1);
});

/**
 * INCIDENT FIX (2026-09-01): `search_tools`/`describe_tool` never reached `ToolExecutor`, so
 * `withToolAttemptAudit` never recorded them — an agent's `search_tools` miss on
 * `custom_credential_verify` left no query, limit, or hit-id trail to diagnose after the fact. Unlike
 * the Local CLI path (`tool-catalog-audit.test.ts`'s `withToolCatalogAudit`, which has no real
 * per-call identity to record), `executeMetaTool` already has the real `principal`/`run` for every
 * call — these tests assert that real identity, not a placeholder, lands in the row.
 */
test("INCIDENT FIX: a search_tools call through executeMetaTool is recorded with the caller's real principal/run and the query length, limit, and ranked hit ids — never the raw query text", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { ...( { toolAttemptAudit: { sink, workspaceId: "ws-meta-tool" }, installExtensions: false }), contributions });

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "workspace", limit: 5 }));
  const { hits } = JSON.parse(textOf(result)) as { hits: ReadonlyArray<{ id: string }> };

  assert.equal(sink.events.length, 1);
  const [event] = sink.events;
  assert.equal(event.toolId, "search_tools");
  assert.equal(event.workspaceId, "ws-meta-tool");
  assert.equal(event.runId, RUN.id);
  assert.equal(event.principalId, PRINCIPAL.id);
  // `query` itself must never land in the durable detail (`tool-catalog-audit.ts`'s
  // `searchToolsAuditDetail` redaction, 80145322) — `queryLength` is its value-free stand-in.
  // `deepEqual` against this exact key set fails if a raw `query` field is ever reintroduced
  // alongside `queryLength`, so no separate substring check is needed (and one would be unsound
  // here anyway: several ranked hit ids, e.g. "content_read.workspace", legitimately contain "workspace").
  assert.deepEqual(JSON.parse(String(event.detail)), { queryLength: "workspace".length, limit: 5, resultIds: hits.map((h) => h.id), resultCount: hits.length });
});

test("a describe_tool call through executeMetaTool is recorded with the requested id and whether it resolved", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { ...( { toolAttemptAudit: { sink, workspaceId: "ws-meta-tool" }, installExtensions: false }), contributions });

  await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "content_read.workspace" }));
  await s.executeMetaTool(PRINCIPAL, RUN, call("describe_tool", { id: "content_read.workspace_but_invented" }));

  assert.equal(sink.events.length, 2);
  assert.deepEqual(JSON.parse(String(sink.events[0].detail)), { id: "content_read.workspace", found: true });
  assert.deepEqual(JSON.parse(String(sink.events[1].detail)), { id: "content_read.workspace_but_invented", found: false });
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
  const s = createByokToolSurface(fakeRouteDeps(), { ...( { toolAttemptAudit: { sink, workspaceId: "ws-meta-tool" }, installExtensions: false }), contributions });

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

test("ordinary successful and throwing delegated handlers record their complete audit trail", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { ...( { toolAttemptAudit: { sink, workspaceId: "ws-meta-tool" }, installExtensions: false }), contributions });
  s.registry.register(fakeAllowedRegistration("probe_audit_success", async () => ({ saved: true })));
  s.registry.register(fakeAllowedRegistration("probe_audit_failure", async () => { throw new Error("probe failure"); }));
  const success = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "probe_audit_success", input: {} }));
  const failure = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "probe_audit_failure", input: {} }));
  assert.notEqual(success.isError, true);
  assert.deepEqual(JSON.parse(textOf(success)), { saved: true });
  assert.equal(failure.isError, true);
  assert.deepEqual(sink.events.map(({ toolId, phase, workspaceId, principalId, runId }) => ({ toolId, phase, workspaceId, principalId, runId })),
    [
      ["probe_audit_success", "requested"], ["probe_audit_success", "completed"],
      ["probe_audit_failure", "requested"], ["probe_audit_failure", "failed"],
    ].map(([toolId, phase]) => ({ toolId, phase, workspaceId: "ws-meta-tool", principalId: PRINCIPAL.id, runId: RUN.id })),
  );
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
//
// NOT covered here, deliberately: `search_tools`/`describe_tool`. Both bypass `executor` entirely —
// `runSearchTools`/`runDescribeTool` (this file's own dispatch) call `appendToolCatalogAttempt`
// directly and never reach `ToolExecutor.execute` — so `withToolFailureRecovery` structurally cannot
// apply to either. That is expected, not a gap: neither tool's output is a handler result a real
// domain tool could carry a `{hint, remedyToolId}` diagnostic on. Only `execute_delegated_tool`,
// which resolves to a real registered tool's real handler output, can ever trigger this loop.
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

test("WIRING: a diagnostic-carrying execute_delegated_tool result goes through ask -> apply -> retry with NO toolAttemptAudit sink present — the un-audited composition path also works, not just the audited one", async () => {
  const s = surface(); // bare — no toolAttemptAudit — proving recovery does not depend on that option
  let originalCallCount = 0;
  let remedyInputSeen: unknown;

  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_original", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return issueToolFailureDiagnostic({ diagnostic: { executed: false, hint: "needs a value", remedyToolId: "fake_recoverable_remedy" } }, {});
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

  const delivered = s.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL.id, params: { value: "the-fix" } }, { toolId: TOOL_FAILURE_RECOVERY_TOOL_ID });
  assert.deepEqual(delivered, { ok: true }, "the recovery exchange must be reachable off the SAME surfaceExchanges store this surface exposes");

  const result = await pending;
  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(textOf(result)), { fixed: true }, "the final result must be the RETRY's own output, not the original diagnostic");
  assert.equal(originalCallCount, 2, "the original tool must run exactly twice: the failing call, then the retry — never more");
  assert.deepEqual(remedyInputSeen, { value: "the-fix" }, "the human's answer must reach the remedy tool's own input");
  assert.equal(s.surfaceExchanges.size(), 0, "the exchange must be closed once resolved — with no sink involved, nothing here depends on toolAttemptAudit at all");
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

  assert.deepEqual(JSON.parse(textOf(result)), { fixed: true });
  assert.equal(callCount, 1, "a call that never carries a diagnostic must run exactly once");
  assert.equal(emitted.length, 0, "no recovery surface should ever be raised for a hint-free result");
  assert.equal(s.surfaceExchanges.size(), 0, "the happy path must never open a recovery exchange at all — not just resolve one quickly");
});

test("WIRING: no second recovery cycle — a retry whose OWN result also carries a fresh hint+remedyToolId is returned as-is, not looped on again", async () => {
  const s = surface();
  let originalCallCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_original_double", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return issueToolFailureDiagnostic({ diagnostic: { hint: "first problem", remedyToolId: "fake_recoverable_remedy_double" } }, {});
      // The retry's own output ALSO looks diagnostic-shaped — this must not trigger a second ask.
      return issueToolFailureDiagnostic({ diagnostic: { hint: "second problem", remedyToolId: "fake_recoverable_remedy_double" } }, {});
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
  s.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL.id, params: { value: "fix-1" } }, { toolId: TOOL_FAILURE_RECOVERY_TOOL_ID });

  const result = await pending;
  assert.deepEqual(
    JSON.parse(textOf(result)),
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
      return issueToolFailureDiagnostic({ diagnostic: { executed: false, status: 401, hint: "needs a value", remedyToolId: "fake_recoverable_decline_remedy" } }, {});
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
  s.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL.id, params: { __dismissed: true } }, { toolId: TOOL_FAILURE_RECOVERY_TOOL_ID });

  const result = await pending;
  assert.deepEqual(
    JSON.parse(textOf(result)),
    { executed: false, status: 401, hint: "needs a value", remedyToolId: "fake_recoverable_decline_remedy" },
    "a decline must hand back the exact original diagnostic, verbatim",
  );
  assert.equal(originalCallCount, 1, "declining must never trigger a retry");
  assert.equal(remedyCallCount, 0, "declining must never call the remedy tool");
});

test("WIRING: a headless call (no emitSurface) with a diagnostic-carrying result returns it untouched instead of hanging", async () => {
  const s = surface();
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_headless", async () => issueToolFailureDiagnostic({ diagnostic: { hint: "needs a value", remedyToolId: "fake_recoverable_headless_remedy" } }, {})),
  );

  // No emitSurface passed — the synthetic/headless caller shape this loop's own doc says must never guess.
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "fake_recoverable_headless", input: {} }));

  assert.deepEqual(JSON.parse(textOf(result)), { hint: "needs a value", remedyToolId: "fake_recoverable_headless_remedy" });
  assert.equal(s.surfaceExchanges.size(), 0, "no exchange should be left open with no channel to answer through");
});

test("WIRING: the failed retry still returns a coherent, exact error to the model — and does NOT recursively re-enter recovery", async () => {
  const s = surface();
  let originalCallCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_retry_fails", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return issueToolFailureDiagnostic({ diagnostic: { hint: "needs a value", remedyToolId: "fake_recoverable_retry_fails_remedy" } }, {});
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
  s.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL.id, params: { value: "fix-1" } }, { toolId: TOOL_FAILURE_RECOVERY_TOOL_ID });

  const result = await pending;
  assert.equal(result.isError, true);
  // 2026-09-16: an internal failure now carries a redacted-message ID prefix (`tool-failure-redaction.ts`,
  // owner decision "hide secrets only") — the retry's own message still reaches the model verbatim
  // AFTER that prefix, it is just no longer the exact first characters of `content`.
  assert.ok(textOf(result).startsWith("Error ERR-"), `expected an ID prefix, got: ${textOf(result)}`);
  assert.ok(
    textOf(result).endsWith(": still broken after the fix"),
    "the retry's own failure message must reach the model verbatim (after the ID prefix), not be swallowed",
  );
  assert.match(textOf(result), TOOL_ERROR_ID_PATTERN, "an internal failure must carry a copyable error ID");
  // The single most important assertion in this file: a retry that ITSELF fails must never trigger a
  // second ask -> apply -> retry cycle. Proven structurally by call/surface counts, not just by the
  // final content — a recursive re-entry here would show up as a 3rd `originalCallCount` or a 2nd
  // emitted surface even though the model-facing error text above would look identical either way.
  assert.equal(originalCallCount, 2, "the original tool must run at most twice — the failing call and the ONE retry — never a third time");
  assert.equal(emitted.length, 1, "no second recovery surface may ever be raised, even though the retry itself failed");
  assert.equal(s.surfaceExchanges.size(), 0, "no exchange may be left open after the retry settles, successfully or not");
});

test("WIRING: recovery composes OUTSIDE audit — original, remedy, and retry are each their own audited attempt (2 rows apiece), none lost or duplicated", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const s = createByokToolSurface(fakeRouteDeps(), { ...( { toolAttemptAudit: { sink, workspaceId: "ws-recovery-audit" }, installExtensions: false }), contributions });
  let originalCallCount = 0;
  s.registry.register(
    fakeAllowedRegistration("fake_recoverable_audited", async () => {
      originalCallCount += 1;
      if (originalCallCount === 1) return issueToolFailureDiagnostic({ diagnostic: { hint: "needs a value", remedyToolId: "fake_recoverable_audited_remedy" } }, {});
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
  s.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL.id, params: { value: "fix-1" } }, { toolId: TOOL_FAILURE_RECOVERY_TOOL_ID });
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

/**
 * @file S4 (BYOK federation surface) — `design-byok-external-mcp-2026-09-24.md` §2.1 item 5. Unlike
 * every test above, these three build a REAL `InMemoryExternalMcpServerRepo` row through
 * `saveExternalMcpServer` (mirrors `external-mcp-store.test.ts`'s own `makeDeps()`), because the
 * property under test is that `createByokToolSurface` reads the STORED roster through
 * `external-mcp-connection-source.ts`, not that a fed-in fake list round-trips.
 * `federationConnect` (this surface's own test seam, threaded to
 * `CreateFederationRuntimeParams.connect`) is what stands in for the real transport — the row's
 * `command`/`args` are never actually spawned.
 */
const FEDERATION_WORKSPACE = "ws-federation-surface";

/** One enabled `stdio` row allowlisting exactly `echo`, saved through the real store so admission
 *  goes through the real `readEnabledExternalMcpConfigs` -> `toResolvedFederatedConnections` path,
 *  not a hand-built `ResolvedFederatedConnection`. */
async function saveEchoServerRow(repo: InMemoryExternalMcpServerRepo, sealer: AesGcmSecretSealer, keyring: InMemoryKeyring, allowedToolNames = "echo"): Promise<void> {
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock: createFakeClock({ startIso: "2026-09-24T00:00:00.000Z" }) },
    {
      workspaceId: FEDERATION_WORKSPACE,
      serverId: "echo-server",
      label: "Echo",
      transport: "stdio",
      enabled: true,
      command: "npx",
      args: "-y echo-mcp-server",
      allowedToolNames,
      writeAllowedToolNames: "",
      principalId: "principal-federation-surface",
      env: "",
    },
  );
}

/** `fakeRouteDeps()` widened with the ONE real repo/sealer pair federation reads from — every other
 *  field stays the bare double `fakeRouteDeps()` already provides, which is enough because
 *  `attachAssistantToolExtensions`'s installed-extension half is fail-open regardless (see that
 *  function's own doc) and nothing here calls a real tool handler through it. */
function federationRouteDeps(repo: InMemoryExternalMcpServerRepo, sealer: AesGcmSecretSealer): ByokToolSurfaceDeps {
  return {
    ...fakeRouteDeps(),
    workspaceId: FEDERATION_WORKSPACE,
    externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer,
  } as unknown as ByokToolSurfaceDeps;
}

test("BYOK federation: awaitFederation boots the real stored roster and resolves {settled: true}", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveEchoServerRow(repo, sealer, keyring);

  const s = createByokToolSurface(federationRouteDeps(repo, sealer), { ...( {
    federationConnect: async () => new InMemoryMcpSession({ tools: [{ name: "echo", description: "echo text", inputSchema: { type: "object" } }] }),
  }), contributions });

  assert.deepEqual(await s.awaitFederation(1000), { settled: true });
});

test("BYOK federation: after awaitFederation settles, search_tools finds the newly federated tool", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveEchoServerRow(repo, sealer, keyring);

  const s = createByokToolSurface(federationRouteDeps(repo, sealer), { ...( {
    federationConnect: async () => new InMemoryMcpSession({ tools: [{ name: "echo", description: "echo text", inputSchema: { type: "object" } }] }),
  }), contributions });
  await s.awaitFederation(1000);

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("search_tools", { query: "echo" }));
  const { hits } = JSON.parse(textOf(result)) as { hits: ReadonlyArray<{ id: string }> };

  assert.ok(
    hits.some((hit) => hit.id === "mcp__echo-server__echo"),
    `expected a federated hit for the echo tool; got: ${JSON.stringify(hits)}`,
  );
});

test("BYOK federation: settled admitted tools execute with remote names and arguments, while unlisted tools stay refused", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveEchoServerRow(repo, sealer, keyring, "echo, write_ungranted");
  const remoteResult = { content: [{ type: "text", text: "remote echo result" }] };
  const session = new InMemoryMcpSession({
    tools: [
      { name: "echo", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
      { name: "write_ungranted", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } },
      { name: "unlisted", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
    ] }, {
    onCall: () => remoteResult });
  const s = createByokToolSurface(federationRouteDeps(repo, sealer), { ...( { federationConnect: async () => session }), contributions });
  assert.deepEqual(await s.awaitFederation(1000), { settled: true });
  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "mcp__echo-server__echo", input: { text: "hello" } }));
  assert.notEqual(result.isError, true);
  assert.deepEqual(session.calls, [{ name: "echo", arguments: { text: "hello" } }]);
  const parsed = JSON.parse(textOf(result));
  assert.deepEqual(parsed.federated, { connectionId: "echo-server", tool: "echo", remoteReportedError: false });
  assert.match(parsed.untrusted, /remote echo result/);
  const payload = parsed.untrusted.match(/<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data-/)?.[1];
  assert.ok(payload);
  assert.deepEqual(JSON.parse(payload), remoteResult);
  const refused = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "mcp__echo-server__unlisted", input: {} }));
  assert.equal(refused.isError, true);
  assert.equal(session.calls.length, 1);
  // Owner commit 6eac86229 (2026-10-01, trust.ts R3 "confirm only protected actions"): an allowlisted
  // ordinary write runs with no card, and writeAllowedToolNames is reported, not a gate. The same
  // config (readOnlyHint:false, empty write list) runs in mcp-federation/__tests__/
  // confirmation-policy.unit.test.ts "n06: create_project ordinary call needs no card". Admission
  // (the unlisted refusal above) and authorize() still decide whether it may run at all.
  const write = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "mcp__echo-server__write_ungranted", input: {} }));
  assert.notEqual(write.isError, true);
  assert.deepEqual(session.calls, [{ name: "echo", arguments: { text: "hello" } }, { name: "write_ungranted", arguments: {} }]);
});

// `settled: true`, not `false`: with no federation there is nothing still connecting, and
// `assistant-byok.ts` appends FEDERATION_STILL_CONNECTING_NOTE to the system prompt on `false` —
// a no-federation surface must not tell the model that tools are on their way.
test("BYOK federation: installExtensions: false leaves federation undefined and awaitFederation settled at once", async () => {
  const s = createByokToolSurface(fakeRouteDeps(), { ...( { installExtensions: false }), contributions });

  assert.equal(s.federation, undefined);
  assert.deepEqual(await s.awaitFederation(1000), { settled: true });
});

/**
 * @file Regression tests for commit 3e87d71c5 ("still connecting" vs "unknown tool") — see
 * `ADS-memory/.local-artifacts/handoffs/2026-09-24-mcp-connect-ux.md`'s "NOT DONE — regression
 * tests" section, which names this exact scenario as the natural test: a `federationConnect` that
 * has not yet resolved when `execute_delegated_tool` names a still-registering federated id, and one
 * that has rejected by the time the boot pass settles.
 */

test("BYOK federation: execute_delegated_tool for a still-registering federated id gets 'still connecting', not a bare 'unknown tool' throw", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveEchoServerRow(repo, sealer, keyring);

  // Never resolves during this test — stands in for npx startup (6-13s) outlasting
  // `assistant-byok.ts`'s own bounded `FEDERATION_TURN_WAIT_MS` (here, `awaitFederation`'s 10ms).
  let releaseConnect!: (session: InMemoryMcpSession) => void;
  const connectGate = new Promise<InMemoryMcpSession>((resolve) => {
    releaseConnect = resolve;
  });

  const s = createByokToolSurface(federationRouteDeps(repo, sealer), { ...( {
    federationConnect: async () => connectGate,
  }), contributions });

  assert.deepEqual(await s.awaitFederation(10), { settled: false }, "the boot pass must still be mid-connect for this test to exercise the right branch");
  assert.equal(s.federation?.started, false);

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "mcp__echo-server__echo", input: {} }));

  assert.equal(result.isError, true);
  assert.equal(result.content, "External MCP server 'echo-server' is still connecting — try again in a moment.");
  // The exact throw text this test exists to stop the model from seeing in its place.
  assert.doesNotMatch(result.content, /unknown tool/i);

  // Let the background boot pass finish so it does not leave a dangling connect promise once this
  // test returns.
  releaseConnect(new InMemoryMcpSession({ tools: [{ name: "echo", description: "echo text", inputSchema: { type: "object" } }] }));
  await s.federation?.start();
});

test("BYOK federation: execute_delegated_tool for a server that was never in the roster gets 'unknown tool', even while the boot pass is still mid-connect for a DIFFERENT server", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveEchoServerRow(repo, sealer, keyring);

  // Never resolves during this test, same as the "still-registering" test above — echo-server is
  // mid-connect throughout, but the call below names a DIFFERENT, never-configured connectionId.
  let releaseConnect!: (session: InMemoryMcpSession) => void;
  const connectGate = new Promise<InMemoryMcpSession>((resolve) => {
    releaseConnect = resolve;
  });

  const s = createByokToolSurface(federationRouteDeps(repo, sealer), { ...( {
    federationConnect: async () => connectGate,
  }), contributions });

  assert.deepEqual(await s.awaitFederation(10), { settled: false }, "the boot pass must still be mid-connect for this test to exercise the right branch");

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "mcp__ghost-server__whatever", input: {} }));

  assert.equal(result.isError, true);
  assert.doesNotMatch(textOf(result), /still connecting/i, "a server that was never in the roster must not be told to wait");
  assert.match(textOf(result), /unknown tool/i);

  releaseConnect(new InMemoryMcpSession({ tools: [{ name: "echo", description: "echo text", inputSchema: { type: "object" } }] }));
  await s.federation?.start();
});

test("BYOK federation: execute_delegated_tool for a connection that failed to connect gets that failure's own reason, once the boot pass has settled", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveEchoServerRow(repo, sealer, keyring);

  const s = createByokToolSurface(federationRouteDeps(repo, sealer), { ...( {
    federationConnect: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  }), contributions });

  assert.deepEqual(await s.awaitFederation(1000), { settled: true });
  assert.equal(s.federation?.started, true);
  assert.deepEqual(s.federation?.connectFailures(), [{ connectionId: "echo-server", reason: "connect ECONNREFUSED" }]);

  const result = await s.executeMetaTool(PRINCIPAL, RUN, call("execute_delegated_tool", { toolId: "mcp__echo-server__echo", input: {} }));

  assert.equal(result.isError, true);
  assert.equal(result.content, "External MCP server 'echo-server' failed to connect: connect ECONNREFUSED");
});
