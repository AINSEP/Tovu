import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminFsFilesCustomRootRoutes } from '../custom-root.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, INTERNAL_CODE, allowed, fixture } from '#src/server/__tests__/helpers/admin-route-failures';

test('custom root: default store uses the bound site directory across PUT, GET and DELETE', async t => {
  const siteDir = mkdtempSync(join(tmpdir(), 's02-root-'));
  const folder = mkdtempSync(join(tmpdir(), 's02-folder-'));
  t.after(() => { rmSync(siteDir, { recursive: true, force: true }); rmSync(folder, { recursive: true, force: true }); });
  const { app } = fixture(registerAdminFsFilesCustomRootRoutes, { siteBinding: { dir: siteDir }, storeOptional: undefined });
  const path = `${BASE}/fs-files/custom-root`;
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', path), { status: 200, body: { path: null } });
  const put = await dispatchJsonRequest(app, 'PUT', path, { path: folder });
  assert.equal(put.status, 200);
  // macOS canonicalizes /var to /private/var; use the response's canonical path for the read.
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', path), put);
  assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', path), { status: 200, body: { path: null } });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', path), { status: 200, body: { path: null } });
});

test('custom root: an unexpected persistence failure is a private internal error', async t => {
  const blocked = join(mkdtempSync(join(tmpdir(), 's02-root-blocked-')), 'file');
  t.after(() => rmSync(join(blocked, '..'), { recursive: true, force: true }));
  writeFileSync(blocked, 'a file cannot be a site directory');
  const { app } = fixture(registerAdminFsFilesCustomRootRoutes, { siteBinding: { dir: blocked }, storeOptional: undefined });
  assert.deepEqual(await dispatchJsonRequest(app, 'PUT', `${BASE}/fs-files/custom-root`, { path: tmpdir() }), { status: 500, body: INTERNAL_CODE });
});

for (const body of [undefined, {}, { path: '' }, { path: 42 }]) {
  test(`custom root: missing or non-string path ${JSON.stringify(body)} does not write a setting`, async t => {
    const siteDir = mkdtempSync(join(tmpdir(), 's02-root-invalid-'));
    t.after(() => rmSync(siteDir, { recursive: true, force: true }));
    const { app } = fixture(registerAdminFsFilesCustomRootRoutes, { storeOptional: { siteDir } });
    assert.deepEqual(await dispatchJsonRequest(app, 'PUT', `${BASE}/fs-files/custom-root`, body), {
      status: 400, body: { error: "'path' is required and must be a non-empty string", code: 'VALIDATION_ERROR' },
    });
    assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/fs-files/custom-root`), { status: 200, body: { path: null } });
  });
}

for (const method of ['GET', 'PUT', 'DELETE']) {
  test(`custom root ${method}: mismatched workspace and denied permission preserve the store`, async t => {
    const siteDir = mkdtempSync(join(tmpdir(), 's02-root-denied-'));
    t.after(() => rmSync(siteDir, { recursive: true, force: true }));
    const permissions: string[] = [];
    const { app } = fixture(registerAdminFsFilesCustomRootRoutes, {
      storeOptional: { siteDir }, authorize: async ({ permission }: { permission: string }) => { permissions.push(permission); return { allowed: false, reason: 'no_grant' }; },
    });
    assert.deepEqual(await dispatchJsonRequest(app, method, '/api/admin/v1/workspaces/other/fs-files/custom-root', { path: tmpdir() }), { status: 404, body: { error: 'workspace was not found' } });
    assert.deepEqual(permissions, []);
    const response = await dispatchJsonRequest(app, method, `${BASE}/fs-files/custom-root`, { path: tmpdir() });
    assert.equal(response.status, 403);
    assert.equal((response.body as { code: string }).code, 'FORBIDDEN');
    assert.equal(permissions.length, 1);
    assert.equal(permissions[0], method === 'GET' ? 'content.read' : 'fs_files.custom_root.manage');
  });
}
