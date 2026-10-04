import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { applyPublishedWebMcp } from '../published-webmcp.js';

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
