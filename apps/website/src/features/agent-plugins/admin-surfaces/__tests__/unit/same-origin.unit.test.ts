/**
 * @file Unit tests for `same-origin.ts`, the CSRF gate of the admin-surface writes: only a browser
 * request whose `Origin` is exactly this server's host, with agreeing fetch metadata when sent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { isSameOriginAdminWrite } from '../../same-origin.js';

const HOST = 'admin.acme.test:8443';
const allowed = (origin: string | undefined, fetchSite?: string) => isSameOriginAdminWrite({ origin, host: HOST, fetchSite });

test('the exact https or http origin of this host is admitted, with or without fetch metadata', () => {
  assert.equal(allowed('https://admin.acme.test:8443'), true);
  assert.equal(allowed('http://admin.acme.test:8443', 'same-origin'), true);
});

test('security: a missing Origin or a missing Host is refused', () => {
  assert.equal(allowed(undefined), false);
  assert.equal(allowed(''), false);
  assert.equal(isSameOriginAdminWrite({ origin: 'https://admin.acme.test:8443', host: undefined, fetchSite: undefined }), false);
});

test('security: fetch metadata other than same-origin is refused even with a matching Origin', () => {
  for (const site of ['same-site', 'cross-site', 'none']) assert.equal(allowed('https://admin.acme.test:8443', site), false, site);
});

test('security: a sandboxed frame\'s opaque "null" origin is refused', () => {
  assert.equal(allowed('null'), false);
});

test('security: another host or port is refused', () => {
  assert.equal(allowed('https://evil.acme.test:8443'), false);
  assert.equal(allowed('https://admin.acme.test'), false);
});

test('security: an Origin that is not a bare origin (path, trailing slash, credentials) is refused', () => {
  for (const origin of ['https://admin.acme.test:8443/', 'https://admin.acme.test:8443/admin', 'https://user@admin.acme.test:8443']) assert.equal(allowed(origin), false, origin);
});

test('security: a non-http(s) scheme naming this host is refused', () => {
  assert.equal(allowed('ftp://admin.acme.test:8443'), false);
  assert.equal(allowed('ws://admin.acme.test:8443'), false);
});
