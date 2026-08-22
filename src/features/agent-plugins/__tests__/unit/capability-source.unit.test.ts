import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../install.js";
import { AGENT_PLUGIN_SKILLS_CAPABILITY_SOURCE_ID, createAgentPluginSkillsCapabilitySource } from "../../capability-source.js";

/**
 * @file `createAgentPluginSkillsCapabilitySource()` — the first `CapabilitySource`
 * (`assistant/capability-source-registry.ts`), turning every installed Agent Plugin's skill folders
 * into one discovery-only capability card per skill folder per digest.
 *
 * Every fixture below installs a REAL package through the production `installAgentPlugin` pipeline
 * (same idiom `resolve-agent-plugin-refs.unit.test.ts` already establishes), against
 * `TOVU_AGENT_PLUGINS_DIR` pointed at a temp directory — this source calls
 * `resolveAgentPluginLayout()` with no override (mirroring `plugin-prompt-prefix.ts`'s identical real
 * call), so the env var is the only injection seam available to a test, exactly as it is for every
 * other real caller of that function.
 */

const WORKSPACE_A = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_B = "44444444-4444-4444-8444-444444444444";

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

function manifest(name: string, version = "1.0.0"): string {
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version });
}

/** Sets `TOVU_AGENT_PLUGINS_DIR` to a fresh temp directory for the duration of `fn`, restoring
 *  whatever was there before and cleaning up afterward — `forceRemove` because a successful install
 *  freezes its published package root read-only. */
async function withAgentPluginsDir<T>(fn: (agentPluginsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-capability-source-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

/** Installs one real package with an arbitrary set of skill folders, keyed to a unique archive so a
 *  second call in the same test produces a genuinely different digest. */
async function installRealPackage(
  workspaceId: string,
  pluginId: string,
  skills: Readonly<Record<string, string>>,
  archiveSeed: string,
) {
  const entries: AgentPluginArchiveEntry[] = [fileEntry("plugin.json", manifest(pluginId))];
  for (const [skillName, skillMarkdown] of Object.entries(skills)) {
    entries.push(fileEntry(`skills/${skillName}/SKILL.md`, skillMarkdown));
  }
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: reader(entries),
    layout: resolveAgentPluginLayout(),
    workspaceId,
  });
}

test("registers under the expected, stable source id", () => {
  const source = createAgentPluginSkillsCapabilitySource();
  assert.equal(source.id, AGENT_PLUGIN_SKILLS_CAPABILITY_SOURCE_ID);
});

test("a 3-skill plugin produces 3 distinct cards, not 1", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(
      WORKSPACE_A,
      "coffee-roastery",
      {
        "coffee-roastery": "# Coffee Roastery\n",
        "bean-sourcing": "# Bean Sourcing\n",
        "roast-profiles": "# Roast Profiles\n",
      },
      "archive-3-skills",
    );

    const source = createAgentPluginSkillsCapabilitySource();
    const cards = await source.list({ workspaceId: WORKSPACE_A });

    assert.equal(cards.length, 3);
    assert.deepEqual(
      cards.map((c) => c.skillName).sort(),
      ["bean-sourcing", "coffee-roastery", "roast-profiles"],
    );
  });
});

test("a plugin with no eponymous skill still produces cards — this is what closes the scaling-cliff gap", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(WORKSPACE_A, "my-plugin", { "totally-different-skill": "# Different\n" }, "archive-no-eponymous");

    const source = createAgentPluginSkillsCapabilitySource();
    const cards = await source.list({ workspaceId: WORKSPACE_A });

    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.pluginId, "my-plugin");
    assert.equal(cards[0]?.skillName, "totally-different-skill");
  });
});

test("two installed digests of one plugin produce disjoint ids, both present, no throw", async () => {
  await withAgentPluginsDir(async () => {
    const first = await installRealPackage(WORKSPACE_A, "ui-ux-design", { "ui-ux-design": "# Variant A\n" }, "archive-digest-a");
    const second = await installRealPackage(WORKSPACE_A, "ui-ux-design", { "ui-ux-design": "# Variant B\n" }, "archive-digest-b");
    assert.notEqual(first.archiveDigest, second.archiveDigest, "sanity: the two installs must be genuinely different digests");

    const source = createAgentPluginSkillsCapabilitySource();
    const cards = await source.list({ workspaceId: WORKSPACE_A });

    assert.equal(cards.length, 2);
    const ids = cards.map((c) => c.id);
    assert.equal(new Set(ids).size, 2, "the two cards must have disjoint ids");
    for (const card of cards) {
      assert.equal(card.id, `agent-plugin-skill:ui-ux-design:${card.revision}:ui-ux-design`);
      assert.ok([first.archiveDigest, second.archiveDigest].includes(card.revision));
    }
  });
});

test("every card carries kind/pluginId/skillName/revision/source as first-class fields, not only baked into id", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installRealPackage(WORKSPACE_A, "ui-ux-design", { "ui-ux-design": "# UI UX\n" }, "archive-fields");
    const source = createAgentPluginSkillsCapabilitySource();
    const [card] = await source.list({ workspaceId: WORKSPACE_A });

    assert.ok(card);
    assert.equal(card.kind, "agent-plugin-skill");
    assert.equal(card.pluginId, "ui-ux-design");
    assert.equal(card.skillName, "ui-ux-design");
    assert.equal(card.revision, installed.archiveDigest);
    assert.equal(card.source, AGENT_PLUGIN_SKILLS_CAPABILITY_SOURCE_ID);
    assert.ok(card.keywords.includes("ui-ux-design"));
  });
});

test("workspace isolation: a source built for workspace A sees nothing installed only under workspace B", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(WORKSPACE_B, "only-in-b", { "only-in-b": "# Only in B\n" }, "archive-tenancy");

    const source = createAgentPluginSkillsCapabilitySource();
    const cardsForA = await source.list({ workspaceId: WORKSPACE_A });
    const cardsForB = await source.list({ workspaceId: WORKSPACE_B });

    assert.deepEqual(cardsForA, []);
    assert.equal(cardsForB.length, 1);
  });
});

test("an empty (never-installed) workspace produces zero cards, no throw", async () => {
  await withAgentPluginsDir(async () => {
    const source = createAgentPluginSkillsCapabilitySource();
    const cards = await source.list({ workspaceId: WORKSPACE_A });
    assert.deepEqual(cards, []);
  });
});

test("read() resolves a card's handle to the REAL SKILL.md content on disk, independently verified", async () => {
  await withAgentPluginsDir(async () => {
    const skillMarkdown = "# Roast Profiles\n\nLight, medium, and dark roast curves.\n";
    await installRealPackage(WORKSPACE_A, "coffee-roastery", { "roast-profiles": skillMarkdown }, "archive-read");

    const source = createAgentPluginSkillsCapabilitySource();
    const [card] = await source.list({ workspaceId: WORKSPACE_A });
    assert.ok(card);
    assert.ok(source.read, "this source must declare read()");

    const content = await source.read(card.handle, { workspaceId: WORKSPACE_A });
    assert.equal(content, skillMarkdown);

    // Independent read off the real installed path — proves `read()` returned the actual bytes on
    // disk, not a value that merely happens to match what this test itself wrote above.
    const packagesDir = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).packages;
    const [digest] = await readdir(packagesDir);
    const independentRead = await readFile(path.join(packagesDir, digest as string, "skills/roast-profiles/SKILL.md"), "utf8");
    assert.equal(independentRead, skillMarkdown);
    assert.equal(content, independentRead);
  });
});
