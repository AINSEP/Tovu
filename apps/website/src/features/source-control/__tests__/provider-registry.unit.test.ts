import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { setAgentPluginActivation } from "#src/features/agent-plugins/activation";
import { recordBundledAgentPluginDigests } from "#src/features/agent-plugins/bundled-digests";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "#src/features/agent-plugins/install";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";

import { loadSourceControlProviderRegistry, noSourceControlProviderMessage, parseSourceControlProvidersFile, pickSourceControlProviderForApi, SOURCE_CONTROL_PROVIDERS_FILENAME } from "../provider-registry.js";
import type { SourceControlProvider } from "../provider-module.js";

/**
 * @file `provider-registry.ts` — the seam that lets an Agent Plugin add a git host. Loading a module
 * runs its code in-process, so only an ENABLED plugin whose installed digest is the one Tovu's own
 * seed recorded is loaded, every refusal says why, and a switched-off plugin is remembered so the
 * caller can say which one to turn back on. Every case installs a REAL package through
 * `installAgentPlugin`. Mirrors `agent-plugins/__tests__/unit/mail-adapter-registry.unit.test.ts`.
 */

const WORKSPACE_ID = "workspace-local";

const FIXTURE_MODULE = `export default {
  create() {
    return { id: "fixture-git", apiOrigin: "https://git.fixture.test" };
  },
};
`;

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

function descriptorJson(providers: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 1, providers });
}

const FIXTURE_FILES = {
  [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([{ id: "fixture-git", label: "Fixture Git", module: "source-control/fixture.mjs" }]),
  "source-control/fixture.mjs": FIXTURE_MODULE,
};

async function installPackage(pluginId: string, files: Readonly<Record<string, string>>): Promise<string> {
  const entries = [
    fileEntry("plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" })),
    ...Object.entries(files).map(([entryPath, content]) => fileEntry(entryPath, content)),
  ];
  const archive = new Uint8Array(Buffer.from(`${pluginId}:${JSON.stringify(files)}`));
  const installed = await installAgentPlugin({
    archive,
    expectedSha256: createHash("sha256").update(archive).digest("hex"),
    archiveReader: {
      async *entries() {
        yield* entries;
      },
    },
    layout: resolveAgentPluginLayout(),
    workspaceId: WORKSPACE_ID,
  });
  return installed.archiveDigest;
}

async function withWorkspace<T>(fn: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-source-control-providers-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID).root);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function markBundled(workspaceRoot: string, pluginId: string, archiveDigest: string, enabled = true): Promise<void> {
  await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest }] });
  await setAgentPluginActivation({ workspaceRoot, pluginId, enabled, actor: "test" }, { origin: "bundled" });
}

test("lists a provider from an enabled, Tovu-bundled plugin and builds it from its module", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-git", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-git", digest);

    const registry = await loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.refusals, []);
    assert.deepEqual(registry.list().map((loaded) => [loaded.descriptor.id, loaded.descriptor.label, loaded.pluginId]), [["fixture-git", "Fixture Git", "fixture-git"]]);
    assert.equal(registry.get("fixture-git")?.module.create({ kit: {} as never }).apiOrigin, "https://git.fixture.test");
    assert.deepEqual([...(registry.switchedOff ?? [])], []);
  });
});

test("refuses a plugin whose installed digest is not the one Tovu shipped", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-git", FIXTURE_FILES);
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fixture-git", enabled: true, actor: "test" }, { origin: "operator-installed" });

    const registry = await loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, [
      `source-control providers from 'fixture-git' were not loaded: only plugins shipped with Tovu may add source-control providers (installed digest ${digest.slice(0, 12)} is not the one this build shipped)`,
    ]);
  });
});

test("a switched-off bundled plugin contributes nothing, is not an error, and is remembered by provider id", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-git", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-git", digest, false);

    const registry = await loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, []);
    assert.deepEqual([...(registry.switchedOff ?? [])], [["fixture-git", "fixture-git"]]);
    assert.equal(
      noSourceControlProviderMessage(registry, "fixture-git"),
      "No enabled Agent Plugin provides 'fixture-git' source control: the 'fixture-git' Agent Plugin is switched off. To switch it back on, open the admin's Add-Ons > Agent Plugins screen and turn on 'fixture-git'.",
    );
  });
});

test("a module without create() is refused, and a module path escaping the plugin root is refused", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-git", {
      [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([
        { id: "no-create", label: "No Create", module: "source-control/empty.mjs" },
        { id: "escapes", label: "Escapes", module: "../x.mjs" },
      ]),
      "source-control/empty.mjs": "export default {};\n",
    });
    await markBundled(workspaceRoot, "fixture-git", digest);

    const registry = await loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, [
      "source-control provider 'no-create' from 'fixture-git' was not loaded: its module has no create() function",
      "source-control provider 'escapes' from 'fixture-git' was not loaded: module path '../x.mjs' escapes the plugin root",
    ]);
  });
});

test("parseSourceControlProvidersFile rejects bad JSON, a bad schema version, a non-.mjs module, an empty label and a duplicate id", () => {
  assert.deepEqual(parseSourceControlProvidersFile("{"), { ok: false, reason: "not valid JSON" });
  assert.deepEqual(parseSourceControlProvidersFile(JSON.stringify({ schemaVersion: 2, providers: [] })), { ok: false, reason: "schemaVersion must be 1" });
  const entry = { id: "a", label: "A", module: "a.mjs" };
  assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, module: "a.js" }])), { ok: false, reason: "providers[0].module must be a relative path ending in .mjs" });
  assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, label: "" }])), { ok: false, reason: "providers[0].label must be a non-empty string" });
  assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([entry, entry])), { ok: false, reason: "providers[1].id 'a' is declared twice" });
});

test("pickSourceControlProviderForApi matches by API origin, falls back to a sole provider, and otherwise says why", () => {
  const github = { apiOrigin: "https://api.github.com" } as SourceControlProvider;
  const other = { apiOrigin: "https://git.example.test" } as SourceControlProvider;
  assert.deepEqual(pickSourceControlProviderForApi([github, other], "https://api.github.com/repos"), { ok: true, provider: github });
  assert.deepEqual(pickSourceControlProviderForApi([other], "https://self-hosted.test/api"), { ok: true, provider: other });
  assert.deepEqual(pickSourceControlProviderForApi([github, other], "https://nope.test"), { ok: false, message: "No enabled Agent Plugin provides source control for https://nope.test." });
  assert.deepEqual(pickSourceControlProviderForApi([], "https://nope.test", "custom why"), { ok: false, message: "custom why" });
  assert.equal(
    noSourceControlProviderMessage({}),
    "No enabled Agent Plugin provides source control, and no installed one declares it. Open the admin's Add-Ons > Agent Plugins screen to install or turn on a plugin that provides it.",
  );
});
