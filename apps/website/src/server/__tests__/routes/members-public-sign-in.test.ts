import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { OutboundEmail } from "#src/features/members/index";

import { createCapturingResponse, extractRouteHandler, startTestServer } from "../helpers/http-test-server.js";

import express from "express";
import { nowIso } from "@jini-ai/core/primitives";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { createRateLimiter, LOGIN_STRICT, MAGIC_LINK_COMPLETE_ATTEMPT, MAGIC_LINK_PER_EMAIL, MAGIC_LINK_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import type { MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { registerPublicMemberSignInRequestRoute } from "../../inbound/public-http/routes/members/sign-in.js";

/**
 * @file FEAT-013 Phase 2 (ADR-PIPE-013 Decision §2-3, ADR-030 OQ-8) —
 * `registerPublicMemberSignInRequestRoute`: the primary target of the hard
 * pre-launch precondition. Both `MAGIC_LINK_PER_EMAIL` and `MAGIC_LINK_PER_IP`
 * must be enforced (T015/W-002/W-003), and INV-06 (anti-enumeration) must
 * hold: a registered and an unregistered email both get `{accepted:true}`
 * below the limit and both get `429` identically once exceeded.
 */

function buildPublicApp(): { app: express.Express; deps: MemberPublicRouteDeps } {
  const routeDeps = createRouteDeps();
  const capabilities = routeDeps.mailer.capabilities();
  routeDeps.mailer.capabilities = () => ({ ...capabilities, driver: "memory" });
  const deps: MemberPublicRouteDeps = {
    workspaceId: routeDeps.workspaceId,
    memberRepo: routeDeps.memberRepo,
    memberTierRepo: routeDeps.memberTierRepo,
    memberSubscriptionRepo: routeDeps.memberSubscriptionRepo,
    memberSessionRepo: routeDeps.memberSessionRepo,
    magicLinkRepo: routeDeps.magicLinkRepo,
    mailer: routeDeps.mailer,
    origin: routeDeps.originRegistry,
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    principalRepo: routeDeps.principalRepo,
    passwordHasher: routeDeps.passwordHasher,
    passwordSignInPerEmailLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock: routeDeps.clock }),
    passwordSignInPerIpLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock: routeDeps.clock }),
    magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock }),
    magicLinkPerIpLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_IP, clock: routeDeps.clock }),
    magicLinkCompleteAttemptLimiter: createRateLimiter({ profile: MAGIC_LINK_COMPLETE_ATTEMPT, clock: routeDeps.clock }),
  };
  const app = express();
  app.use(express.json());
  registerPublicMemberSignInRequestRoute(app, deps);
  return { app, deps };
}

async function postSignIn(baseUrl: string, workspaceId: string, email: string) {
  return fetch(`${baseUrl}/api/members/v1/workspaces/${workspaceId}/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

/** Acceptance exposes a uniform handle, never the delivery result. */
async function assertAccepted(response: Response) {
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["accepted", "challengeId"]);
  assert.equal(body.accepted, true);
  assert.equal(typeof body.challengeId, "string");
}

test("T015/W-002: MAGIC_LINK_PER_EMAIL — the 6th sign-in request for the same email is denied 429; a different email is unaffected", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    const res = await postSignIn(baseUrl, deps.workspaceId, "budget-a@example.com");
    assert.equal(res.status, 200, `request ${i + 1} for budget-a should succeed`);
  }
  const sixth = await postSignIn(baseUrl, deps.workspaceId, "budget-a@example.com");
  assert.equal(sixth.status, 429);
  const sixthBody = (await sixth.json()) as { code: string };
  assert.equal(sixthBody.code, "RATE_LIMIT_EXCEEDED");

  // A DIFFERENT email has its own independent counter — unaffected by budget-a's exhaustion.
  const otherEmail = await postSignIn(baseUrl, deps.workspaceId, "budget-b@example.com");
  assert.equal(otherEmail.status, 200);
});

test("T015/W-003: MAGIC_LINK_PER_IP — the 21st sign-in request from this IP (across distinct emails) is denied 429", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  for (let i = 0; i < MAGIC_LINK_PER_IP.max; i++) {
    const res = await postSignIn(baseUrl, deps.workspaceId, `distinct-${i}@example.com`);
    assert.equal(res.status, 200, `request ${i + 1} (distinct email, same IP) should succeed`);
  }

  const twentyFirst = await postSignIn(baseUrl, deps.workspaceId, "distinct-final@example.com");
  assert.equal(twentyFirst.status, 429);
  const body = (await twentyFirst.json()) as { code: string };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
});

test("INV-06: a registered and an unregistered email both get {accepted:true} below the limit, identically", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.memberRepo.save({
    id: "existing-member",
    workspaceId: deps.workspaceId,
    email: "registered@example.com",
    status: "active",
    createdAt: nowIso({ clock: deps.clock }),
    updatedAt: nowIso({ clock: deps.clock }),
    version: 1,
  });

  const registered = await postSignIn(baseUrl, deps.workspaceId, "registered@example.com");
  const unregistered = await postSignIn(baseUrl, deps.workspaceId, "never-seen@example.com");
  assert.equal(registered.status, 200);
  assert.equal(unregistered.status, 200);
  await assertAccepted(registered);
  await assertAccepted(unregistered);
});

test("INV-06: a registered and an unregistered email both get 429 identically once exceeded", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.memberRepo.save({
    id: "existing-member-2",
    workspaceId: deps.workspaceId,
    email: "registered2@example.com",
    status: "active",
    createdAt: nowIso({ clock: deps.clock }),
    updatedAt: nowIso({ clock: deps.clock }),
    version: 1,
  });

  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    await postSignIn(baseUrl, deps.workspaceId, "registered2@example.com");
  }
  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    await postSignIn(baseUrl, deps.workspaceId, "unregistered2@example.com");
  }

  const registeredDenied = await postSignIn(baseUrl, deps.workspaceId, "registered2@example.com");
  const unregisteredDenied = await postSignIn(baseUrl, deps.workspaceId, "unregistered2@example.com");
  assert.equal(registeredDenied.status, 429);
  assert.equal(unregisteredDenied.status, 429);
  const registeredBody = (await registeredDenied.json()) as { code: string; error: string };
  const unregisteredBody = (await unregisteredDenied.json()) as { code: string; error: string };
  assert.equal(registeredBody.code, unregisteredBody.code);
  assert.equal(registeredBody.error, unregisteredBody.error);
});

test("404s on a workspace id that does not match the deployed workspace", async (t) => {
  const { app } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await postSignIn(baseUrl, "some-other-workspace", "whoever@example.com");
  assert.equal(res.status, 404);
});

test("a malformed email is rejected 400 with the MemberValidationError message, below any rate limit", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await postSignIn(baseUrl, deps.workspaceId, "not-an-email");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /is not a valid email address|expected email/);
});

test("a redirectPath is carried into the minted sign-in link", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const sent: OutboundEmail[] = [];
  const send = deps.mailer.send.bind(deps.mailer);
  let resolveSent!: () => void;
  const delivered = new Promise<void>(resolve => { resolveSent = resolve; });
  deps.mailer.send = async (message, options) => {
    sent.push(message);
    const result = await send(message, options);
    resolveSent();
    return result;
  };
  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "redirect-path@example.com", redirectPath: "/welcome" }),
  });
  assert.equal(res.status, 200);
  await delivered;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to.email, "redirect-path@example.com");
  const actionableLink = sent[0].text?.match(/https?:\/\/\S+/)?.[0];
  assert.ok(actionableLink);
  const link = new URL(actionableLink, baseUrl);
  assert.equal(link.pathname, "/signin");
  const fragment = new URLSearchParams(link.hash.slice(1));
  assert.equal(fragment.get("redirect"), "/welcome");
  const rawToken = fragment.get("magic");
  assert.ok(rawToken);
  const storedToken = await deps.magicLinkRepo.findByTokenHash({
    workspaceId: deps.workspaceId,
    tokenHash: createHash("sha256").update(rawToken).digest("hex"),
  });
  assert.ok(storedToken, "the actionable URL's token must identify a minted sign-in token");
  const member = await deps.memberRepo.findByEmail({ workspaceId: deps.workspaceId, email: "redirect-path@example.com" });
  assert.equal(member, null, "request does not create a member");
  assert.equal(storedToken.email, "redirect-path@example.com");
  assert.ok(storedToken.memberId, "new-address token reserves a member id");
  assert.equal(storedToken.purpose, "signin");
});

test("a detached mailer failure keeps the public acceptance response", async (t) => {
  const { app, deps } = buildPublicApp();
  deps.mailer.send = async () => {
    throw new Error("smtp exploded");
  };
  const baseUrl = await startTestServer(app, t);

  const res = await postSignIn(baseUrl, deps.workspaceId, "mailer-failure@example.com");
  assert.equal(res.status, 200);
  await assertAccepted(res);
});

test("blank emails return validation errors without allocating empty limiter buckets", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  for (const email of ["", " \t "]) {
    const res = await postSignIn(baseUrl, deps.workspaceId, email);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: `'${email}' is not a valid email address` });
  }
  assert.equal(await deps.magicLinkPerEmailLimiter.size!({}), 0);
  assert.equal(await deps.magicLinkPerIpLimiter.size!({}), 0);
});

test("an email-less JSON body ({}) is treated as an empty, invalid email — not a crash", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /is not a valid email address|expected email/);
});

// The two tests below deliberately bypass real HTTP dispatch, the same technique
// `export-site-route.test.ts` uses and `extractRouteHandler`'s own doc describes: Express
// guarantees `req.params.workspaceId` is always a populated string for any request that reaches
// this handler at all (an unfilled `:workspaceId` segment simply never matches the route), and
// `body-parser`'s `express.json()` unconditionally sets `req.body = req.body || {}` before this
// handler ever runs (`node_modules/body-parser/lib/types/json.js`) — so neither `?? ""` nor `?? {}`
// fallback below is reachable through any real request. Calling the handler directly is the only
// way to exercise them, exactly as the exhaustiveness-guard case that helper's doc describes.
test("req.params.workspaceId ?? \"\": an unpopulated param (impossible via real Express routing) still 404s rather than throwing", async () => {
  const { app } = buildPublicApp();
  const handler = extractRouteHandler(app, "post", "/api/members/v1/workspaces/:workspaceId/sign-in");
  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined }, body: { email: "whoever@example.com" } } as unknown as Parameters<
    typeof handler
  >[0];

  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("req.body ?? {}: an undefined body (impossible with express.json() mounted) still resolves to an empty-email 400 rather than throwing", async () => {
  const { app, deps } = buildPublicApp();
  const handler = extractRouteHandler(app, "post", "/api/members/v1/workspaces/:workspaceId/sign-in");
  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: deps.workspaceId }, body: undefined, get: () => undefined, is: () => "application/json" } as unknown as Parameters<typeof handler>[0];

  await handler(req, res);
  assert.equal(capture.statusCode, 400);
  assert.match((capture.jsonBody as { error: string }).error, /expected email/);
});


test("MAGIC_LINK_PER_EMAIL shares one budget across case and whitespace variants", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  const variants = ["Budget@Example.com", " budget@example.com ", "BUDGET@example.COM", "budget@example.com", "\tBudget@Example.com\n"];
  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    const res = await postSignIn(baseUrl, deps.workspaceId, variants[i % variants.length]);
    assert.equal(res.status, 200);
  }
  const denied = await postSignIn(baseUrl, deps.workspaceId, " BUDGET@EXAMPLE.COM ");
  assert.equal(denied.status, 429);
  const body = await denied.json() as { code: string; error: string };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
  assert.equal(body.error, "too many member authentication requests");
  assert.equal((await postSignIn(baseUrl, deps.workspaceId, "different@example.com")).status, 200);
});

for (const mode of ["console", "missing_credential", "sender_missing"] as const) {
  test(`step 1: ${mode} returns a clear identical site-level 503 for known, missing and disabled addresses`, async t => {
    const { app, deps } = buildPublicApp();
    await deps.memberRepo.save({ id: "known", workspaceId: deps.workspaceId, email: "known@example.com", status: "active", createdAt: "2026-10-24", updatedAt: "2026-10-24", version: 1 });
    await deps.memberRepo.save({ id: "disabled", workspaceId: deps.workspaceId, email: "disabled@example.com", status: "disabled", createdAt: "2026-10-24", updatedAt: "2026-10-24", version: 1 });
    if (mode === "console") {
      const caps = deps.mailer.capabilities();
      deps.mailer.capabilities = () => ({ ...caps, driver: "console" });
    } else if (mode === "sender_missing") {
      const caps = deps.mailer.capabilities();
      deps.mailer.capabilities = () => ({ ...caps, driver: "smtp" });
    } else {
      deps.mailStatus = async () => ({ state: "unconfigured", lanes: [{ lane: "transactional", providerId: "smtp", state: "missing_credential" }], warnings: [] });
    }
    deps.memberRepo.findByEmail = async () => assert.fail("readiness must not inspect any address");
    deps.magicLinkRepo.save = async () => assert.fail("unready site must not mint tokens");
    deps.mailer.send = async () => assert.fail("unready site must not send");
    const baseUrl = await startTestServer(app, t);
    for (const email of ["known@example.com", "missing@example.com", "disabled@example.com"]) {
      const response = await postSignIn(baseUrl, deps.workspaceId, email);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Member sign-in is unavailable: email is not set up for this site.", code: "MEMBER_SIGN_IN_UNAVAILABLE" });
    }
  });
}

test("step 1: public acceptance hides suppressed and failed sends and disabled membership", async t => {
  const { app, deps } = buildPublicApp();
  await deps.memberRepo.save({ id: "disabled", workspaceId: deps.workspaceId, email: "disabled@example.com", status: "disabled", createdAt: "2026-10-24", updatedAt: "2026-10-24", version: 1 });
  const baseUrl = await startTestServer(app, t);
  for (const errorCode of ["MAIL_RECIPIENT_SUPPRESSED", "MAIL_SEND_FAILED"]) {
    deps.mailer.send = async () => ({ ok: false, retryable: false, errorCode, message: "private provider detail" });
    for (const email of ["new@example.com", "disabled@example.com"]) {
      const response = await postSignIn(baseUrl, deps.workspaceId, email);
      assert.equal(response.status, 200);
      await assertAccepted(response);
    }
  }
  assert.equal(await deps.memberRepo.findByEmail({ workspaceId: deps.workspaceId, email: "new@example.com" }), null);
});

test("step 1: createApp wires MailStatus and the trusted https localhost origin into public members", async t => {
  const deps = createRouteDeps();
  const caps = deps.mailer.capabilities();
  deps.mailer.capabilities = () => ({ ...caps, driver: "memory" });
  let ready = true;
  deps.mailStatus = async () => ({ state: ready ? "ready" : "unconfigured", lanes: [{ lane: "transactional", providerId: ready ? "smtp" : null, state: ready ? "ready" : "unconfigured" }], warnings: [], providers: [], refusals: [], checkedAt: "2026-10-24" });
  deps.originRegistry.canonicalOrigin = async () => ({ scheme: "https", host: "localhost", port: 3000, source: "dev-capability", verifiedAt: "2026-10-24" });
  const sent: OutboundEmail[] = [];
  let resolveSent!: () => void;
  const delivered = new Promise<void>(resolve => { resolveSent = resolve; });
  deps.mailer.send = async message => { sent.push(message); resolveSent(); return { ok: true, providerMessageId: "one", acceptedAt: "2026-10-24" }; };
  const baseUrl = await startTestServer(createApp(deps), t);
  const first = await postSignIn(baseUrl, deps.workspaceId, "new@example.com");
  assert.equal(first.status, 200);
  await assertAccepted(first);
  await delivered;
  assert.match(sent[0].text!, /https:\/\/localhost:3000\/signin#magic=[a-f0-9]{64}/);
  assert.equal(await deps.memberRepo.findByEmail({ workspaceId: deps.workspaceId, email: "new@example.com" }), null);
  ready = false;
  assert.equal((await postSignIn(baseUrl, deps.workspaceId, "other@example.com")).status, 503);
  assert.equal(sent.length, 1, "readiness comes from the same composed site status");
});
