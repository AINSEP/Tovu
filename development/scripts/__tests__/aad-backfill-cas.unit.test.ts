import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../../apps/website/src/features/webhooks/keyring.memory.js";
import * as runner from "../aad-backfill-runner.js";

// Suppress only import-time CLI startup. The exported runs, pending-row selection,
// per-slot writes, shared runner, SQLite and AES-GCM all execute normally (F1.4/F3.4).
const cliMock = mock.module(new URL("../aad-backfill-runner.js", import.meta.url).href, {
  namedExports: { ...runner, runAadBackfillMain: async () => undefined },
});
const execution = await import("../backfill-execution-credential-aad.js");
const media = await import("../backfill-media-provider-credential-aad.js");
const site = await import("../backfill-site-assistant-credential-aad.js");
const mcp = await import("../backfill-external-mcp-aad.js");
cliMock.restore();

const cases = [
  { name: "execution", table: "admin_execution_credentials", identity: "principal_id", identityValue: "admin", extraColumns: "protocol, provider_id, masked", extraValues: "'openai', 'openai', 'OLD1'", prefix: "", version: "aad_version", run: execution.runExecutionCredentialAadBackfill },
  { name: "media", table: "media_provider_credentials", identity: "provider_id", identityValue: "openai", extraColumns: "key_tail", extraValues: "'OLD1'", prefix: "", version: "aad_version", run: media.runMediaProviderCredentialAadBackfill },
  { name: "site", table: "site_assistant_credentials", identity: "provider", identityValue: "openai", extraColumns: "masked", extraValues: "'OLD1'", prefix: "", version: "aad_version", run: site.runSiteAssistantCredentialAadBackfill },
  ...["env", "oauth"].map((slot) => ({ name: `mcp-${slot}`, table: "external_mcp_servers", identity: "server_id", identityValue: "server", extraColumns: "transport, auth_mode, enabled, env_names", extraValues: "'stdio', 'oauth', 1, '[]'", prefix: slot === "oauth" ? "oauth_" : "", version: slot === "oauth" ? "oauth_aad_version" : "aad_version", run: mcp.runExternalMcpAadBackfill })),
];

for (const c of cases) {
  for (const rotate of [false, true]) {
    test(`${c.name}: ${rotate ? "a concurrent rotation survives and aborts migration" : "an unchanged legacy row migrates and reopens"}`, async (t) => {
      const dir = mkdtempSync(path.join(tmpdir(), "aad-cas-"));
      const db = openContentDb(path.join(dir, "content.db"));
      t.after(() => { db.$client.close(); rmSync(dir, { recursive: true, force: true }); });
      db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES ('ws', 'Test', 'test', 'x')").run();
      if (c.name === "execution") db.$client.prepare("INSERT INTO principals (id, workspace_id, kind, display_name, status, created_at) VALUES ('admin', 'ws', 'user', 'Admin', 'active', 'x')").run();
      const keyring = new InMemoryKeyring();
      const realSealer = new AesGcmSecretSealer(keyring);
      const key = await keyring.activeKey();
      const legacy = await realSealer.seal({ plaintext: "OLD-KEY", key });
      const columns = `${c.prefix}sealed_key_id, ${c.prefix}sealed_ciphertext, ${c.prefix}sealed_nonce, ${c.prefix}sealed_alg`;
      db.$client.prepare(`INSERT INTO ${c.table} (workspace_id, ${c.identity}, ${c.extraColumns}, ${columns}, ${c.version}, created_at, updated_at) VALUES ('ws', ?, ${c.extraValues}, ?, ?, ?, ?, 0, 'x', 'x')`).run(c.identityValue, legacy.keyId, legacy.ciphertext, legacy.nonce, legacy.alg);
      let seals = 0;
      let rotated: Awaited<ReturnType<typeof realSealer.seal>> | undefined;
      let boundAad: string | undefined;
      const sealer: runner.AadBackfillDeps["sealer"] = {
        open: (input) => realSealer.open(input),
        seal: async (input) => {
          seals++;
          boundAad = input.aad;
          assert.ok(boundAad, "the actual callback must bind this row's AAD");
          if (rotate) {
            rotated = await realSealer.seal({ plaintext: "NEW-ROTATED-KEY", key, aad: boundAad });
            db.$client.prepare(`UPDATE ${c.table} SET ${c.prefix}sealed_key_id = ?, ${c.prefix}sealed_ciphertext = ?, ${c.prefix}sealed_nonce = ?, ${c.prefix}sealed_alg = ?, ${c.version} = 1 WHERE workspace_id = 'ws' AND ${c.identity} = ?`).run(rotated.keyId, rotated.ciphertext, rotated.nonce, rotated.alg, c.identityValue);
          }
          return realSealer.seal(input);
        },
      };
      const run = () => c.run({ db, keyring, sealer, log: () => undefined }, { apply: true });
      if (rotate) await assert.rejects(run, /changed 0 row/, "a stale write must report zero rows and abort (F7.1)");
      else assert.deepEqual(await run(), { migrated: 1, total: 1 });
      assert.equal(seals, 1, "the real write path must be reached exactly once");
      const row = db.$client.prepare(`SELECT ${c.prefix}sealed_key_id AS keyId, ${c.prefix}sealed_ciphertext AS ciphertext, ${c.prefix}sealed_nonce AS nonce, ${c.prefix}sealed_alg AS alg, ${c.version} AS version FROM ${c.table} WHERE workspace_id = 'ws' AND ${c.identity} = ?`).get(c.identityValue) as runner.SealedColumns & { version: number };
      assert.equal(row.version, 1);
      if (rotate) assert.equal(row.ciphertext, rotated!.ciphertext, "the rotation must survive the actual SQL callback");
      assert.equal(await realSealer.open({ sealed: row, aad: boundAad }), rotate ? "NEW-ROTATED-KEY" : "OLD-KEY");
    });
  }
}
