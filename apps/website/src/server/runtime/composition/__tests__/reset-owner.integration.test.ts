import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { resetSelfHostedOwner } from "#src/server/runtime/composition/reset-owner";

interface OwnerRow { username: string; password_hash: string }

/** Seed a real, migrated site the way the server boot does, then release every handle. */
async function seededSite(): Promise<{ dir: string; contentDbPath: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-reset-owner-"));
  const { contentDbPath } = resolveSiteDatabasePaths({ dir }, { reserveIdentity: false });
  let store: { close(): Promise<void> } | undefined;
  const deps = await createSiteRouteDeps({}, { dbPath: contentDbPath, overrides: { onStoreOpened: ({ store: opened }: { store: { close(): Promise<void> } }) => { store = opened; } } });
  await Promise.all(Object.entries(deps).filter(([key]) => key.endsWith("Ready")).map(([, work]) => work));
  await deps.ownerPrincipalId;
  await store?.close();
  return { dir, contentDbPath };
}

function ownerRows(contentDbPath: string): OwnerRow[] {
  const db = new Database(contentDbPath, { readonly: true });
  try {
    return db.prepare(`SELECT DISTINCT u.username, u.password_hash FROM identity_users u
      JOIN principal_roles pr ON pr.principal_id=u.principal_id AND pr.workspace_id=u.workspace_id
      JOIN roles r ON r.id=pr.role_id AND r.workspace_id=pr.workspace_id WHERE r.name='owner' AND r.is_builtin=1`).all() as OwnerRow[];
  } finally { db.close(); }
}

test("a missing site directory is refused before any database is opened or created", async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-reset-owner-missing-")), "absent");
  await assert.rejects(resetSelfHostedOwner({ dir, password: "new-pass-a1" }), { message: "The site directory does not exist" });
  assert.equal(fs.existsSync(dir), false);
});

test("the single stored owner gets the new password and its username is returned", { timeout: 60_000 }, async () => {
  const { dir, contentDbPath } = await seededSite();
  const [before] = ownerRows(contentDbPath);
  assert.ok(before, "the boot seeded one owner");
  const username = await resetSelfHostedOwner({ dir, password: "new-pass-a1" });
  assert.equal(username, before.username);
  const [after] = ownerRows(contentDbPath);
  assert.equal(after?.username, before.username);
  assert.notEqual(after?.password_hash, before.password_hash);
  // The same password again is already in force: the stored hash is left as it is.
  assert.equal(await resetSelfHostedOwner({ dir, password: "new-pass-a1" }), before.username);
  assert.equal(ownerRows(contentDbPath)[0]?.password_hash, after?.password_hash);
});

test("an explicit username must name the stored owner; any other name resets nothing", { timeout: 60_000 }, async () => {
  const { dir, contentDbPath } = await seededSite();
  const [before] = ownerRows(contentDbPath);
  assert.ok(before, "the boot seeded one owner");
  await assert.rejects(resetSelfHostedOwner({ dir, password: "new-pass-b2", username: "someone-else" }),
    { message: "That username is not the site owner. Omit the username to recover the current owner account." });
  assert.deepEqual(ownerRows(contentDbPath), [before]);
  assert.equal(await resetSelfHostedOwner({ dir, password: "new-pass-b2", username: before.username }), before.username);
  assert.notEqual(ownerRows(contentDbPath)[0]?.password_hash, before.password_hash);
});

test("a site without exactly one stored owner is refused and nothing is reset", { timeout: 60_000 }, async () => {
  const { dir, contentDbPath } = await seededSite();
  const db = new Database(contentDbPath);
  try { db.prepare("DELETE FROM principal_roles WHERE role_id IN (SELECT id FROM roles WHERE name='owner' AND is_builtin=1)").run(); } finally { db.close(); }
  await assert.rejects(resetSelfHostedOwner({ dir, password: "new-pass-c3" }), { message: "The site must have exactly one stored owner" });
  assert.deepEqual(ownerRows(contentDbPath), []);
});
