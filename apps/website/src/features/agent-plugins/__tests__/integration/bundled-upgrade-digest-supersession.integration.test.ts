import assert from "node:assert/strict";
import { appendFile, chmod, cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { setAgentPluginActivation } from "../../activation.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { listInstalledPlugins, resolveAgentPluginRefs } from "../../resolve-agent-plugin-refs.js";
import { resolveAgentPluginMcpServers } from "../../federate-mcp.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";
import { loadAgentPluginSearchCandidates, loadInstalledAgentPluginToolSources } from "../../tool-registrations.js";

/**
 * @file The upgrade path `seed-bundled.ts` claims to support, driven end to end against the REAL
 * bundled `content/agent-plugins/site-compliance/` bytes.
 *
 * Seeding is content-addressed and nothing retires a digest, so shipping a NEW VERSION of an
 * already-installed bundled plugin used to land it ALONGSIDE the old one — and both consumption
 * surfaces then refused the plugin outright as ambiguous (`resolve-agent-plugin-refs.ts`'s
 * "refusing to guess which one to use", `tool-registrations.ts`'s `poisonedPluginIds`). A product
 * upgrade therefore silently BROKE every enabled bundled plugin whose bytes it touched.
 *
 * The fix is a per-workspace bundled-digest ledger the seeder writes (`bundled-digests.ts`), so the
 * winner is named by the build's own manifest rather than guessed. This test asserts the OUTCOME
 * — the plugin keeps working across the upgrade and serves the NEW content — rather than the
 * ledger's file format, so it stays honest about the product behaviour and not the mechanism.
 *
 * Deliberately NOT asserted here: that anything was deleted. Superseded bytes stay on disk; this
 * test proves they do.
 */

const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const BUNDLED_SOURCE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PLUGIN_ID = "site-compliance";

/** Content unique enough that finding it in a prompt prefix or a registered tool's skill markdown
 *  can only mean the UPGRADED package was the one resolved. */
const UPGRADE_MARKER = "UPGRADED-BUNDLE-MARKER-9f3c1a it must consult the 2026 accessibility annex";

/** The upgraded bundle's manifest version — what the admin listing and the search tool must report
 *  once the upgrade has been seeded. */
const UPGRADED_VERSION = "9.9.9";

/** The MCP server the upgraded bundle declares and the shipped one does not — so "which package did
 *  federation read" has a visible, binary answer. */
const UPGRADED_MCP_SERVER_KEY = "site-compliance-evidence";

/** `install.ts` freezes published trees to 0o555, so a plain `rm -rf` of a temp install root fails
 *  EACCES. Restores write permission on the way down first — the same wrinkle every other test in
 *  this feature that installs a real package has to handle. */
async function forceRemove(target: string): Promise<void> {
  try {
    const info = await stat(target);
    await chmod(target, 0o700);
    if (info.isDirectory()) {
      for (const entry of await readdir(target)) await forceRemove(path.join(target, entry));
    }
  } catch {
    return;
  }
  await rm(target, { recursive: true, force: true });
}

/** A copy of the REAL bundled source tree with one plugin's eponymous SKILL.md extended — exactly
 *  the shape of a product upgrade that revises a bundled plugin, and enough to change its content
 *  digest. Returns the new source root. */
async function buildUpgradedBundle(): Promise<string> {
  const upgraded = await mkdtemp(path.join(tmpdir(), "tovu-bundled-upgrade-source-"));
  await cp(BUNDLED_SOURCE_ROOT, upgraded, { recursive: true });
  await appendFile(path.join(upgraded, PLUGIN_ID, "skills", PLUGIN_ID, "SKILL.md"), `\n\n## Upgrade\n\n${UPGRADE_MARKER}\n`, "utf8");

  const manifestPath = path.join(upgraded, PLUGIN_ID, "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, version: UPGRADED_VERSION }, null, 2)}\n`, "utf8");

  const mcpPath = path.join(upgraded, PLUGIN_ID, "mcp.json");
  const mcp = JSON.parse(await readFile(mcpPath, "utf8"));
  const mcpServers = { ...mcp.mcpServers, [UPGRADED_MCP_SERVER_KEY]: { type: "streamable-http", url: "https://mcp.example.test/evidence", tovuAuthMode: "none" } };
  await writeFile(mcpPath, `${JSON.stringify({ ...mcp, mcpServers }, null, 2)}\n`, "utf8");
  return upgraded;
}

async function withUpgradeScenario<T>(
  fn: (context: {
    readonly workspaceRoot: string;
    readonly upgradedSourceRoot: string;
    readonly seedFrom: (sourceRoot: string) => Promise<string>;
  }) => Promise<T>,
): Promise<T> {
  const installRoot = await mkdtemp(path.join(tmpdir(), "tovu-bundled-upgrade-"));
  const upgradedSourceRoot = await buildUpgradedBundle();
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = installRoot;
  try {
    /** Runs one "boot" against `sourceRoot` and returns the digest seeded for {@link PLUGIN_ID}. */
    const seedFrom = async (sourceRoot: string): Promise<string> => {
      const result = await seedBundledAgentPlugins({ layout: resolveAgentPluginLayout(), workspaceId: WORKSPACE_ID, sourceRoot });
      const failures = result.outcomes.filter((outcome) => outcome.status === "failed");
      assert.deepEqual(failures, [], `bundled plugins must seed cleanly, got: ${JSON.stringify(failures)}`);
      const seeded = result.outcomes.find((outcome) => outcome.pluginId === PLUGIN_ID);
      assert.ok(seeded && seeded.status === "seeded", `${PLUGIN_ID} must be seeded from ${sourceRoot}`);
      return seeded.archiveDigest;
    };

    return await fn({ workspaceRoot: resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID).root, upgradedSourceRoot, seedFrom });
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(installRoot);
    await forceRemove(upgradedSourceRoot);
  }
}

test("a bundled upgrade of an ENABLED plugin keeps its tool registered, on the NEW digest", async () => {
  await withUpgradeScenario(async ({ workspaceRoot, upgradedSourceRoot, seedFrom }) => {
    const firstDigest = await seedFrom(BUNDLED_SOURCE_ROOT);
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "operator:test" });

    const beforeUpgrade = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID });
    assert.equal(
      beforeUpgrade.find((source) => source.pluginId === PLUGIN_ID)?.archiveDigest,
      firstDigest,
      "precondition: the enabled plugin's tool registers before the upgrade",
    );

    const secondDigest = await seedFrom(upgradedSourceRoot);
    assert.notEqual(secondDigest, firstDigest, "the upgraded bundle must genuinely change the content digest");

    const afterUpgrade = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID });
    const source = afterUpgrade.find((candidate) => candidate.pluginId === PLUGIN_ID);
    assert.ok(source, `'${PLUGIN_ID}' must still be wired as a tool after a bundled upgrade`);
    assert.equal(source.archiveDigest, secondDigest, "the tool must be wired to the digest this build ships, not the retired one");
    assert.ok(
      source.skills.find((skill) => skill.name === PLUGIN_ID)?.markdown.includes(UPGRADE_MARKER),
      "the registered tool must serve the UPGRADED package's skill content",
    );
  });
});

test("a bundled upgrade of an ENABLED plugin keeps run-start injection working, with the NEW content", async () => {
  await withUpgradeScenario(async ({ workspaceRoot, upgradedSourceRoot, seedFrom }) => {
    await seedFrom(BUNDLED_SOURCE_ROOT);
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "operator:test" });
    await seedFrom(upgradedSourceRoot);

    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const injected = await resolveAgentPluginRefs([PLUGIN_ID], layout);

    assert.equal(injected.ok, true, `pinning '${PLUGIN_ID}' must still resolve after a bundled upgrade`);
    assert.ok(injected.ok && injected.promptPrefix.includes(UPGRADE_MARKER), "the prompt prefix must carry the UPGRADED package's skill content");
  });
});

test("the superseded digest's bytes stay on disk — nothing is deleted by an upgrade", async () => {
  await withUpgradeScenario(async ({ upgradedSourceRoot, seedFrom }) => {
    const firstDigest = await seedFrom(BUNDLED_SOURCE_ROOT);
    const secondDigest = await seedFrom(upgradedSourceRoot);

    const layout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID);
    const digestsOnDisk = (await listInstalledPlugins(layout.packages))
      .filter((plugin) => plugin.pluginId === PLUGIN_ID)
      .map((plugin) => plugin.archiveDigest)
      .sort();

    assert.deepEqual(digestsOnDisk, [firstDigest, secondDigest].sort(), "both digests must remain installed; superseding is not deleting");
  });
});

test("the admin listing reports the version the RUNNING build ships, in EITHER seeding order", async () => {
  /** The version the admin listing / search catalog reports for {@link PLUGIN_ID} after booting
   *  once per entry of `order`, each boot against that bundle. */
  const listedVersionAfter = async (order: readonly ("shipped" | "upgraded")[]): Promise<string | undefined> =>
    withUpgradeScenario(async ({ upgradedSourceRoot, seedFrom }) => {
      for (const which of order) await seedFrom(which === "shipped" ? BUNDLED_SOURCE_ROOT : upgradedSourceRoot);
      return (await loadAgentPluginSearchCandidates({ workspaceId: WORKSPACE_ID })).find((candidate) => candidate.pluginId === PLUGIN_ID)?.version;
    });

  const shippedVersion = await listedVersionAfter(["shipped"]);
  assert.ok(shippedVersion !== undefined && shippedVersion !== UPGRADED_VERSION, "precondition: the two bundles must declare different versions");

  // BOTH directions, deliberately. This listing's fallback for an id it cannot disambiguate is
  // "keep the first digest the directory walk returned", which is hex order — so asserting only the
  // forward case would pass or fail on whether the new digest happened to sort first. Exactly one of
  // these two can be satisfied by walk order, so together they can only pass on the ledger.
  assert.equal(await listedVersionAfter(["shipped", "upgraded"]), UPGRADED_VERSION, "after an upgrade, the listing must name the upgraded package");
  assert.equal(await listedVersionAfter(["upgraded", "shipped"]), shippedVersion, "after a rollback, the listing must name the package this build ships again");
});

test("MCP federation reads the RUNNING build's package, in EITHER seeding order", async () => {
  /** The MCP server keys `resolveAgentPluginMcpServers` would provision for {@link PLUGIN_ID} after
   *  booting once per entry of `order`. */
  const serverKeysAfter = async (order: readonly ("shipped" | "upgraded")[]): Promise<readonly string[]> =>
    withUpgradeScenario(async ({ upgradedSourceRoot, seedFrom }) => {
      for (const which of order) await seedFrom(which === "shipped" ? BUNDLED_SOURCE_ROOT : upgradedSourceRoot);
      return Object.keys(await resolveAgentPluginMcpServers({ workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID }));
    });

  // Both directions for the same reason the listing test asserts both — see its own comment. This
  // one matters more: enabling a plugin PROVISIONS these rows, so reading the wrong package here
  // writes real external-MCP state an operator never asked for.
  assert.ok(!(await serverKeysAfter(["shipped"])).includes(UPGRADED_MCP_SERVER_KEY), "precondition: the shipped bundle declares no such server");
  assert.ok((await serverKeysAfter(["shipped", "upgraded"])).includes(UPGRADED_MCP_SERVER_KEY), "after an upgrade, federation must read the upgraded package");
  assert.ok(!(await serverKeysAfter(["upgraded", "shipped"])).includes(UPGRADED_MCP_SERVER_KEY), "after a rollback, federation must read the package this build ships again");
});
