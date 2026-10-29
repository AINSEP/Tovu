import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { registerAdminSiteKeyRoutes, startFreshDetail, type AdminSiteKeyDeps, type SiteKeyKeyWriter } from '../../site-key.js';

test('site key generation supplies the shared writer a live scan of this site', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'h4-site-key-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.TOVU_RUNTIME_MODE;
  process.env.TOVU_RUNTIME_MODE = 'local';
  t.after(() => { if (previous === undefined) delete process.env.TOVU_RUNTIME_MODE; else process.env.TOVU_RUNTIME_MODE = previous; });
  writeFileSync(join(dir, '.site-meta.json'), JSON.stringify({ siteKeyId: '11111111-1111-4111-8111-111111111111' }));
  const scanned: unknown[] = [];
  const writer = portFake<SiteKeyKeyWriter>({ ensureSiteKeyForSite: async ({ siteDir, findSiteKeyDependentData }) => {
    scanned.push([siteDir, await findSiteKeyDependentData(siteDir)]);
    return { action: 'mint', fingerprint: 'public-fingerprint', perSiteFilePath: '/fixture/site-key.hex' };
  } });
  const app = express();
  registerAdminSiteKeyRoutes(app, portFake<AdminSiteKeyDeps>({ workspaceId: 'ws',
    siteBinding: { name: 'fixture', dir, dirOverridden: true, switcherCompatible: false },
    authorize: async () => ({ allowed: true, reason: 'owner' }),
  }), writer);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' }; res.locals.authCredentialKind = 'session';
  res.set = (() => res) as typeof res.set;
  await extractRouteHandler(app, 'post', '/api/admin/v1/workspaces/:workspaceId/system/site-key/generate')({ params: { workspaceId: 'ws' } }, res);
  assert.deepEqual(scanned, [[dir, false]]);
  assert.deepEqual(capture, { statusCode: 201, jsonBody: { outcome: 'created', fingerprint: 'public-fingerprint', keyFilePath: '/fixture/site-key.hex', runtimeMode: 'local' } });
});

test('start-fresh warning names every affected webhook with its receiver', () => {
  assert.equal(startFreshDetail(1, [{ label: 'Orders', targetUrl: 'https://orders.example/hook' }, { label: 'Archive', targetUrl: 'https://archive.example/hook' }]),
    "1 saved credential can't be unlocked and will be removed. These webhooks get a new signing secret, so update their receivers: Orders (https://orders.example/hook), Archive (https://archive.example/hook).");
});

test('start-fresh preview lists every affected webhook without writing or disclosing the key', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'h4-site-key-preview-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, value] of [['TOVU_RUNTIME_MODE', 'local'], ['TOVU_SITE_KEY', 'a'.repeat(64)]] as const) {
    const previous = process.env[name]; process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const affectedWebhooks = [{ label: 'Orders', targetUrl: 'https://orders.example/hook' }, { label: 'Archive', targetUrl: 'https://archive.example/hook' }];
  const checked: unknown[] = [];
  const app = express();
  registerAdminSiteKeyRoutes(app, portFake<AdminSiteKeyDeps>({ workspaceId: 'ws',
    siteBinding: { name: 'fixture', dir, dirOverridden: true, switcherCompatible: false },
    authorize: async () => ({ allowed: true, reason: 'owner' }),
    webhookSubscriptionRepo: { listByWorkspace: async (input: unknown) => { checked.push(input); return affectedWebhooks.map(row => ({ ...row, signingSecret: 'private' })); } },
  }), portFake<SiteKeyKeyWriter>({ checkKey: async input => {
    checked.push(input); return { sealed: 3, opens: 1, storageSecret: 'absent', metadataOnly: 2 };
  }, installSiteKey: () => assert.fail('preview cannot install a key'), discardNotOpening: async () => assert.fail('preview cannot discard credentials') }));
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' }; res.locals.authCredentialKind = 'session';
  res.set = (() => res) as typeof res.set;
  await extractRouteHandler(app, 'get', '/api/admin/v1/workspaces/:workspaceId/system/site-key/start-fresh')({ params: { workspaceId: 'ws' } }, res);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { removes: 2, metadataOnly: 2, affectedWebhooks,
    detail: "2 saved credentials can't be unlocked and will be removed. These webhooks get a new signing secret, so update their receivers: Orders (https://orders.example/hook), Archive (https://archive.example/hook).", runtimeMode: 'local' } });
  assert.deepEqual(checked, [{ siteDir: dir, contentKernel: undefined, hex: 'a'.repeat(64) }, { workspaceId: 'ws' }]);
});
