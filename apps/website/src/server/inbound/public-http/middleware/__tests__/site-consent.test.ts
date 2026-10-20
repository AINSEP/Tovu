/** @file Consent 1b public wiring: static/live split, boot failures and durable-proof failures. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { JSDOM } from 'jsdom';
import { registerConsentHttp } from '@jini-ai/cms/consent/express';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import { applySiteConsent, CONSENT_RECEIPTS_DIR_NAME, createSiteConsentPorts } from '../site-consent.js';
import { bindSiteConsentService } from '#src/server/runtime/composition/site-consent';

async function publicFixture({ t }: { t: import('node:test').TestContext }, _options = {}) {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const deps = createRouteDeps(); deps.consentStore = f.store;
  return { ...f, deps, revisionId: saved.revision.id };
}

test('live HTML is gated and static export returns 409 without changing the live delivery mode', async t => {
  const f = await publicFixture({ t }); const app = express();
  applySiteConsent({ app, deps: f.deps });
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body><script>window.optional=1</script></body></html>'));
  const base = await startTestServer(app, t);
  const exported = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(exported.status, 409);
  const live = await fetch(base); const html = await live.text();
  assert.equal(live.status, 200); assert.match(html, /data-jini-consent-script/);
  assert.match(html, /window.optional=1/); assert.equal(live.headers.get('cache-control'), 'private, no-store');
  const config = await createSiteConsentPorts({ deps: f.deps }).config.get({});
  assert.equal(config.policyVersion, `${f.config.policyVersion}:${f.revisionId}`);
});

test('bootstrap or policy-store failure never returns ungated active HTML', async t => {
  const f = await publicFixture({ t });
  const failing = { ...f.store, read: async () => { throw new Error('sensitive persisted location'); } };
  f.deps.consentStore = failing;
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get('/', (_req, res) => res.type('html').send('<html><body><script>window.leaked=1</script></body></html>'));
  const base = await startTestServer(app, t); const html = await (await fetch(base)).text();
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.ok(![...document.querySelectorAll('script')].some(script => script.textContent === 'window.leaked=1'));
  assert.ok(!html.includes('sensitive persisted location'));
  dom.window.close();
});

test('cached OFF cannot bypass consent after publishing ON when the next policy read fails', async t => {
  const f = consentFixture({ t });
  const off = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled: false }, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: off.revision.id, expectedPublishedId: null });
  const deps = createRouteDeps(); deps.consentStore = f.store;
  const app = express(); applySiteConsent({ app, deps });
  const original = '<html><head></head><body><script>window.optional=1</script></body></html>';
  app.get('/', (_req, res) => res.type('html').send(original));
  const base = await startTestServer(app, t);
  assert.equal(await (await fetch(base)).text(), original);
  const on = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, regionMode: 'opt-out' }, expectedDraftId: off.revision.id });
  await f.service.publish({ principalId: 'owner', draftId: on.revision.id, expectedPublishedId: off.revision.id });
  deps.consentStore = { ...f.store, read: async () => { throw new Error('sensitive policy storage path'); } };
  const response = await fetch(base);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const dom = new JSDOM(html);
  try {
    const state = JSON.parse(dom.window.document.querySelector('#jini-consent-config')!.textContent!);
    assert.deepEqual(state.choices, { necessary: true, functional: false, analytics: false, marketing: false });
    assert.ok(dom.window.document.querySelector('template[data-jini-consent-script]'));
    assert.ok(![...dom.window.document.querySelectorAll('script')].some(script => script.textContent === 'window.optional=1'));
    assert.ok(!html.includes('sensitive policy storage path'));
  } finally { dom.window.close(); }
  const exported = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(exported.status, 409);
  assert.match(await exported.text(), /Static export requires/);
});

test('bound readiness counts the serving site receipts and blocks when that directory is unavailable', async t => {
  const f = await publicFixture({ t });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tovu-consent-health-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  f.deps.siteBinding = { ...f.deps.siteBinding, dir: directory };
  f.deps.authorize = f.ports.authorize;
  f.deps.siteTitleReady = Promise.resolve();
  f.deps.createSiteApp = () => {
    const app = express();
    app.get('/', (_req, res) => res.type('html').send('<html><head></head><body>Site</body></html>'));
    return app;
  };
  const service = bindSiteConsentService({ deps: f.deps });
  const config = { ...f.config, privacyPolicyUrl: 'https://site.example/privacy' };
  const empty = await service.readiness({ principalId: 'owner', config });
  assert.equal(empty.ready, true);
  assert.deepEqual(empty.receipts, { writable: true, count: 0 });
  const receipts = path.join(directory, CONSENT_RECEIPTS_DIR_NAME);
  await fs.writeFile(path.join(receipts, 'receipt_01234567890123456789.json'), '{}');
  assert.deepEqual((await service.readiness({ principalId: 'owner', config })).receipts, { writable: true, count: 1 });
  await fs.rm(receipts, { recursive: true });
  await fs.writeFile(receipts, 'a file cannot store receipt files');
  const failed = await service.readiness({ principalId: 'owner', config });
  assert.equal(failed.ready, false);
  assert.deepEqual(failed.receipts, { writable: false, count: null });
  assert.ok(failed.blockingProblems.some(problem => problem.code === 'RECEIPT_STORAGE_UNAVAILABLE'));
  assert.ok(!JSON.stringify(failed).includes(directory));
});

test('a receipt save failure issues no cookie; cross-origin posts are refused before saving', async t => {
  const f = await publicFixture({ t }); let writes = 0;
  const ports = createSiteConsentPorts({ deps: f.deps });
  ports.records = { read: async () => null, save: async () => { writes++; throw new Error('durability failure'); } };
  const app = express(); registerConsentHttp({ app, ports });
  const base = await startTestServer(app, t);
  const send = (origin: string) => fetch(`${base}/api/site-consent`, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ action: 'accept', policyVersion: `${f.config.policyVersion}:${f.revisionId}` }) });
  const foreign = await send('https://attacker.example'); assert.equal(foreign.status, 403); assert.equal(writes, 0);
  const failed = await send(base); assert.equal(failed.status, 500); assert.equal(failed.headers.get('set-cookie'), null); assert.equal(writes, 1);
});

test('a missing or malformed receipt in opt-out mode still denies optional categories', async t => {
  const f = await publicFixture({ t });
  const next = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, regionMode: 'opt-out' }, expectedDraftId: f.revisionId });
  await f.service.publish({ principalId: 'owner', draftId: next.revision.id, expectedPublishedId: f.revisionId });
  const ports = createSiteConsentPorts({ deps: f.deps });
  ports.records = { read: async () => null, save: async () => assert.fail('reading proof cannot write') };
  const app = express(); registerConsentHttp({ app, ports });
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body><script>window.optional=1</script></body></html>'));
  const base = await startTestServer(app, t);
  for (const cookie of ['jini_consent=short', 'jini_consent=missing_01234567890123456789']) {
    const html = await (await fetch(base, { headers: { cookie } })).text();
    const dom = new JSDOM(html);
    const state = JSON.parse(dom.window.document.querySelector('#jini-consent-config')!.textContent!);
    assert.deepEqual(state.choices, { necessary: true, functional: false, analytics: false, marketing: false });
    dom.window.close();
  }
});
