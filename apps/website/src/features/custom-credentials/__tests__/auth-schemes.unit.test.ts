
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../agent-plugins/activation-effects.js";
const { setAgentPluginActivation } = agentPluginActivations;
import { detectSelfDescribingAuthScheme, parseCredentialSchemesFile } from "@jini-ai/integrations/credentialed-http";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";

import { recordBundledAgentPluginDigests } from "../../agent-plugins/lifecycle.js";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "../../agent-plugins/lifecycle.js";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";

import {
  CREDENTIAL_SCHEMES_FILENAME,
  loadCredentialSchemeRegistry,
  loadCredentialSchemeRegistryFromSource,
  type CredentialSchemeRule,
} from "../auth-schemes.js";
import { BUNDLED_DEPLOY_PLUGIN_ROOT, loadBundledAuthSchemes } from "./bundled-auth-schemes.fixture.js";

/**
 * @file `auth-schemes.ts` — self-describing token scheme rules shipped as plugin data, and the pure
 * `detectSelfDescribingAuthScheme` that applies them. Replaces the old per-vendor recognizer tests
 * (`custom-credentials/providers/__tests__/`) with the same exact semantics, run against the rules the
 * bundled `deploy` plugin actually ships. Every token is SYNTHETIC, never a real credential.
 * End-to-end proof that `credentialed-request.ts` applies the rules lives in
 * `credentialed-request.unit.test.ts` and `auth-failure-diagnostic.unit.test.ts`.
 */

// ---------------------------------------------------------------------------------------------
// detect, against the bundled deploy plugin's shipped rules
// ---------------------------------------------------------------------------------------------

test("detect: a token starting with FlyV1 splits into scheme 'FlyV1' and everything after it as the value", async () => {
  assert.deepEqual(detectSelfDescribingAuthScheme({ token: "FlyV1fake_test_token_value", rules: await loadBundledAuthSchemes() }), { scheme: "FlyV1", value: "fake_test_token_value" });
});

test("detect: a token that IS exactly 'FlyV1', with nothing following it, does not match — there is no credential value left to send", async () => {
  assert.equal(detectSelfDescribingAuthScheme({ token: "FlyV1", rules: await loadBundledAuthSchemes() }), null);
});

test("detect: a token that merely CONTAINS 'FlyV1' later in the string, not as a leading prefix, does not match", async () => {
  assert.equal(detectSelfDescribingAuthScheme({ token: "opaque_FlyV1_in_the_middle", rules: await loadBundledAuthSchemes() }), null);
});

test("detect: an ordinary opaque token does not match — the overwhelming majority of tokens", async () => {
  assert.equal(detectSelfDescribingAuthScheme({ token: "opaque-secret-token", rules: await loadBundledAuthSchemes() }), null);
});

test("detect: the match is case-sensitive — a lowercase 'flyv1' prefix does not match", async () => {
  assert.equal(detectSelfDescribingAuthScheme({ token: "flyv1fake_test_token_value", rules: await loadBundledAuthSchemes() }), null);
});

test("detect: with no rules loaded, nothing matches", () => {
  assert.equal(detectSelfDescribingAuthScheme({ token: "FlyV1fake_test_token_value", rules: [] }), null);
});

test("detect: first matching rule wins, in declared order", () => {
  const rules: CredentialSchemeRule[] = [
    { id: "long", prefix: "AbcDef", scheme: "Long" },
    { id: "short", prefix: "Abc", scheme: "Short" },
  ];
  assert.deepEqual(detectSelfDescribingAuthScheme({ token: "AbcDef_rest", rules: rules }), { scheme: "Long", value: "_rest" });
  assert.deepEqual(detectSelfDescribingAuthScheme({ token: "Abc_rest", rules: rules }), { scheme: "Short", value: "_rest" });
});

test("detect: the scheme sent may differ from the prefix matched", () => {
  assert.deepEqual(detectSelfDescribingAuthScheme({ token: "pfx_value", rules: [{ id: "x", prefix: "pfx_", scheme: "Custom" }] }), { scheme: "Custom", value: "value" });
});

// ---------------------------------------------------------------------------------------------
// the bundled deploy plugin's file
// ---------------------------------------------------------------------------------------------

test("the bundled deploy plugin ships exactly one rule, fly-io, sending FlyV1 for a FlyV1 prefix", async () => {
  const registry = await loadCredentialSchemeRegistryFromSource({ pluginId: "deploy", packageRoot: BUNDLED_DEPLOY_PLUGIN_ROOT });
  assert.deepEqual(registry.rules, [{ id: "fly-io", prefix: "FlyV1", scheme: "FlyV1" }]);
  assert.deepEqual(registry.refusals, []);
});

test("a source directory without the file contributes nothing and is not an error", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-empty-auth-schemes-"));
  try {
    const registry = await loadCredentialSchemeRegistryFromSource({ pluginId: "empty", packageRoot: root });
    assert.deepEqual(registry, { rules: [], refusals: [] });
  } finally {
    await forceRemove(root);
  }
});

// ---------------------------------------------------------------------------------------------
// parseCredentialSchemesFile
// ---------------------------------------------------------------------------------------------

test("parse: accepts a valid file and ignores unknown keys such as note", () => {
  const parsed = parseCredentialSchemesFile({ raw: JSON.stringify({ schemaVersion: 1, schemes: [{ id: "a-b", prefix: "Pfx", scheme: "Pfx", note: "evidence" }] }) });
  assert.deepEqual(parsed, { ok: true, rules: [{ id: "a-b", prefix: "Pfx", scheme: "Pfx" }] });
});

test("parse: rejects each malformed shape with its exact reason", () => {
  const cases: [string, string][] = [
    ["{", "not valid JSON"],
    [JSON.stringify({ schemaVersion: 2, schemes: [] }), "schemaVersion must be 1"],
    [JSON.stringify({ schemaVersion: 1 }), "schemes must be an array of at most 32 rules"],
    [JSON.stringify({ schemaVersion: 1, schemes: ["x"] }), "schemes[0] must be an object"],
    [JSON.stringify({ schemaVersion: 1, schemes: [{ id: "Bad Id", prefix: "P", scheme: "P" }] }), "schemes[0].id must be a lowercase hyphenated id"],
    [JSON.stringify({ schemaVersion: 1, schemes: [{ id: "a", prefix: "", scheme: "P" }] }), "schemes[0].prefix must be a non-empty run of HTTP token characters"],
    [JSON.stringify({ schemaVersion: 1, schemes: [{ id: "a", prefix: "P x", scheme: "P" }] }), "schemes[0].prefix must be a non-empty run of HTTP token characters"],
    [JSON.stringify({ schemaVersion: 1, schemes: [{ id: "a", prefix: "P", scheme: "Bad Scheme" }] }), "schemes[0].scheme must be an HTTP auth-scheme name"],
    [JSON.stringify({ schemaVersion: 1, schemes: [{ id: "a", prefix: "P", scheme: "P" }, { id: "a", prefix: "Q", scheme: "Q" }] }), "schemes[1].id 'a' is declared twice"],
  ];
  for (const [raw, reason] of cases) assert.deepEqual(parseCredentialSchemesFile({ raw }), { ok: false, reason }, raw);
});

// ---------------------------------------------------------------------------------------------
// loadCredentialSchemeRegistry: bundled-digest gate YES, activation gate NO
// ---------------------------------------------------------------------------------------------

const WORKSPACE_ID = "workspace-local";
const SCHEMES_FILE = JSON.stringify({ schemaVersion: 1, schemes: [{ id: "fixture-scheme", prefix: "FixV1", scheme: "FixV1" }] });

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
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-auth-schemes-"));
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

test("registry: a Tovu-bundled plugin's rules load", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", { [CREDENTIAL_SCHEMES_FILENAME]: SCHEMES_FILE });
    await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId: "fixture-deploy", archiveDigest: digest }] });
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fixture-deploy", enabled: true, actor: "test" }, { origin: "bundled" });

    const registry = await loadCredentialSchemeRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry, { rules: [{ id: "fixture-scheme", prefix: "FixV1", scheme: "FixV1" }], refusals: [] });
  });
});

test("registry: a DISABLED bundled plugin's rules still load, so a saved credential keeps working when the plugin is switched off", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", { [CREDENTIAL_SCHEMES_FILENAME]: SCHEMES_FILE });
    await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId: "fixture-deploy", archiveDigest: digest }] });
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fixture-deploy", enabled: false, actor: "test" }, { origin: "bundled" });

    const registry = await loadCredentialSchemeRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.rules.map((rule) => rule.id), ["fixture-scheme"]);
  });
});

test("registry: an operator-installed plugin (digest not the bundled one) is refused, even when enabled", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", { [CREDENTIAL_SCHEMES_FILENAME]: SCHEMES_FILE });
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fixture-deploy", enabled: true, actor: "test" }, { origin: "operator-installed" });

    const registry = await loadCredentialSchemeRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry, {
      rules: [],
      refusals: [
        `credential schemes from 'fixture-deploy' were not loaded: only plugins shipped with Tovu may add credential schemes (installed digest ${digest.slice(0, 12)} is not the one this build shipped)`,
      ],
    });
  });
});

test("registry: a malformed file drops that plugin with the parse reason", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-deploy", { [CREDENTIAL_SCHEMES_FILENAME]: JSON.stringify({ schemaVersion: 2, schemes: [] }) });
    await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId: "fixture-deploy", archiveDigest: digest }] });

    const registry = await loadCredentialSchemeRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry, {
      rules: [],
      refusals: [`credential schemes from 'fixture-deploy' were not loaded: ${CREDENTIAL_SCHEMES_FILENAME} is invalid: schemaVersion must be 1`],
    });
  });
});

test("registry: a workspace with nothing installed has no rules and no refusals", async () => {
  await withWorkspace(async () => {
    assert.deepEqual(await loadCredentialSchemeRegistry({ workspaceId: WORKSPACE_ID }), { rules: [], refusals: [] });
  });
});

test("registry: duplicate IDs across trusted plugins remove both ambiguous rules and retain unique rules", async () => {
  await withWorkspace(async workspaceRoot => {
    for (const [pluginId, prefix] of [["first-scheme", "First"], ["second-scheme", "Second"]]) {
      const schemes = [{ id: "shared", prefix, scheme: prefix }, { id: pluginId, prefix: `${prefix}Unique`, scheme: prefix }];
      const digest = await installPackage(pluginId, { [CREDENTIAL_SCHEMES_FILENAME]: JSON.stringify({ schemaVersion: 1, schemes }) });
      await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: digest }] });
    }
    const registry = await loadCredentialSchemeRegistry({ workspaceId: WORKSPACE_ID });
    assert.deepEqual([...registry.rules].sort((a, b) => a.id.localeCompare(b.id)), [
      { id: "first-scheme", prefix: "FirstUnique", scheme: "First" },
      { id: "second-scheme", prefix: "SecondUnique", scheme: "Second" },
    ]);
    assert.deepEqual(registry.refusals, ["credential scheme 'shared' was not loaded: more than one plugin declares it"]);
  });
});

test("registry: a malformed plugin does not discard a healthy plugin's rules", async () => {
  await withWorkspace(async workspaceRoot => {
    for (const [pluginId, raw] of [["bad-scheme", "{"], ["good-scheme", SCHEMES_FILE]]) {
      const digest = await installPackage(pluginId, { [CREDENTIAL_SCHEMES_FILENAME]: raw });
      await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: digest }] });
    }
    assert.deepEqual(await loadCredentialSchemeRegistry({ workspaceId: WORKSPACE_ID }), {
      rules: [{ id: "fixture-scheme", prefix: "FixV1", scheme: "FixV1" }],
      refusals: [`credential schemes from 'bad-scheme' were not loaded: ${CREDENTIAL_SCHEMES_FILENAME} is invalid: not valid JSON`],
    });
  });
});
