import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createFormCollectionRegistry } from '@jini-ai/cms/forms';
import { createPublicPageSecurityHeaderSet } from '../../public-page-security-headers.js';
import { publicPageSecurityHeaders } from '../../../../features/theme/public-page-security-headers.js';
import { createPublicPageSecurityHeaders } from '../../../../server/inbound/public-http/middleware/public-page-security-headers.js';
import { renderHeadersFile } from '../../../../features/site-export/static-security-headers.js';

const resources = { scripts: [], styles: [], fonts: [], fontPreconnects: {} };
test('provider frame declarations extend only frame-src and reject malformed origins', () => {
  const base = createPublicPageSecurityHeaderSet({ resources });
  const headers = createPublicPageSecurityHeaderSet({ resources }, { frameOrigins: ['https://frames.example.test', 'https://frames.example.test', 'bad; script-src *', 'https://frames.example.test/path'] });
  const policy = headers['Content-Security-Policy-Report-Only']!;
  const frame = policy.split('; ').find(part => part.startsWith('frame-src '))!;
  assert.equal(frame.split(' ').filter(source => source === 'https://frames.example.test').length, 1);
  assert.equal(policy.replace(' https://frames.example.test', ''), base['Content-Security-Policy-Report-Only']);
  assert.equal(Object.hasOwn(headers, 'Content-Security-Policy'), false);
});
test('current provider declarations reach live middleware and static headers without a consent gate', () => {
  const providers = createFormCollectionRegistry({});
  let active = true;
  const readHeaders = () => publicPageSecurityHeaders({ formCollectionProviders: () => providers });
  const middleware = createPublicPageSecurityHeaders(undefined, { readHeaders });
  const capture = () => {
    const headers: Record<string, string> = {};
    middleware({ path: '/' } as Request, { setHeader: (key: string, value: string) => { headers[key] = value; } } as unknown as Response, (() => {}) as NextFunction);
    return headers;
  };
  assert.doesNotMatch(capture()['Content-Security-Policy-Report-Only']!, /frames.example.test/);
  providers.contribute({ pluginId: 'fourth', definition: { id: 'fourth', provider: {
    describe: () => {
      if (!active) throw new Error('Provider lease unavailable');
      return { label: 'Fourth', fields: [], answers: 'Fourth answers', validation: 'Fourth checks', frameOrigins: ['https://frames.example.test'] };
    },
    plan: () => ({ kind: 'unavailable', code: 'invalid_configuration', message: 'Configure a public form.' }),
  } } });
  const live = capture();
  assert.match(live['Content-Security-Policy-Report-Only']!, /frame-src [^;]* https:\/\/frames.example.test(?:;|$)/);
  assert.ok(renderHeadersFile(readHeaders()).includes(`  Content-Security-Policy-Report-Only: ${live['Content-Security-Policy-Report-Only']}\n`));
  active = false;
  assert.doesNotMatch(capture()['Content-Security-Policy-Report-Only']!, /frames.example.test/, 'a retired or broken provider must not keep cached origins');
  assert.doesNotMatch(publicPageSecurityHeaders({})['Content-Security-Policy-Report-Only']!, /frames.example.test/, 'one registry must not leak into another app');
});
