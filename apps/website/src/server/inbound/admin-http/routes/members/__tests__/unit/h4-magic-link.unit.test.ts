import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import express from 'express';
import * as members from '#src/features/members/index';
import { SenderIdentityNotConfiguredError } from '#src/platform/mail/index';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { MembersRouteDeps } from '../../deps.js';

let send: typeof members.requestSignInLink = async () => assert.fail('unexpected sign-in mail');
mock.module('#src/features/members/index', { namedExports: { ...members, requestSignInLink: (required: Parameters<typeof send>[0]) => send(required) } });
const { registerAdminMemberRequestMagicLinkRoute } = await import('../../request-magic-link.js');
const PATH = '/api/admin/v1/workspaces/:workspaceId/members/request-magic-link';

for (const [error, status, body] of [
  [new members.MemberSignInUnavailableError('Site mail is disabled'), 503, { error: 'Site mail is disabled', code: 'MEMBER_SIGN_IN_UNAVAILABLE' }],
  [new SenderIdentityNotConfiguredError({ workspaceId: 'ws', driver: 'smtp' }), 503, { error: 'Member sign-in is unavailable: email is not set up for this site.', code: 'MEMBER_SIGN_IN_UNAVAILABLE' }],
  [new members.MemberValidationError('invalid address'), 400, { error: 'invalid address' }],
  [new Error('private mailer detail'), 500, { error: 'internal error' }],
] as const) {
  test(`admin magic link maps ${error.constructor.name} without leaking delivery details`, async t => {
    t.after(() => { send = async () => assert.fail('unexpected sign-in mail'); });
    const order: unknown[] = [];
    send = async ({ input }) => { order.push(input); throw error; };
    const app = express();
    registerAdminMemberRequestMagicLinkRoute(app, portFake<MembersRouteDeps>({ workspaceId: 'ws',
      authorize: async input => { order.push(input); return { allowed: true, reason: 'owner' }; },
      magicLinkPerEmailLimiter: { check: async input => { order.push(input); return { allowed: true }; } },
    }));
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: 'operator' };
    await extractRouteHandler(app, 'post', PATH)({ params: { workspaceId: 'ws' }, body: { email: ' Person@Example.com ', redirectPath: '/account' } }, res);
    assert.deepEqual(capture, { statusCode: status, jsonBody: body });
    assert.deepEqual(order, [
      { principalId: 'operator', permission: 'member.manage', workspaceId: 'ws', entityType: 'member' },
      { key: 'person@example.com' },
      { workspaceId: 'ws', email: ' Person@Example.com ', redirectPath: '/account' },
    ]);
  });
}

test('admin magic link refuses rate-limited mail without requesting delivery', async () => {
  const app = express();
  registerAdminMemberRequestMagicLinkRoute(app, portFake<MembersRouteDeps>({ workspaceId: 'ws',
    authorize: async () => ({ allowed: true, reason: 'owner' }),
    magicLinkPerEmailLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 23 }) },
  }));
  const { res, capture } = createCapturingResponse();
  const headers: Record<string, unknown> = {};
  res.setHeader = ((name: string, value: unknown) => { headers[name] = value; return res; }) as typeof res.setHeader;
  res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'post', PATH)({ params: { workspaceId: 'ws' }, body: { email: 'person@example.com' } }, res);
  assert.deepEqual(capture, { statusCode: 429, jsonBody: { error: 'too many sign-in requests for this email', code: 'RATE_LIMIT_EXCEEDED', details: { retryAfterSeconds: 23 } } });
  assert.deepEqual(headers, { 'Retry-After': '23' });
});
