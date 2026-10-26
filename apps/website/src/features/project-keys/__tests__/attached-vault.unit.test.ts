import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { attachedOnlyVault } from "../attached-vault.js";
import { protectProjectKeyDeletes } from "../protected-vault.js";
import { fakeAttachments, vaultRow } from "./helpers.js";

const query = { workspaceId: "project", kind: "vendor" as const, ownerKey: "tovu", principalId: null, provider: "host" };
test("attached inventory includes nondefaults while the vault default remains the stored default", async () => {
  const vault = new InMemoryVaultRepo({}); const attachments = fakeAttachments();
  await vault.put({ record: vaultRow(), expectedRevision: null });
  await vault.put({ record: { ...vaultRow({ id: "key-b" }), label: "B", isDefault: false }, expectedRevision: null });
  await attachments.attach({ siteId: "site-a", siteName: "A", keyId: "key-b" });
  const view = attachedOnlyVault({ vault, attachments, siteId: "site-a" });
  assert.deepEqual((await view.list(query)).map(row => row.id), ['key-b']);
  assert.equal(await view.findDefault!(query), null);
  assert.equal((await vault.findDefault(query))?.id, "key-a", "selection never mutates project defaults");
  await vault.put({ record: { ...vaultRow({ id: "key-c" }), label: "C", isDefault: false }, expectedRevision: null });
  await attachments.attach({ siteId: "site-a", siteName: "A", keyId: "key-c" });
  assert.deepEqual((await view.list(query)).map(row => row.id), ['key-b', 'key-c']);
  assert.equal(await view.findDefault!(query), null);
  await attachments.attach({ siteId: "site-a", siteName: "A", keyId: "key-a" });
  assert.equal((await view.findDefault!(query))?.id, "key-a");
});
test("unattached writes stay hidden; attachment, isolation and detach apply to every read immediately", async () => {
  const vault = new InMemoryVaultRepo({});
  const attachments = fakeAttachments();
  const a = attachedOnlyVault({ vault, siteId: "site-a", attachments });
  const b = attachedOnlyVault({ vault, siteId: "site-b", attachments });
  const record = await a.put({ record: vaultRow(), expectedRevision: null });
  assert.equal(record.id, "key-a");
  const key = { workspaceId: "project", id: record.id };
  assert.equal(await a.find(key), null);
  assert.deepEqual(await a.list(query), []);
  assert.equal(await a.findDefault!(query), null);
  assert.equal(await a.findOne!({ ...query }), null);
  await attachments.attach({ siteId: "site-a", keyId: record.id, siteName: "A" });
  assert.equal((await a.find(key))?.id, record.id);
  assert.equal((await a.findDefault!(query))?.id, record.id);
  assert.equal((await a.findOne!(query))?.id, record.id);
  assert.deepEqual((await a.list(query)).map(row => row.id), [record.id]);
  assert.equal(await b.find(key), null);
  await attachments.detach({ siteId: "site-a", keyId: record.id });
  assert.equal(await a.find(key), null);
  assert.equal(await a.findDefault!(query), null);
  assert.equal(await a.findOne!(query), null);
  assert.deepEqual(await a.list(query), []);
  const missing = attachedOnlyVault({ vault, siteId: "", attachments });
  assert.equal(await missing.find(key), null);
});

test("project deletes refuse other users, preserve both row and attachments, and clean up a permitted delete", async () => {
  const vault = new InMemoryVaultRepo({}); const attachments = fakeAttachments();
  await vault.put({ record: vaultRow(), expectedRevision: null });
  await attachments.attach({ siteId: "site-a", siteName: "A", keyId: "key-a" });
  await attachments.attach({ siteId: "site-b", siteName: "B", keyId: "key-a" });
  const protectedVault = protectProjectKeyDeletes({ vault, attachments, siteId: "site-a", transaction: async ({ run }) => run() });
  const input = { workspaceId: "project", id: "key-a", expectedRevision: 1 };
  await assert.rejects(protectedVault.delete(input), { message: "Used by B too. To stop using it here, choose 'Stop using it on this site'." });
  await assert.rejects(protectedVault.applyBatch!({ ops: [{ delete: input }] }), { message: "Used by B too. To stop using it here, choose 'Stop using it on this site'." });
  assert.equal((await vault.find(input))?.id, "key-a");
  assert.equal((await attachments.usersOf({ keyId: "key-a" })).length, 2);
  await attachments.detach({ siteId: "site-b", keyId: "key-a" });
  assert.equal(await protectedVault.delete(input), true);
  assert.deepEqual(await attachments.usersOf({ keyId: "key-a" }), []);
  await vault.put({ record: vaultRow(), expectedRevision: null });
  assert.equal(await attachments.isAttached({ siteId: "site-a", keyId: "key-a" }), false, "reusing a fixed id never silently reattaches it");
});


test("a batch containing another site's key refuses before deleting any earlier key", async () => {
  const vault = new InMemoryVaultRepo({}); const attachments = fakeAttachments();
  await vault.put({ record: vaultRow(), expectedRevision: null });
  await vault.put({ record: { ...vaultRow({ id: "key-b" }), label: "Other", isDefault: false }, expectedRevision: null });
  await attachments.attach({ siteId: "site-a", siteName: "A", keyId: "key-a" });
  await attachments.attach({ siteId: "site-b", siteName: "B", keyId: "key-b" });
  const protectedVault = protectProjectKeyDeletes({ vault, attachments, siteId: "site-a", transaction: async ({ run }) => run() });
  const first = { workspaceId: "project", id: "key-a", expectedRevision: 1 };
  const second = { ...first, id: "key-b" };
  await assert.rejects(protectedVault.applyBatch!({ ops: [{ delete: first }, { delete: second }] }), { message: "Used by B too. To stop using it here, choose 'Stop using it on this site'." });
  assert.equal((await vault.find(first))?.id, "key-a");
  assert.equal((await vault.find(second))?.id, "key-b");
  assert.equal(await attachments.isAttached({ siteId: "site-a", keyId: "key-a" }), true);
});
