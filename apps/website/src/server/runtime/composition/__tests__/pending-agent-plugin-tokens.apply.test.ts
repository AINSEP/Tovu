import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import { applyPendingAgentPluginTokens, PENDING_AGENT_PLUGIN_TOKENS_FILENAME } from "../pending-agent-plugin-tokens.js";

/**
 * @file `applyPendingAgentPluginTokens`: the new site's first boot opens the tokens create-site
 * onboarding sealed for it, imports each, and deletes the file once every token was handled.
 * Real AES-GCM sealer over an in-memory keyring; the file is written the way the seal path writes it
 * (the seal path itself makes real site-key files, so it is not exercised here).
 */

const TOKEN = "sbp_pending_token_never_logged";
const aad = (pluginId: string) => `tovu:agent-plugin-pending-token:v1:${pluginId}`;

let siteDir: string;
let sealer: AesGcmSecretSealer;
let keyring: InMemoryKeyring;

beforeEach(() => {
  siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-tokens-"));
  keyring = new InMemoryKeyring();
  sealer = new AesGcmSecretSealer(keyring);
});

afterEach(() => fs.rmSync(siteDir, { recursive: true, force: true }));

const target = () => path.join(siteDir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME);

async function writePending(tokens: Record<string, string>, sealWith = sealer): Promise<void> {
  const key = await keyring.activeKey();
  const sealed: Record<string, unknown> = {};
  for (const [pluginId, token] of Object.entries(tokens)) sealed[pluginId] = await sealWith.seal({ plaintext: token, key, aad: aad(pluginId) });
  fs.writeFileSync(target(), JSON.stringify({ version: 1, tokens: sealed }));
}

function recorder() {
  const logs = { info: [] as string[], warn: [] as string[] };
  return { logs, log: { info: (m: string) => void logs.info.push(m), warn: (m: string) => void logs.warn.push(m) } };
}

test("no pending file: nothing is imported and nothing is logged", async () => {
  const { logs, log } = recorder();
  const calls: string[] = [];
  await applyPendingAgentPluginTokens({ siteDir, sealer, importToken: async (id) => (calls.push(id), "saved") }, log);
  assert.deepEqual(calls, []);
  assert.deepEqual(logs, { info: [], warn: [] });
});

test("every token imported: each is opened with its plugin id, logged without the token, and the file is deleted", async () => {
  await writePending({ supabase: TOKEN, other: "tok-other" });
  const { logs, log } = recorder();
  const calls: Array<[string, string]> = [];
  await applyPendingAgentPluginTokens(
    { siteDir, sealer, importToken: async (id, token) => (calls.push([id, token]), id === "other" ? "already-connected" : "saved") },
    log,
  );
  assert.deepEqual(calls.sort(), [["other", "tok-other"], ["supabase", TOKEN]]);
  assert.equal(fs.existsSync(target()), false, "a fully handled file is deleted");
  assert.deepEqual(logs.info, ["[agent-plugins] connected 'supabase' with the access token given when this site was created."]);
  assert.deepEqual(logs.warn, []);
});

test("an operator-off plugin: the token is saved, the log says it stays off, and the file is deleted", async () => {
  await writePending({ supabase: TOKEN });
  const { logs, log } = recorder();
  await applyPendingAgentPluginTokens({ siteDir, sealer, importToken: async () => "saved-left-off" }, log);
  assert.equal(fs.existsSync(target()), false);
  assert.match(logs.info[0] ?? "", /stays off because an operator turned it off/);
});

test("an import that throws keeps only that token for the next boot, still sealed and 0600", async () => {
  await writePending({ supabase: TOKEN, other: "tok-other" });
  const { logs, log } = recorder();
  await applyPendingAgentPluginTokens(
    {
      siteDir,
      sealer,
      importToken: async (id) => {
        if (id === "supabase") throw new Error("store unavailable");
        return "saved";
      },
    },
    log,
  );
  const raw = fs.readFileSync(target(), "utf8");
  assert.ok(!raw.includes(TOKEN), "the kept token stays sealed");
  const kept = JSON.parse(raw) as { version: number; tokens: Record<string, unknown> };
  assert.equal(kept.version, 1);
  assert.deepEqual(Object.keys(kept.tokens), ["supabase"]);
  assert.equal(fs.statSync(target()).mode & 0o777, 0o600);
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0] ?? "", /could not connect 'supabase' .*\(will retry next start\): store unavailable/);
  assert.ok(!logs.warn.join("").includes(TOKEN));

  // The next boot retries the kept token and then deletes the file.
  const calls: string[] = [];
  await applyPendingAgentPluginTokens({ siteDir, sealer, importToken: async (id) => (calls.push(id), "saved") }, recorder().log);
  assert.deepEqual(calls, ["supabase"]);
  assert.equal(fs.existsSync(target()), false);
});

test("a token that will not open with this site's key is dropped with a warning, never imported", async () => {
  await writePending({ supabase: TOKEN }, new AesGcmSecretSealer(new InMemoryKeyring()));
  const { logs, log } = recorder();
  const calls: string[] = [];
  await applyPendingAgentPluginTokens({ siteDir, sealer, importToken: async (id) => (calls.push(id), "saved") }, log);
  assert.deepEqual(calls, []);
  assert.equal(fs.existsSync(target()), false, "no later boot could open it either");
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0] ?? "", /for 'supabase' .* does not open with this site's key; it was dropped/);
});

test("a token sealed for one plugin id does not open as another's", async () => {
  const key = await keyring.activeKey();
  const sealed = await sealer.seal({ plaintext: TOKEN, key, aad: aad("supabase") });
  fs.writeFileSync(target(), JSON.stringify({ version: 1, tokens: { other: sealed } }));
  const calls: string[] = [];
  const { logs, log } = recorder();
  await applyPendingAgentPluginTokens({ siteDir, sealer, importToken: async (id) => (calls.push(id), "saved") }, log);
  assert.deepEqual(calls, []);
  assert.match(logs.warn[0] ?? "", /for 'other' .* dropped/);
});

test("a file that is not valid JSON is removed with a warning", async () => {
  fs.writeFileSync(target(), "{not json");
  const { logs, log } = recorder();
  await applyPendingAgentPluginTokens({ siteDir, sealer, importToken: async () => "saved" }, log);
  assert.equal(fs.existsSync(target()), false);
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0] ?? "", /is not valid JSON; removing it/);
});
