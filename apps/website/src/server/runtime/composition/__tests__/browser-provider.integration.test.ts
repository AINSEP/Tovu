/** Chart plan step 5 / ADR-025 amendment: use the real product artifact and activation owner. */
import assert from "node:assert/strict";
import test from "node:test";
import { createSystemClock } from "@jini-ai/core/primitives";
import { InMemoryPluginActivationRepo, setPluginEnabled } from "@jini-ai/plugins/host";
import { composePluginRuntime } from "../plugin-runtime.js";
import { RECHARTS_BROWSER_APPROVAL, RECHARTS_RUNTIME_SOURCE } from "../charts-recharts-source.js";

function fixture(repo = new InMemoryPluginActivationRepo()) {
  const clock = createSystemClock();
  const runtime = composePluginRuntime({ workspaceId: "site", clock, activationRepo: repo,
    sources: [RECHARTS_RUNTIME_SOURCE], browserProviderApprovals: [RECHARTS_BROWSER_APPROVAL], bundledEnabledIds: ["charts-recharts"] });
  return { repo, clock, runtime };
}

test("step 5: boot enables and admits the bundled provider; disable/reboot preserves the owner's row", async () => {
  const { repo, clock, runtime } = fixture();
  await runtime.attachEnabledPluginsAtBoot();
  assert.equal((await repo.getActivation({ workspaceId: "site", pluginId: "charts-recharts" }))?.enabled, true);
  const admitted = runtime.browserProviders({});
  assert.equal(admitted.providers.length, 1);
  assert.equal(admitted.providers[0]?.declaration.id, "plugin.recharts");
  assert.deepEqual(admitted.providers[0]?.declaration.kinds, ["bar", "line", "pie"]);
  await setPluginEnabled({ deps: { clock, repo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled },
    input: { workspaceId: "site", pluginId: "charts-recharts", enabled: false } });
  assert.deepEqual(runtime.browserProviders({}).providers, []);
  assert.ok(runtime.browserProviders({}).generation > admitted.generation);
  const rebooted = fixture(repo).runtime;
  await rebooted.attachEnabledPluginsAtBoot();
  assert.deepEqual(rebooted.browserProviders({}).providers, []);
  assert.equal((await repo.getActivation({ workspaceId: "site", pluginId: "charts-recharts" }))?.enabled, false);
  await setPluginEnabled({ deps: { clock, repo, discovery: await rebooted.discoverPlugins(), onEnabled: rebooted.onPluginEnabled, onDisabled: rebooted.onPluginDisabled },
    input: { workspaceId: "site", pluginId: "charts-recharts", enabled: true } });
  assert.equal(rebooted.browserProviders({}).providers[0]?.declaration.id, "plugin.recharts");
});

test("step 5: compiled-in source without a review approval never exposes browser assets", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const runtime = composePluginRuntime({ workspaceId: "site", clock: createSystemClock(), activationRepo: repo,
    sources: [RECHARTS_RUNTIME_SOURCE], bundledEnabledIds: ["charts-recharts"] });
  await runtime.attachEnabledPluginsAtBoot();
  assert.deepEqual(runtime.browserProviders({}).providers, []);
  assert.equal(await repo.getActivation({ workspaceId: "site", pluginId: "charts-recharts" }), null);
});

test("step 5: boot leaves a quarantined activation row unchanged", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const row = { pluginId: "charts-recharts", workspaceId: "site", version: "0.1.0", enabled: false,
    updatedAt: "2026-10-13T00:00:00.000Z", quarantinedAt: "2026-10-13T00:00:00.000Z", quarantineReason: "operator review", quarantineFailureCount: 3 };
  await repo.save(row);
  const runtime = fixture(repo).runtime;
  await runtime.attachEnabledPluginsAtBoot();
  assert.deepEqual(await repo.getActivation({ workspaceId: "site", pluginId: "charts-recharts" }), row);
  assert.deepEqual(runtime.browserProviders({}).providers, []);
});
