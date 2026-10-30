import { resolveSiteRoot } from "#src/platform/site-dir/index";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";
import { ACTIVATIONS_FILENAME } from "@jini-ai/agent-plugins/lifecycle";
import {
  BUNDLED_DIGESTS_FILENAME,
  readBundledAgentPluginDigests,
  recordBundledAgentPluginDigests,
  removeBundledAgentPluginDigest,
} from "../../lifecycle.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { listInstalledPlugins } from "../../lifecycle.js";
import { RETIRED_BUNDLED_AGENT_PLUGINS, retireBundledAgentPlugins } from "../../lifecycle.js";
import { seedBundledAgentPlugins } from "../../lifecycle.js";
import { AgentPluginNotUninstallableError, uninstallAgentPlugin } from "../../lifecycle.js";

/**
 * @file `retireBundledAgentPlugins()` — the boot migration that removes `tovu-deploy-fly` (merged
 * into `deploy`, 2026-09-29, now straight into `fly`), `create-tovu-theme` + `tovuize-site` (merged
 * into `tovu-theme`, 2026-10-06) and `deploy` (split across fly, render, railway, github and the
 * static hosts, Phase B7 2026-10-12) from a workspace and keeps their users' capability on.
 *
 * The mechanics tests below still use `tovu-deploy-fly` -> `deploy` as an explicit test map: only
 * the ids are borrowed, the product map is asserted on its own.
 *
 * Every test builds the real on-disk shape a workspace has after earlier boots: packages installed
 * through `installAgentPlugin`, records written by the seeder's own `recordBundledAgentPluginIfAbsent`
 * (or an operator's `setAgentPluginActivation`), and the seeder's own digest ledger.
 */

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const RETIRED = "tovu-deploy-fly";
const SUCCESSOR = "deploy";
/** The mechanics tests below assert whole outcome lists, so they retire only `tovu-deploy-fly`;
 *  the theme merge's own tests at the end of this file run the real map. */
const ONLY_FLY = { retired: new Map([[RETIRED, SUCCESSOR]]) };

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

function fileEntry(entryPath: string, content: string): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file",
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
  } as AgentPluginArchiveEntry;
}

async function freshLayout() {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-retire-test-"));
  const layout = resolveAgentPluginLayout({ siteDir: resolveSiteRoot({ env: {}, cwd: cwd }) }, { env: {} });
  return { cwd, layout, workspaceLayout: layout.forWorkspace(WORKSPACE_ID) };
}

async function installPackage(layout: ReturnType<typeof resolveAgentPluginLayout>, pluginId: string, archiveLabel: string) {
  const manifest = JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" });
  const archive = new Uint8Array(Buffer.from(archiveLabel));
  return installAgentPlugin({
    archive,
    expectedSha256: createHash("sha256").update(archive).digest("hex"),
    archiveReader: reader([fileEntry("plugin.json", manifest), fileEntry(`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`)]),
    layout,
    workspaceId: WORKSPACE_ID,
  });
}

/** The state a workspace is in after booting a build that still shipped `tovu-deploy-fly`: both
 *  bundled packages installed, both seeded (fly disabled, deploy enabled), both in the ledger. */
async function seedPreRetirementWorkspace(layout: ReturnType<typeof resolveAgentPluginLayout>, workspaceRoot: string) {
  const fly = await installPackage(layout, RETIRED, "archive-fly");
  const deploy = await installPackage(layout, SUCCESSOR, "archive-deploy");
  await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: RETIRED });
  await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: SUCCESSOR }, { enabled: true });
  await recordBundledAgentPluginDigests({
    workspaceRoot,
    seeded: [
      { pluginId: RETIRED, archiveDigest: fly.archiveDigest },
      { pluginId: SUCCESSOR, archiveDigest: deploy.archiveDigest },
    ],
  });
  return { fly, deploy };
}

/** A successor the way a successful seed leaves it: installed, and its digest in the ledger —
 *  what @jini-ai/agent-plugins 0.4.5 (R6) requires before it retires anything into it. */
async function seedSuccessor(layout: ReturnType<typeof resolveAgentPluginLayout>, workspaceRoot: string) {
  const installed = await installPackage(layout, SUCCESSOR, "archive-deploy");
  await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId: SUCCESSOR, archiveDigest: installed.archiveDigest }] });
  return installed;
}

async function installedIds(workspaceRoot: string): Promise<string[]> {
  return (await listInstalledPlugins(workspaceRoot)).map((plugin) => plugin.pluginId).sort();
}

const DEPLOY_SUCCESSORS = ["fly", "render", "railway", "github", "vercel", "netlify", "cloudflare", "github-pages", "s3-compatible"];

test("the retirement map sends tovu-deploy-fly to fly, and deploy to every plugin split out of it, Fly first", () => {
  assert.equal(RETIRED_BUNDLED_AGENT_PLUGINS.get("tovu-deploy-fly"), "fly");
  assert.deepEqual(RETIRED_BUNDLED_AGENT_PLUGINS.get("deploy"), DEPLOY_SUCCESSORS);
});

test("an ENABLED tovu-deploy-fly: its package, record and ledger entry go; deploy stays enabled", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    const { fly, deploy } = await seedPreRetirementWorkspace(layout, workspaceLayout.root);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED, enabled: true, actor: "test:operator" });

    const outcomes = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.deepEqual(outcomes, [
      {
        pluginId: RETIRED,
        successorId: SUCCESSOR,
        status: "retired",
        removedDigests: [fly.archiveDigest],
        activationRemoved: true,
        ledgerEntryRemoved: true,
        successor: "already-enabled",
      },
    ]);
    assert.deepEqual(await installedIds(workspaceLayout.root), [SUCCESSOR]);

    const activations = await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root });
    assert.equal(Object.hasOwn(activations.plugins, RETIRED), false, "the retired plugin's record is deleted, not tombstoned");
    assert.equal(activations.plugins[SUCCESSOR]?.enabled, true);

    const ledger = await readBundledAgentPluginDigests(workspaceLayout.root);
    assert.equal(ledger.has(RETIRED), false);
    assert.equal(ledger.get(SUCCESSOR), deploy.archiveDigest, "the successor's ledger entry is untouched");
  } finally {
    await forceRemove(cwd);
  }
});

test("an enabled tovu-deploy-fly switches on deploy's untouched disabled seed record, as the retirement actor", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await installPackage(layout, RETIRED, "archive-fly");
    await seedSuccessor(layout, workspaceLayout.root);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED, enabled: true, actor: "test:operator" }, { origin: "bundled" });
    // The seeder's own disabled record, never touched by an operator.
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: workspaceLayout.root, pluginId: SUCCESSOR });

    const [outcome] = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.equal(outcome?.status, "retired");
    assert.equal(outcome?.status === "retired" && outcome.successor, "enabled");
    const record = (await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root })).plugins[SUCCESSOR];
    assert.equal(record?.enabled, true);
    assert.equal(record?.origin, "bundled");
    assert.equal(record?.updatedBy, "system:retire-tovu-deploy-fly");
  } finally {
    await forceRemove(cwd);
  }
});

test("an enabled tovu-deploy-fly with NO deploy record creates deploy's record enabled", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await installPackage(layout, RETIRED, "archive-fly");
    await seedSuccessor(layout, workspaceLayout.root);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED, enabled: true, actor: "test:operator" }, { origin: "bundled" });

    const [outcome] = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.equal(outcome?.status === "retired" && outcome.successor, "enabled");
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root })).plugins[SUCCESSOR]?.enabled, true);
  } finally {
    await forceRemove(cwd);
  }
});

test("an operator-DISABLED deploy stays off and is reported, while tovu-deploy-fly is still removed", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await seedPreRetirementWorkspace(layout, workspaceLayout.root);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED, enabled: true, actor: "test:operator" });
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: SUCCESSOR, enabled: false, actor: "test:operator" });

    const [outcome] = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.equal(outcome?.status, "retired");
    assert.equal(outcome?.status === "retired" && outcome.successor, "left-disabled-by-operator");

    const activations = await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root });
    assert.equal(activations.plugins[SUCCESSOR]?.enabled, false, "an operator's decision is never overridden");
    assert.equal(activations.plugins[SUCCESSOR]?.updatedBy, "test:operator");
    assert.equal(Object.hasOwn(activations.plugins, RETIRED), false);
    assert.deepEqual(await installedIds(workspaceLayout.root), [SUCCESSOR]);
  } finally {
    await forceRemove(cwd);
  }
});

test("a DISABLED tovu-deploy-fly is removed without touching deploy", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await seedPreRetirementWorkspace(layout, workspaceLayout.root);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: SUCCESSOR, enabled: false, actor: "test:operator" });
    const deployBefore = (await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root })).plugins[SUCCESSOR];

    const [outcome] = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.equal(outcome?.status === "retired" && outcome.successor, "not-needed");
    assert.deepEqual((await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root })).plugins[SUCCESSOR], deployBefore);
    assert.deepEqual(await installedIds(workspaceLayout.root), [SUCCESSOR]);
  } finally {
    await forceRemove(cwd);
  }
});

test("a second run is a no-op: 'absent', and neither state file is rewritten", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await seedPreRetirementWorkspace(layout, workspaceLayout.root);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED, enabled: true, actor: "test:operator" });
    await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    const activationsBytes = await readFile(path.join(workspaceLayout.root, ACTIVATIONS_FILENAME), "utf8");
    const ledgerBytes = await readFile(path.join(workspaceLayout.root, BUNDLED_DIGESTS_FILENAME), "utf8");

    const second = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.deepEqual(second, [{ pluginId: RETIRED, successorId: SUCCESSOR, status: "absent" }]);
    assert.equal(await readFile(path.join(workspaceLayout.root, ACTIVATIONS_FILENAME), "utf8"), activationsBytes);
    assert.equal(await readFile(path.join(workspaceLayout.root, BUNDLED_DIGESTS_FILENAME), "utf8"), ledgerBytes);
  } finally {
    await forceRemove(cwd);
  }
});

test("a workspace that never had tovu-deploy-fly: 'absent', and no state file is created", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    const outcomes = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.deepEqual(outcomes, [{ pluginId: RETIRED, successorId: SUCCESSOR, status: "absent" }]);
    await assert.rejects(() => access(path.join(workspaceLayout.root, ACTIVATIONS_FILENAME)));
    await assert.rejects(() => access(path.join(workspaceLayout.root, BUNDLED_DIGESTS_FILENAME)));
  } finally {
    await forceRemove(cwd);
  }
});

test("a record with no package left is deleted directly", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await seedSuccessor(layout, workspaceLayout.root);
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED });

    const [outcome] = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.deepEqual(outcome, {
      pluginId: RETIRED,
      successorId: SUCCESSOR,
      status: "retired",
      removedDigests: [],
      activationRemoved: true,
      ledgerEntryRemoved: false,
      successor: "not-needed",
    });
    assert.equal(Object.hasOwn((await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root })).plugins, RETIRED), false);
  } finally {
    await forceRemove(cwd);
  }
});

test("a leftover ledger entry alone is dropped, and every other entry keeps its own bytes", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    const ledgerPath = path.join(workspaceLayout.root, BUNDLED_DIGESTS_FILENAME);
    await mkdir(workspaceLayout.root, { recursive: true });
    const deployEntry = { archiveDigest: "b".repeat(64), seededAt: "2026-01-01T00:00:00.000Z" };
    await writeFile(
      ledgerPath,
      JSON.stringify({ schemaVersion: 1, plugins: { [RETIRED]: { archiveDigest: "a".repeat(64), seededAt: "2026-01-01T00:00:00.000Z" }, [SUCCESSOR]: deployEntry } }),
      "utf8",
    );

    const [outcome] = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.equal(outcome?.status === "retired" && outcome.ledgerEntryRemoved, true);
    const written = JSON.parse(await readFile(ledgerPath, "utf8")) as { plugins: Record<string, unknown> };
    assert.deepEqual(written.plugins, { [SUCCESSOR]: deployEntry }, "the successor's seededAt is preserved, not restamped");
  } finally {
    await forceRemove(cwd);
  }
});

test("removeBundledAgentPluginDigest writes nothing for a missing or malformed ledger", async () => {
  const { cwd, workspaceLayout } = await freshLayout();
  try {
    assert.equal(await removeBundledAgentPluginDigest({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED }), false);

    await mkdir(workspaceLayout.root, { recursive: true });
    const ledgerPath = path.join(workspaceLayout.root, BUNDLED_DIGESTS_FILENAME);
    await writeFile(ledgerPath, "{not json", "utf8");
    assert.equal(await removeBundledAgentPluginDigest({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED }), false);
    assert.equal(await readFile(ledgerPath, "utf8"), "{not json");
  } finally {
    await forceRemove(cwd);
  }
});

test("a MALFORMED tovu-deploy-fly record fails the retirement and changes nothing", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await installPackage(layout, RETIRED, "archive-fly");
    await mkdir(workspaceLayout.root, { recursive: true });
    const activationsPath = path.join(workspaceLayout.root, ACTIVATIONS_FILENAME);
    const raw = JSON.stringify({ schemaVersion: 1, plugins: { [RETIRED]: "bundled" } });
    await writeFile(activationsPath, raw, "utf8");

    const [outcome] = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID }, ONLY_FLY);

    assert.equal(outcome?.status, "failed");
    assert.match(outcome?.status === "failed" ? outcome.reason : "", /cannot tell whether 'tovu-deploy-fly' was enabled/);
    assert.equal(await readFile(activationsPath, "utf8"), raw);
    assert.deepEqual(await installedIds(workspaceLayout.root), [RETIRED]);
  } finally {
    await forceRemove(cwd);
  }
});

test("a package-list I/O failure becomes a failed retirement and the next entry still runs", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await mkdir(workspaceLayout.root, { recursive: true });
    const brokenPackages = path.join(workspaceLayout.root, "not-a-directory");
    await writeFile(brokenPackages, "keep these bytes", "utf8");
    let reads = 0;
    const failingLayout = { ...layout, forWorkspace: (workspaceId: string) => {
      assert.equal(workspaceId, WORKSPACE_ID);
      return reads++ === 0 ? { ...workspaceLayout, root: brokenPackages } : workspaceLayout;
    } };
    const outcomes = await retireBundledAgentPlugins({ layout: failingLayout, workspaceId: WORKSPACE_ID }, {
      retired: new Map([[RETIRED, SUCCESSOR], ["another-retired", SUCCESSOR]]),
    });
    assert.equal(outcomes.length, 2);
    assert.equal(outcomes[0]?.pluginId, RETIRED);
    assert.equal(outcomes[0]?.status, "failed");
    assert.match(outcomes[0]?.status === "failed" ? outcomes[0].reason : "", /ENOTDIR/);
    assert.deepEqual(outcomes[1], { pluginId: "another-retired", successorId: SUCCESSOR, status: "absent" });
    assert.equal(await readFile(brokenPackages, "utf8"), "keep these bytes");
  } finally {
    await forceRemove(cwd);
  }
});

test("uninstallAgentPlugin's retiredBundled option skips only the bundled refusal", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    const installed = await installPackage(layout, RETIRED, "archive-fly");
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: workspaceLayout.root, pluginId: RETIRED });
    const request = { layout, workspaceId: WORKSPACE_ID, pluginId: RETIRED };

    await assert.rejects(() => uninstallAgentPlugin(request), AgentPluginNotUninstallableError);

    const result = await uninstallAgentPlugin(request, { retiredBundled: true });
    assert.deepEqual(result.removedDigests, [installed.archiveDigest]);
    assert.deepEqual(await installedIds(workspaceLayout.root), []);
  } finally {
    await forceRemove(cwd);
  }
});

test("seedBundledAgentPlugins never seeds a retired id from a stale source directory, and reports retirements", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  const bundledRoot = await mkdtemp(path.join(tmpdir(), "tovu-retire-bundled-source-"));
  try {
    const staleDir = path.join(bundledRoot, RETIRED);
    await mkdir(path.join(staleDir, "skills", RETIRED), { recursive: true });
    await writeFile(
      path.join(staleDir, "plugin.json"),
      JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: RETIRED, version: "1.0.0" }),
      "utf8",
    );
    await writeFile(path.join(staleDir, "skills", RETIRED, "SKILL.md"), `# ${RETIRED}\n`, "utf8");

    const result = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: bundledRoot });

    assert.deepEqual(result.outcomes, []);
    assert.deepEqual(
      result.retirements,
      [...RETIRED_BUNDLED_AGENT_PLUGINS].map(([pluginId, successor]) => typeof successor === "string"
        ? { pluginId, successorId: successor, status: "absent" }
        : { pluginId, successorId: successor[0], successorIds: successor, status: "absent" }),
    );
    assert.deepEqual(await installedIds(workspaceLayout.root), []);
  } finally {
    await forceRemove(cwd);
    await forceRemove(bundledRoot);
  }
});

// --- create-tovu-theme + tovuize-site -> tovu-theme (2026-10-06), through the real map ---------

const THEME_SUCCESSOR = "tovu-theme";
const THEME_RETIRED = ["create-tovu-theme", "tovuize-site"] as const;

/** A workspace booted on a build that still shipped both theme plugins, then on one that ships
 *  `tovu-theme`: all three installed, all three seeded disabled, all three in the ledger. */
async function seedPreThemeMergeWorkspace(layout: ReturnType<typeof resolveAgentPluginLayout>, workspaceRoot: string) {
  const seeded: { pluginId: string; archiveDigest: string }[] = [];
  for (const pluginId of [...THEME_RETIRED, THEME_SUCCESSOR]) {
    const installed = await installPackage(layout, pluginId, `archive-${pluginId}`);
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId });
    seeded.push({ pluginId, archiveDigest: installed.archiveDigest });
  }
  await recordBundledAgentPluginDigests({ workspaceRoot, seeded });
}

test("the retirement map sends create-tovu-theme and tovuize-site to tovu-theme", () => {
  for (const retired of THEME_RETIRED) assert.equal(RETIRED_BUNDLED_AGENT_PLUGINS.get(retired), THEME_SUCCESSOR);
});

test("an enabled create-tovu-theme switches tovu-theme on; both old theme plugins are removed", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await seedPreThemeMergeWorkspace(layout, workspaceLayout.root);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "create-tovu-theme", enabled: true, actor: "test:operator" });

    const outcomes = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID });

    const byId = new Map(outcomes.map((outcome) => [outcome.pluginId, outcome]));
    const created = byId.get("create-tovu-theme");
    const tovuized = byId.get("tovuize-site");
    assert.equal(created?.status === "retired" && created.successor, "enabled");
    assert.equal(tovuized?.status === "retired" && tovuized.successor, "not-needed", "tovuize-site was off");
    assert.deepEqual(await installedIds(workspaceLayout.root), [THEME_SUCCESSOR]);

    const activations = await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root });
    for (const retired of THEME_RETIRED) assert.equal(Object.hasOwn(activations.plugins, retired), false, `${retired}'s record is deleted`);
    assert.equal(activations.plugins[THEME_SUCCESSOR]?.enabled, true);
    assert.equal(activations.plugins[THEME_SUCCESSOR]?.updatedBy, "system:retire-create-tovu-theme");

    const ledger = await readBundledAgentPluginDigests(workspaceLayout.root);
    assert.deepEqual([...ledger.keys()], [THEME_SUCCESSOR]);
  } finally {
    await forceRemove(cwd);
  }
});

test("both old theme plugins DISABLED: both are removed and tovu-theme stays off", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  try {
    await seedPreThemeMergeWorkspace(layout, workspaceLayout.root);

    const outcomes = await retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID });

    for (const retired of THEME_RETIRED) {
      const outcome = outcomes.find((candidate) => candidate.pluginId === retired);
      assert.equal(outcome?.status === "retired" && outcome.successor, "not-needed", retired);
    }
    assert.deepEqual(await installedIds(workspaceLayout.root), [THEME_SUCCESSOR]);
    const record = (await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root })).plugins[THEME_SUCCESSOR];
    assert.equal(record?.enabled, false);
    assert.equal(record?.updatedBy, "system:seed");
  } finally {
    await forceRemove(cwd);
  }
});

// --- deploy -> its split successors (Phase B7), through the real map: R6 safety -----------------

async function writeBundledSource(sourceRoot: string, pluginId: string, manifest?: string) {
  await mkdir(path.join(sourceRoot, pluginId, "skills", pluginId), { recursive: true });
  await writeFile(path.join(sourceRoot, pluginId, "plugin.json"), manifest ?? JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" }));
  await writeFile(path.join(sourceRoot, pluginId, "skills", pluginId, "SKILL.md"), `# ${pluginId}\n`);
}

/** A workspace that last booted a build still shipping `deploy`: installed, and on by the operator. */
async function seedLegacyDeployWorkspace(layout: ReturnType<typeof resolveAgentPluginLayout>, workspaceRoot: string) {
  const deploy = await installPackage(layout, "deploy", "archive-legacy-deploy");
  await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: true, actor: "operator" }, { origin: "bundled" });
  return deploy;
}

test("R6: a failed Fly seed keeps deploy — its bytes and the operator's 'on' — and switches no Fly record on", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  const sourceRoot = path.join(cwd, "broken-source");
  try {
    await seedLegacyDeployWorkspace(layout, workspaceLayout.root);
    await writeBundledSource(sourceRoot, "fly", "{");

    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });

    assert.equal(seeded.outcomes.find(outcome => outcome.pluginId === "fly")?.status, "failed");
    const deploy = seeded.retirements.find(outcome => outcome.pluginId === "deploy");
    assert.equal(deploy?.status, "failed");
    assert.match(deploy?.status === "failed" ? deploy.reason : "", /^'deploy' is kept until every successor is usable: successor 'fly' has never been seeded/);
    assert.deepEqual(await installedIds(workspaceLayout.root), ["deploy"]);
    assert.equal((await readBundledAgentPluginDigests(workspaceLayout.root)).has("fly"), false);
    const activations = await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root });
    assert.equal(activations.plugins.deploy?.enabled, true, "the operator's record stays with the code it switches");
    assert.equal(activations.plugins.fly, undefined, "no Fly switch without Fly's code");
  } finally { await forceRemove(cwd); }
});

test("R6: Fly alone seeding is not enough — deploy is kept until Render, Railway, GitHub and the static hosts are usable too", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  const sourceRoot = path.join(cwd, "partial-source");
  try {
    await seedLegacyDeployWorkspace(layout, workspaceLayout.root);
    await writeBundledSource(sourceRoot, "fly");

    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });

    assert.equal(seeded.outcomes.find(outcome => outcome.pluginId === "fly")?.status, "seeded");
    const deploy = seeded.retirements.find(outcome => outcome.pluginId === "deploy");
    assert.equal(deploy?.status, "failed");
    assert.match(deploy?.status === "failed" ? deploy.reason : "", /successor 'render' has never been seeded/);
    assert.deepEqual(await installedIds(workspaceLayout.root), ["deploy", "fly"]);
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root })).plugins.deploy?.enabled, true);
  } finally { await forceRemove(cwd); }
});

test("R6: once every successor seeds, deploy is retired and its successors are on; the next boot is a no-op", async () => {
  const { cwd, layout, workspaceLayout } = await freshLayout();
  const sourceRoot = path.join(cwd, "full-source");
  try {
    const legacy = await seedLegacyDeployWorkspace(layout, workspaceLayout.root);
    for (const pluginId of DEPLOY_SUCCESSORS) await writeBundledSource(sourceRoot, pluginId);

    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });

    const deploy = seeded.retirements.find(outcome => outcome.pluginId === "deploy");
    assert.equal(deploy?.status, "retired");
    assert.deepEqual(deploy?.status === "retired" && deploy.removedDigests, [legacy.archiveDigest]);
    assert.deepEqual(deploy?.successorIds, DEPLOY_SUCCESSORS);
    assert.deepEqual(await installedIds(workspaceLayout.root), [...DEPLOY_SUCCESSORS].sort());
    const activations = await readAgentPluginActivations({ workspaceRoot: workspaceLayout.root });
    assert.equal(Object.hasOwn(activations.plugins, "deploy"), false);
    for (const pluginId of DEPLOY_SUCCESSORS) assert.equal(activations.plugins[pluginId]?.enabled, true, pluginId);

    const nextBoot = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
    assert.equal(nextBoot.retirements.find(outcome => outcome.pluginId === "deploy")?.status, "absent");
    assert.deepEqual(await installedIds(workspaceLayout.root), [...DEPLOY_SUCCESSORS].sort());
  } finally { await forceRemove(cwd); }
});

test('Cloudflare retirement and pinned references translate plugin IDs while preserving the Pages target ID', async () => {
  const { RETIRED_PLUGIN_REPLACEMENTS, translateRetiredPluginRefs } = await import('../../bundled-catalog.js');
  assert.equal(RETIRED_BUNDLED_AGENT_PLUGINS.get('cloudflare-pages'), 'cloudflare');
  assert.equal(RETIRED_PLUGIN_REPLACEMENTS.get('cloudflare-pages'), 'cloudflare');
  assert.deepEqual(translateRetiredPluginRefs(['cloudflare-pages', 'cloudflare', 'deploy']), ['cloudflare', 'fly']);
});
