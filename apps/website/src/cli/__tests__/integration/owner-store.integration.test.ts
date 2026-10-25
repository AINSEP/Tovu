import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sql } from "kysely";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { vaultRepo } from "#src/platform/db/__tests__/vault-credential.fixture";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { secretsVaultStatements } from "#src/platform/db/migrations/0012_secrets_vault";
import { FixedSiteKeyKeyring, fingerprintSiteKeyHex } from "#src/features/webhooks/keyring.env";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { childProcessCoverageEnv } from "#src/contracts/core/__tests__/helpers/child-process-coverage-env";
import { runOwnerStoreCommand, type OwnerStoreAction, type OwnerStoreEntry } from "../../commands/owner-store.js";

/** S2 boundary integration: real migrated vault tables and different site keys. Tests are
 * deliberately scoped to the CLI adapter; Jini owns crypto, transaction and migration tests.
 */
async function fixture() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-owner-cli-")));
  const userDataDir = path.join(home, "profile");
  const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, sourceRoots: [], appDataDir: userDataDir });
  const registry = createTovuVaultKinds({ policy: { validateMeta: ({ meta }) => meta,
    legacyPublishCredential: () => undefined, tokenField: () => undefined } });
  const sites: { dir: string; id: string; vault: SecretsVaultService; close: () => Promise<void> }[] = [];
  for (const id of ["first", "second"]) {
    const dir = path.join(home, id);
    fs.mkdirSync(dir);
    const hex = randomBytes(32).toString("hex");
    const keysDir = path.join(home, ".tovu", "site-keys");
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(path.join(keysDir, `${id}.hex`), hex, { mode: 0o600 });
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: id, siteKeyId: id,
      siteKeyFingerprint: fingerprintSiteKeyHex(hex), storage: { kind: "sqlite" } }));
    const dbPath = resolveSiteDatabasePaths({ dir }, { workspace, placement: "inSite", reserveIdentity: false }).contentDbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const kernel = openSqliteFileKernel<ContentDatabase>(dbPath);
    await kernel.execute(sql`CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT, slug TEXT, created_at TEXT)`);
    await kernel.execute(sql`CREATE TABLE principals(id TEXT PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO workspaces VALUES(${id},${id},${id},'2026-10-24')`);
    for (const statement of secretsVaultStatements({ dialect: "sqlite" })) await kernel.execute(sql.raw(statement));
    const keyring = new FixedSiteKeyKeyring(hex);
    const vault = new SecretsVaultService({ repo: vaultRepo(kernel), keyring,
      sealer: new AesGcmSecretSealer({ keyring }), metaParsers: registry.metaParsers,
      authorize: async () => {}, now: () => "2026-10-24T00:00:00.000Z", newId: () => "unused" });
    sites.push({ dir, id, vault, close: () => kernel.close() });
  }
  const output: string[] = [];
  const invoke = async ({ action, request = {}, site, profile = userDataDir }: {
    action: OwnerStoreAction; request?: Record<string, unknown>; site?: string; profile?: string;
  }) => {
    let exitCode = 0;
    const reply = await runOwnerStoreCommand({ action, site }, { home, workspace,
      readRequest: async () => JSON.stringify({ userDataDir: profile, ...request }),
      output: line => output.push(line), setExitCode: code => { exitCode = code; } });
    assert.equal(exitCode, reply.ok ? 0 : 1);
    assert.equal(output.at(-1)?.trim().split("\n").length, 1);
    return reply;
  };
  const close = async () => {
    for (const site of sites) await site.close();
    fs.rmSync(home, { recursive: true, force: true });
  };
  return { home, userDataDir, sites, output, invoke, close };
}

const entry = ({ value, id, expectedRevision = null }: { value: string; id?: string; expectedRevision?: number | null }) => ({
  kind: "vendor", label: "Deployment key", provider: "vercel", id, expectedRevision,
  meta: { credentialType: "vendor", worksFor: ["vercel"] }, payload: { vendorId: "vercel", token: value },
});
const scope = ({ site, id }: { site: { id: string }; id: string }) => ({ workspaceId: site.id, id,
  kind: "vendor" as const, ownerKey: "tovu", principalId: null, binding: null });

test("two sites receive a vendor key, replacement overwrites copies, revoke removes only the chosen copy", async () => {
  const f = await fixture();
  const initial = "owner-initial-secret-1234567890";
  const replacement = "owner-replacement-secret-1234567890";
  try {
    const saved = await f.invoke({ action: "put", request: { entry: entry({ value: initial }) } });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const metadata = saved.data.entry as OwnerStoreEntry;
    for (const site of f.sites) {
      assert.equal((await f.invoke({ action: "grant", request: { entryId: metadata.id, consumerId: site.dir } })).ok, true);
      // Repeated grants and syncs must remain idempotent, without multiplying rows.
      assert.equal((await f.invoke({ action: "grant", request: { entryId: metadata.id, consumerId: site.dir } })).ok, true);
      const copied = await f.invoke({ action: "sync", site: site.dir });
      assert.equal(copied.ok, true);
      if (copied.ok) assert.deepEqual(copied.data.results, [{ id: metadata.id, kind: "vendor", status: "copied" }]);
      const opened = await site.vault.get(scope({ site, id: metadata.id }));
      assert.ok(opened && opened.payload);
      assert.equal(opened.payload.token, initial, "copy opens only under the target site's own key/context");
    }
    const blocked = await f.invoke({ action: "delete", request: { entryId: metadata.id, expectedRevision: metadata.revision } });
    assert.equal(blocked.ok, false, "deletion must not leave granted copies untracked");
    const replaced = await f.invoke({ action: "put", request: { entry: entry({ value: replacement, id: metadata.id, expectedRevision: metadata.revision }) } });
    assert.equal(replaced.ok, true);
    for (const site of f.sites) {
      await f.invoke({ action: "sync", site: site.dir });
      await f.invoke({ action: "sync", site: site.dir });
      const opened = await site.vault.get(scope({ site, id: metadata.id }));
      assert.ok(opened && opened.payload);
      assert.equal(opened.payload.token, replacement);
    }
    const [first, second] = f.sites;
    assert.ok(first && second);
    fs.unlinkSync(path.join(f.home, ".tovu", "site-keys", `${first.id}.hex`));
    assert.equal((await f.invoke({ action: "revoke", site: first.dir, request: { entryId: metadata.id } })).ok, true);
    assert.equal(await first.vault.get(scope({ site: first, id: metadata.id })), null);
    await f.invoke({ action: "sync", site: first.dir });
    assert.equal(await first.vault.get(scope({ site: first, id: metadata.id })), null, "a later sync must not republish a revoked key");
    const retained = await second.vault.get(scope({ site: second, id: metadata.id }));
    assert.ok(retained && retained.payload);
    assert.equal(retained.payload.token, replacement);
    assert.ok(!f.output.join("").includes(initial));
    assert.ok(!f.output.join("").includes(replacement));
  } finally { await f.close(); }
});

test("missing owner.key with saved credentials requires recovery and never generates a replacement", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.invoke({ action: "put", request: { entry: entry({ value: "recoverable-secret-1234567890" }) } })).ok, true);
    const keyPath = path.join(f.userDataDir, "owner.key");
    fs.unlinkSync(keyPath);
    const status = await f.invoke({ action: "status" });
    assert.ok(!status.ok);
    assert.equal(status.error.code, "recovery-required");
    assert.equal(fs.existsSync(keyPath), false);
  } finally { await f.close(); }
});

test("relative and traversal paths are refused before any owner file is created", async () => {
  const f = await fixture();
  try {
    // path.join would normalize ".." away; the desktop could send it raw.
    for (const profile of ["profile", `${f.home}${path.sep}x${path.sep}..${path.sep}escaped`]) {
      const reply = await f.invoke({ action: "status", profile });
      assert.ok(!reply.ok);
      assert.equal(reply.error.code, "invalid-input");
    }
    assert.equal(fs.existsSync(path.join(f.home, "escaped")), false);
    const sync = await f.invoke({ action: "sync", site: `${f.sites[0]!.dir}${path.sep}..${path.sep}second` });
    assert.ok(!sync.ok);
    assert.equal(sync.error.code, "invalid-input");
  } finally { await f.close(); }
});

test("encrypted export restores only into an empty store and never reactivates grants", async () => {
  const f = await fixture();
  const value = "backup-secret-1234567890";
  const passphrase = "backup passphrase remains private";
  try {
    const saved = await f.invoke({ action: "put", request: { entry: entry({ value }) } });
    assert.ok(saved.ok);
    const metadata = saved.data.entry as OwnerStoreEntry;
    await f.invoke({ action: "grant", request: { entryId: metadata.id, consumerId: f.sites[0]!.dir } });
    const filePath = path.join(f.home, "shared.tovu-owner-backup");
    assert.equal((await f.invoke({ action: "export", request: { filePath, passphrase } })).ok, true);
    const envelope = fs.readFileSync(filePath, "utf8");
    assert.equal((await f.invoke({ action: "export", request: { filePath, passphrase } })).ok, false, "export never overwrites");
    assert.equal(fs.readFileSync(filePath, "utf8"), envelope);
    assert.ok(!envelope.includes(value));
    assert.ok(!envelope.includes(fs.readFileSync(path.join(f.userDataDir, "owner.key"), "utf8").trim()));
    assert.equal((await f.invoke({ action: "restore", request: { filePath, passphrase } })).ok, false);
    const profile = path.join(f.home, "restored");
    assert.equal((await f.invoke({ action: "restore", profile, request: { filePath, passphrase: "wrong" } })).ok, false);
    const restored = await f.invoke({ action: "restore", profile, request: { filePath, passphrase } });
    assert.ok(restored.ok);
    assert.equal(restored.data.restored, 1);
    const inventory = await f.invoke({ action: "list", profile });
    assert.ok(inventory.ok);
    assert.deepEqual(inventory.data.grants, []);
    assert.ok(!f.output.join("").includes(value));
    assert.ok(!f.output.join("").includes(passphrase));
  } finally { await f.close(); }
});

test("the registered CLI consumes secrets only on stdin and sanitizes malformed JSON", () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-owner-process-")));
  const secret = "must-never-appear-in-a-parser-error-12345";
  const args = ["--import", "tsx", path.resolve(import.meta.dirname, "../../main.ts"), "owner-store", "put", "--json"];
  try {
    const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 30_000,
      input: `{"userDataDir":${JSON.stringify(home)},"entry":{"payload":"${secret}"`,
      env: { ...childProcessCoverageEnv(path.join(home, "child-coverage")), HOME: home, USERPROFILE: home, TOVU_DESKTOP_USER_DATA_DIR: home,
        APPDATA: path.join(home, "Roaming"), XDG_CONFIG_HOME: home, XDG_DATA_HOME: home } });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.equal(JSON.parse(result.stdout).error.code, "invalid-input");
    assert.ok(!args.join(" ").includes(secret));
    assert.ok(!result.stdout.includes(secret));
    assert.ok(!result.stderr.includes(secret));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
