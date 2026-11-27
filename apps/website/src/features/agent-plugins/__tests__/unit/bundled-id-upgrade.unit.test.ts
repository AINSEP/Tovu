/**
 * @file Tovu's binding of the publisher-ID upgrade (`bundled-id-upgrade.ts`): its rename map and held-reason
 * wording. The upgrade's generic decisions are pinned in `@jini-ai/agent-plugins`
 * (`src/site/__tests__/bundled-id-upgrade.test.ts`); the real-package path is proven in
 * `installed-plugin-id-upgrade.unit.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { BundledIdUpgradePort, InstalledRevision } from "@jini-ai/agent-plugins/site/bundled-id-upgrade";
import { MEASURED_RENAMES_0_7_2 } from "../../../plugins/__tests__/fixtures/measured-renames-0-7-2.js";
import { RENAMED_BUNDLED_PLUGIN_IDS, seedWithTovuRenamedBundledPlugins, upgradeTovuRenamedBundledPlugins } from "../../bundled-id-upgrade.js";

const REVISION: InstalledRevision = { pluginId: "cloudflare", id: "tovu/cloudflare", archiveDigest: "a".repeat(64), packageRoot: "/ws/cloudflare/package/sha256/aaa" };

function mismatchedLedger() {
  const renames: string[][] = [];
  const port: BundledIdUpgradePort = {
    listInstalledPlugins: async () => [REVISION],
    readBundledAgentPluginDigests: async () => new Map([["cloudflare", "b".repeat(64)]]),
    packAgentPluginDirectory: async () => ({ sha256: REVISION.archiveDigest }),
    readBundledSourceManifest: async () => JSON.stringify({ extensions: { jini: { id: "jini/cloudflare" } } }),
    filesystem: {
      stat: (async () => ({ mode: 0o40555 })) as unknown as BundledIdUpgradePort["filesystem"]["stat"],
      mkdir: (async () => undefined) as BundledIdUpgradePort["filesystem"]["mkdir"],
      chmod: async () => undefined,
      rename: async (from, to) => { renames.push([String(from), String(to)]); },
    },
  };
  return { port, renames };
}

test("a revision the ledger does not name is held with Tovu's wording, never moved, using Tovu's rename map", async () => {
  const { port, renames } = mismatchedLedger();
  assert.deepEqual(await upgradeTovuRenamedBundledPlugins({ workspaceRoot: "/ws", port }),
    [{ status: "held", pluginId: "cloudflare", to: "jini/cloudflare", reason: "its installed copy is not the one Tovu installed from its own build" }]);
  assert.deepEqual(renames, []);
});

test("the rename map covers every bundled package 0.7.2 shipped as tovu/<id>", () => {
  const missing = MEASURED_RENAMES_0_7_2.filter(id => RENAMED_BUNDLED_PLUGIN_IDS.get(id)?.from !== `tovu/${id}` || RENAMED_BUNDLED_PLUGIN_IDS.get(id)?.to !== `jini/${id}`);
  assert.deepEqual(missing, [], "a site holding one of these pre-rename copies would keep it and log a seed conflict on every boot");
  assert.deepEqual([...RENAMED_BUNDLED_PLUGIN_IDS.keys()].sort(), [...MEASURED_RENAMES_0_7_2].sort(), "upgrades must not move packages outside the measured rename cohort");
});

test("startup seeding receives the blocked legacy ID and reason inside the workspace lock", async () => {
  const { port, renames } = mismatchedLedger();
  const events: string[] = [];
  let held = false;
  const ownership = { workspaceRoot: "/ws", lockPath: "/ws/.agent-plugin-layout-migrated.lock", isHeld: () => held };
  const reason = "its installed copy is not the one Tovu installed from its own build";
  const seeded = { outcomes: [{ pluginId: "another-plugin", status: "seeded" }] };
  const result = await seedWithTovuRenamedBundledPlugins({
    workspaceRoot: "/ws", port,
    withWorkspaceLock: async ({ workspaceRoot, run }) => {
      assert.equal(workspaceRoot, "/ws");
      held = true;
      events.push("lock");
      try { return await run({ ownership }); } finally { held = false; events.push("unlock"); }
    },
    seed: async ({ ownership: passed, heldPluginIds }) => {
      assert.equal(passed, ownership);
      assert.equal(passed.isHeld(), true);
      assert.deepEqual([...heldPluginIds], [["cloudflare", reason]]);
      events.push("seed");
      return seeded;
    },
  });
  assert.deepEqual(result, { seeded, idUpgrades: [{ status: "held", pluginId: "cloudflare", to: "jini/cloudflare", reason }] });
  assert.deepEqual(renames, []);
  assert.deepEqual(events, ["lock", "seed", "unlock"]);
});
