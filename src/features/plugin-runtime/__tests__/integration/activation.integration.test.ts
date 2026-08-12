import assert from "node:assert/strict";
import test from "node:test";

import { getActivation, setPluginEnabled, PluginIncompatibleError, PluginInvalidError, PluginNotFoundError } from "../../activation";
import { InMemoryPluginActivationRepo } from "../../repo.memory";
import type { PluginDiscoveryRecord } from "../../discovery";
import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { composePluginRuntime, type PluginRuntimeSource } from "#src/server/plugin-runtime";
import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "../../../../../packages/sdk/src/index";
import { PluginHookFailedError } from "../../hook-registry";
import { toAdminPluginResponse } from "#src/server/http/admin/plugins";

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

test("AC-01 end to end: enabling word-count through the documented HTTP path runs setup, attaches its filter, and invokes it on content save", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const pluginsBase = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;

  const enableResponse = await fetch(`${pluginsBase}/word-count`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  if (enableResponse.status !== 200) {
    assert.fail(`enable returned ${enableResponse.status}: ${await enableResponse.text()}`);
  }

  const changeSetsAfterEnable = await deps.changeSets.listByWorkspace({ workspaceId: deps.workspaceId });
  const saveResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/posts`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Plugin wire proof",
      slug: "plugin-wire-proof",
      status: "draft",
      bodyJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "one two three four five" }] }],
      },
    }),
  });
  if (saveResponse.status !== 201) {
    assert.fail(`save returned ${saveResponse.status}: ${await saveResponse.text()}`);
  }

  const saved = (await saveResponse.json()) as {
    post: { ext?: { "word-count"?: { count?: number } } };
  };
  assert.equal(
    saved.post.ext?.["word-count"]?.count,
    5,
    "word-count's setup() must attach the filter that contributes ext.word-count.count"
  );

  const changeSetsAfterSave = await deps.changeSets.listByWorkspace({ workspaceId: deps.workspaceId });
  assert.equal(changeSetsAfterSave.length, changeSetsAfterEnable.length + 1, "the content save must record one change set");
});

test("auto-quarantine end to end: repeated hook failures persist disabled metadata, detach immediately, and operator re-enable clears it", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const testClock = clock("2026-08-12T12:00:00.000Z");
  let shouldThrow = true;
  const source: PluginRuntimeSource = {
    source: "built-in",
    entryPath: "built-in:throwing-plugin",
    manifest: {
      id: "throwing-plugin",
      name: "Throwing Plugin",
      version: "1.0.0",
      sdkRange: "^0.1.0",
      engine: 1,
      tier: "tier-3",
      capabilities: ["hooks.attach"],
      hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE],
      fields: [{ path: "ext.throwing-plugin.ok", type: "boolean", queryable: false }],
      integrity: {},
    },
    importModule: async () => ({
      default: definePlugin({
        setup(sdk) {
          sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, async () => {
            if (shouldThrow) throw new Error("save blocker");
            return { ok: true };
          });
        },
      }),
    }),
  };
  const runtime = composePluginRuntime({
    workspaceId: WORKSPACE,
    clock: testClock,
    activationRepo: repo,
    sources: [source],
    failureThreshold: 2,
  });
  const discovery = await runtime.discoverPlugins();

  await setPluginEnabled({
    deps: {
      clock: testClock,
      repo,
      discovery,
      onEnabled: runtime.onPluginEnabled,
      onDisabled: runtime.onPluginDisabled,
    },
    input: { workspaceId: WORKSPACE, pluginId: source.manifest.id, enabled: true },
  });

  const entry = {
    id: "entry-1",
    workspaceId: WORKSPACE,
    title: "Entry",
    slug: "entry",
    status: "draft" as const,
    bodyJson: {},
    ext: {},
  };
  await assert.rejects(() => runtime.beforeSaveHook(entry), PluginHookFailedError);
  await assert.rejects(() => runtime.beforeSaveHook(entry), PluginHookFailedError);

  const quarantined = await repo.getActivation({ workspaceId: WORKSPACE, pluginId: source.manifest.id });
  assert.equal(quarantined?.enabled, false);
  assert.equal(quarantined?.quarantinedAt, "2026-08-12T12:00:00.000Z");
  assert.equal(quarantined?.quarantineFailureCount, 2);
  assert.match(quarantined?.quarantineReason ?? "", /save blocker/);
  assert.deepEqual(toAdminPluginResponse(discovery[0]!, quarantined).quarantine, {
    at: "2026-08-12T12:00:00.000Z",
    reason: "plugin 'throwing-plugin' content.entry.beforeSave filter failed: save blocker",
    consecutiveFailures: 2,
  });
  assert.deepEqual(await runtime.beforeSaveHook(entry), {}, "the detached filter must stop blocking the next save");

  shouldThrow = false;
  const { activation: reEnabled } = await setPluginEnabled({
    deps: {
      clock: testClock,
      repo,
      discovery,
      onEnabled: runtime.onPluginEnabled,
      onDisabled: runtime.onPluginDisabled,
    },
    input: { workspaceId: WORKSPACE, pluginId: source.manifest.id, enabled: true },
  });
  assert.equal(reEnabled.enabled, true);
  assert.equal(reEnabled.quarantinedAt ?? null, null);
  assert.equal(toAdminPluginResponse(discovery[0]!, reEnabled).quarantine, null);
  assert.deepEqual(await runtime.beforeSaveHook(entry), { "throwing-plugin": { ok: true } });
});
