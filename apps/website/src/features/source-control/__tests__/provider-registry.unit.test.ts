import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { setAgentPluginActivation } from "#src/features/agent-plugins/activation";
import { recordBundledAgentPluginDigests } from "#src/features/agent-plugins/bundled-digests";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "#src/features/agent-plugins/install";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";

import { buildLoadedSourceControlProvider, findReservedPath, isUnderWorkflowPath, loadSourceControlProviderRegistry, noSourceControlProviderMessage, parseSourceControlProvidersFile, pickSourceControlProviderForApi, SOURCE_CONTROL_PROVIDERS_FILENAME } from "../provider-registry.js";
import type { SourceControlProvider } from "../provider-module.js";
import { GITHUB_PACKAGE_ROOT } from "./fixtures/github-from-source.js";

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
    return { readAccountLabel: async () => "fixture-account" };
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
  [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([{ id: "fixture-git", label: "Fixture Git", apiOrigin: "https://git.fixture.test", maxFileBytes: 1024, module: "source-control/fixture.mjs" }]),
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
    const provider = buildLoadedSourceControlProvider(registry.get("fixture-git")!, {} as never);
    // The host facts come from the plugin's DECLARED descriptor, the operations from its module.
    assert.deepEqual([provider.id, provider.label, provider.apiOrigin, provider.maxFileBytes], ["fixture-git", "Fixture Git", "https://git.fixture.test", 1024]);
    assert.equal(await provider.readAccountLabel("t"), "fixture-account");
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
        { id: "no-create", label: "No Create", apiOrigin: "https://a.test", module: "source-control/empty.mjs" },
        { id: "escapes", label: "Escapes", apiOrigin: "https://b.test", module: "../x.mjs" },
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

test("parseSourceControlProvidersFile rejects bad JSON, a bad schema version, a non-.mjs module, an empty label, a duplicate id, a bad apiOrigin and a bad maxFileBytes", () => {
  assert.deepEqual(parseSourceControlProvidersFile("{"), { ok: false, reason: "not valid JSON" });
  assert.deepEqual(parseSourceControlProvidersFile(JSON.stringify({ schemaVersion: 2, providers: [] })), { ok: false, reason: "schemaVersion must be 1" });
  const entry = { id: "a", label: "A", apiOrigin: "https://a.test", module: "a.mjs" };
  assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, module: "a.js" }])), { ok: false, reason: "providers[0].module must be a relative path ending in .mjs" });
  assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, label: "" }])), { ok: false, reason: "providers[0].label must be a non-empty string" });
  assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([entry, entry])), { ok: false, reason: "providers[1].id 'a' is declared twice" });
  for (const apiOrigin of ["http://a.test", "https://a.test/api", "not a url", undefined]) {
    assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, apiOrigin }])), { ok: false, reason: "providers[0].apiOrigin must be an https origin with no path" });
  }
  for (const maxFileBytes of [0, -1, 1.5, "100"]) {
    assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, maxFileBytes }])), { ok: false, reason: "providers[0].maxFileBytes must be a positive integer" });
  }
});

test("reservedPaths: parsed from the descriptor, carried on the built provider, and a malformed list refuses the file", () => {
  const entry = { id: "a", label: "A", apiOrigin: "https://a.test", module: "a.mjs" };
  const parsed = parseSourceControlProvidersFile(descriptorJson([{ ...entry, reservedPaths: [".github", "ci/hooks"] }]));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.descriptors[0]?.reservedPaths, [".github", "ci/hooks"]);
  const provider = buildLoadedSourceControlProvider({ descriptor: parsed.descriptors[0]!, pluginId: "a", module: { create: () => ({}) as never } }, {} as never);
  assert.deepEqual(provider.reservedPaths, [".github", "ci/hooks"]);

  const noneDeclared = parseSourceControlProvidersFile(descriptorJson([entry]));
  assert.ok(noneDeclared.ok);
  assert.equal("reservedPaths" in noneDeclared.descriptors[0]!, false);

  const reason = "providers[0].reservedPaths must be a list of at most 20 relative folder paths";
  for (const reservedPaths of ["x", [""], ["/abs"], ["a/../b"], ["./a"], [1], Array.from({ length: 21 }, (_, i) => `d${i}`)]) {
    assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, reservedPaths }])), { ok: false, reason });
  }
});

test("findReservedPath matches the folder itself or anything under it, case-insensitively, and nothing that merely shares a prefix", () => {
  assert.equal(findReservedPath(".github", [".github"]), ".github");
  assert.equal(findReservedPath(".GitHub/workflows", [".github"]), ".github");
  assert.equal(findReservedPath(".github-backup", [".github"]), undefined);
  assert.equal(findReservedPath("site/.github", [".github"]), undefined);
  assert.equal(findReservedPath(".github", undefined), undefined);
});

test("workflowPaths: parsed from the descriptor, carried on the built provider, and a malformed list refuses the file", () => {
  const entry = { id: "a", label: "A", apiOrigin: "https://a.test", module: "a.mjs" };
  const parsed = parseSourceControlProvidersFile(descriptorJson([{ ...entry, workflowPaths: [".ci/pipelines"] }]));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.descriptors[0]?.workflowPaths, [".ci/pipelines"]);
  const provider = buildLoadedSourceControlProvider({ descriptor: parsed.descriptors[0]!, pluginId: "a", module: { create: () => ({}) as never } }, {} as never);
  assert.deepEqual(provider.workflowPaths, [".ci/pipelines"]);

  const noneDeclared = parseSourceControlProvidersFile(descriptorJson([entry]));
  assert.ok(noneDeclared.ok);
  assert.equal("workflowPaths" in noneDeclared.descriptors[0]!, false);

  const reason = "providers[0].workflowPaths must be a list of at most 20 relative folder paths";
  for (const workflowPaths of ["x", [""], ["/abs"], ["a/../b"], [1]]) {
    assert.deepEqual(parseSourceControlProvidersFile(descriptorJson([{ ...entry, workflowPaths }])), { ok: false, reason });
  }
});

test("the bundled github plugin declares .github/workflows as its workflow path", async () => {
  const parsed = parseSourceControlProvidersFile(await readFile(path.join(GITHUB_PACKAGE_ROOT, SOURCE_CONTROL_PROVIDERS_FILENAME), "utf8"));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.descriptors.find((descriptor) => descriptor.id === "github")?.workflowPaths, [".github/workflows"]);
});

test("isUnderWorkflowPath matches exactly the declared directory, from the repository root, case-sensitively", () => {
  const github = [".github/workflows"];
  assert.equal(isUnderWorkflowPath(".github/workflows/fly-deploy.yml", github), true);
  assert.equal(isUnderWorkflowPath("fly.toml", github), false);
  assert.equal(isUnderWorkflowPath(".github/workflow/fly-deploy.yml", github), false, "singular 'workflow' is not the real directory GitHub reads");
  assert.equal(isUnderWorkflowPath("sub/.github/workflows/fly-deploy.yml", github), false, "a nested .github is not the repo-root one GitHub Actions reads");
  assert.equal(isUnderWorkflowPath(".GitHub/workflows/fly-deploy.yml", github), false, "GitHub reads only the exact spelling");
  assert.equal(isUnderWorkflowPath(".github/workflows/fly-deploy.yml", undefined), false, "a host that declares none flags nothing");
});

test("a module whose validateTarget is not a function is refused", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-git", {
      [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([{ id: "bad-validate", label: "Bad", apiOrigin: "https://a.test", module: "source-control/bad.mjs" }]),
      "source-control/bad.mjs": "export default { create() { return {}; }, validateTarget: 'no' };\n",
    });
    await markBundled(workspaceRoot, "fixture-git", digest);

    const registry = await loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, ["source-control provider 'bad-validate' from 'fixture-git' was not loaded: its module's validateTarget is not a function"]);
  });
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
