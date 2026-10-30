/** s5: path spelling never grants access; only the site or the persisted human selection can. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveSiteFileRequest } from '../site-file-request.js';

test('picked-folder relative, absolute and home-relative paths resolve to the same guarded read', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 's5-picked-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const site = path.join(base, 'site');
  const picked = path.join(base, 'Additional Assets');
  fs.mkdirSync(site); fs.mkdirSync(picked);
  fs.writeFileSync(path.join(picked, 'logo.svg'), '<svg/>');
  const routeDeps = { workspaceId: 'ws', siteBinding: { dir: site }, resolveRoots: () => ({ site, custom: picked, repo: base }) };
  const expected = { rootPath: fs.realpathSync(picked), relativePath: 'logo.svg' };
  for (const source of ['logo.svg', path.join(picked, 'logo.svg'), '~/Additional Assets/logo.svg']) {
    assert.deepEqual(resolveSiteFileRequest({ routeDeps, root: 'custom', relativePath: source }, { homeDir: base }), expected);
  }
  assert.deepEqual(resolveSiteFileRequest({ routeDeps, root: 'site' }), { rootPath: fs.realpathSync(site), relativePath: '.' });
  for (const source of ['../unpicked.svg', path.join(base, 'unpicked.svg'), '.env']) {
    assert.throws(() => resolveSiteFileRequest({ routeDeps, root: 'custom', relativePath: source }), /folder button.*root.*custom/);
  }
  assert.throws(() => resolveSiteFileRequest({ routeDeps, root: 'repo' }), /repo is unavailable/);
  if (process.platform !== 'win32') {
    fs.symlinkSync(site, path.join(picked, 'escape'));
    assert.throws(() => resolveSiteFileRequest({ routeDeps, root: 'custom', relativePath: 'escape/private.txt' }), /symbolic link/);
  }
});
