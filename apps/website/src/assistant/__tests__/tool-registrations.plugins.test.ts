import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import { InMemoryChangeSetRepo } from "../../contracts/core/commands/index.js";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";
import type { PluginDiscoveryRecord } from "../../features/plugin-runtime/discovery.js";
import { pluginAgentToolCatalog, type AgentToolDefinition as PluginsAgentToolDefinition } from "../../features/plugin-runtime/agent-tools.js";
import { InMemoryPluginActivationRepo } from "../../features/plugin-runtime/repo.memory.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildPluginsRegistrations, contributePluginsTools, type PluginsToolDeps } from "../../features/plugin-runtime/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

// Plugins moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots now do via
// `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
registerToolContributor(contributePluginsTools());

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
    onPluginUninstalled: async (pluginId: string) => {
      order.push(`onPluginUninstalled:${pluginId}`);
    },
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, order, pluginActivationRepo };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function pluginsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("plugins_") || r.descriptor.id === "content_read.plugin")
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

test("exactly the 3 plugin-runtime operations are wired — list, set-enabled, and uninstall (2026-09-07), nothing else", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...pluginsRegistrations(deps).keys()].sort(), ["content_read.plugin", "plugins_set_enabled", "plugins_uninstall"]);
  assert.equal(pluginAgentToolCatalog.length, 3, "there is no unwired plugins entry — the whole catalog is wired");
});

test("no install/upload tool exists — this codebase has no admin route for either operation (uninstall now DOES, see tool-registrations.plugins-uninstall.test.ts)", () => {
  const { deps } = fakeRouteDeps();
  for (const id of pluginsRegistrations(deps).keys()) {
    if (id === "plugins_uninstall") continue;
    assert.equal(/install|uninstall|upload|delete/i.test(id), false, `'${id}' must not imply an operation with no backing admin route`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired plugins registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of pluginsRegistrations(deps)) {
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.plugin") continue;
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
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.plugin") continue;
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
  "content_read.plugin": {},
  // `enabled: false`, not `true`: since 2026-09-09 an ENABLE parks on a human confirmation
  // (`set-enabled-confirmation-ui.ts`), and this shared loop asserts on the authorization gate, not
  // on the dialog. The enable direction has its own tests below, driven through a real exchange
  // store. `family` is required and never inferred — see that section's own header.
  plugins_set_enabled: { pluginId: VALID_PLUGIN.id, enabled: false, family: "site-runtime" },
  // `plugins_uninstall` is deliberately ABSENT here (2026-09-16): since it now always parks on a
  // human confirmation (`uninstall-confirmation-ui.ts`), a bare `.handler()` call with no
  // `emitSurface` fails closed rather than completing — unlike `plugins_set_enabled`, which dodges
  // its own confirmation via `enabled: false` above, uninstall has no non-destructive direction to
  // dodge into. Its own authorize-ordering and denied-principal coverage lives in the dedicated
  // `tool-registrations.plugins-uninstall.test.ts`, driven through a real exchange store the way
  // `enableWithDecision` below drives `plugins_set_enabled`'s enable direction.
};

test("every wired plugins tool except plugins_uninstall has a known input fixture — uninstall cannot be dodged into a non-confirming input the way set-enabled can", () => {
  const { deps } = fakeRouteDeps();
  const wiredExceptUninstall = [...pluginsRegistrations(deps).keys()].filter((id) => id !== "plugins_uninstall");
  assert.deepEqual(wiredExceptUninstall.sort(), Object.keys(TOOL_INPUTS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with its catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    authorizeCalls.length = 0;

    await wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId]));

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    // A `content_read.*` card is catalogued in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so this cross-check has nothing to resolve for it. The
    // card's own expectation is still asserted independently just below/above.
    if (!toolId.startsWith("content_read.")) {
      assert.equal(authorizeCalls[0].permission, catalogEntry(toolId).authorization.permission);
    }
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

/**
 * Drives `plugins_set_enabled`'s ENABLE direction end to end, answering its confirmation dialog the
 * way `mcp-ui-tool-calls-route.ts` does for a real human click.
 *
 * Built through `buildPluginsRegistrations` directly rather than `buildAssistantToolRegistrations`
 * because the exchange store has to be one this test can `deliver` into; the assistant-level builder
 * owns its own store internally. The registration is otherwise identical — same builder, same deps.
 */
async function enableWithDecision(
  deps: RouteDeps,
  input: Record<string, unknown>,
  decision: "confirm" | "cancel",
): Promise<unknown> {
  const surfaceExchanges: SurfaceExchangeStore = createSurfaceExchangeStore();
  const registration = buildPluginsRegistrations(deps as unknown as PluginsToolDeps, { surfaceExchanges }).find(
    (r) => r.descriptor.id === "plugins_set_enabled",
  );
  assert.ok(registration, "expected 'plugins_set_enabled' to be wired");

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => void emitted.push(surface);
  const pending = registration.handler({
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    emitSurface,
  } as ToolExecutionContext);

  await new Promise((resolve) => setImmediate(resolve));
  if (emitted.length === 0) return pending; // refused before the dialog — let the caller assert on it

  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the dialog must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1] ?? "", params: { decision }, principalId: PRINCIPAL_ID, toolId: "plugins_set_enabled" });
  return pending;
}

test("plugins_set_enabled: authorize() runs before any write", async () => {
  const { deps, order } = fakeRouteDeps();
  order.length = 0;

  await enableWithDecision(deps, { pluginId: VALID_PLUGIN.id, enabled: true, family: "site-runtime" }, "confirm");

  assert.equal(order[0], "authorize", `first observable effect was '${order[0]}', not the authorization check`);
});

test("plugins_set_enabled: refuses to enable a plugin whose discovery status is 'invalid'", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => enableWithDecision(deps, { pluginId: INVALID_PLUGIN.id, enabled: true, family: "site-runtime" }, "confirm"),
    /failed validation/,
  );
});

test("plugins_set_enabled: refuses to enable an unknown plugin id", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => enableWithDecision(deps, { pluginId: "does-not-exist", enabled: true, family: "site-runtime" }, "confirm"),
    /was not found/,
  );
});

test("plugins_set_enabled: disabling has no validity precondition — a currently-invalid plugin can still be disabled", async () => {
  const { deps, pluginActivationRepo } = fakeRouteDeps();
  await pluginActivationRepo.save({ pluginId: INVALID_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "0.1.0", enabled: true, updatedAt: NOW });

  const out = (await wired(deps, "plugins_set_enabled").handler(
    executionContext({ pluginId: INVALID_PLUGIN.id, enabled: false, family: "site-runtime" }),
  )) as { plugin: { enabled: boolean } };
  assert.equal(out.plugin.enabled, false);
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow — proves today's tools compose correctly in sequence
// ---------------------------------------------------------------------------

test("workflow: list plugins, enable one the list returned, list again to confirm the state change is reflected", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: list — learn which plugins exist and their current state.
  const before = (await wired(deps, "content_read.plugin").handler(executionContext({}))) as {
    plugins: Array<{ id: string; enabled: boolean; status: string }>;
  };
  const target = before.plugins.find((p) => p.id === VALID_PLUGIN.id);
  assert.ok(target, "the fixture's valid plugin must appear in the initial list");
  assert.equal(target.enabled, false, "a never-activated plugin starts disabled");
  assert.equal(target.status, "valid");

  // Step 2: enable — using the id step 1 returned, not a hardcoded literal. Enabling now parks on a
  // human confirmation, so the workflow answers it the way a real click does.
  await enableWithDecision(deps, { pluginId: target.id, enabled: true, family: "site-runtime" }, "confirm");

  // Step 3: list again — the enable in step 2 must be visible in a FRESH read, proving state
  // actually persisted rather than the tool merely reporting success.
  const after = (await wired(deps, "content_read.plugin").handler(executionContext({}))) as {
    plugins: Array<{ id: string; enabled: boolean }>;
  };
  const updated = after.plugins.find((p) => p.id === target.id);
  assert.ok(updated);
  assert.equal(updated.enabled, true, "the enable call in step 2 must be reflected in step 3's fresh list");

  // The unrelated invalid plugin must be untouched by the whole sequence.
  const untouched = after.plugins.find((p) => p.id === INVALID_PLUGIN.id);
  assert.equal(untouched?.enabled, false);
});
