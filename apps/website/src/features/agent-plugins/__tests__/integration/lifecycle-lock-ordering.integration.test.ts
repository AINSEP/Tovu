/**
 * @file P2-T5.0 lock ordering through the real Tovu lifecycle binding: the real file-lock adapter and a
 * temporary site. The workspace layout-migration lock is outermost and held from before the
 * publisher-ID move through seed and put-back; the seed's `migrateBeforeSeed` seam migrates under that
 * held ownership without reacquiring it; another workspace's lock is never taken while one is held.
 * Each workspace starts in the legacy layout, so the migration does real moves (not a marker no-op).
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createTovuAgentPluginLifecycle } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { migrateAgentPluginLayout, withAgentPluginWorkspaceLock } from "../../memory.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { selectedPluginSourceRoot } from "../fixtures/bundled-source-root.js";

const WORKSPACE = "workspace-local";
const SIBLING = "workspace-other";
const DIGEST = "e".repeat(64);
// A reacquired lock waits 15 s for itself before failing; this bound makes that a test failure.
const BOUNDED = { timeout: 12_000 };

async function boundSite(t: TestContext) {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "tovu-lock-order-")));
  t.after(() => forceRemove(dir));
  const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  const lifecycle = createTovuAgentPluginLifecycle({ layout });
  const source = await selectedPluginSourceRoot({ pluginIds: ["cloudflare"] });
  t.after(() => source.dispose());
  return { layout, lifecycle, sourceRoot: source.root, rootOf: (workspaceId: string) => layout.forWorkspace({ workspaceId }).root };
}
/** One legacy-layout package in a workspace; returns its legacy path and its migrated path. */
async function legacyPackage(workspaceRoot: string) {
  const legacy = path.join(workspaceRoot, "packages", "sha256", DIGEST);
  await mkdir(legacy, { recursive: true });
  await writeFile(path.join(legacy, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "legacy-one" }));
  return { legacy, migrated: path.join(workspaceRoot, "legacy-one", "package", "sha256", DIGEST) };
}
const exists = (target: string) => stat(target).then(() => true, () => false);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const contain = async ({ root, entryPath }: { root: string; entryPath: string }) => path.resolve(root, entryPath);
/** Holds one workspace's real migration lock until `release` is called. */
async function holdWorkspace(workspaceRoot: string) {
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const inside = new Promise<void>(resolve => { entered = resolve; });
  const held = withAgentPluginWorkspaceLock({ workspaceRoot, run: async () => { entered(); await gate; } });
  await inside;
  return { release: async () => { release(); await held; } };
}

test("a seed cannot enter migration work while another contender owns the workspace window, then proceeds", BOUNDED, async t => {
  const { layout, lifecycle, sourceRoot, rootOf } = await boundSite(t);
  const { legacy, migrated } = await legacyPackage(rootOf(WORKSPACE));
  const first = await holdWorkspace(rootOf(WORKSPACE));
  let settled = false;
  const second = lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot }).finally(() => { settled = true; });
  await sleep(400);
  assert.equal(settled, false, "the second contender waits on the held workspace lock");
  assert.equal(await exists(legacy), true, "no migration work ran inside the held window");
  await first.release();
  const report = await second;
  assert.equal(await exists(migrated), true, "after release the second contender migrated the legacy package");
  assert.deepEqual(report.outcomes.map(outcome => [outcome.pluginId, outcome.status]), [["cloudflare", "seeded"]]);
});

test("the migrateBeforeSeed seam migrates under the held ownership and seed completes without reacquiring", BOUNDED, async t => {
  const { layout, lifecycle, sourceRoot, rootOf } = await boundSite(t);
  const { legacy, migrated } = await legacyPackage(rootOf(WORKSPACE));
  const report = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot });
  assert.deepEqual(report.outcomes.map(outcome => [outcome.pluginId, outcome.status]), [["cloudflare", "seeded"]]);
  assert.equal(await exists(legacy), false);
  assert.equal(await exists(migrated), true);
});

test("a sibling workspace migrates before this workspace's lock is taken, never while it is held", BOUNDED, async t => {
  const { layout, lifecycle, sourceRoot, rootOf } = await boundSite(t);
  const sibling = await legacyPackage(rootOf(SIBLING));
  const active = await legacyPackage(rootOf(WORKSPACE));
  const siblingHold = await holdWorkspace(rootOf(SIBLING));
  let settled = false;
  const seeding = lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot }).finally(() => { settled = true; });
  await sleep(400);
  // The seed is blocked on the sibling's lock, yet this workspace's lock is free: a direct migration takes it at once.
  assert.deepEqual(await migrateAgentPluginLayout({ contain, layout, workspaceId: WORKSPACE }), { complete: true, moved: 1 });
  assert.equal(await exists(active.migrated), true);
  assert.equal(settled, false, "the seed is still waiting for the sibling workspace");
  await siblingHold.release();
  await seeding;
  assert.equal(await exists(sibling.migrated), true, "the sibling migrated once its own lock was free");
});
