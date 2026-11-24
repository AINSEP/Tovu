/**
 * @file Tovu's binding of the publisher-ID upgrade (`bundled-id-upgrade.ts`): its rename map and held-reason
 * wording. The upgrade's generic decisions are pinned in `@jini-ai/agent-plugins`
 * (`src/site/__tests__/bundled-id-upgrade.test.ts`); the real-package path is proven in
 * `installed-plugin-id-upgrade.unit.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { BundledIdUpgradePort, InstalledRevision } from "@jini-ai/agent-plugins/site/bundled-id-upgrade";
import { RENAMED_BUNDLED_PLUGIN_IDS, upgradeTovuRenamedBundledPlugins } from "../../bundled-id-upgrade.js";

const REVISION: InstalledRevision = { pluginId: "cloudflare", id: "tovu/cloudflare", archiveDigest: "a".repeat(64), packageRoot: "/ws/cloudflare/package/sha256/aaa" };

test("a revision the ledger does not name is held with Tovu's wording, never moved, using Tovu's rename map", async () => {
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
  assert.deepEqual(await upgradeTovuRenamedBundledPlugins({ workspaceRoot: "/ws", port }),
    [{ status: "held", pluginId: "cloudflare", to: "jini/cloudflare", reason: "its installed copy is not the one Tovu installed from its own build" }]);
  assert.deepEqual(renames, []);
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
