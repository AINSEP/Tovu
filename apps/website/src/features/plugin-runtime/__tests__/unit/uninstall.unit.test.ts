import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import type { PluginDiscoveryRecord } from "../../discovery.js";
import { PluginChangedSincePreviewError, uninstallPlugin, type UninstallPluginRequired } from "../../uninstall.js";

/**
 * @file `uninstallPlugin()`'s `confirmedPreview` binding — t91 F2.2. B-T7 failed at this commit's
 * parent (the file failed to load: `../../uninstall.js` did not yet export
 * `PluginChangedSincePreviewError`).
 */

const SITE: PluginDiscoveryRecord = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  source: "site",
  tier: "tier-3",
  status: "valid",
  errors: [],
};

function requestFor(record: PluginDiscoveryRecord, repo: InMemoryPluginActivationRepo, calls: string[]): UninstallPluginRequired {
  return {
    deps: { repo, discovery: [record], onUninstall: async (id: string) => void calls.push(id) },
    input: { pluginId: record.id },
  };
}

test("a confirmed preview refuses when the record's version no longer matches the previewed version", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ pluginId: "my-plugin", workspaceId: "ws-1", version: "1.0.0", enabled: false, updatedAt: "2026-09-16T00:00:00.000Z" });
  const calls: string[] = [];
  const changed: PluginDiscoveryRecord = { ...SITE, version: "2.0.0" };

  await assert.rejects(
    () => uninstallPlugin(requestFor(changed, repo, calls), { confirmedPreview: { pluginId: "my-plugin", name: "My Plugin", version: "1.0.0" } }),
    (error: unknown) =>
      error instanceof PluginChangedSincePreviewError &&
      error.message === "plugin 'my-plugin' changed after its uninstall was previewed (previewed My Plugin 1.0.0; now My Plugin 2.0.0) — nothing was removed",
  );
  assert.deepEqual(calls, []);
  assert.equal((await repo.listAll()).length, 1);
});

test("a confirmed preview refuses when the record's NAME changed but its version did not", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ pluginId: "my-plugin", workspaceId: "ws-1", version: "1.0.0", enabled: false, updatedAt: "2026-09-16T00:00:00.000Z" });
  const calls: string[] = [];
  const renamed: PluginDiscoveryRecord = { ...SITE, name: "Someone Else's Plugin" };

  await assert.rejects(
    () => uninstallPlugin(requestFor(renamed, repo, calls), { confirmedPreview: { pluginId: "my-plugin", name: "My Plugin", version: "1.0.0" } }),
    (error: unknown) =>
      error instanceof PluginChangedSincePreviewError &&
      error.message ===
        "plugin 'my-plugin' changed after its uninstall was previewed (previewed My Plugin 1.0.0; now Someone Else's Plugin 1.0.0) — nothing was removed",
  );
  assert.deepEqual(calls, []);
  assert.equal((await repo.listAll()).length, 1);
});

test("guard: an unchanged confirmed preview uninstalls normally", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ pluginId: "my-plugin", workspaceId: "ws-1", version: "1.0.0", enabled: false, updatedAt: "2026-09-16T00:00:00.000Z" });
  const calls: string[] = [];

  const result = await uninstallPlugin(requestFor(SITE, repo, calls), {
    confirmedPreview: { pluginId: "my-plugin", name: "My Plugin", version: "1.0.0" },
  });

  assert.deepEqual(result, { clearedWorkspaceIds: ["ws-1"] });
  assert.deepEqual(calls, ["my-plugin"]);
});

test("guard: no optional argument (the admin route path) uninstalls normally regardless of version", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ pluginId: "my-plugin", workspaceId: "ws-1", version: "1.0.0", enabled: false, updatedAt: "2026-09-16T00:00:00.000Z" });
  const calls: string[] = [];
  const changed: PluginDiscoveryRecord = { ...SITE, version: "2.0.0" };

  const result = await uninstallPlugin(requestFor(changed, repo, calls));

  assert.deepEqual(result, { clearedWorkspaceIds: ["ws-1"] });
  assert.deepEqual(calls, ["my-plugin"]);
});
