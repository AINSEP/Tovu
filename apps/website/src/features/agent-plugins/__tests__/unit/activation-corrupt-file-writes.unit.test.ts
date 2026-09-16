import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";
import {
  AgentPluginActivationsUnreadableError,
  deleteAgentPluginActivation,
  recordBundledAgentPluginIfAbsent,
  resolveAgentPluginActivation,
  setAgentPluginActivation,
} from "../../activation.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { listInstalledPlugins } from "../../resolve-agent-plugin-refs.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";
import { previewAgentPluginUninstall, uninstallAgentPlugin } from "../../uninstall.js";

/**
 * @file t91 F1.1 — the committed form of the security re-check's
 * `ADS-memory/.local-artifacts/tmp/t91-security-recheck/activation-corrupt-rewrite.probe.test.ts`.
 *
 * Every writer of `activations.json` used to read the file LENIENTLY (a corrupt byte reads as "no
 * decisions recorded") and then rewrote a fresh file from that lenient view — laundering a corrupt
 * file, and every disabled plugin's decision inside it, into a well-formed one with nothing
 * disabled. Two arms of the same root cause: a whole-file fault (T1-T3b, T8-T10) and a single
 * malformed ENTRY inside an otherwise well-formed file (T4-T6), which the old `normalizePluginsBag`
 * silently dropped on every rewrite. Every case below failed at HEAD `c52b8d54` (2026-09-16) — the
 * fix makes every writer refuse on an unreadable file, and preserve any entry it is not the one
 * being changed.
 */

const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";

/** The probe's own truncated file: valid start, no closing braces. `evil-plugin` is recorded
 *  disabled — the state a writer must never launder into "absent, therefore active". */
const CORRUPT = '{"schemaVersion":1,"plugins":{"evil-plugin":{"enabled":false,"origin":"operator-installed"}}';

/** Well-formed envelope, well-formed EXCEPT `evil-plugin`'s own entry (`enabled` is a string, not a
 *  boolean) — the entry-level laundering arm. `good-plugin` is a normal, valid, disabled record. */
const MALFORMED_ENTRY =
  JSON.stringify(
    {
      schemaVersion: 1,
      plugins: {
        "evil-plugin": { enabled: "no" },
        "good-plugin": { enabled: false, origin: "operator-installed", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "op" },
      },
    },
    null,
    2,
  ) + "\n";

/** A well-formed but unsupported schema version — must be refused exactly like a parse failure, not
 *  silently downgraded (and destroyed) into schemaVersion 1 on the next write. */
const V2 = JSON.stringify({ schemaVersion: 2, plugins: { "evil-plugin": { enabled: false } } });

async function freshRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "tovu-activation-corrupt-"));
}

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
  };
}

/** Installs a real operator package via `installAgentPlugin` — same idiom `uninstall.unit.test.ts`
 *  already uses — so T9/T10 exercise the real on-disk shape a bundled refusal must check against. */
async function installTestPackage(
  instanceLayout: ReturnType<typeof resolveAgentPluginLayout>,
  pluginId: string,
  archiveLabel: string,
) {
  const manifest = JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" });
  const archive = new Uint8Array(Buffer.from(archiveLabel));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: reader([fileEntry("plugin.json", manifest), fileEntry(`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`)]),
    layout: instanceLayout,
    workspaceId: WORKSPACE_ID,
  });
}

/** Writes a minimal, real bundled-plugin SOURCE directory (`plugin.json` + eponymous SKILL.md) that
 *  `seedBundledAgentPlugins` can pack and install — `<tmp>/bundled/mini-bundled/...`. */
async function writeBundledSourceFixture(bundledRoot: string): Promise<void> {
  const pluginDir = path.join(bundledRoot, "mini-bundled");
  await mkdir(path.join(pluginDir, "skills", "mini-bundled"), { recursive: true });
  await writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "mini-bundled", version: "1.0.0" }),
    "utf8",
  );
  await writeFile(path.join(pluginDir, "skills", "mini-bundled", "SKILL.md"), "# mini-bundled\n", "utf8");
}

// ---------------------------------------------------------------------------
// T1-T3b — whole-file fault: every writer refuses, none rewrites
// ---------------------------------------------------------------------------

test("recordBundledAgentPluginIfAbsent refuses a corrupt file and never rewrites it", async () => {
  const root = await freshRoot();
  try {
    await writeFile(path.join(root, "activations.json"), CORRUPT, "utf8");

    await assert.rejects(
      () => recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "ui-ux-design" }),
      AgentPluginActivationsUnreadableError,
    );
    assert.equal(await readFile(path.join(root, "activations.json"), "utf8"), CORRUPT, "the corrupt file must be left byte-for-byte untouched");
    assert.equal((await resolveAgentPluginActivation(root, "evil-plugin")).verdict, "undetermined");
  } finally {
    await forceRemove(root);
  }
});

test("setAgentPluginActivation refuses a corrupt file even when toggling an UNRELATED plugin", async () => {
  const root = await freshRoot();
  try {
    await writeFile(path.join(root, "activations.json"), CORRUPT, "utf8");

    await assert.rejects(
      () => setAgentPluginActivation({ workspaceRoot: root, pluginId: "other", enabled: false, actor: "t" }),
      AgentPluginActivationsUnreadableError,
    );
    assert.equal(await readFile(path.join(root, "activations.json"), "utf8"), CORRUPT);
    assert.equal((await resolveAgentPluginActivation(root, "evil-plugin")).verdict, "undetermined");
  } finally {
    await forceRemove(root);
  }
});

test("deleteAgentPluginActivation refuses a corrupt file rather than silently no-op'ing", async () => {
  const root = await freshRoot();
  try {
    await writeFile(path.join(root, "activations.json"), CORRUPT, "utf8");

    await assert.rejects(
      () => deleteAgentPluginActivation({ workspaceRoot: root, pluginId: "evil-plugin" }),
      AgentPluginActivationsUnreadableError,
    );
    assert.equal(await readFile(path.join(root, "activations.json"), "utf8"), CORRUPT);
  } finally {
    await forceRemove(root);
  }
});

test("a well-formed but unsupported schemaVersion is refused, not silently downgraded (and destroyed) into v1", async () => {
  const root = await freshRoot();
  try {
    await writeFile(path.join(root, "activations.json"), V2, "utf8");

    await assert.rejects(
      () => setAgentPluginActivation({ workspaceRoot: root, pluginId: "x", enabled: true, actor: "t" }),
      AgentPluginActivationsUnreadableError,
    );
    const parsed = JSON.parse(await readFile(path.join(root, "activations.json"), "utf8")) as { schemaVersion: number };
    assert.equal(parsed.schemaVersion, 2, "a v2 file must survive intact for the next upgrade to read, not be rewritten as v1");
  } finally {
    await forceRemove(root);
  }
});

// ---------------------------------------------------------------------------
// T4-T6 — entry-level fault: one malformed entry survives every OTHER write
// ---------------------------------------------------------------------------

test("recordBundledAgentPluginIfAbsent for a DIFFERENT plugin preserves a malformed sibling entry byte-for-byte", async () => {
  const root = await freshRoot();
  try {
    await writeFile(path.join(root, "activations.json"), MALFORMED_ENTRY, "utf8");

    const { recorded } = await recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "ui-ux-design" });
    assert.equal(recorded, true);

    const raw = JSON.parse(await readFile(path.join(root, "activations.json"), "utf8")) as { plugins: Record<string, unknown> };
    assert.deepEqual(raw.plugins["evil-plugin"], { enabled: "no" }, "the malformed entry must survive a write to a different plugin, untouched");
    assert.equal((await resolveAgentPluginActivation(root, "evil-plugin")).verdict, "undetermined");
    assert.equal((await resolveAgentPluginActivation(root, "good-plugin")).verdict, "inactive");
  } finally {
    await forceRemove(root);
  }
});

test("recordBundledAgentPluginIfAbsent treats a present-but-malformed entry as an existing decision, and leaves it alone", async () => {
  const root = await freshRoot();
  try {
    await writeFile(path.join(root, "activations.json"), MALFORMED_ENTRY, "utf8");

    const { recorded } = await recordBundledAgentPluginIfAbsent({ workspaceRoot: root, pluginId: "evil-plugin" });
    assert.equal(recorded, false, "a malformed-but-present entry counts as a decision — the seeder must not overwrite it with a fresh disabled record");

    const raw = JSON.parse(await readFile(path.join(root, "activations.json"), "utf8")) as { plugins: Record<string, unknown> };
    assert.deepEqual(raw.plugins["evil-plugin"], { enabled: "no" });
    assert.equal((await resolveAgentPluginActivation(root, "evil-plugin")).verdict, "undetermined");
  } finally {
    await forceRemove(root);
  }
});

test("setAgentPluginActivation for a DIFFERENT plugin preserves a malformed sibling entry byte-for-byte", async () => {
  const root = await freshRoot();
  try {
    await writeFile(path.join(root, "activations.json"), MALFORMED_ENTRY, "utf8");

    await setAgentPluginActivation({ workspaceRoot: root, pluginId: "good-plugin", enabled: true, actor: "op-2" });

    assert.equal((await resolveAgentPluginActivation(root, "good-plugin")).verdict, "active");
    const raw = JSON.parse(await readFile(path.join(root, "activations.json"), "utf8")) as { plugins: Record<string, unknown> };
    assert.deepEqual(raw.plugins["evil-plugin"], { enabled: "no" }, "toggling a sibling must not drop the malformed entry");
    assert.equal((await resolveAgentPluginActivation(root, "evil-plugin")).verdict, "undetermined");
  } finally {
    await forceRemove(root);
  }
});

// ---------------------------------------------------------------------------
// T7-T8 — the boot seeder: pre-flight refuses BEFORE installing anything
// ---------------------------------------------------------------------------

test("GUARD: seedBundledAgentPlugins still seeds normally against an ABSENT file (first boot)", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-seed-corrupt-guard-"));
  const bundledRoot = await mkdtemp(path.join(tmpdir(), "tovu-seed-corrupt-bundled-"));
  try {
    await writeBundledSourceFixture(bundledRoot);
    const layout = resolveAgentPluginLayout({ cwd, env: {} });

    const result = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: bundledRoot });

    assert.equal(result.outcomes.length, 1);
    assert.equal(result.outcomes[0]?.status, "seeded");
    assert.equal((result.outcomes[0] as { pluginId: string }).pluginId, "mini-bundled");
    assert.equal((result.outcomes[0] as { activationRecorded: boolean }).activationRecorded, true);
    assert.equal(
      (await resolveAgentPluginActivation(layout.forWorkspace(WORKSPACE_ID).root, "mini-bundled")).verdict,
      "inactive",
    );
  } finally {
    await forceRemove(cwd);
    await forceRemove(bundledRoot);
  }
});

test("seedBundledAgentPlugins refuses a corrupt activations file: installs nothing, reports every bundled plugin failed", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-seed-corrupt-"));
  const bundledRoot = await mkdtemp(path.join(tmpdir(), "tovu-seed-corrupt-bundled-"));
  try {
    await writeBundledSourceFixture(bundledRoot);
    const layout = resolveAgentPluginLayout({ cwd, env: {} });
    const workspaceLayout = layout.forWorkspace(WORKSPACE_ID);
    await mkdir(workspaceLayout.root, { recursive: true });
    await writeFile(path.join(workspaceLayout.root, "activations.json"), CORRUPT, "utf8");

    const result = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: bundledRoot });

    assert.equal(result.outcomes.length, 1);
    const outcome = result.outcomes[0] as { pluginId: string; status: string; reason?: string };
    assert.equal(outcome.pluginId, "mini-bundled");
    assert.equal(outcome.status, "failed");
    assert.match(outcome.reason ?? "", /activations\.json is not valid JSON/);
    assert.match(outcome.reason ?? "", /left untouched/);

    assert.deepEqual(await listInstalledPlugins(workspaceLayout.packages), [], "nothing may be installed while the record cannot be written");
    assert.equal(await readFile(path.join(workspaceLayout.root, "activations.json"), "utf8"), CORRUPT);
  } finally {
    await forceRemove(cwd);
    await forceRemove(bundledRoot);
  }
});

// ---------------------------------------------------------------------------
// T9-T10 — uninstall: preview and uninstall both refuse rather than proceed
// ---------------------------------------------------------------------------

test("previewAgentPluginUninstall and uninstallAgentPlugin both refuse a corrupt activations file, leaving the package installed", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-uninstall-corrupt-"));
  try {
    const instanceLayout = resolveAgentPluginLayout({ cwd, env: {} });
    await installTestPackage(instanceLayout, "op-plugin", "archive-corrupt-preview");
    const workspaceRoot = instanceLayout.forWorkspace(WORKSPACE_ID).root;
    await writeFile(path.join(workspaceRoot, "activations.json"), CORRUPT, "utf8");

    await assert.rejects(
      () => previewAgentPluginUninstall({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "op-plugin" }),
      AgentPluginActivationsUnreadableError,
    );
    await assert.rejects(
      () => uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "op-plugin" }),
      AgentPluginActivationsUnreadableError,
    );

    const installed = await listInstalledPlugins(instanceLayout.forWorkspace(WORKSPACE_ID).packages);
    assert.ok(installed.some((plugin) => plugin.pluginId === "op-plugin"), "a refused uninstall must not remove the package");
  } finally {
    await forceRemove(cwd);
  }
});

test("uninstallAgentPlugin refuses a corrupt file even when its (unreadable) content would have said the plugin is bundled", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-uninstall-corrupt-bundled-"));
  try {
    const instanceLayout = resolveAgentPluginLayout({ cwd, env: {} });
    await installTestPackage(instanceLayout, "op-plugin", "archive-corrupt-bundled");
    const workspaceRoot = instanceLayout.forWorkspace(WORKSPACE_ID).root;
    await writeFile(
      path.join(workspaceRoot, "activations.json"),
      '{"schemaVersion":1,"plugins":{"op-plugin":{"enabled":false,"origin":"bundled"}}',
      "utf8",
    );

    await assert.rejects(
      () => uninstallAgentPlugin({ layout: instanceLayout, workspaceId: WORKSPACE_ID, pluginId: "op-plugin" }),
      AgentPluginActivationsUnreadableError,
    );

    const installed = await listInstalledPlugins(instanceLayout.forWorkspace(WORKSPACE_ID).packages);
    assert.ok(installed.some((plugin) => plugin.pluginId === "op-plugin"), "a refused uninstall must not remove the package");
  } finally {
    await forceRemove(cwd);
  }
});
