import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { seedBundledAgentPlugins } from "#src/features/agent-plugins/lifecycle";
import { bindProviderFacePorts } from "#src/features/agent-plugins/provider-plugin-link";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { seededWorkspace } from "../../configuration/seed.js";

/**
 * @file One switch in BOTH compositions (plan §2.9): toggling a provider plugin's activation row
 * through the composed `pluginActivationRepo` moves its linked agent plugin face. The SQLite root
 * (`deps.ts`) has always wrapped the repo; the memory root (`app.ts`, TOVU_DB=memory) used a bare
 * in-memory repo, so the face silently stayed where it was until the next boot's sync.
 * The face is a fixture (no vendor): only its `extensions.tovu.providerPlugin` link matters.
 */

const PROVIDER_ID = "fixture-chart-provider";
const FACE_ID = "fixture-chart-face";

/** Point the agent plugin layout at a temp root for this test; restored afterwards. */
async function isolatedAgentPluginsDir(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tovu-face-sync-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = path.join(root, "agent-plugins");
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(root);
  });
  return root;
}

/** Seed the linked face as a bundled agent plugin into `workspaceId`; returns ports that read it. */
async function seedLinkedFace({ root, workspaceId }: { root: string; workspaceId: string }) {
  const sourceRoot = path.join(root, "bundled");
  await mkdir(path.join(sourceRoot, FACE_ID, "skills", FACE_ID), { recursive: true });
  await writeFile(path.join(sourceRoot, FACE_ID, "plugin.json"), JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: FACE_ID, version: "1.0.0",
    extensions: { tovu: { id: `test/${FACE_ID}`, providerPlugin: PROVIDER_ID } },
  }));
  await writeFile(path.join(sourceRoot, FACE_ID, "skills", FACE_ID, "SKILL.md"), `# ${FACE_ID}\n`);
  const layout = resolveAgentPluginLayout({ siteDir: root });
  const seeded = await seedBundledAgentPlugins({ layout, workspaceId, sourceRoot });
  assert.deepEqual(seeded.outcomes.filter((outcome) => outcome.status === "failed"), []);
  return bindProviderFacePorts({ workspaceRoot: () => layout.forWorkspace(workspaceId).root });
}

const providerRow = ({ workspaceId, enabled }: { workspaceId: string; enabled: boolean }) =>
  ({ workspaceId, pluginId: PROVIDER_ID, version: "1.0.0", enabled, updatedAt: "2026-11-02T00:00:00.000Z" });

/** Toggle the provider on, then off, through the composed repo; the face follows each write. */
async function assertFaceFollows({ repo, ports, workspaceId }: {
  repo: { save(record: ReturnType<typeof providerRow>): Promise<void> };
  ports: ReturnType<typeof bindProviderFacePorts>;
  workspaceId: string;
}) {
  assert.equal((await ports.links({})).get(FACE_ID), PROVIDER_ID, "the fixture face is linked");
  await repo.save(providerRow({ workspaceId, enabled: true }));
  assert.equal(await ports.isFaceActive({ pluginId: FACE_ID }), true, "enabling the provider turns its face on");
  await repo.save(providerRow({ workspaceId, enabled: false }));
  assert.equal(await ports.isFaceActive({ pluginId: FACE_ID }), false, "disabling the provider turns its face off");
}

test("memory composition: the provider switch moves its linked face (was a bare repo)", async (t) => {
  const root = await isolatedAgentPluginsDir(t);
  const ports = await seedLinkedFace({ root, workspaceId: seededWorkspace.id });
  const routeDeps = createRouteDeps();
  await assertFaceFollows({ repo: routeDeps.pluginActivationRepo, ports, workspaceId: seededWorkspace.id });
});

test("SQLite composition: the provider switch moves its linked face", async (t) => {
  const root = await isolatedAgentPluginsDir(t);
  const siteDir = path.join(root, "site");
  await mkdir(siteDir);
  await writeFile(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "uuid-face-sync" }));
  let close = async () => {};
  t.after(() => close());
  const routeDeps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
    siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false },
    onStoreOpened: (store) => { close = () => store.close(); },
  });
  await routeDeps.identityReady;
  const ports = await seedLinkedFace({ root, workspaceId: routeDeps.workspaceId });
  await assertFaceFollows({ repo: routeDeps.pluginActivationRepo, ports, workspaceId: routeDeps.workspaceId });
  await routeDeps.pluginRuntimeReady;
});
