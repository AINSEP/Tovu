import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { applyPublishedWebMcp } from '../published-webmcp.js';

test('visitor content lookup is lazy, once per eligible HTML response, and absent for exports', async t => {
  const app = express();
  let lookups = 0;
  applyPublishedWebMcp({ app, readEnabled: async () => false,
    allowsVisitorPublication: async () => { lookups++; return true; } });
  app.get('/plain', (_req, res) => res.type('html').send('<html><body>Plain</body></html>'));
  app.get('/widget', (_req, res) => res.type('html').send('<html><body><div id="tovu-site-assistant-root"></div></body></html>'));
  const base = await startTestServer(app, t);
  await (await fetch(`${base}/plain`)).text();
  assert.equal(lookups, 0);
  const published = await (await fetch(`${base}/widget`)).text();
  assert.equal(lookups, 1);
  assert.match(published, /tovu-visitor-publication/);
  assert.doesNotMatch(published, /data-tovu-webmcp-script/, 'external WebMCP stays disabled independently of visitor controls');
  await (await fetch(`${base}/widget`, { headers: { 'x-tovu-static-export': '1' } })).text();
  assert.equal(lookups, 1);
});

test('public pages honor the server gate, including native forms, while APIs and admin stay outside it', async (t) => {
  let enabled = true;
  const app = express();
  applyPublishedWebMcp({ app, readEnabled: async () => enabled });
  const html = '<html><body><form toolname="contact" tooldescription="Contact" method="post" action="/forms/contact"></form></body></html>';
  app.get('/', (_req, res) => res.type('html').send(html));
  app.get('/admin', (_req, res) => res.type('html').send(html));
  app.get('/api/example', (_req, res) => res.json({ html }));
  const base = await startTestServer(app, t);
  assert.match(await (await fetch(base)).text(), /data-tovu-webmcp-script/);
  enabled = false;
  const off = await (await fetch(base)).text();
  assert.doesNotMatch(off, /toolname|data-tovu-webmcp-script/);
  assert.match(off, /action="\/forms\/contact"/);
  assert.equal(await (await fetch(`${base}/admin`)).text(), html);
  assert.deepEqual(await (await fetch(`${base}/api/example`)).json(), { html });
});

test('a failed setting read disables tools without breaking the published page', async (t) => {
  const app = express();
  applyPublishedWebMcp({ app, readEnabled: async () => { throw new Error('unavailable'); } });
  app.get('/', (_req, res) => res.type('html').send('<html><body><form toolname="contact" tooldescription="Contact"></form></body></html>'));
  const response = await fetch(await startTestServer(app, t));
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /toolname|data-tovu-webmcp-script/);
});

test('static export skips WebMCP injection without changing the live site setting or theme attributes', async (t) => {
  const app = express();
  let reads = 0;
  applyPublishedWebMcp({ app, readEnabled: async () => { reads++; return true; } });
  app.get('/', (_req, res) => res.type('html').send('<html><body><form toolname="contact" tooldescription="Contact" toolautosubmit data-form-slug="contact" action="/forms/contact/submit"></form></body></html>'));
  const base = await startTestServer(app, t);
  const exported = await (await fetch(base, { headers: { 'x-tovu-static-export': '1' } })).text();
  assert.equal(reads, 0);
  assert.doesNotMatch(exported, /data-tovu-webmcp-script|toolname|tooldescription|toolautosubmit/);
  assert.match(exported, /data-form-slug="contact"/);
  assert.match(exported, /action="\/forms\/contact\/submit"/);
  assert.match(await (await fetch(base)).text(), /data-tovu-webmcp-script/);
  assert.equal(reads, 1);
});

test('untyped html-looking strings are injected while plain text, errors, buffers and non-GET requests pass through', async (t) => {
  const app = express();
  applyPublishedWebMcp({ app, readEnabled: async () => true });
  const doc = '<!doctype html><html><body><form toolname="contact" tooldescription="Contact"></form></body></html>';
  app.get('/untyped', (_req, res) => res.send(doc));
  app.get('/plain', (_req, res) => res.send('just text'));
  app.get('/missing', (_req, res) => res.status(404).type('html').send(doc));
  app.get('/buffer', (_req, res) => res.type('html').send(Buffer.from(doc)));
  app.post('/untyped', (_req, res) => res.type('html').send(doc));
  const base = await startTestServer(app, t);
  assert.match(await (await fetch(`${base}/untyped`)).text(), /data-tovu-webmcp-script/);
  assert.equal(await (await fetch(`${base}/plain`)).text(), 'just text');
  assert.equal(await (await fetch(`${base}/missing`)).text(), doc);
  assert.equal(await (await fetch(`${base}/buffer`)).text(), doc);
  assert.equal(await (await fetch(`${base}/untyped`, { method: 'POST' })).text(), doc);
});

test('raw theme files stay byte-exact under both theme asset mounts, live and preview', async (t) => {
  const app = express();
  applyPublishedWebMcp({ app, readEnabled: async () => true });
  const html = '<html><body><form toolname="contact" tooldescription="Contact"></form></body></html>';
  for (const route of ['/theme-assets/live/pages/blank.html', '/theme-preview-assets/rev/live/pages/blank.html']) {
    app.get(route, (_req, res) => res.type('html').send(html));
  }
  const base = await startTestServer(app, t);
  assert.equal(await (await fetch(`${base}/theme-assets/live/pages/blank.html`)).text(), html);
  assert.equal(await (await fetch(`${base}/theme-preview-assets/rev/live/pages/blank.html`)).text(), html);
});
