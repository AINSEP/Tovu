import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ValidationError } from '#src/platform/site-dir/errors';
import { moveSiteStorage } from '../move-site-storage.js';
import { acquireOwnerLock } from '#src/platform/db/kernel/drivers/pglite-owner';

for (const kind of ['sqlite', 'postgres', 'pglite'] as const) {
  test(`L058a storage preflight ${kind} refuses before opening databases`, async t => {
    const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'move-pin-'));
    t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
    const storage = kind === 'postgres' ? { kind, secretRef: 'site' } : { kind };
    const meta = JSON.stringify({ storage });
    fs.writeFileSync(path.join(siteDir, '.site-meta.json'), meta);
    const message = kind === 'pglite'
      ? `storage move: the site's PGlite data dir ${path.join(siteDir, 'pglite')} does not exist`
      : `storage move: this site is stored on ${kind}, not pglite${kind === 'sqlite' ? '; a SQLite site moves with the database transfer tools' : ''}`;
    await assert.rejects(moveSiteStorage({ siteDir, connectionString: 'unused', secretRef: 'site' }), { message });
    assert.equal(fs.readFileSync(path.join(siteDir, '.site-meta.json'), 'utf8'), meta);
  });
}
test('L058a held PGlite owner lock refuses without touching metadata', async t => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'move-lock-pin-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(siteDir, '.site-meta.json'), JSON.stringify({ storage: { kind: 'pglite' } }));
  const dataDir = path.join(siteDir, 'pglite');
  fs.mkdirSync(dataDir);
  const release = acquireOwnerLock({ dataDir });
  try {
    await assert.rejects(moveSiteStorage({ siteDir, connectionString: 'unused', secretRef: { env: 'PG_TEST' } }),
      { message: `storage move: the site is running (process ${process.pid}); stop it, then move it` });
  } finally { release(); }
});

test("a broken site metadata file is reported as a storage move validation error and is not rewritten", async (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-metadata-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const meta = path.join(siteDir, ".site-meta.json");
  fs.writeFileSync(meta, '{"storage":');
  await assert.rejects(moveSiteStorage({ siteDir, connectionString: "unused", secretRef: "site" }), (error: unknown) => {
    assert(error instanceof ValidationError);
    const prefix = `storage move: ${meta} cannot be read: `;
    assert.equal(error.message.slice(0, prefix.length), prefix);
    assert.notEqual(error.message.slice(prefix.length), "");
    return true;
  });
  assert.equal(fs.readFileSync(meta, "utf8"), '{"storage":');
  assert.deepEqual(fs.readdirSync(siteDir), [".site-meta.json"]);
});

test("a lock that names no process yet still refuses the move as a running site, with the process unknown", async (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-pidless-lock-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const meta = JSON.stringify({ storage: { kind: "pglite" } });
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), meta);
  const dataDir = path.join(siteDir, "pglite");
  fs.mkdirSync(dataDir);
  // A just-created lock file without its pid: a starter between create and write (fresh, so not stale).
  fs.writeFileSync(path.join(dataDir, "tovu-owner.pid"), "");
  await assert.rejects(moveSiteStorage({ siteDir, connectionString: "unused", secretRef: "site" }), (error: unknown) => {
    assert(error instanceof ValidationError);
    assert.equal(error.message, "storage move: the site is running (process unknown); stop it, then move it");
    return true;
  });
  assert.equal(fs.readFileSync(path.join(siteDir, ".site-meta.json"), "utf8"), meta);
});

test("a lock failure that is not a running site propagates as itself, not as a storage move refusal", async (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-lock-error-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const meta = JSON.stringify({ storage: { kind: "pglite" } });
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), meta);
  // The data dir "exists" but is a plain file, so the owner lock cannot be created inside it.
  fs.writeFileSync(path.join(siteDir, "pglite"), "not a directory");
  await assert.rejects(moveSiteStorage({ siteDir, connectionString: "unused", secretRef: "site" }), (error: unknown) => {
    assert.equal(error instanceof ValidationError, false);
    assert.equal((error as NodeJS.ErrnoException).code, "ENOTDIR");
    return true;
  });
  assert.equal(fs.readFileSync(path.join(siteDir, ".site-meta.json"), "utf8"), meta);
});
