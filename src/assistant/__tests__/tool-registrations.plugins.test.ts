import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryChangeSetRepo } from "../../contracts/core/commands/index.js";
import type { PluginDiscoveryRecord } from "../../features/plugin-runtime/discovery.js";
import { pluginAgentToolCatalog, type AgentToolDefinition as PluginsAgentToolDefinition } from "../../features/plugin-runtime/agent-tools.js";
import { InMemoryPluginActivationRepo } from "../../features/plugin-runtime/repo.memory.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributePluginsTools } from "../../features/plugin-runtime/tool-registrations.js";

// Plugins moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots now do via
// `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
contributePluginsTools();

/**
 * @file The Plugins (SPEC-005, ADR-005-ARCH) tool-wiring test file — the sibling of
 * `tool-registrations.database-recovery.test.ts`, covering the same union of concerns
 * `tool-registrations.forms.test.ts` already established combining into one file: published
 * contracts, the risk cross-check, the model-facing output projection, the full ADR-021
 * authorization half, and a multi-tool workflow test.
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

const VALID_PLUGIN: PluginDiscoveryRecord = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  source: "built-in",
  tier: "tier-3",
  status: "valid",
  errors: [],
};

const INVALID_PLUGIN: PluginDiscoveryRecord = {
  id: "broken-plugin",
  name: "Broken",
  version: "0.1.0",
  source: "site",
  tier: "tier-3",
  status: "invalid",
  errors: [{ code: "MANIFEST_MALFORMED", file: null, message: "manifest did not parse" }],
};

function fakeRouteDeps(options: { allow?: boolean; discovery?: PluginDiscoveryRecord[] } = {}) {
  const allow = options.allow ?? true;
  const discovery = options.discovery ?? [VALID_PLUGIN, INVALID_PLUGIN];
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const order: string[] = [];

  let counter = 0;
  const pluginActivationRepo = new InMemoryPluginActivationRepo();

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: {
      enqueue: async () => {
        order.push("outbox.enqueue");
      },
    },
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      order.push("authorize");
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    pluginActivationRepo,
    discoverPlugins: async () => discovery,
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, order, pluginActivationRepo };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function pluginsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("plugins_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = pluginsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): PluginsAgentToolDefinition {
  const entry = pluginAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

// ---------------------------------------------------------------------------
// 1. The catalog is complete
// ---------------------------------------------------------------------------

test("exactly the 2 plugin-runtime operations are wired — list and set-enabled, nothing else", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...pluginsRegistrations(deps).keys()].sort(), ["plugins_list", "plugins_set_enabled"]);
  assert.equal(pluginAgentToolCatalog.length, 2, "there is no unwired plugins entry — the whole catalog is wired");
});

test("no install/uninstall/upload tool exists — this codebase has no admin route for either operation", () => {
  const { deps } = fakeRouteDeps();
  for (const id of pluginsRegistrations(deps).keys()) {
    assert.equal(/install|uninstall|upload|delete/i.test(id), false, `'${id}' must not imply an operation with no backing admin route`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired plugins registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of pluginsRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's, not a second copy`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired plugins tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of pluginsRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

test("plugins_set_enabled's description is honest about ADR-023 DDL risk — it is not advertised as a pure metadata toggle", () => {
  assert.match(catalogEntry("plugins_set_enabled").description, /schema DDL|data module/i);
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for both wired tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of pluginsRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a plugins catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for set_enabled fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("plugins_set_enabled", { ...catalogEntry("plugins_set_enabled"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for both plugins registrations", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of pluginsRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2)
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  plugins_list: {},
  plugins_set_enabled: { pluginId: VALID_PLUGIN.id, enabled: true },
};

test("every wired plugins tool has a known input fixture", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...pluginsRegistrations(deps).keys()].sort(), Object.keys(TOOL_INPUTS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with its catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    authorizeCalls.length = 0;

    await wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId]));

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, catalogEntry(toolId).authorization.permission);
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is rejected and nothing is written`, async () => {
    const { deps, pluginActivationRepo } = fakeRouteDeps({ allow: false });
    const before = await pluginActivationRepo.listAll();

    await assert.rejects(
      () => wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
        assert.match((error as Error).message, /is not authorized for/);
        return true;
      },
    );

    const after = await pluginActivationRepo.listAll();
    assert.deepEqual(after, before, "the permission gate must run ahead of any durable effect");
  });
}

test("plugins_set_enabled: authorize() runs before any write", async () => {
  const { deps, order } = fakeRouteDeps();
  order.length = 0;

  await wired(deps, "plugins_set_enabled").handler(executionContext({ pluginId: VALID_PLUGIN.id, enabled: true }));

  assert.equal(order[0], "authorize", `first observable effect was '${order[0]}', not the authorization check`);
});

test("plugins_set_enabled: refuses to enable a plugin whose discovery status is 'invalid'", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "plugins_set_enabled").handler(executionContext({ pluginId: INVALID_PLUGIN.id, enabled: true })),
    /failed validation/,
  );
});

test("plugins_set_enabled: refuses to enable an unknown plugin id", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "plugins_set_enabled").handler(executionContext({ pluginId: "does-not-exist", enabled: true })),
    /was not found/,
  );
});

test("plugins_set_enabled: disabling has no validity precondition — a currently-invalid plugin can still be disabled", async () => {
  const { deps, pluginActivationRepo } = fakeRouteDeps();
  await pluginActivationRepo.save({ pluginId: INVALID_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "0.1.0", enabled: true, updatedAt: NOW });

  const out = (await wired(deps, "plugins_set_enabled").handler(executionContext({ pluginId: INVALID_PLUGIN.id, enabled: false }))) as {
    plugin: { enabled: boolean };
  };
  assert.equal(out.plugin.enabled, false);
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow — proves today's tools compose correctly in sequence
// ---------------------------------------------------------------------------

test("workflow: list plugins, enable one the list returned, list again to confirm the state change is reflected", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: list — learn which plugins exist and their current state.
  const before = (await wired(deps, "plugins_list").handler(executionContext({}))) as {
    plugins: Array<{ id: string; enabled: boolean; status: string }>;
  };
  const target = before.plugins.find((p) => p.id === VALID_PLUGIN.id);
  assert.ok(target, "the fixture's valid plugin must appear in the initial list");
  assert.equal(target.enabled, false, "a never-activated plugin starts disabled");
  assert.equal(target.status, "valid");

  // Step 2: enable — using the id step 1 returned, not a hardcoded literal.
  await wired(deps, "plugins_set_enabled").handler(executionContext({ pluginId: target.id, enabled: true }));

  // Step 3: list again — the enable in step 2 must be visible in a FRESH read, proving state
  // actually persisted rather than the tool merely reporting success.
  const after = (await wired(deps, "plugins_list").handler(executionContext({}))) as {
    plugins: Array<{ id: string; enabled: boolean }>;
  };
  const updated = after.plugins.find((p) => p.id === target.id);
  assert.ok(updated);
  assert.equal(updated.enabled, true, "the enable call in step 2 must be reflected in step 3's fresh list");

  // The unrelated invalid plugin must be untouched by the whole sequence.
  const untouched = after.plugins.find((p) => p.id === INVALID_PLUGIN.id);
  assert.equal(untouched?.enabled, false);
});
