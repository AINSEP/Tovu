import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { PluginActivationRecord } from "@jini-ai/plugins/host";
import { sqlitePluginActivationRepoFor } from "../repo.sqlite.js";

/**
 * @file The plugin-activation repo on every dialect through the kernel's matrix
 * (`describeEachDialect` + ONE factory). Covers every public method: hit, miss, upsert (including
 * clearing quarantine fields), other-workspace isolation and rollback.
 */

const WS = "ws-dialects";
const OTHER = "ws-other";
const T0 = "2026-09-28T00:00:00.000Z";
const T1 = "2026-09-28T01:00:00.000Z";

function activation(pluginId: string, overrides: Partial<PluginActivationRecord> = {}): PluginActivationRecord {
  return { pluginId, workspaceId: WS, version: "1.0.0", enabled: true, updatedAt: T0, ...overrides };
}

function repos(kernel: ContentKernel) {
  return { kernel, repo: sqlitePluginActivationRepoFor({ store: kernel }, {}) };
}

describeEachDialect("plugin activation repo", { tables: ["plugin_activations"], make: repos }, (makeRepos) => {
  test("save then getActivation round-trips, enabled as a boolean and no quarantine keys", async () => {
    const { repo } = makeRepos();
    await repo.save(activation("p1"));
    await repo.save(activation("p2", { enabled: false }));
    assert.deepEqual(await repo.getActivation({ workspaceId: WS, pluginId: "p1" }), activation("p1"));
    assert.deepEqual(await repo.getActivation({ workspaceId: WS, pluginId: "p2" }), activation("p2", { enabled: false }));
  });

  test("getActivation misses unknown plugins and other workspaces", async () => {
    const { repo } = makeRepos();
    await repo.save(activation("p1"));
    assert.equal(await repo.getActivation({ workspaceId: WS, pluginId: "nope" }), null);
    assert.equal(await repo.getActivation({ workspaceId: OTHER, pluginId: "p1" }), null);
  });

  test("save upserts on (workspace, plugin): quarantine fields round-trip and clear again", async () => {
    const { repo } = makeRepos();
    await repo.save(activation("p1"));
    await repo.save(activation("p1", { workspaceId: OTHER }));
    const quarantined = activation("p1", {
      enabled: false,
      version: "1.1.0",
      updatedAt: T1,
      quarantinedAt: T1,
      quarantineReason: "crashed",
      quarantineFailureCount: 3,
    });
    await repo.save(quarantined);
    assert.deepEqual(await repo.getActivation({ workspaceId: WS, pluginId: "p1" }), quarantined);
    await repo.save(activation("p1", { updatedAt: T1 }));
    assert.deepEqual(await repo.getActivation({ workspaceId: WS, pluginId: "p1" }), activation("p1", { updatedAt: T1 }));
    assert.deepEqual(
      await repo.getActivation({ workspaceId: OTHER, pluginId: "p1" }),
      activation("p1", { workspaceId: OTHER })
    );
  });

  test("deleteActivation removes only the named row; deleting a missing row is a no-op", async () => {
    const { repo } = makeRepos();
    await repo.save(activation("p1"));
    await repo.save(activation("p2"));
    await repo.save(activation("p1", { workspaceId: OTHER }));
    await repo.deleteActivation({ workspaceId: WS, pluginId: "p1" });
    await repo.deleteActivation({ workspaceId: WS, pluginId: "nope" });
    assert.equal(await repo.getActivation({ workspaceId: WS, pluginId: "p1" }), null);
    const left = (await repo.listAll()).map((r) => `${r.workspaceId}/${r.pluginId}`).sort();
    assert.deepEqual(left, [`${WS}/p2`, `${OTHER}/p1`]);
  });

  test("listAll is empty on a fresh database", async () => {
    const { repo } = makeRepos();
    assert.deepEqual(await repo.listAll(), []);
  });

  test("writes inside a failed transaction roll back", async () => {
    const { kernel, repo } = makeRepos();
    await repo.save(activation("p1"));
    await assert.rejects(
      kernel.transaction(async () => {
        await repo.save(activation("p1", { enabled: false, updatedAt: T1 }));
        await repo.save(activation("p2"));
        await repo.deleteActivation({ workspaceId: WS, pluginId: "p1" });
        throw new Error("boom");
      }),
      /boom/
    );
    assert.deepEqual(await repo.listAll(), [activation("p1")]);
  });
});
