import assert from "node:assert/strict";
import test from "node:test";

import { getActivation, setPluginEnabled, PluginIncompatibleError, PluginInvalidError, PluginNotFoundError } from "../../activation";
import { InMemoryPluginActivationRepo } from "../../repo.memory";
import type { PluginDiscoveryRecord } from "../../discovery";

/**
 * @file C-011/C-012 `setPluginEnabled()`/`getActivation()` — SPEC-005 REQ-07, BR-05, AC-02, AC-13
 * (state-symmetry half — the full gateway-revert wiring is exercised end-to-end at
 * `plugins-http.integration.test.ts`), INV-03/INV-05.
 *
 * TDD-certified against the stubs in `../../activation.ts` / `../../repo.memory.ts`; currently RED
 * — every function throws "not implemented". These assertions describe the contract the
 * Programmer stage must satisfy.
 */

const WORKSPACE = "ws-1";

function discoveryOf(status: PluginDiscoveryRecord["status"]): PluginDiscoveryRecord[] {
  return [
    {
      id: "word-count",
      name: "Word Count",
      version: "1.0.0",
      source: "built-in",
      status,
      errors: status === "valid" ? [] : [{ code: "SOME_ERROR", file: null, message: "fixture" }],
    },
  ];
}

function clock(iso = "2026-07-28T00:00:00.000Z") {
  return { nowIso: () => iso };
}

test("BR-05 step (1): enabling/disabling a plugin id absent from discovery is PluginNotFoundError", async () => {
  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: { clock: clock(), repo: new InMemoryPluginActivationRepo(), discovery: [] },
        input: { workspaceId: WORKSPACE, pluginId: "nonexistent", enabled: true },
      }),
    PluginNotFoundError
  );
});

test("BR-05 step (2)/AC-04: enabling a plugin whose discovered status is 'invalid' is PluginInvalidError, no activation row written", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: { clock: clock(), repo, discovery: discoveryOf("invalid") },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: true },
      }),
    PluginInvalidError
  );
});

test("BR-05 step (2)/AC-04: enabling a plugin whose discovered status is 'incompatible' is PluginIncompatibleError", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: { clock: clock(), repo, discovery: discoveryOf("incompatible") },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: true },
      }),
    PluginIncompatibleError
  );
});

test("BR-05: disabling has NO validity precondition — a plugin that is 'invalid' but currently enabled can still be disabled", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ pluginId: "word-count", workspaceId: WORKSPACE, version: "1.0.0", enabled: true, updatedAt: "2026-07-28T00:00:00.000Z" });

  const { activation } = await setPluginEnabled({
    deps: { clock: clock(), repo, discovery: discoveryOf("invalid") },
    input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: false },
  });

  assert.equal(activation.enabled, false, "disable must succeed even though status is 'invalid' — BR-05 gates only enabling");
});

test("REQ-07/AC-02: a successful enable upserts enabled:true and invokes onEnabled with the plugin id (the load side effect)", async () => {
  const repo = new InMemoryPluginActivationRepo();
  let onEnabledCalledWith: string | null = null;

  const { activation } = await setPluginEnabled({
    deps: {
      clock: clock(),
      repo,
      discovery: discoveryOf("valid"),
      onEnabled: async (pluginId) => {
        onEnabledCalledWith = pluginId;
      },
    },
    input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: true },
  });

  assert.equal(activation.enabled, true);
  assert.equal(activation.version, "1.0.0");
  assert.equal(onEnabledCalledWith, "word-count");

  const persisted = await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "word-count" });
  assert.equal(persisted?.enabled, true);
});

test("REQ-07: a failed enable side effect restores the prior activation and rethrows the original error", async () => {
  const prior = {
    pluginId: "word-count",
    workspaceId: WORKSPACE,
    version: "0.9.0",
    enabled: false,
    updatedAt: "2026-07-27T00:00:00.000Z",
  } as const;
  const repo = new InMemoryPluginActivationRepo([prior]);
  const originalError = new Error("enable side effect failed");

  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: {
          clock: clock(),
          repo,
          discovery: discoveryOf("valid"),
          onEnabled: async () => {
            throw originalError;
          },
        },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: true },
      }),
    (error) => error === originalError
  );

  assert.deepEqual(
    await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "word-count" }),
    prior
  );
});

test("REQ-07: a failed first enable removes the newly-created activation and rethrows the original error", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const originalError = new Error("first enable side effect failed");

  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: {
          clock: clock(),
          repo,
          discovery: discoveryOf("valid"),
          onEnabled: async () => {
            throw originalError;
          },
        },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: true },
      }),
    (error) => error === originalError
  );

  assert.equal(
    await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "word-count" }),
    null
  );
});

test("REQ-07: a compensation failure never masks the original enable side-effect error", async () => {
  const backing = new InMemoryPluginActivationRepo([
    {
      pluginId: "word-count",
      workspaceId: WORKSPACE,
      version: "0.9.0",
      enabled: false,
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
  ]);
  let saveCalls = 0;
  const repo = {
    getActivation: backing.getActivation.bind(backing),
    listAll: backing.listAll.bind(backing),
    deleteActivation: backing.deleteActivation.bind(backing),
    save: async (record: Parameters<typeof backing.save>[0]) => {
      saveCalls += 1;
      if (saveCalls === 2) throw new Error("compensation failed");
      await backing.save(record);
    },
  };
  const originalError = new Error("enable side effect failed");

  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: {
          clock: clock(),
          repo,
          discovery: discoveryOf("valid"),
          onEnabled: async () => {
            throw originalError;
          },
        },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: true },
      }),
    (error) => error === originalError
  );
});

test("REQ-07/AC-02: a successful disable upserts enabled:false and invokes onDisabled (the unload side effect); ext data is never touched by this module (INV-03 — no ext dependency exists here at all)", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ pluginId: "word-count", workspaceId: WORKSPACE, version: "1.0.0", enabled: true, updatedAt: "2026-07-28T00:00:00.000Z" });
  let onDisabledCalledWith: string | null = null;

  const { activation } = await setPluginEnabled({
    deps: {
      clock: clock("2026-07-28T02:00:00.000Z"),
      repo,
      discovery: discoveryOf("valid"),
      onDisabled: (pluginId) => {
        onDisabledCalledWith = pluginId;
      },
    },
    input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: false },
  });

  assert.equal(activation.enabled, false);
  assert.equal(onDisabledCalledWith, "word-count");
});

test("REQ-07 (AC-13 state-symmetry half): disable is the exact structural inverse of enable — only `enabled` and `updatedAt` differ, `version` is unchanged", async () => {
  const repo = new InMemoryPluginActivationRepo();

  const { activation: enabled } = await setPluginEnabled({
    deps: { clock: clock("2026-07-28T00:00:00.000Z"), repo, discovery: discoveryOf("valid") },
    input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: true },
  });

  const { activation: disabled } = await setPluginEnabled({
    deps: { clock: clock("2026-07-28T01:00:00.000Z"), repo, discovery: discoveryOf("valid") },
    input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: false },
  });

  assert.equal(disabled.version, enabled.version, "REQ-07: disable must not change the active version pointer");
  assert.equal(disabled.pluginId, enabled.pluginId);
  assert.equal(disabled.workspaceId, enabled.workspaceId);
  assert.equal(disabled.enabled, false);
});

test("state.spec.md §5: getActivation returns null for a plugin that has never been enabled (treated as disabled, not an error)", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const activation = await getActivation({ deps: { repo }, input: { workspaceId: WORKSPACE, pluginId: "never-enabled" } });
  assert.equal(activation, null);
});
