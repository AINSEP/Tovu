import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import type * as memberLogin from "@jini-ai/user-management/member-login/link-service";
import * as oidcLogin from "@jini-ai/user-management/member-login/oidc-login";
import { originFixture } from "#src/features/member-login/__tests__/fixtures";
import { InMemoryMemberRepo, InMemoryMemberExternalIdentityRepo } from "@jini-ai/user-management/members/repo.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { MEMBER_OIDC_BINDING_COOKIE,
  type MemberOidcRouteDeps } from "../../inbound/public-http/routes/members/oidc-deps.js";
import { dispatchHttpRequest } from "../helpers/in-process-http.js";
import { portFake } from "../helpers/port-fake.js";

test("T44: a rate-limited OIDC email continuation redirects the browser to the sign-in error page", async t => {
  const routeErrors = createRouteIncidentReporter().errors;
  const clock = createFakeClock({ startIso: "2026-10-24T12:00:00.000Z" });
  const binding = "b".repeat(43);
  const email = "person@other.example";
  let completed = 0;
  // Protocol verification is outside this HTTP test: return its verified identity contract,
  // then exercise the real link policy and HTTP limits without a provider, socket or key.
  t.mock.module("@jini-ai/user-management/member-login/oidc-login", { namedExports: {
    ...oidcLogin,
    completeOidcLogin: async ({ input }: Parameters<typeof oidcLogin.completeOidcLogin>[0]) => {
      assert.deepEqual(input, { workspaceId: "ws", providerId: "google", browserBinding: binding,
        params: { code: "one-time-code", state: "sealed-state" } });
      completed++;
      assert.equal(completed, 1, "the callback must not retry the one-time code");
      return { identity: { providerId: "google", issuer: "https://accounts.google.com", subject: "subject",
        email, emailAuthoritative: false }, startedAt: clock.nowIso(), authenticatedAt: clock.nowIso(),
        returnPath: "/account" } satisfies oidcLogin.CompletedOidcLogin;
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
    protocol: portFake<oidcLogin.OidcLoginDeps>({ origin: originFixture() }),
    links: portFake<memberLogin.MemberLoginLinkDeps>({ clock, members: memberRepo, identities,
      transaction: async run => run(), lockKey: async () => undefined, reportFailure: () => undefined }),
    listProviders: async () => [],
  };
  const app = express();
  registerMemberOidcCallbackRoute({ errors: routeErrors, app, deps });
  // Real Express/native HTTP transport: the binding cookie and the query travel on the wire.
  const response = await dispatchHttpRequest({ app, method: "GET",
    url: "/api/members/v1/workspaces/ws/oidc/google/callback?code=one-time-code&state=sealed-state",
    headers: { cookie: `${MEMBER_OIDC_BINDING_COOKIE}=${binding}` } });

  assert.equal(completed, 1);
  assert.deepEqual(limitedEmails, [email], "the email continuation limit must be reached after completion");
  assert.deepEqual((await memberRepo.list({ workspaceId: "ws" })).items, []);
  assert.deepEqual(await identities.findBySubject({ workspaceId: "ws", issuer: "https://accounts.google.com", subject: "subject" }), null);
  assert.equal(response.status, 303, "the top-level callback must redirect instead of rendering 429 JSON");
  assert.equal(response.headers.location, "/signin#oidcError=LOGIN_UNAVAILABLE");
  // No JSON was rendered (the hand-made response recorded a `res.json` call as `body`): no JSON content type.
  assert.doesNotMatch(String(response.headers["content-type"]), /json/);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
});
