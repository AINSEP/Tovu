import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { applyPendingAgentPluginTokens, listPendingAgentPluginTokenIds, PENDING_AGENT_PLUGIN_TOKENS_FILENAME, sealPendingAgentPluginTokensForNewSite } from "../pending-agent-plugin-tokens.js";

/** In-process coverage of the onboarding token file: key refusal, sealing with the new site's
 * sealer, and the id listing's tolerance of malformed files. */

function siteDir(t: test.TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-tokens-seal-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

for (const action of ["invalid", "refuse"] as const) {
  test(`a ${action} site key refuses before any token file is written`, async (t) => {
    const dir = siteDir(t);
    const dependentChecks: boolean[] = [];
    await assert.rejects(
      sealPendingAgentPluginTokensForNewSite({ siteDir: dir, siteKeyId: "k", tokens: { "plugin-a": "tok" } }, {
        ensure: async (input) => { dependentChecks.push(await input.findSiteKeyDependentData!(input.siteDir)); return { action } as never; },
        sealerFor: () => { throw new Error("must not build a sealer after a refusal"); },
      }),
      { message: `could not prepare the new site's key to store its access tokens (${action})` },
    );
    assert.deepEqual(dependentChecks, [false]);
    assert.equal(fs.existsSync(path.join(dir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME)), false);
  });
}

test("tokens are sealed with the new site's sealer and import back through the apply path", async (t) => {
  const dir = siteDir(t);
  const keyring = new InMemoryKeyring();
  const sealing = { keyring, sealer: new AesGcmSecretSealer(keyring) };
  const keyIds: string[] = [];
  await sealPendingAgentPluginTokensForNewSite({ siteDir: dir, siteKeyId: "k-new", tokens: { "plugin-a": "tok-a", "plugin-b": "tok-b" } }, {
    ensure: async () => ({ action: "mint" }) as never,
    sealerFor: (siteKeyId) => { keyIds.push(siteKeyId); return sealing; },
  });
  assert.deepEqual(keyIds, ["k-new"]);
  const raw = fs.readFileSync(path.join(dir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME), "utf8");
  assert.equal(raw.includes("tok-a") || raw.includes("tok-b"), false);
  assert.deepEqual([...listPendingAgentPluginTokenIds(dir)], ["plugin-a", "plugin-b"]);
  const imported: Array<[string, string]> = [];
  await applyPendingAgentPluginTokens({ siteDir: dir, sealer: sealing.sealer, importToken: async (pluginId, token) => { imported.push([pluginId, token]); return "saved"; } },
    { info: () => {}, warn: () => {} });
  assert.deepEqual(imported, [["plugin-a", "tok-a"], ["plugin-b", "tok-b"]]);
});

for (const [name, contents] of [["null", "null"], ["an array of tokens", '{"version":1,"tokens":["x"]}'], ["no tokens field", '{"version":1}']] as const) {
  test(`listing pending token ids of a file holding ${name} is empty`, (t) => {
    const dir = siteDir(t);
    fs.writeFileSync(path.join(dir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME), contents);
    assert.deepEqual([...listPendingAgentPluginTokenIds(dir)], []);
  });
}

test("applying a file with no tokens field removes it without importing anything", async (t) => {
  const dir = siteDir(t);
  const target = path.join(dir, PENDING_AGENT_PLUGIN_TOKENS_FILENAME);
  fs.writeFileSync(target, '{"version":1}');
  const keyring = new InMemoryKeyring();
  await applyPendingAgentPluginTokens({ siteDir: dir, sealer: new AesGcmSecretSealer(keyring), importToken: async () => { throw new Error("nothing to import"); } },
    { info: () => {}, warn: () => {} });
  assert.equal(fs.existsSync(target), false);
});
