import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { InMemoryExternalMcpServerRepo, saveExternalMcpServer } from "#src/assistant/index";
import { openExternalMcpOAuthPayload } from "#src/assistant/external-mcp-store";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import type { McpServerConfig } from "#src/features/agent-plugins/mcp-metadata";
import { PENDING_AGENT_PLUGIN_TOKENS_FILENAME } from "../../composition/pending-agent-plugin-tokens.js";

import { importAgentPluginTokensAtBoot, type AgentPluginTokenBootSteps } from "../bootstrap.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";

/**
 * @file Boot's Agent Plugin token imports: the token typed into create-site onboarding for THIS site
 * is applied before any ambient env token, and a plugin that still has a pending token is never given
 * the env token — otherwise the env import (another account's token) saved first and the pending
 * import then found the row "already connected" and deleted the token the person chose.
 */

const deps = {} as NewsletterRouteDeps;
const options = { useMemory: false, defaultContentDbPath: () => "/sites/new-site/content.db" };

function recordingSteps(pending: readonly string[], applyThrows = false) {
  const calls: string[] = [];
  const steps: AgentPluginTokenBootSteps = {
    pendingPluginIds: (siteDir) => (calls.push(`pending-ids:${siteDir}`), new Set(pending)),
    applyPending: async (siteDir) => {
      calls.push(`apply:${siteDir}`);
      if (applyThrows) throw new Error("disk went away");
    },
    importFromEnv: async (skip) => void calls.push(`env:skip=${[...skip].sort().join(",")}`),
  };
  return { calls, steps };
}

test("pending onboarding tokens are applied first, and the env import skips every plugin that had one", async () => {
  const { calls, steps } = recordingSteps(["supabase"]);
  await importAgentPluginTokensAtBoot(deps, options, steps);
  assert.deepEqual(calls, ["pending-ids:/sites/new-site", "apply:/sites/new-site", "env:skip=supabase"]);
});

test("a failed pending apply still keeps the env import off the pending plugins", async () => {
  const { calls, steps } = recordingSteps(["supabase"], true);
  await importAgentPluginTokensAtBoot(deps, options, steps);
  assert.deepEqual(calls.at(-1), "env:skip=supabase");
});

test("memory mode has no site folder: only the env import runs, skipping nothing", async () => {
  const { calls, steps } = recordingSteps(["supabase"]);
  await importAgentPluginTokensAtBoot(deps, { ...options, useMemory: true }, steps);
  assert.deepEqual(calls, ["env:skip="]);
});

test("default boot adapters preserve a failed onboarding token over a conflicting ambient token and retry it", async (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "boot-token-order-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const envName = "TOVU_TEST_BOOT_PLUGIN_TOKEN";
  const previous = process.env[envName];
  process.env[envName] = "ambient-account-token";
  t.after(() => { if (previous === undefined) delete process.env[envName]; else process.env[envName] = previous; });
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const repo = new InMemoryExternalMcpServerRepo();
  const clock = { nowMs: () => 0, nowIso: () => "2026-09-29T00:00:00.000Z" };
  const servers: Record<string, McpServerConfig> = {
    supabase: { type: "streamable-http", url: "https://mcp.example.com/mcp", tovuAuthMode: "oauth",
      tovuTokenAuth: { helpUrl: "https://example.com/tokens", probeUrl: "https://example.com/probe", importFromEnv: envName } },
  };
  await saveExternalMcpServer({ repo, sealer, keyring, clock }, {
    workspaceId: "ws-boot-token", serverId: "supabase", transport: "streamable_http", authMode: "oauth",
    enabled: false, command: "", url: "https://mcp.example.com/mcp", args: "", allowedToolNames: "",
    writeAllowedToolNames: "", principalId: "owner", provisionedByPluginId: "supabase",
  });
  const sealed = await sealer.seal({ plaintext: "chosen-site-token", key: await keyring.activeKey(), aad: "tovu:agent-plugin-pending-token:v1:supabase" });
  const pendingFile = path.join(siteDir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME);
  fs.writeFileSync(pendingFile, JSON.stringify({ version: 1, tokens: { supabase: sealed } }));
  let failImport = true;
  const realDeps = {
    workspaceId: "ws-boot-token", clock, externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring,
    resolveInstalledPlugin: async () => {
      if (failImport) { failImport = false; throw new Error("transient plugin read failure"); }
      return { servers };
    },
    listPlugins: async () => [{ pluginId: "supabase", servers, bundled: true }],
    onConnected: async () => {}, isPluginOffByOperator: async () => false, switchPluginOn: async () => true,
  } as unknown as NewsletterRouteDeps;
  const bootOptions = { useMemory: false, defaultContentDbPath: () => path.join(siteDir, "content.db") };

  await importAgentPluginTokensAtBoot(realDeps, bootOptions);
  const failedRow = await repo.findByServerId({ workspaceId: realDeps.workspaceId, serverId: "supabase" });
  assert.equal(failedRow?.sealedOAuth, null, "ambient credentials must not take over after the pending import fails");
  assert.equal(fs.existsSync(pendingFile), true, "the chosen token remains retryable");
  await importAgentPluginTokensAtBoot(realDeps, bootOptions);
  const saved = await repo.findByServerId({ workspaceId: realDeps.workspaceId, serverId: "supabase" });
  assert.ok(saved?.sealedOAuth);
  assert.equal((await openExternalMcpOAuthPayload(sealer, saved)).staticAccessToken, "chosen-site-token");
  assert.equal(fs.existsSync(pendingFile), false);
});
