
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";

import { recordBundledAgentPluginDigests } from "../../bundled-digests.js";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { MAIL_ADAPTERS_FILENAME, loadMailAdapterRegistry, parseMailAdaptersFile } from "../../mail-adapter-registry.js";

/**
 * @file `mail-adapter-registry.ts` — the generic seam that lets an Agent Plugin add a mail provider.
 * Loading a module runs its code in-process, so the trust rule is the point: only an ENABLED plugin
 * whose installed digest is the one Tovu's own seed recorded is loaded, and every refusal says why.
 * Every case installs a REAL package through `installAgentPlugin`.
 */

const WORKSPACE_ID = "workspace-local";

const FIXTURE_MODULE = `export default {
  create({ credential }) {
    return {
      capabilities() { return { driver: "fixture-mail", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }; },
      async send() { return { ok: true, providerMessageId: "fixture:" + credential.token, acceptedAt: "2026-09-29T00:00:00.000Z" }; },
      async sendBatch() { return []; },
    };
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

function descriptorJson(adapters: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 1, adapters });
}

const FIXTURE_FILES = {
  [MAIL_ADAPTERS_FILENAME]: descriptorJson([{ id: "fixture-mail", label: "Fixture Mail", module: "adapters/fixture.mjs", credentialLabel: "Fixture Mail Key" }]),
  "adapters/fixture.mjs": FIXTURE_MODULE,
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
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-mail-adapters-"));
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

test("lists an adapter from an enabled, Tovu-bundled plugin and builds a working mailer from its module", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-mail", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-mail", digest);

    const registry = await loadMailAdapterRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.refusals, []);
    assert.deepEqual(
      registry.list().map((adapter) => [adapter.descriptor.id, adapter.descriptor.credentialLabel, adapter.pluginId]),
      [["fixture-mail", "Fixture Mail Key", "fixture-mail"]],
    );
    const mailer = registry.list()[0]!.module.create({ credential: { token: "tok", baseUrl: "https://x.test" }, kit: { httpClient: { send: async () => ({ status: 200, headers: {}, bodyText: "" }) } } });
    const result = await mailer.send(
      { workspaceId: WORKSPACE_ID, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "s", text: "t" },
      { idempotencyKey: "k", workspaceId: WORKSPACE_ID, sourceContext: { module: "test" } },
    );
    assert.deepEqual(result, { ok: true, providerMessageId: "fixture:tok", acceptedAt: "2026-09-29T00:00:00.000Z" });
  });
});

test("refuses a plugin whose installed digest is not the one Tovu shipped", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-mail", FIXTURE_FILES);
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fixture-mail", enabled: true, actor: "test" }, { origin: "operator-installed" });

    const registry = await loadMailAdapterRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, [
      `mail adapters from 'fixture-mail' were not loaded: only plugins shipped with Tovu may add mail adapters (installed digest ${digest.slice(0, 12)} is not the one this build shipped)`,
    ]);
  });
});

test("a disabled bundled plugin contributes nothing and is not an error", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-mail", FIXTURE_FILES);
    await markBundled(workspaceRoot, "fixture-mail", digest, false);

    const registry = await loadMailAdapterRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, []);
  });
});

test("a module without create() is refused, and a module path escaping the plugin root is refused", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("fixture-mail", {
      [MAIL_ADAPTERS_FILENAME]: descriptorJson([
        { id: "no-create", label: "No Create", module: "adapters/empty.mjs", credentialLabel: "A" },
        { id: "escapes", label: "Escapes", module: "../x.mjs", credentialLabel: "B" },
      ]),
      "adapters/empty.mjs": "export default {};\n",
    });
    await markBundled(workspaceRoot, "fixture-mail", digest);

    const registry = await loadMailAdapterRegistry({ workspaceId: WORKSPACE_ID });

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, [
      "mail adapter 'no-create' from 'fixture-mail' was not loaded: its module has no create() function",
      "mail adapter 'escapes' from 'fixture-mail' was not loaded: module path '../x.mjs' escapes the plugin root",
    ]);
  });
});

test("parseMailAdaptersFile rejects a bad schema version, a non-.mjs module, a missing credential label and a duplicate id", () => {
  assert.deepEqual(parseMailAdaptersFile("{"), { ok: false, reason: "not valid JSON" });
  assert.deepEqual(parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [] })), { ok: false, reason: "schemaVersion must be 1" });
  const entry = { id: "a", label: "A", module: "a.mjs", credentialLabel: "A key" };
  assert.deepEqual(parseMailAdaptersFile(descriptorJson([{ ...entry, module: "a.js" }])), { ok: false, reason: "adapters[0].module must be a relative path ending in .mjs" });
  assert.deepEqual(parseMailAdaptersFile(descriptorJson([{ ...entry, credentialLabel: "" }])), { ok: false, reason: "adapters[0].credentialLabel must be a non-empty string" });
  assert.deepEqual(parseMailAdaptersFile(descriptorJson([entry, entry])), { ok: false, reason: "adapters[1].id 'a' is declared twice" });
});

test("throwing modules and malformed descriptors are refused while healthy mail adapters still load", async () => {
  await withWorkspace(async (workspaceRoot) => {
    for (const [pluginId, files] of Object.entries({
      "healthy-mail": FIXTURE_FILES,
      "throwing-mail": { ...FIXTURE_FILES, "adapters/fixture.mjs": 'throw new Error("fixture import failed");' },
      "malformed-mail": { [MAIL_ADAPTERS_FILENAME]: "{" },
    })) {
      const digest = await installPackage(pluginId, files);
      await markBundled(workspaceRoot, pluginId, digest);
    }
    const registry = await loadMailAdapterRegistry({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(registry.refusals, [
      "mail adapters from 'malformed-mail' were not loaded: tovu-mail-adapters.json is invalid: not valid JSON",
      "mail adapter 'fixture-mail' from 'throwing-mail' was not loaded: fixture import failed",
    ]);
    assert.deepEqual(registry.list().map(adapter => [adapter.pluginId, adapter.descriptor.id]), [["healthy-mail", "fixture-mail"]]);
    const mailer = registry.list()[0]!.module.create({ credential: { token: "survived", baseUrl: "https://x.test" }, kit: { httpClient: { send: async () => ({ status: 200, headers: {}, bodyText: "" }) } } });
    assert.deepEqual(await mailer.send(
      { workspaceId: WORKSPACE_ID, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "s", text: "t" },
      { idempotencyKey: "k", workspaceId: WORKSPACE_ID, sourceContext: { module: "test" } },
    ), { ok: true, providerMessageId: "fixture:survived", acceptedAt: "2026-09-29T00:00:00.000Z" });
  });
});
