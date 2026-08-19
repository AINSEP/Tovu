import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import {
  getSettingsAgentToolCatalog,
  type AgentToolDefinition as SettingsAgentToolDefinition,
  AGENT_WRITABLE_PREFERENCE_IDS,
  InMemorySettingsRepo,
  type SettingDefinitionRecord,
  type SettingValueRecord,
} from "../../features/settings/index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeSettingsTools } from "../../features/settings/tool-registrations.js";

/**
 * @file The Settings (SPEC-007) tool-wiring test file — mirrors
 * `tool-registrations.database-recovery.test.ts`/`tool-registrations.plugins.test.ts`'s own shape.
 * Catalog completeness (3 wired reads + 1 curated write vs. 4 declared-but-excluded generic
 * writes, and WHY), published contract parity, the risk cross-check, the ADR-021 §2 authorization
 * half (including the cross-principal `settings.user.read` gate), and a multi-tool workflow test.
 *
 * §6 covers `settings_set_ui_preference`, whose whole safety argument is that its blast radius is
 * structural rather than behavioral — so the tests there assert what is UNREACHABLE (an unlisted
 * key, another operator's layer, a non-user scope), not merely what the happy path returns.
 */

// `settings` moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, the last domain of this rollout to convert the standard
// way — see `features/settings/tool-registrations.ts`'s own header for the two-stage trace: first
// pulled out via a one-off exception because 3 files inside `assistant/` value-imported
// `features/settings` engine functions directly, then fully converted once those 3 files took the
// functions as injected deps instead). So `buildAssistantToolRegistrations` below no longer wires it
// unless something explicitly installs it first, mirroring what the real composition roots now do
// via `installFirstPartyToolContributors()` — same fix `tool-registrations.post.test.ts`/
// `tool-registrations.entries.test.ts` already apply.
resetToolContributorsForTests();
contributeSettingsTools();

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

/**
 * The one real agent-writable preference used by §6, mirroring what
 * `features/settings/ui-tab-definitions.ts` registers for it at boot: a string, defaulting to
 * `"en"`, scoped `user | workspace` (`SCOPE_BIT.user | SCOPE_BIT.workspace` = 6).
 *
 * A real id rather than a synthetic one, because `settings_set_ui_preference`'s allowlist is
 * closed — a made-up key could not be written through it at all, so the test would prove nothing
 * about the path an operator actually exercises.
 */
const LANGUAGE_DEFINITION: SettingDefinitionRecord = {
  ...DEFINITION,
  settingId: "setting-language-locale",
  namespace: "core.language",
  key: "locale",
  schema: { type: "string" },
  defaultValue: "en",
  scopes: 6,
};

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const settingsRepo = new InMemorySettingsRepo({ definitions: [DEFINITION, LANGUAGE_DEFINITION] });

  const deps = {
    workspaceId: WORKSPACE_ID,
    settingsRepo,
    settingsReady: Promise.resolve(),
    // `settings_set_ui_preference` awaits THIS one, not `settingsReady` — its definitions come
    // from `ensureSettingsUiTabDefinitions()`, not the legacy presentation migration.
    settingsUiTabsReady: Promise.resolve(),
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

test("exactly the 4 wireable settings entries are registered — 3 reads and the curated preference write", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...settingsRegistrations(deps).keys()].sort(),
    ["settings_get_effective", "settings_get_raw", "settings_list_definitions", "settings_set_ui_preference"],
  );
  assert.equal(getSettingsAgentToolCatalog().length, 8, "sanity: the full settings catalog is 8 entries (4 wired + 4 excluded generic writes)");
});

for (const excludedId of ["settings_set", "settings_clear", "settings_reset", "settings_register_definitions"]) {
  test(`${excludedId} is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification`, () => {
    const { deps } = fakeRouteDeps();
    assert.equal(settingsRegistrations(deps).has(excludedId), false);
    assert.throws(() => assertRiskMetadataIsWirable(excludedId, catalogEntry(excludedId)), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
  });
}

test("no GENERIC settings write is reachable anywhere in the whole assistant tool set", () => {
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
  settings_set_ui_preference: { setting: "core.language.locale", value: "es" },
};

const PERMISSION_OF: Record<string, string> = {
  settings_list_definitions: "settings.read.definitions",
  settings_get_effective: "settings.read",
  settings_get_raw: "settings.read.raw",
  // Derived by `write-service.deriveRequiredPermission`, NOT passed by the handler — a user-scoped
  // write that names no target principal is a self-write. That this row matches the catalog
  // entry's declared permission is the assertion that the declaration is honest.
  settings_set_ui_preference: "settings.user.self.write",
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

/**
 * The regression the handoff's §3 asked for, filed against the ROUTE and found to be missing from
 * the TOOL as well. Both read tools default an omitted `principalId` to the caller, because
 * `undefined` does not mean "the caller" to `getEffective` — it means "skip the user layer".
 *
 * This is a positive assertion (the user value is RETURNED), not merely that no error is thrown.
 * The broken version threw nothing: it returned the default layer's value, confidently and wrongly.
 */
for (const toolId of ["settings_get_effective", "settings_get_raw"]) {
  test(`${toolId}: omitting principalId reads the CALLER's own user layer, not the default`, async () => {
    const { deps, settingsRepo } = fakeRouteDeps();
    await settingsRepo.saveUserValue({
      settingId: LANGUAGE_DEFINITION.settingId,
      scope: "user",
      workspaceId: WORKSPACE_ID,
      principalId: PRINCIPAL_ID,
      valueJson: "es",
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: PRINCIPAL_ID,
      updatedAt: NOW,
    } as SettingValueRecord);

    const input = toolId === "settings_get_effective" ? { namespace: "core.language" } : { namespace: "core.language", key: "locale" };
    const result = (await wired(deps, toolId).handler(executionContext(input))) as {
      data?: Array<{ key: string; value: unknown; sourceLayer: string }>;
      user?: unknown;
    };

    if (toolId === "settings_get_effective") {
      const row = result.data?.find((d) => d.key === "locale");
      assert.ok(row, "the language key must be present in the effective read");
      assert.equal(row.value, "es", "the caller's own user-layer value must win over the definition default");
      assert.equal(row.sourceLayer, "user", "and it must be reported as coming from the user layer");
    } else {
      assert.equal(result.user, "es", "the raw read must surface the caller's own user layer");
    }
  });
}

test("settings_get_effective: omitting principalId does NOT trigger the cross-principal permission check", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired(deps, "settings_get_effective").handler(executionContext({ namespace: "core.language" }));

  // Defaulting to the caller must not be mistaken for naming someone else — otherwise every
  // ordinary self-read would demand `settings.user.read`, a grant it has no business needing.
  assert.equal(authorizeCalls.length, 1, "a self-read by default needs only the base read permission");
  assert.equal(authorizeCalls[0].permission, "settings.read");
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
// 6. settings_set_ui_preference — the curated write's structural bounds
// ---------------------------------------------------------------------------

test("settings_set_ui_preference: the published enum is exactly the allowlist, so an unlisted key is not even describable", () => {
  const { deps } = fakeRouteDeps();
  const schema = wired(deps, "settings_set_ui_preference").descriptor.inputSchema as {
    properties: { setting: { enum: string[] } };
  };

  assert.deepEqual([...schema.properties.setting.enum].sort(), [...AGENT_WRITABLE_PREFERENCE_IDS].sort());
  // The point of the enum is which keys it CANNOT name. `core.privacy.*` and
  // `core.instructions.custom` are registered by the same boot call and deliberately withheld.
  for (const withheld of [
    "core.privacy.telemetry.metrics",
    "core.privacy.telemetry.content",
    "core.privacy.decisionAt",
    "core.privacy.installationId",
    "core.instructions.custom",
  ]) {
    assert.equal(schema.properties.setting.enum.includes(withheld), false, `${withheld} must not be agent-writable`);
  }
});

test("settings_set_ui_preference: a key outside the allowlist is refused by the handler even when the schema is bypassed", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  // Calls the handler directly, which is exactly the bypass being defended against: a stale or
  // mis-published descriptor would let this input through the daemon's own enum validation.
  await assert.rejects(
    () => wired(deps, "settings_set_ui_preference").handler(executionContext({ setting: "core.presentation.site_title", value: "pwned" })),
    /is not an agent-writable preference/,
  );
  assert.equal(authorizeCalls.length, 0, "an unlisted key is refused before any authorize() call — it cannot be used to probe grants");
});

test("settings_set_ui_preference: writes land on the CALLER's own user layer", async () => {
  const { deps, settingsRepo } = fakeRouteDeps();

  const result = (await wired(deps, "settings_set_ui_preference").handler(
    executionContext({ setting: "core.language.locale", value: "es" }),
  )) as { setting: string; value: unknown; scope: string };

  assert.deepEqual({ setting: result.setting, value: result.value, scope: result.scope }, { setting: "core.language.locale", value: "es", scope: "user" });

  const stored = await settingsRepo.getUserValue({
    workspaceId: WORKSPACE_ID,
    principalId: PRINCIPAL_ID,
    settingId: LANGUAGE_DEFINITION.settingId,
  });
  assert.equal(stored?.valueJson, "es", "the value must be readable back from the caller's own user layer");

  const other = await settingsRepo.getUserValue({
    workspaceId: WORKSPACE_ID,
    principalId: OTHER_PRINCIPAL_ID,
    settingId: LANGUAGE_DEFINITION.settingId,
  });
  assert.equal(other, null, "no other principal's layer may be touched");
});

test("settings_set_ui_preference: input naming another principal or a wider scope is ignored, not honored", async () => {
  const { deps, authorizeCalls, settingsRepo } = fakeRouteDeps();
  authorizeCalls.length = 0;

  // `additionalProperties: false` means a real caller could not send these at all. Asserting the
  // handler ignores them anyway is what makes the guarantee structural: it holds even if the
  // schema stops being enforced.
  await wired(deps, "settings_set_ui_preference").handler(
    executionContext({ setting: "core.language.locale", value: "es", principalId: OTHER_PRINCIPAL_ID, scope: "global" }),
  );

  assert.equal(authorizeCalls[0].permission, "settings.user.self.write", "a smuggled principalId must not escalate to settings.user.write");

  const other = await settingsRepo.getUserValue({
    workspaceId: WORKSPACE_ID,
    principalId: OTHER_PRINCIPAL_ID,
    settingId: LANGUAGE_DEFINITION.settingId,
  });
  assert.equal(other, null, "the smuggled principalId must not have been used as the write target");
  assert.equal(
    await settingsRepo.getGlobalValue(LANGUAGE_DEFINITION.settingId),
    null,
    "the smuggled scope must not have widened the write beyond the user layer",
  );
});

test("settings_set_ui_preference: a value of the wrong shape is rejected and nothing is written", async () => {
  const { deps, settingsRepo } = fakeRouteDeps();

  await assert.rejects(
    () => wired(deps, "settings_set_ui_preference").handler(executionContext({ setting: "core.language.locale", value: 42 })),
    // The ledger's registered schema is the validator; the tool republishes its own schema on the
    // rejection so a model can correct in one turn.
    /does not match the definition schema/,
  );

  const stored = await settingsRepo.getUserValue({
    workspaceId: WORKSPACE_ID,
    principalId: PRINCIPAL_ID,
    settingId: LANGUAGE_DEFINITION.settingId,
  });
  assert.equal(stored, null, "a rejected value must leave no row behind");
});

test("settings_set_ui_preference: `false` is a settable value, not a missing one", async () => {
  const { deps, settingsRepo } = fakeRouteDeps();
  const booleanDefinition: SettingDefinitionRecord = {
    ...LANGUAGE_DEFINITION,
    settingId: "setting-sound-enabled",
    namespace: "core.notifications",
    key: "soundEnabled",
    schema: { type: "boolean" },
    defaultValue: true,
  };
  await settingsRepo.saveDefinition(booleanDefinition);

  await wired(deps, "settings_set_ui_preference").handler(executionContext({ setting: "core.notifications.soundEnabled", value: false }));

  const stored = await settingsRepo.getUserValue({ workspaceId: WORKSPACE_ID, principalId: PRINCIPAL_ID, settingId: booleanDefinition.settingId });
  assert.equal(stored?.valueJson, false, "a falsy-but-legal value must be stored, not treated as absent");
});

test("settings_set_ui_preference: the write is recorded in the revision ledger, attributed to the caller", async () => {
  const { deps, settingsRepo } = fakeRouteDeps();

  const result = (await wired(deps, "settings_set_ui_preference").handler(
    executionContext({ setting: "core.language.locale", value: "es" }),
  )) as { revisionSeq: number };

  const revisions = await settingsRepo.listRevisions({ settingId: LANGUAGE_DEFINITION.settingId });
  const revision = revisions.find((r) => r.seq === result.revisionSeq);
  assert.ok(revision, "the returned revisionSeq must name a real ledger entry");
  assert.equal(revision.op, "set");
  assert.equal(revision.actor, PRINCIPAL_ID, "an agent-driven change is attributed to the human principal the run carries");
  assert.equal(revision.afterJson, "es");
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
