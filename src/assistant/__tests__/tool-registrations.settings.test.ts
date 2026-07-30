import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { getSettingsAgentToolCatalog, type AgentToolDefinition as SettingsAgentToolDefinition } from "../../features/settings/agent-tools";
import { InMemorySettingsRepo } from "../../features/settings/repo.memory";
import type { SettingDefinitionRecord, SettingValueRecord } from "../../features/settings/types";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

/**
 * @file The Settings (SPEC-007) tool-wiring test file — mirrors
 * `tool-registrations.database-recovery.test.ts`/`tool-registrations.plugins.test.ts`'s own shape.
 * Read-only domain: catalog completeness (3 wired reads vs. 4 declared-but-excluded writes, and
 * WHY), published contract parity, the risk cross-check, the ADR-021 §2 authorization half
 * (including the cross-principal `settings.user.read` gate), and a multi-tool workflow test.
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const OTHER_PRINCIPAL_ID = "principal-other";
const NOW = "2026-07-29T00:00:00.000Z";

const DEFINITION: SettingDefinitionRecord = {
  settingId: "setting-1",
  version: 1,
  workspaceId: null,
  namespace: "core.presentation",
  key: "site_title",
  ownerKind: "core",
  ownerId: null,
  schema: { type: "string" },
  defaultValue: "Untitled Site",
  scopes: 7,
  secret: false,
  status: "active",
  aliasOfNamespace: null,
  aliasOfKey: null,
  coercionTag: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const settingsRepo = new InMemorySettingsRepo({ definitions: [DEFINITION] });

  const deps = {
    workspaceId: WORKSPACE_ID,
    settingsRepo,
    settingsReady: Promise.resolve(),
    clock: { nowIso: () => NOW },
    idGen: { newId: () => "id-unused" },
    principalRepo: { findById: async () => null },
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, settingsRepo };
}

function executionContext(input: Record<string, unknown> | undefined, principalId: string = PRINCIPAL_ID): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: principalId }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function settingsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("settings_")).map((r) => [r.descriptor.id, r]));
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = settingsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): SettingsAgentToolDefinition {
  const entry = getSettingsAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

// ---------------------------------------------------------------------------
// 1. Catalog completeness — wired reads vs. declared-but-excluded writes, and excluded tools stay excluded
// ---------------------------------------------------------------------------

test("exactly the 3 wireable settings entries are registered — all reads, no write", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...settingsRegistrations(deps).keys()].sort(), ["settings_get_effective", "settings_get_raw", "settings_list_definitions"]);
  assert.equal(getSettingsAgentToolCatalog().length, 7, "sanity: the full settings catalog is still 7 entries (3 wired + 4 excluded writes)");
});

for (const excludedId of ["settings_set", "settings_clear", "settings_reset", "settings_register_definitions"]) {
  test(`${excludedId} is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification`, () => {
    const { deps } = fakeRouteDeps();
    assert.equal(settingsRegistrations(deps).has(excludedId), false);
    assert.throws(() => assertRiskMetadataIsWirable(excludedId, catalogEntry(excludedId)), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
  });
}

test("no tool name across the whole assistant tool set implies a setting value can be written by an agent", () => {
  const { deps } = fakeRouteDeps();
  const ids = buildAssistantToolRegistrations(deps).map((r) => r.descriptor.id);
  for (const excludedId of ["settings_set", "settings_clear", "settings_reset", "settings_register_definitions"]) {
    assert.equal(ids.includes(excludedId), false);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired settings registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of settingsRegistrations(deps)) {
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired settings tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of settingsRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for all 3 wired settings tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of settingsRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired settings registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of settingsRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2)
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  settings_list_definitions: {},
  settings_get_effective: { namespace: "core.presentation" },
  settings_get_raw: { namespace: "core.presentation", key: "site_title" },
};

const PERMISSION_OF: Record<string, string> = {
  settings_list_definitions: "settings.read.definitions",
  settings_get_effective: "settings.read",
  settings_get_raw: "settings.read.raw",
};

test("every wired settings tool has a known input fixture", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...settingsRegistrations(deps).keys()].sort(), Object.keys(TOOL_INPUTS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with its catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    authorizeCalls.length = 0;

    await wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId]));

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, PERMISSION_OF[toolId]);
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is rejected`, async () => {
    const { deps } = fakeRouteDeps({ allow: false });

    await assert.rejects(
      () => wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
        assert.match((error as Error).message, /is not authorized for/);
        assert.ok((error as Error).message.includes(PERMISSION_OF[toolId]));
        return true;
      },
    );
  });
}

test("settings_get_effective / settings_get_raw: reading another principal's user layer requires settings.user.read as a SECOND check", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired(deps, "settings_get_effective").handler(executionContext({ namespace: "core.presentation", principalId: OTHER_PRINCIPAL_ID }));

  assert.equal(authorizeCalls.length, 2, "the base read permission, then the cross-principal permission");
  assert.equal(authorizeCalls[0].permission, "settings.read");
  assert.equal(authorizeCalls[1].permission, "settings.user.read");
  assert.equal(authorizeCalls[1].principalId, PRINCIPAL_ID, "the cross-principal check is evaluated against the CALLER, not the target");
});

test("settings_get_effective: reading one's OWN principalId does not trigger the cross-principal check", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired(deps, "settings_get_effective").handler(executionContext({ namespace: "core.presentation", principalId: PRINCIPAL_ID }));

  assert.equal(authorizeCalls.length, 1, "a self-read never needs the second, cross-principal permission");
});

test("settings_get_effective / settings_get_raw: a caller lacking settings.user.read cannot read another principal's layer", async () => {
  let call = 0;
  const settingsRepo = new InMemorySettingsRepo({ definitions: [DEFINITION] });
  const deps = {
    workspaceId: WORKSPACE_ID,
    settingsRepo,
    settingsReady: Promise.resolve(),
    clock: { nowIso: () => NOW },
    idGen: { newId: () => "id-unused" },
    principalRepo: { findById: async () => null },
    // First call (the base read permission) is allowed; the second (cross-principal) is denied.
    authorize: async () => {
      call += 1;
      return call === 1 ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  } as unknown as RouteDeps;

  await assert.rejects(
    () => wired(deps, "settings_get_effective").handler(executionContext({ namespace: "core.presentation", principalId: OTHER_PRINCIPAL_ID })),
    /is not authorized for 'settings\.user\.read'/,
  );
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow
// ---------------------------------------------------------------------------

test("workflow: list definitions, get the effective value for the namespace one of them belongs to, get its raw per-layer breakdown", async () => {
  const { deps, settingsRepo } = fakeRouteDeps();
  await settingsRepo.saveGlobalValue({
    settingId: DEFINITION.settingId,
    scope: "global",
    workspaceId: null,
    principalId: null,
    valueJson: "My Real Site",
    state: "set",
    defVersion: 1,
    seq: 1,
    updatedBy: "seed",
    updatedAt: NOW,
  } as SettingValueRecord);

  // Step 1: list — learn which definitions exist.
  const listed = (await wired(deps, "settings_list_definitions").handler(executionContext({}))) as {
    data: Array<{ namespace: string; key: string }>;
  };
  const target = listed.data.find((d) => d.key === DEFINITION.key);
  assert.ok(target, "the fixture definition must appear in the listing");

  // Step 2: get the effective value for that namespace, using the namespace step 1 returned.
  const effective = (await wired(deps, "settings_get_effective").handler(executionContext({ namespace: target.namespace }))) as {
    data: Array<{ key: string; value: unknown; sourceLayer: string }>;
  };
  const effectiveRow = effective.data.find((d) => d.key === target.key);
  assert.ok(effectiveRow);
  assert.equal(effectiveRow.value, "My Real Site");
  assert.equal(effectiveRow.sourceLayer, "global");

  // Step 3: get the raw per-layer breakdown for the exact namespace+key steps 1/2 handed forward.
  const raw = (await wired(deps, "settings_get_raw").handler(executionContext({ namespace: target.namespace, key: target.key }))) as {
    global: unknown;
    workspace: unknown;
    user: unknown;
    default: unknown;
  };
  assert.equal(raw.global, "My Real Site", "the global value set directly in the repo must be visible through the raw read");
  assert.equal(raw.workspace, null);
  assert.equal(raw.user, null);
  assert.equal(raw.default, DEFINITION.defaultValue);
});
