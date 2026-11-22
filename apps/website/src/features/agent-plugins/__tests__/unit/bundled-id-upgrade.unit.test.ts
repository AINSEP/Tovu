/**
 * @file The publisher-ID upgrade's decisions over injected ports (`bundled-id-upgrade.ts`): what it
 * refuses to move and how it puts a moved copy back. The real-package path is proven in
 * `installed-plugin-id-upgrade.unit.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { RENAMED_BUNDLED_PLUGIN_IDS, restoreUnseededUpgrades, upgradeRenamedBundledPlugins, type BundledIdUpgradePort, type InstalledRevision } from "../../bundled-id-upgrade.js";

const RENAMED = new Map([["cloudflare", { from: "tovu/cloudflare", to: "jini/cloudflare" }]]);
const REVISION: InstalledRevision = { pluginId: "cloudflare", id: "tovu/cloudflare", archiveDigest: "a".repeat(64), packageRoot: "/ws/cloudflare/package/sha256/aaa" };

/** A port over fixed answers that records every rename instead of touching a disk. */
function fakePort({ ledgerDigest = REVISION.archiveDigest, sourceId = "jini/cloudflare", renames = [] as string[][] } = {}): BundledIdUpgradePort {
  return {
    listInstalledPlugins: async () => [REVISION],
    readBundledAgentPluginDigests: async () => new Map([["cloudflare", ledgerDigest]]),
    packAgentPluginDirectory: async () => ({ sha256: REVISION.archiveDigest }),
    readBundledSourceManifest: async () => JSON.stringify({ extensions: { jini: { id: sourceId } } }),
    filesystem: {
      stat: (async () => ({ mode: 0o40555 })) as unknown as BundledIdUpgradePort["filesystem"]["stat"],
      mkdir: (async () => undefined) as BundledIdUpgradePort["filesystem"]["mkdir"],
      chmod: async () => undefined,
      rename: async (from, to) => { renames.push([String(from), String(to)]); },
    },
  };
}

test("a revision the ledger does not name is held, never moved", async () => {
  const renames: string[][] = [];
  const outcomes = await upgradeRenamedBundledPlugins({ workspaceRoot: "/ws", port: fakePort({ ledgerDigest: "b".repeat(64), renames }) }, { renamed: RENAMED });
  assert.deepEqual(outcomes, [{ status: "held", pluginId: "cloudflare", to: "jini/cloudflare", reason: "its installed copy is not the one Tovu installed from its own build" }]);
  assert.deepEqual(renames, []);
});

test("nothing moves when this build does not ship the canonical package", async () => {
  const renames: string[][] = [];
  assert.deepEqual(await upgradeRenamedBundledPlugins({ workspaceRoot: "/ws", port: fakePort({ sourceId: "tovu/cloudflare", renames }) }, { renamed: RENAMED }), []);
  assert.deepEqual(renames, []);
});

test("a moved copy whose replacement did not seed is put back and reported as restored", async () => {
  const renames: string[][] = [];
  const port = fakePort({ renames });
  const upgrades = await upgradeRenamedBundledPlugins({ workspaceRoot: "/ws", port }, { renamed: RENAMED });
  const savedAt = `/ws/.bundled-id-upgrade/cloudflare/${REVISION.archiveDigest}`;
  assert.deepEqual(upgrades, [{ status: "upgraded", pluginId: "cloudflare", to: "jini/cloudflare", moved: [{ packageRoot: REVISION.packageRoot, savedAt }] }]);
  const restored = await restoreUnseededUpgrades({ outcomes: upgrades, seededIds: new Set(), filesystem: port.filesystem });
  assert.equal(restored[0]?.status, "restored");
  assert.deepEqual(renames, [[REVISION.packageRoot, savedAt], [savedAt, REVISION.packageRoot]]);
  assert.deepEqual(await restoreUnseededUpgrades({ outcomes: upgrades, seededIds: new Set(["cloudflare"]), filesystem: port.filesystem }), upgrades);
});

// Measured in combine-11 (cloud-results/combine-11-tovu-b4-plugin-id-upgrade.txt): every bundled package
// @jini-ai/agent-plugins 0.7.2 shipped as `tovu/<id>` and 0.7.3-next.2 ships as `jini/<id>`.
const MEASURED_RENAMES_0_7_2 = [
  "calendly", "cloudflare", "composio", "fly", "github-pages", "github", "google-login", "google-workspace",
  "higgsfield-media", "jev", "meilisearch", "netlify", "opentelemetry", "posthog", "railway", "render", "resend",
  "s3-compatible", "sentry", "shopify", "site-compliance", "site-import", "supabase", "vercel", "wordpress",
];

test("the rename map covers every bundled package 0.7.2 shipped as tovu/<id>", () => {
  const missing = MEASURED_RENAMES_0_7_2.filter(id => RENAMED_BUNDLED_PLUGIN_IDS.get(id)?.from !== `tovu/${id}` || RENAMED_BUNDLED_PLUGIN_IDS.get(id)?.to !== `jini/${id}`);
  assert.deepEqual(missing, [], "a site holding one of these pre-rename copies would keep it and log a seed conflict on every boot");
});
