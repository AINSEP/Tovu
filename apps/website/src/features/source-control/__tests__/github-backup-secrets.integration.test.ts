import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { sanitizeShareDatabase } from "#src/server/runtime/composition/site-portability";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential } from "../../custom-credentials/store.js";
import { planSiteBackup, pushSiteBackup, type PushResult, type SiteBackupToolDeps } from "../../site-backup/backup-service.js";
import { FakeGitHub } from "../../site-backup/__tests__/fixtures/fake-github.js";
import { SiteBackupPlanStore } from "../../site-backup/plan-store.js";
import { SiteBackupPushJobs } from "../../site-backup/push-jobs.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { githubFromSource } from "./fixtures/github-from-source.js";

// Export review, security flag 1. Kept here because a concurrent export-v2 job owns site-backup/.
test("SEC-1: GitHub backup excludes password hashes, sessions, magic-link tokens and sealed vault rows", async (t) => {
  const stamp = "2026-10-26T12:00:00.000Z";
  const expires = "2099-01-01T00:00:00.000Z";
  const canaries = {
    passwordHash: "BACKUP_CANARY_PASSWORD_HASH_719e2cb3",
    session: "BACKUP_CANARY_ADMIN_SESSION_719e2cb3",
    memberSession: "BACKUP_CANARY_MEMBER_SESSION_719e2cb3",
    magicLink: "BACKUP_CANARY_MAGIC_LINK_719e2cb3",
    sealedVault: "BACKUP_CANARY_SEALED_CIPHERTEXT_719e2cb3",
  };
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-github-backup-secrets-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const siteDir = path.join(dir, "demo-site");
  await mkdir(siteDir);
  await writeFile(path.join(siteDir, "config.json"), JSON.stringify({ name: "Backup fixture" }));
  const sql = openContentDb({ filePath: ":memory:" }).$client;
  t.after(() => sql.close());
  sql.prepare("INSERT INTO workspaces (id,slug,name,created_at) VALUES ('ws','site','Site',?)").run(stamp);
  sql.prepare("INSERT INTO principals (id,workspace_id,kind,display_name,status,created_at) VALUES ('owner','ws','user','Owner','active',?)").run(stamp);
  sql.prepare("INSERT INTO identity_users (principal_id,workspace_id,username,password_hash) VALUES ('owner','ws','owner',?)").run(canaries.passwordHash);
  sql.prepare("INSERT INTO sessions (id,workspace_id,principal_id,token_hash,created_at,expires_at) VALUES ('session','ws','owner',?,?,?)").run(canaries.session, stamp, expires);
  sql.prepare("INSERT INTO members (id,workspace_id,email,status,created_at,updated_at,version) VALUES ('member','ws','member@example.test','active',?,?,1)").run(stamp, stamp);
  sql.prepare("INSERT INTO member_sessions (id,workspace_id,member_id,token_hash,created_at,expires_at) VALUES ('member-session','ws','member',?,?,?)").run(canaries.memberSession, stamp, expires);
  sql.prepare("INSERT INTO member_magic_tokens (id,workspace_id,member_id,token_hash,purpose,created_at,expires_at) VALUES ('magic-link','ws','member',?,'login',?,?)").run(canaries.magicLink, stamp, expires);
  // Opaque envelope fixture: no real key or recoverable secret is needed to prove ciphertext leaks.
  sql.prepare(`INSERT INTO secrets_vault
    (workspace_id,id,kind,owner_key,label,is_default,revision,meta,created_at,updated_at,
     sealed_key_id,sealed_ciphertext,sealed_nonce,sealed_alg)
    VALUES ('ws','vault','custom','tovu','fixture',0,1,'{}',?,?,'fixture-key',?,'fixture-nonce','aes-256-gcm')`)
    .run(stamp, stamp, canaries.sealedVault);
  sql.prepare(`INSERT INTO posts
    (id,workspace_id,title,slug,body_json,status,kind,updated_at,version)
    VALUES ('post','ws','Content survives backup','post','{"type":"doc"}','published','post',?,1)`)
    .run(stamp);
  const snapshot = sql.serialize();
  for (const value of Object.values(canaries)) assert.ok(snapshot.includes(Buffer.from(value)), "fixture must contain every private canary");

  const github = new FakeGitHub();
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await createCustomCredential({
    repo, keyring, sealer, clock: createFakeClock({ startIso: stamp }), idGen: { newId: () => "backup-credential" },
  }, {
    workspaceId: "ws", label: "github", category: "source-control", baseUrl: "https://api.github.com",
    additionalHosts: [], connection: { token: "fixture_fake_token_never_real" },
  });
  const deps: SiteBackupToolDeps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: "ws",
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    customCredentialsHttpClient: github,
    loadSourceControlProviders: githubFromSource,
    dbOps: {
      getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }),
      captureRestorePoint: async () => {
        const artifactRef = path.join(dir, "snapshot.db");
        await writeFile(artifactRef, snapshot);
        return { artifactRef, watermarkAtCapture: 42 };
      },
      restoreFromArtifact: async () => assert.fail("a backup must never restore the live database"),
    },
    siteBackupSources: {
      siteDir, mediaUploadsDir: null, themesDir: path.join(siteDir, "themes"),
      agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(siteDir, "agent-plugins") } }),
      skillsDir: path.join(siteDir, "skills"), tovuVersion: "test",
    },
    siteBackupPlanStore: new SiteBackupPlanStore(),
    siteBackupPushJobs: new SiteBackupPushJobs<PushResult>(),
    siteBackupSiteKeyStatus: () => ({ active: true }),
    siteBackupSanitize: sanitizeShareDatabase,
    siteBackupNow: () => new Date(stamp),
  };
  const caller = { principal: { id: "owner" }, signal: new AbortController().signal };
  const plan = await planSiteBackup({ deps, call: { ...caller, input: {
    owner: "octo", repo: "backups", credential: "github",
    include: { database: true, media: false, themes: false, plugins: false, settings: false },
  } } }) as { planned: boolean; planId: string };
  assert.equal(plan.planned, true, JSON.stringify(plan));
  const pushed = await pushSiteBackup({ deps, call: { ...caller, input: { planId: plan.planId } } });
  assert.equal(pushed.pushed, true, JSON.stringify(pushed));
  assert.deepEqual(github.unexpected, []);
  const uploaded = github.files.get("demo-site/database/content.db");
  assert.ok(uploaded, "successful backup must contain its content database");
  const backedUp = new Database(uploaded);
  t.after(() => backedUp.close());
  assert.deepEqual(backedUp.prepare("SELECT id,title FROM posts").all(), [{ id: "post", title: "Content survives backup" }]);

  // Inspect every uploaded blob, including unreferenced blobs, as well as inline committed files.
  // Scanning raw SQLite bytes also catches private values left behind in free pages after DELETE.
  const payloads = [...github.blobContents, ...github.files.values()];
  const leakedCanaries = Object.entries(canaries)
    .filter(([, value]) => payloads.some(bytes => bytes.includes(Buffer.from(value))))
    .map(([kind]) => kind);
  assert.deepEqual(leakedCanaries, [], "GitHub backup payload must contain no private canaries");
  for (const table of ["sessions", "member_sessions", "member_magic_tokens", "secrets_vault"]) {
    assert.deepEqual(backedUp.prepare(`SELECT * FROM "${table}"`).all(), [], `${table} rows must not leave the site`);
  }
});
