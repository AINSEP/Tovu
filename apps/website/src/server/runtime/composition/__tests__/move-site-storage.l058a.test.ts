import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
  const release = acquireOwnerLock(dataDir);
  try {
    await assert.rejects(moveSiteStorage({ siteDir, connectionString: 'unused', secretRef: { env: 'PG_TEST' } }),
      { message: `storage move: the site is running (process ${process.pid}); stop it, then move it` });
  } finally { release(); }
});
