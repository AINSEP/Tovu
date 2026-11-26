import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { sql } from "kysely";
import { sqliteKernel } from "../../../platform/db/kernel/drivers/sqlite.js";
import { createKeyAttachments } from "@jini-ai/user-management/project-keys/sql/attachments";
import { jsonText } from "@jini-ai/db/kernel";
import { siteKeyAttachments } from "../../../platform/db/migrations/project/0002_site_key_attachments.js";

test("SQL attachment identity, retry, renaming and cleanup preserve other sites and keys", async t => {
  const db = new Database(":memory:"); t.after(() => db.close());
  const kernel = sqliteKernel<unknown>({ source: db });
  await siteKeyAttachments({ checksum: "new-step" }).up(kernel, { note() {} });
  const attachments = createKeyAttachments({ sql: kernel, tables: { attachments: "site_key_attachments", vault: "secrets_vault" },
    nowIso: () => new Date().toISOString(), credentialTypeText: ({ column }) => jsonText({ dialect: kernel.dialect, column, path: ["credentialType"] }),
    policy: { ownerWorkspaceId: "project", customKind: "custom", vendorKind: "vendor", vendorCredentialType: "custom", maxGrants: 100,
      tooManyKeys: "This site uses more than 100 saved keys. Remove unused site grants in Shared Keys before continuing.",
      ambiguousLabel: "More than one granted key has this label. Revoke the extra site grant in Shared Keys and choose one key.",
      noSiteId: "This site has no id yet; restart it." } });
  const a = { siteId: "uuid-a", keyId: "key-a", siteName: "A" };
  await attachments.attach(a); await attachments.attach(a);
  await attachments.attach({ siteId: "uuid-b", keyId: "key-a", siteName: "B" });
  await attachments.attach({ ...a, keyId: "key-b" });
  assert.equal((await attachments.usersOf({ keyId: "key-a" })).length, 2);
  await attachments.renameSite({ siteId: "uuid-a", siteName: "Renamed" });
  assert.deepEqual(await attachments.usersOf({ keyId: "key-b" }), [{ siteId: "uuid-a", siteName: "Renamed" }]);
  await attachments.detach(a);
  assert.equal(await attachments.isAttached(a), false);
  assert.equal(await attachments.isAttached({ siteId: "uuid-b", keyId: "key-a" }), true);
  await attachments.removeKey({ keyId: "key-a" });
  assert.deepEqual(await attachments.usersOf({ keyId: "key-a" }), []);
  assert.equal(await attachments.isAttached({ ...a, keyId: "key-b" }), true);
  assert.equal(await attachments.isAttached({ ...a, siteId: "" }), false);
  await assert.rejects(attachments.attach({ ...a, siteId: "" }), { message: "This site has no id yet; restart it." });
  assert.equal((await kernel.query(sql`SELECT * FROM site_key_attachments`)).length, 1);
});
