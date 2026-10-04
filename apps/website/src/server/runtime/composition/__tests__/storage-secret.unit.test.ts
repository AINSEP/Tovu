import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import {
  readSealedConnectionString,
  resolvePostgresConnectionString,
  STORAGE_SECRET_FILENAME,
  StorageSecretError,
  writeSealedConnectionString,
} from "../storage-secret.js";

/**
 * @file O3 — a Postgres site's connection string: sealed with the site key in the site folder, or
 * read from an environment variable; never in the clear on disk, never in an error message.
 *
 * Outcome Matrix:
 *   Given a sealed string                         -> it reads back; the file is 0600 and holds no plaintext
 *   Given another site key                        -> refused, the message names the file, not the value
 *   Given a tampered or malformed file             -> refused
 *   Given secretRef { env } set / unset            -> the value / a StorageSecretError naming the variable
 */

const URL = "postgresql://owner:PW-SENTINEL-51c3@db.example.test:5432/site";

test("new-site sealing prepares its identified key file and the default reader reopens it", (t) => {
  const dir = siteDir(t);
  const isolatedHome = path.join(dir, "isolated-home");
  const siteKeyId = "storage-secret-audit-site";
  fs.mkdirSync(isolatedHome);
  const script = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import os from "node:os";
    import { mock } from "node:test";
    mock.module("node:os", { defaultExport: { ...os, homedir: () => ${JSON.stringify(isolatedHome)} },
      namedExports: { ...os, homedir: () => ${JSON.stringify(isolatedHome)} } });
    const { sealConnectionStringForNewSite, readSealedConnectionString } =
      await import(${JSON.stringify(new globalThis.URL("../storage-secret.ts", import.meta.url).href)});
    await sealConnectionStringForNewSite({ siteDir: ${JSON.stringify(dir)}, siteKeyId: ${JSON.stringify(siteKeyId)}, connectionString: ${JSON.stringify(URL)} });
    fs.writeFileSync(${JSON.stringify(path.join(dir, ".site-meta.json"))}, JSON.stringify({ siteKeyId: ${JSON.stringify(siteKeyId)} }));
    assert.equal(await readSealedConnectionString({ siteDir: ${JSON.stringify(dir)} }), ${JSON.stringify(URL)});
  `;
  const env = { ...process.env, TOVU_RUNTIME_MODE: "local" };
  delete env.TOVU_SITE_KEY;
  delete env.TOVU_INTEGRATIONS_ROOT_KEY;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--experimental-test-module-mocks", "--input-type=module", "--eval", script],
    { env, encoding: "utf8", timeout: 15_000 });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  const keyFile = path.join(isolatedHome, ".tovu/site-keys", `${siteKeyId}.hex`);
  assert.match(fs.readFileSync(keyFile, "utf8").trim(), /^[a-f0-9]{64}$/);
  assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600);
  const raw = fs.readFileSync(path.join(dir, STORAGE_SECRET_FILENAME), "utf8");
  assert.ok(!raw.includes("PW-SENTINEL-51c3") && !raw.includes("db.example.test"));
});

function siteDir(t: test.TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-storage-secret-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function sealerFor(keyring: InMemoryKeyring) {
  return { keyring, sealer: new AesGcmSecretSealer(keyring) };
}

test("a sealed connection string round-trips; the file is 0600 and never holds it in the clear", async (t) => {
  const dir = siteDir(t);
  const key = sealerFor(new InMemoryKeyring());
  await writeSealedConnectionString({ siteDir: dir, connectionString: URL }, key);
  const file = path.join(dir, STORAGE_SECRET_FILENAME);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const raw = fs.readFileSync(file, "utf8");
  assert.ok(!raw.includes("PW-SENTINEL-51c3") && !raw.includes("db.example.test"));
  assert.equal(await readSealedConnectionString({ siteDir: dir }, { sealer: key.sealer }), URL);
  assert.equal(await resolvePostgresConnectionString({ kind: "postgres", secretRef: "site" }, { siteDir: dir }, { sealer: key.sealer }), URL);
  assert.deepEqual(fs.readdirSync(dir), [STORAGE_SECRET_FILENAME], "no temp file left behind");
});

test("another site key, a tampered file or a malformed one is refused without the value", async (t) => {
  const dir = siteDir(t);
  const mine = sealerFor(new InMemoryKeyring());
  await writeSealedConnectionString({ siteDir: dir, connectionString: URL }, mine);
  const refused = (pattern: RegExp) => (err: unknown) =>
    err instanceof StorageSecretError && pattern.test(err.message) && !err.message.includes("PW-SENTINEL");
  await assert.rejects(readSealedConnectionString({ siteDir: dir }, { sealer: sealerFor(new InMemoryKeyring()).sealer }), refused(/does not open with this site's key/));

  const file = path.join(dir, STORAGE_SECRET_FILENAME);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  parsed.sealed.ciphertext = Buffer.from("tampered").toString("base64");
  fs.writeFileSync(file, JSON.stringify(parsed));
  await assert.rejects(readSealedConnectionString({ siteDir: dir }, { sealer: mine.sealer }), refused(/does not open with this site's key/));

  fs.writeFileSync(file, JSON.stringify({ version: 2 }));
  await assert.rejects(readSealedConnectionString({ siteDir: dir }, { sealer: mine.sealer }), refused(/is not a sealed connection string/));
  fs.writeFileSync(file, "{");
  await assert.rejects(readSealedConnectionString({ siteDir: dir }, { sealer: mine.sealer }), refused(/is not valid JSON/));
});

test("secretRef { env }: the variable's value, or an error naming the variable", async (t) => {
  const dir = siteDir(t);
  const storage = { kind: "postgres" as const, secretRef: { env: "SITE_PG_URL" } };
  assert.equal(await resolvePostgresConnectionString(storage, { siteDir: dir }, { env: { SITE_PG_URL: URL } }), URL);
  await assert.rejects(
    resolvePostgresConnectionString(storage, { siteDir: dir }, { env: { SITE_PG_URL: " " } }),
    (err: unknown) => err instanceof StorageSecretError && /environment variable SITE_PG_URL, which is not set/.test(err.message)
  );
});
