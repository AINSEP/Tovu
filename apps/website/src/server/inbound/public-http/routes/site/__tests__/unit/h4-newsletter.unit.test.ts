import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { registerPublicNewsletterConfirmRoute } from '../../newsletter-confirm.js';
import { registerPublicNewsletterUnsubscribeRoute } from '../../newsletter-unsubscribe.js';
import type { NewsletterPublicRouteDeps } from '../../newsletter-deps.js';

for (const [path, register, title, message] of [
  ['/newsletter/confirm', registerPublicNewsletterConfirmRoute, 'Confirmation link invalid', 'This confirmation link is invalid or has expired. Please request a new one.'],
  ['/newsletter/unsubscribe', registerPublicNewsletterUnsubscribeRoute, 'Unsubscribe link invalid', 'This unsubscribe link is invalid or has expired.'],
] as const) {
  for (const token of [undefined, ['first', 'second'], { nested: 'token' }]) {
    test(`${path} refuses a missing or ambiguous token (${JSON.stringify(token)}) as HTML`, async () => {
      const app = express();
      register({ app, deps: portFake<NewsletterPublicRouteDeps>({ workspaceId: 'ws', newsletterReady: Promise.resolve(),
        newsletterConfirmationTokenRepo: { findByTokenHash: async () => null },
        clock: { nowIso: () => '2026-10-28T00:00:00.000Z' },
      }) });
      const { res, capture } = createCapturingResponse();
      Object.assign(res, { type: (type: string) => { assert.equal(type, 'html'); return res; }, send: (html: string) => { capture.jsonBody = html; return res; } });
      await extractRouteHandler(app, 'get', path)({ query: { token } }, res);
      assert.deepEqual(capture, { statusCode: 400, jsonBody: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  <p>${message}</p>
</body>
</html>` });
    });
  }
  test(`${path} redacts unexpected dependency failures in its HTML error page`, async t => {
    const logs = t.mock.method(console, "error", () => {});
    const app = express();
    register({ app, deps: portFake<NewsletterPublicRouteDeps>({ workspaceId: 'ws', newsletterReady: Promise.resolve(),
      newsletterConfirmationTokenRepo: { findByTokenHash: async () => { throw new Error('private database path password=NEWSLETTER_CANARY'); } },
      newsletterKeyring: { derive: async () => { throw new Error('private key path password=NEWSLETTER_CANARY'); } },
      clock: { nowIso: () => '2026-10-28T00:00:00.000Z' },
    }) });
    const { res, capture } = createCapturingResponse();
    Object.assign(res, { type: () => res, send: (html: string) => { capture.jsonBody = html; return res; } });
    await extractRouteHandler(app, 'get', path)({ query: { token: `${Buffer.from('{}').toString('base64url')}.signature` } }, res);
    assert.equal(capture.statusCode, 500);
    assert.match(String(capture.jsonBody), /couldn’t complete/);
    const id = String(capture.jsonBody).match(/Error ID: ([a-f0-9-]{36})/)?.[1];
    assert.ok(id);
    assert.equal(logs.mock.calls.length, 1);
    assert.ok(JSON.stringify(logs.mock.calls).includes(id));
    assert.doesNotMatch(String(capture.jsonBody) + JSON.stringify(logs.mock.calls), /NEWSLETTER_CANARY/);
    assert.doesNotMatch(String(capture.jsonBody), /private/);
  });
}
