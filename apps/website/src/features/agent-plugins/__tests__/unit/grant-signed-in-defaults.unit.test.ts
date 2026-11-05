import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryExternalMcpServerRepo } from "../../../external-mcp/external-mcp-store.memory.js";
import { saveExternalMcpServer } from "../../../external-mcp/external-mcp-store.js";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import { grantDeclaredToolsAtBoot } from "../../grant-signed-in-defaults.js";
import { createBundledSourceArchiveReader, installAgentPlugin, packAgentPluginDirectory } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { agentPluginActivations } from "../../activation-effects.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file `grant-signed-in-defaults.ts`'s boot heal — bug 2026-11-04 (jared-floyd, Higgsfield Media):
 * a plugin that is on, with a signed-in account, whose connection was left off with no tools because
 * the sign-in's own grant missed it. Real install, real activation storage, the real sign-in grant.
 */

const WORKSPACE = "workspace-1";
const PLUGIN = "media-fixture";
const URL_ = "https://mcp.media.example/mcp";
const ALLOW = ["generate_image", "generate_video", "models_explore", "job_status", "jobs_wait", "show_generations", "reveal_generation", "show_generation_by_ids"];
const WRITE = ["generate_image", "generate_video", "reveal_generation"];

type Activation = "operator-on" | "seed-off" | "operator-off";

async function bootWith(input: { activation: Activation; signedIn?: boolean; writeGrantsBy?: string }) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-grant-at-boot-"));
  try {
    const source = path.join(dir, "source");
    await mkdir(source);
    await writeFile(path.join(source, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN, version: "1.0.0" }));
    await writeFile(path.join(source, "mcp.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { media: { type: "streamable-http", url: URL_, tovuAuthMode: "oauth", tovuDefaultTools: { allow: ALLOW, write: WRITE } } } }));
    const packed = await packAgentPluginDirectory(source);
    const agentPluginLayout = resolveAgentPluginLayout({ siteDir: path.join(dir, "site") }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(dir, "installed") } });
    await installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: createBundledSourceArchiveReader(), layout: agentPluginLayout, workspaceId: WORKSPACE });
    const workspaceRoot = agentPluginLayout.forWorkspace(WORKSPACE).root;
    const [enabled, actor] = { "operator-on": [true, "operator-1"], "seed-off": [false, "system:seed"], "operator-off": [false, "operator-1"] }[input.activation] as [boolean, string];
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN, enabled, actor });

    const repo = new InMemoryExternalMcpServerRepo();
    const keyring = new InMemoryKeyring();
    const clock = { nowMs: () => Date.parse("2026-11-04T12:00:00.000Z"), nowIso: () => "2026-11-04T12:00:00.000Z" };
    await saveExternalMcpServer({ repo, sealer: new AesGcmSecretSealer(keyring), keyring, clock }, {
      workspaceId: WORKSPACE, serverId: "media", label: `${PLUGIN} · media`, transport: "streamable_http", authMode: "oauth", enabled: false,
      command: "", url: URL_, args: "", allowedToolNames: "", writeAllowedToolNames: "", oauth: { grant: "authorization_code" },
      principalId: "operator-1", provisionedByPluginId: PLUGIN,
    });
    const provisioned = (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "media" }))!;
    // A finished sign-in (`persistTokens`), and optionally someone having set the write grants before.
    await repo.upsert({ ...provisioned, oauthStatus: input.signedIn === false ? null : "connected", writeGrantsUpdatedByPrincipalId: input.writeGrantsBy ?? null });

    let rosterNotifications = 0;
    const log = { info: [] as string[], warn: [] as string[] };
    await grantDeclaredToolsAtBoot(
      { workspaceId: WORKSPACE, agentPluginLayout, repo, clock, notifyRosterChanged: async () => { rosterNotifications += 1; } },
      { info: (message) => log.info.push(message), warn: (message) => log.warn.push(message) },
    );
    const row = (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "media" }))!;
    const activationAfter = (await agentPluginActivations.readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN];
    return { row, rosterNotifications, log, activationAfter };
  } finally {
    await forceRemove(dir);
  }
}

test("boot turns on a signed-in connection of an on plugin with exactly its declared tools and writes — no restart, no Settings trip", async () => {
  const { row, rosterNotifications, log } = await bootWith({ activation: "operator-on" });
  assert.equal(row.enabled, true);
  assert.deepEqual(JSON.parse(row.allowedToolNames!), ALLOW);
  assert.deepEqual(JSON.parse(row.writeAllowedToolNames!), WRITE);
  assert.equal(row.writeGrantsUpdatedByPrincipalId, "system:connect-defaults");
  assert.equal(rosterNotifications, 1, "the running assistant is told to load the new tools");
  assert.deepEqual(log.warn, []);
  assert.equal(log.info.length, 1);
});

test("boot never switches a plugin on: the seeder's default-off and an operator's off both leave the row and the plugin alone", async () => {
  for (const activation of ["seed-off", "operator-off"] as const) {
    const { row, rosterNotifications, activationAfter } = await bootWith({ activation });
    assert.deepEqual([row.enabled, row.allowedToolNames, row.writeAllowedToolNames], [false, "[]", "[]"], activation);
    assert.equal(activationAfter?.enabled, false, activation);
    assert.equal(rosterNotifications, 0, activation);
  }
});

test("boot grants nothing to a connection that is not signed in", async () => {
  const { row, rosterNotifications } = await bootWith({ activation: "operator-on", signedIn: false });
  assert.deepEqual([row.enabled, row.allowedToolNames, row.writeAllowedToolNames], [false, "[]", "[]"]);
  assert.equal(rosterNotifications, 0);
});

test("boot leaves a row whose write grants someone already set (an operator emptied it on purpose)", async () => {
  const { row, rosterNotifications } = await bootWith({ activation: "operator-on", writeGrantsBy: "operator-1" });
  assert.deepEqual([row.enabled, row.allowedToolNames, row.writeAllowedToolNames], [false, "[]", "[]"]);
  assert.equal(rosterNotifications, 0);
});
