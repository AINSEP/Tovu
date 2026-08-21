import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/cms/core";
import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import { InMemorySettingsRepo } from "../../features/settings/index.js";
import type { SettingValueRecord } from "../../features/settings/index.js";
import { ANALYTICS_NAMESPACE, createSettingsAnalyticsConfig, ensureAnalyticsSettingDefinitions } from "../config.settings.js";

/**
 * @file `config.settings.ts` had no direct test — everything in it was only ever exercised as a
 * side effect of full app-boot wiring in other folders' tests, which never actually calls the
 * returned `AnalyticsConfigPort.get()`. This suite exercises the real registrar + adapter through
 * a real `InMemorySettingsRepo` (no hand-rolled fake of the settings ledger), per this file's own
 * `AnalyticsConfigPort` contract (`ports.ts`) and its `BOOT_ORDERING_FALLBACK` doc comment.
 */

const WORKSPACE_ID = "workspace-1" as UUID;
const SYSTEM_PRINCIPAL_ID = "system-analytics" as UUID;

const clock = { nowIso: () => "2026-08-20T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `analytics-def-id-${++idCounter}` };

function makeRegistrarDeps(settingsRepo: InMemorySettingsRepo) {
  return { settingsRepo, clock, ids, principals: new InMemoryPrincipalRepo([]) };
}

/** Writes a value directly at the repo layer, bypassing `write-service.ts`'s schema validation —
 *  the only way to simulate the "already-registered definition, out-of-schema stored value"
 *  shape `toStringArray`/the `rawRetentionDays` type guard defend against (their own doc comments
 *  say this "should not happen" through the real write path; it can still happen from legacy or
 *  externally-written rows, so it is a reachable state, not a fake one). */
async function plantRawWorkspaceValue(
  settingsRepo: InMemorySettingsRepo,
  key: string,
  valueJson: SettingValueRecord["valueJson"]
): Promise<void> {
  const definition = await settingsRepo.findActiveDefinition({
    namespace: ANALYTICS_NAMESPACE,
    key,
    workspaceId: null,
  });
  assert.ok(definition, `expected an active definition for ${ANALYTICS_NAMESPACE}.${key}`);
  await settingsRepo.saveWorkspaceValue({
    settingId: definition.settingId,
    scope: "workspace",
    workspaceId: WORKSPACE_ID,
    principalId: null,
    valueJson,
    state: "set",
    defVersion: definition.version,
    seq: 1,
    updatedBy: SYSTEM_PRINCIPAL_ID,
    updatedAt: clock.nowIso(),
    originPluginId: null,
  });
}

test("ensureAnalyticsSettingDefinitions registers exactly 6 core.analytics definitions, idempotently", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  const deps = makeRegistrarDeps(settingsRepo);
  const input = { systemPrincipalId: SYSTEM_PRINCIPAL_ID };

  await ensureAnalyticsSettingDefinitions(deps, input);
  const firstPass = (await settingsRepo.listActiveDefinitions({ workspaceId: null })).filter(
    (d) => d.namespace === ANALYTICS_NAMESPACE
  );
  assert.equal(firstPass.length, 6);
  assert.deepEqual(
    firstPass.map((d) => d.key).sort(),
    ["enabled", "excludedIpRanges", "excludedPaths", "honorDoNotTrack", "honorGlobalPrivacyControl", "rawRetentionDays"]
  );

  await ensureAnalyticsSettingDefinitions(deps, input);
  const secondPass = (await settingsRepo.listActiveDefinitions({ workspaceId: null })).filter(
    (d) => d.namespace === ANALYTICS_NAMESPACE
  );
  assert.equal(secondPass.length, 6, "rerun must not double-register");
});

test("createSettingsAnalyticsConfig().get() falls back to BOOT_ORDERING_FALLBACK when definitions are unregistered", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  // Deliberately no ensureAnalyticsSettingDefinitions call — this is the boot-ordering-bug state
  // getEffective's contract says never occurs from an operator choice, only a missing registrar run.
  const config = createSettingsAnalyticsConfig({ settingsRepo });

  const result = await config.get({ workspaceId: WORKSPACE_ID });

  assert.deepEqual(result, {
    workspaceId: WORKSPACE_ID,
    enabled: true,
    honorDoNotTrack: true,
    honorGlobalPrivacyControl: true,
    rawRetentionDays: 30,
    excludedPaths: [],
    excludedIpRanges: [],
    sink: "local",
  });
});

test("createSettingsAnalyticsConfig().get() resolves registered defaults once definitions exist", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  await ensureAnalyticsSettingDefinitions(makeRegistrarDeps(settingsRepo), { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  const config = createSettingsAnalyticsConfig({ settingsRepo });

  const result = await config.get({ workspaceId: WORKSPACE_ID });

  assert.deepEqual(result, {
    workspaceId: WORKSPACE_ID,
    enabled: true,
    honorDoNotTrack: true,
    honorGlobalPrivacyControl: true,
    rawRetentionDays: 30,
    excludedPaths: [],
    excludedIpRanges: [],
    sink: "local",
  });
});

test("createSettingsAnalyticsConfig().get() reflects a stored workspace override, not just defaults", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  await ensureAnalyticsSettingDefinitions(makeRegistrarDeps(settingsRepo), { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  await plantRawWorkspaceValue(settingsRepo, "enabled", false);
  await plantRawWorkspaceValue(settingsRepo, "rawRetentionDays", 90);
  await plantRawWorkspaceValue(settingsRepo, "excludedPaths", ["/admin", "/preview"]);
  const config = createSettingsAnalyticsConfig({ settingsRepo });

  const result = await config.get({ workspaceId: WORKSPACE_ID });

  assert.equal(result.enabled, false);
  assert.equal(result.rawRetentionDays, 90);
  assert.deepEqual(result.excludedPaths, ["/admin", "/preview"]);
  // Untouched keys still resolve to their registered defaults, proving the override is per-key.
  assert.equal(result.honorDoNotTrack, true);
  assert.equal(result.sink, "local");
});

test("createSettingsAnalyticsConfig().get() strictly requires === true for booleans, never truthy-coerces", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  await ensureAnalyticsSettingDefinitions(makeRegistrarDeps(settingsRepo), { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  // A truthy-but-not-boolean stored value should never accidentally read as `true`.
  await plantRawWorkspaceValue(settingsRepo, "honorDoNotTrack", 1);
  const config = createSettingsAnalyticsConfig({ settingsRepo });

  const result = await config.get({ workspaceId: WORKSPACE_ID });

  assert.equal(result.honorDoNotTrack, false);
});

test("createSettingsAnalyticsConfig().get() filters non-string entries out of a stored excludedPaths/excludedIpRanges array", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  await ensureAnalyticsSettingDefinitions(makeRegistrarDeps(settingsRepo), { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  await plantRawWorkspaceValue(settingsRepo, "excludedPaths", ["/admin", 42, null, "/preview", true]);
  const config = createSettingsAnalyticsConfig({ settingsRepo });

  const result = await config.get({ workspaceId: WORKSPACE_ID });

  assert.deepEqual(result.excludedPaths, ["/admin", "/preview"]);
});

test("createSettingsAnalyticsConfig().get() degrades a non-array stored excludedIpRanges value to an empty array", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  await ensureAnalyticsSettingDefinitions(makeRegistrarDeps(settingsRepo), { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  await plantRawWorkspaceValue(settingsRepo, "excludedIpRanges", "not-an-array");
  const config = createSettingsAnalyticsConfig({ settingsRepo });

  const result = await config.get({ workspaceId: WORKSPACE_ID });

  assert.deepEqual(result.excludedIpRanges, []);
});

test("createSettingsAnalyticsConfig().get() falls back to the default rawRetentionDays when the stored value is not a number", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  await ensureAnalyticsSettingDefinitions(makeRegistrarDeps(settingsRepo), { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  await plantRawWorkspaceValue(settingsRepo, "rawRetentionDays", "thirty");
  const config = createSettingsAnalyticsConfig({ settingsRepo });

  const result = await config.get({ workspaceId: WORKSPACE_ID });

  assert.equal(result.rawRetentionDays, 30);
  // Only the malformed field falls back — the rest of resolution is unaffected.
  assert.equal(result.enabled, true);
});
