import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";

import { closeSqliteConnection } from "../../../platform/db/kernel/drivers/sqlite.js";
import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
import { readTemplate } from "../../../platform/site-dir/read-template.js";
import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";
import { createSite } from "../../../platform/site-dir/site-registry.js";
import { importFixture, OWNER_PASSWORD, stamp } from "../../site-backup/__tests__/import.fixture.js";
import { SHARE_LIMITS } from "../../site-backup/share-policy.js";

// SEC-1 follow-up, kept here because a concurrent export-v2 job owns site-backup/.
// A GitHub backup now carries the share projection (no accounts). Restoring one must therefore
// never touch the target site's own accounts, or the site would be left with no owner.
const ACCOUNT_TABLES = ["principals", "identity_users", "principal_roles", "members", "member_sessions"] as const;

/** Every account row of one site, in a stable order. */
function accountRows(required: { dbPath: string }): string {
  const db = openContentDb({ filePath: required.dbPath });
  try {
    return JSON.stringify(ACCOUNT_TABLES.map(table => [table, db.$client.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]));
  } finally { closeSqliteConnection(db); }
}

/** The backup folder exactly as `site_backup_push` lays it out, zipped the way a person downloads it. */
async function githubBackupZip(required: { database: Buffer }): Promise<Buffer> {
  const entries = new Map<string, Buffer>([
    ["tovu-backup.json", Buffer.from(JSON.stringify({ format: "tovu-site-backup", formatVersion: 1 }))],
    ["database/content.db", required.database],
    ["settings/config.json", Buffer.from('{"name":"Portable"}')],
  ]);
  const files = [...entries].map(([name, bytes]) => {
    const file = new File([bytes as BlobPart], name.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: "demo-site/" + name });
    return file;
  });
  return Buffer.from(await (await zipFolderFiles({ files, maxBytes: SHARE_LIMITS.maxArchiveBytes })).arrayBuffer());
}

test("SEC-1 restore: restoring a sanitized GitHub backup keeps the target site's owner and member, and both can still sign in", async t => {
  const h = await importFixture(t);
  const target = await createSite({ name: "target", adminPassword: OWNER_PASSWORD }, { ...h.backendPorts.creationOptions, workspace: h.workspace });
  const dbPath = resolveSiteDatabasePaths({ dir: target.dir }, { workspace: h.workspace }).contentDbPath;
  const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
  const db = openContentDb({ filePath: dbPath });
  try {
    db.$client.prepare("INSERT INTO members (id,workspace_id,email,status,created_at,updated_at,version) VALUES ('member',?,'member@example.test','active',?,?,1)").run(workspaceId, stamp, stamp);
    db.$client.prepare("INSERT INTO member_sessions (id,workspace_id,member_id,token_hash,created_at,expires_at) VALUES ('member-session',?,'member','member-session-hash',?,'2099-01-01T00:00:00.000Z')").run(workspaceId, stamp);
  } finally { closeSqliteConnection(db); }
  const before = accountRows({ dbPath });
  const catalogBefore = h.workspace.registry({}).list({}).find(site => site.id === target.siteId);
  assert.ok(catalogBefore, "fixture: the target site is registered");

  // `h.safe` is `sanitizeShareDatabase` over a source site with its own owner ("source-password"),
  // session and vault row: the same projection `prepareContent` now uploads.
  const upload = await h.backend.upload({ principalId: "recipient", archive: await githubBackupZip({ database: h.safe.bytes }) });
  // Refused or installed as a NEW site: either way the target's accounts are the property under test.
  await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } }).catch((error: unknown) => error);

  assert.deepEqual(h.workspace.registry({}).list({}).find(site => site.id === target.siteId), catalogBefore, "the target stays registered at the same folder");
  assert.equal(accountRows({ dbPath }), before, "owner, roles, member and member session are untouched");
  await h.assertOwnerLogin({ dir: target.dir, rejectedPassword: "source-password" });
  const after = openContentDb({ filePath: dbPath });
  try {
    assert.deepEqual(after.$client.prepare("SELECT id,email,status FROM members").all(), [{ id: "member", email: "member@example.test", status: "active" }]);
    assert.deepEqual(after.$client.prepare("SELECT member_id,token_hash FROM member_sessions").all(), [{ member_id: "member", token_hash: "member-session-hash" }], "the member stays signed in");
  } finally { closeSqliteConnection(after); }
});
