import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import express, { type Request, type Response } from "express";

import * as memberLogin from "#src/features/member-login/index";
import { originFixture } from "#src/features/member-login/__tests__/fixtures";
import { InMemoryMemberRepo, InMemoryMemberExternalIdentityRepo } from "#src/features/members/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { MEMBER_OIDC_BINDING_COOKIE, MEMBER_OIDC_PATH,
  type MemberOidcRouteDeps } from "../../inbound/public-http/routes/members/oidc-deps.js";
import { lastRouteHandler } from "../helpers/last-route-handler.js";
import { portFake } from "../helpers/port-fake.js";

test("T44: a rate-limited OIDC email continuation redirects the browser to the sign-in error page", async t => {
  const clock = createFakeClock({ startIso: "2026-10-24T12:00:00.000Z" });
  const binding = "b".repeat(43);
  const email = "person@other.example";
  const ip = "203.0.113.20";
  let completed = 0;
  // Protocol verification is outside this HTTP test: return its verified identity contract,
  // then exercise the real link policy and HTTP limits without a provider, socket or key.
  t.mock.module("#src/features/member-login/index", { namedExports: {
    ...memberLogin,
    completeOidcLogin: async ({ input }: Parameters<typeof memberLogin.completeOidcLogin>[0]) => {
      assert.deepEqual(input, { workspaceId: "ws", providerId: "google", browserBinding: binding,
        params: { code: "one-time-code", state: "sealed-state" } });
      completed++;
      assert.equal(completed, 1, "the callback must not retry the one-time code");
      return { identity: { providerId: "google", issuer: "https://accounts.google.com", subject: "subject",
        email, emailAuthoritative: false }, startedAt: clock.nowIso(), authenticatedAt: clock.nowIso(),
        returnPath: "/account" } satisfies memberLogin.CompletedOidcLogin;
    },
  } });
  const { registerMemberOidcCallbackRoute } = await import("../../inbound/public-http/routes/members/oidc-callback.js");
  const limitedEmails: string[] = [];
  const members = portFake<MemberPublicRouteDeps>({ workspaceId: "ws",
    magicLinkCompleteAttemptLimiter: { check: async () => ({ allowed: true }) },
    magicLinkPerIpLimiter: { check: async () => ({ allowed: true }) },
    magicLinkPerEmailLimiter: { check: async ({ key }: { key: string }) => {
      limitedEmails.push(key);
      return { allowed: false, retryAfterSeconds: 60 };
    } },
  });
  const memberRepo = new InMemoryMemberRepo();
  const identities = new InMemoryMemberExternalIdentityRepo({});
  const deps: MemberOidcRouteDeps = { members,
    protocol: portFake<memberLogin.OidcLoginDeps>({ origin: originFixture() }),
    links: portFake<memberLogin.MemberLoginLinkDeps>({ clock, members: memberRepo, identities,
      transaction: async run => run(), lockKey: async () => undefined }),
    listProviders: async () => [],
  };
  const app = express();
  registerMemberOidcCallbackRoute({ app, deps });
  const handler = lastRouteHandler(app, "get", `${MEMBER_OIDC_PATH}/callback`);
  const req = { params: { workspaceId: "ws", providerId: "google" },
    query: { code: "one-time-code", state: "sealed-state" },
    headers: { cookie: `${MEMBER_OIDC_BINDING_COOKIE}=${binding}` }, ip,
    socket: { remoteAddress: ip }, get: () => undefined } as unknown as Request;
  const headers: Record<string, unknown> = {};
  let body: unknown;
  let location: string | undefined;
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader(name: string, value: unknown) { headers[name] = value; return this; },
    clearCookie() { return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
    redirect(code: number, target: string) { this.statusCode = code; location = target; },
  });
  await handler(req, res as unknown as Response);

  assert.equal(completed, 1);
  assert.deepEqual(limitedEmails, [email], "the email continuation limit must be reached after completion");
  assert.deepEqual(await memberRepo.list({ workspaceId: "ws" }), []);
  assert.deepEqual(await identities.findBySubject({ workspaceId: "ws", issuer: "https://accounts.google.com", subject: "subject" }), null);
  assert.equal(res.statusCode, 303, "the top-level callback must redirect instead of rendering 429 JSON");
  assert.equal(location, "/signin#oidcError=LOGIN_UNAVAILABLE");
  assert.equal(body, undefined);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
});
