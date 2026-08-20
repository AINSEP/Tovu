import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { getActivation, setPluginEnabled, PluginIncompatibleError, PluginInvalidError, PluginNotFoundError } from "../../activation.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import type { PluginDiscoveryRecord } from "../../discovery.js";
import { PluginLoadError } from "../../loader.js";
import { buildAc11FixtureInstallDir } from "../fixtures/ac11-fixture.js";
import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { composePluginRuntime, type PluginRuntimeSource } from "#src/server/plugin-runtime";
import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "../../../../../packages/sdk/src/index.js";
import { PluginHookFailedError } from "../../hook-registry.js";
import { toAdminPluginResponse } from "#src/features/plugin-runtime/admin-response";

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

test("REQ-07: a failed disable side effect restores the prior activation and rethrows the original error", async () => {
  const prior = {
    pluginId: "word-count",
    workspaceId: WORKSPACE,
    version: "1.0.0",
    enabled: true,
    updatedAt: "2026-07-28T00:00:00.000Z",
  } as const;
  const repo = new InMemoryPluginActivationRepo([prior]);
  const originalError = new Error("disable side effect failed");

  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: {
          clock: clock("2026-07-28T02:00:00.000Z"),
          repo,
          discovery: discoveryOf("valid"),
          onDisabled: () => {
            throw originalError;
          },
        },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: false },
      }),
    (error) => error === originalError
  );

  assert.deepEqual(
    await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "word-count" }),
    prior
  );
});

test("REQ-07: a failed first-time disable removes the newly-created activation and rethrows the original error", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const originalError = new Error("first disable side effect failed");

  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: {
          clock: clock(),
          repo,
          discovery: discoveryOf("valid"),
          onDisabled: () => {
            throw originalError;
          },
        },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: false },
      }),
    (error) => error === originalError
  );

  assert.equal(
    await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "word-count" }),
    null
  );
});

test("REQ-07: a compensation failure never masks the original disable side-effect error", async () => {
  const backing = new InMemoryPluginActivationRepo([
    {
      pluginId: "word-count",
      workspaceId: WORKSPACE,
      version: "1.0.0",
      enabled: true,
      updatedAt: "2026-07-28T00:00:00.000Z",
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
  const originalError = new Error("disable side effect failed");

  await assert.rejects(
    () =>
      setPluginEnabled({
        deps: {
          clock: clock("2026-07-28T02:00:00.000Z"),
          repo,
          discovery: discoveryOf("valid"),
          onDisabled: () => {
            throw originalError;
          },
        },
        input: { workspaceId: WORKSPACE, pluginId: "word-count", enabled: false },
      }),
    (error) => error === originalError
  );
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

/**
 * REACHABILITY (Milestone 1 dispatch, 2026-08-20): before this slice, `composePluginRuntime` never
 * forwarded `installDir` to `discoverPluginRuntimePlugins()` — every real composition root
 * (`server/deps.ts`, `server/app.ts`) called it with `sources: [WORD_COUNT_RUNTIME_SOURCE]` and
 * nothing else, so a plugin placed on disk at the REQ-02 install layout was invisible no matter how
 * it got there. `discoverPlugins()` itself already fully implements and tests the install-dir scan
 * (`discovery.integration.test.ts`'s AC-11 fixture) — the gap was purely in this composition seam.
 */
test("REACHABILITY: composePluginRuntime threads installDir through to discoverPlugins — a site-installed plugin on disk is discovered, not just built-ins", async () => {
  const { installDir, builtIns } = await buildAc11FixtureInstallDir();
  try {
    const wordCountSource: PluginRuntimeSource = {
      source: "built-in",
      manifest: builtIns[0]!.manifest,
      entryPath: "built-in:word-count",
      importModule: async () => ({ default: definePlugin({ setup() {} }) }),
    };
    const runtime = composePluginRuntime({
      workspaceId: WORKSPACE,
      clock: clock(),
      activationRepo: new InMemoryPluginActivationRepo(),
      sources: [wordCountSource],
      installDir,
    });

    const discovered = await runtime.discoverPlugins();
    const ids = discovered.map((r) => `${r.source}:${r.id}`).sort();
    assert.deepEqual(
      ids,
      ["built-in:word-count", "site:invalid-site-plugin", "site:valid-site-plugin"],
      "both site-installed plugins (valid and invalid) must be reachable through the SAME bound discoverPlugins() a real composition root hands to the routes, not just the built-in"
    );
  } finally {
    await rm(installDir, { recursive: true, force: true });
  }
});

/**
 * GAP CLOSED (Milestone 1b, 2026-08-20 — was "KNOWN GAP" under Milestone 1): `onPluginEnabled()`
 * used to resolve its load source ONLY via `sources.find(c => c.manifest.id === pluginId)` — the
 * composition root's static, compiled-in list — so a site-installed plugin was rejected as
 * `PLUGIN_EXPORT_INVALID` before `loadPlugin()` ever ran, tampered or not, and a valid one could
 * never actually be enabled. `resolveLoadTarget()` (`server/plugin-runtime.ts`) now derives a site
 * plugin's load target from its OWN discovery record (`record.manifest` + `siteEntryPath()`), so
 * this attempt genuinely reaches `loadPlugin()`'s real BR-01 pipeline. The distinguishing proof
 * this test now makes — the reason the team lead specifically asked to isolate — is that the
 * rejection is `INTEGRITY_FAILED` (step 1 of `loadPlugin()`), NOT `PLUGIN_EXPORT_INVALID` (which
 * would mean it never got past source resolution) and NOT `CODE_ENTRY_MISSING` (which would mean
 * step 3, `import()`, ran and only then failed). Only `INTEGRITY_FAILED` proves the tamper was
 * caught at the correct step, before any `import()` of this plugin's code.
 */
test("REACHABILITY + CIC U-001: a tampered site-installed plugin discovered via installDir reaches the real load pipeline and fails at the INTEGRITY step, not at source resolution", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-reachability-tampered-"));
  const installDir = path.join(root, "plugins");
  try {
    const versionDir = path.join(installDir, "tampered-plugin", "1.0.0");
    await mkdir(path.join(versionDir, "server"), { recursive: true });
    const entryContents = "export default { setup() {} };\n";
    await writeFile(path.join(versionDir, "server", "index.mjs"), entryContents, "utf8");
    // The manifest's recorded hash deliberately does NOT match the bytes just written — a tamper,
    // by construction (mirrors `loader.integration.test.ts`'s own tampered-fixture pattern).
    const wrongHash = `sha256-${createHash("sha256").update("not what is on disk", "utf8").digest("hex")}`;
    await writeFile(
      path.join(versionDir, "tovu.plugin.json"),
      JSON.stringify({
        id: "tampered-plugin",
        name: "Tampered Plugin",
        version: "1.0.0",
        sdkRange: "^1.0.0",
        engine: 1,
        tier: "tier-3",
        capabilities: [],
        hooks: [],
        fields: [],
        integrity: { "server/index.mjs": wrongHash },
      }),
      "utf8"
    );

    const runtime = composePluginRuntime({
      workspaceId: WORKSPACE,
      clock: clock(),
      activationRepo: new InMemoryPluginActivationRepo(),
      sources: [],
      installDir,
    });

    const discovered = await runtime.discoverPlugins();
    assert.equal(
      discovered.find((r) => r.id === "tampered-plugin")?.status,
      "valid",
      "discovery does not read file bytes (manifest.ts's own doc) — a tamper is invisible until load time, by design"
    );

    await assert.rejects(
      () => runtime.onPluginEnabled("tampered-plugin"),
      (error: unknown) => {
        assert.ok(error instanceof PluginLoadError, "must be a PluginLoadError, not some other thrown value");
        assert.equal(
          (error as PluginLoadError).reason,
          "INTEGRITY_FAILED",
          `expected INTEGRITY_FAILED (loadPlugin's step 1) — got '${(error as PluginLoadError).reason}'. ` +
            "PLUGIN_EXPORT_INVALID would mean this was rejected before reaching loadPlugin() at all; " +
            "CODE_ENTRY_MISSING/anything else would mean import() already ran. Only INTEGRITY_FAILED " +
            "proves the tamper was caught at the right step, before any import()."
        );
        return true;
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * Milestone 1b's headline capability: a VALID site-installed plugin — not just a tampered one —
 * can now actually be enabled end to end through `onPluginEnabled()`, using a real `import()` of
 * its on-disk `server/index.mjs` (no test-injected `importModule`; this is the plugin's manifest
 * exactly as `discoverPlugins()` parsed it, and the real dynamic-import default `loadPlugin()`
 * falls back to when its `importModule` option is omitted — see `resolveLoadTarget()`'s own doc for
 * why a site target never supplies one). Proves setup() actually ran (its filter is reachable via
 * `beforeSaveHook`), not merely that `loaded: true` was returned.
 */
test("Milestone 1b: a VALID site-installed plugin discovered via installDir can be enabled end to end — real import(), setup() runs, filter attaches", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-reachability-valid-"));
  const installDir = path.join(root, "plugins");
  try {
    const versionDir = path.join(installDir, "greeter-plugin", "1.0.0");
    await mkdir(path.join(versionDir, "server"), { recursive: true });
    // A real ESM module, actually `import()`-ed by this test (no injected importModule) — proves
    // this is the genuine dynamic-import path, not a simulated one.
    const entryContents = [
      "export default {",
      "  definition: {",
      "    setup(sdk) {",
      "      sdk.addFilter('content.entry.beforeSave', async () => ({ greeting: 'hello from disk' }));",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n");
    await writeFile(path.join(versionDir, "server", "index.mjs"), entryContents, "utf8");
    const correctHash = `sha256-${createHash("sha256").update(entryContents, "utf8").digest("hex")}`;
    await writeFile(
      path.join(versionDir, "tovu.plugin.json"),
      JSON.stringify({
        id: "greeter-plugin",
        name: "Greeter Plugin",
        version: "1.0.0",
        sdkRange: "^0.1.0",
        engine: 1,
        tier: "tier-3",
        capabilities: ["hooks.attach"],
        hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE],
        fields: [{ path: "ext.greeter-plugin.greeting", type: "string", queryable: false }],
        integrity: { "server/index.mjs": correctHash },
      }),
      "utf8"
    );

    const runtime = composePluginRuntime({
      workspaceId: WORKSPACE,
      clock: clock(),
      activationRepo: new InMemoryPluginActivationRepo(),
      sources: [],
      installDir,
    });

    const discovery = await runtime.discoverPlugins();
    const record = discovery.find((r) => r.id === "greeter-plugin");
    assert.equal(record?.status, "valid");
    assert.equal(record?.source, "site");

    // The point of this test: this must NOT throw. Before Milestone 1b it always threw
    // PluginLoadError("PLUGIN_EXPORT_INVALID") for every site plugin, valid or not.
    await runtime.onPluginEnabled("greeter-plugin");

    const entry = {
      id: "entry-1",
      workspaceId: WORKSPACE,
      title: "Entry",
      slug: "entry",
      status: "draft" as const,
      bodyJson: {},
      ext: {},
    };
    assert.deepEqual(
      await runtime.beforeSaveHook(entry),
      { "greeter-plugin": { greeting: "hello from disk" } },
      "setup()'s addFilter callback must actually have run through the real import() — not a no-op enable"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * Defense-in-depth branch (`resolveLoadTarget()`'s final `return null`): in the real HTTP flow,
 * `onPluginEnabled` is only ever reached after `setPluginEnabled`'s BR-05 step 2 already confirmed
 * `discovered.status === "valid"` — so a "site" record with no `manifest` should never reach here
 * through that path. This test calls `onPluginEnabled` DIRECTLY (as `set-enabled.ts`'s own rollback
 * path can, restoring a plugin that was invalid at the time of a later re-discovery) for a site
 * plugin discovery already marks `invalid`, proving the fallback stays fail-closed rather than
 * throwing an unrelated error (e.g. a raw `TypeError` from reading fields off `undefined`).
 */
test("resolveLoadTarget defense in depth: onPluginEnabled called directly for a discovered-but-INVALID site plugin fails closed with PLUGIN_EXPORT_INVALID, never reaches loadPlugin", async () => {
  const { installDir } = await buildAc11FixtureInstallDir();
  try {
    const runtime = composePluginRuntime({
      workspaceId: WORKSPACE,
      clock: clock(),
      activationRepo: new InMemoryPluginActivationRepo(),
      sources: [],
      installDir,
    });

    const discovery = await runtime.discoverPlugins();
    const record = discovery.find((r) => r.id === "invalid-site-plugin");
    assert.equal(record?.status, "invalid", "fixture precondition: invalid-site-plugin must actually be invalid");
    assert.equal(record?.manifest, undefined, "an invalid record must never carry a manifest (see the field's own doc)");

    await assert.rejects(
      () => runtime.onPluginEnabled("invalid-site-plugin"),
      (error: unknown) => error instanceof PluginLoadError && error.reason === "PLUGIN_EXPORT_INVALID"
    );
  } finally {
    await rm(installDir, { recursive: true, force: true });
  }
});
