// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { OutboundEmail } from "#src/platform/mail/index";
import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap 2 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — member passwordless
 * sign-in through the REAL site composition on both dialects: `POST .../sign-in` mints a token row
 * in `magic_links`, mails the raw token, `POST .../sign-in/complete` consumes it and writes a
 * `member_sessions` row behind the `tovu_member_session` cookie.
 *
 * `features/members/__tests__/invariants.test.ts` and the public-route tests drive the hermetic
 * `createRouteDeps()` root and read the token off the console mailer. Here the mailer is the one
 * true external edge: `site.deps.mailer` is the SAME object `createApp` copied into the public
 * member deps, so replacing its `send` after boot captures every outbound message.
 */

const SIGN_IN_TEXT_PREFIX = "Sign in using this link (expires in 15 minutes): /auth/magic?token=";

function memberRoute(site: BootedSite, suffix: "sign-in" | "sign-in/complete"): string {
  return `/api/members/v1/workspaces/${site.deps.workspaceId}/${suffix}`;
}

/** Anonymous JSON POST — the member routes never see the owner's admin cookie. */
async function anonymousPost(site: BootedSite, route: string, body: unknown): Promise<Response> {
  return fetch(`${site.baseUrl}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/** Replaces the composed mailer's `send` and returns the list every message lands in. */
function captureMail(site: BootedSite): OutboundEmail[] {
  const sent: OutboundEmail[] = [];
  site.deps.mailer.send = async (message) => {
    sent.push(message);
    return { ok: true, providerMessageId: `unrun-${sent.length}`, acceptedAt: new Date().toISOString() };
  };
  return sent;
}

function tokenFrom(message: OutboundEmail): string {
  const text = message.text ?? "";
  assert.ok(text.startsWith(SIGN_IN_TEXT_PREFIX), `unexpected sign-in mail text: ${text}`);
  const token = text.slice(SIGN_IN_TEXT_PREFIX.length).split("&")[0];
  assert.match(token, /^[a-f0-9]{64}$/);
  return token;
}

/** Requests a link for `email`, completes it, and returns the raw member session token from the cookie. */
async function signIn(site: BootedSite, mail: OutboundEmail[], email: string): Promise<{ memberId: string; sessionToken: string }> {
  assert.deepEqual(await expectJson(await anonymousPost(site, memberRoute(site, "sign-in"), { email }), 200), { delivered: true });
  const complete = await anonymousPost(site, memberRoute(site, "sign-in/complete"), { token: tokenFrom(mail[mail.length - 1]) });
  const cookie = complete.headers.get("set-cookie") ?? "";
  const body = await expectJson<{ member: { id: string } }>(complete, 200);
  const sessionToken = decodeURIComponent(cookie.match(/^tovu_member_session=([^;]+);/)?.[1] ?? "");
  assert.match(sessionToken, /^[a-f0-9]{64}$/);
  return { memberId: body.member.id, sessionToken };
}

const sha256 = (raw: string): string => createHash("sha256").update(raw).digest("hex");

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] member magic link [${dialect}]: request mails one link, complete activates the member and persists the session behind tovu_member_session`, async (t) => {
    const site = await bootSite(t, dialect);
    const mail = captureMail(site);
    const { workspaceId } = site.deps;

    const requested = await anonymousPost(site, memberRoute(site, "sign-in"), { email: "  Reader@Example.com ", redirectPath: "/members/only" });
    assert.deepEqual(await expectJson(requested, 200), { delivered: true });
    assert.equal(mail.length, 1);
    const token = tokenFrom(mail[0]);
    assert.deepEqual(
      { to: mail[0].to, from: mail[0].from, subject: mail[0].subject, text: mail[0].text, workspaceId: mail[0].workspaceId },
      {
        to: { email: "reader@example.com" },
        from: { email: "no-reply@members.local", name: "Members" },
        subject: "Your sign-in link",
        text: `${SIGN_IN_TEXT_PREFIX}${token}&redirect=%2Fmembers%2Fonly`,
        workspaceId,
      }
    );

    const pending = await site.deps.memberRepo.findByEmail({ workspaceId, email: "reader@example.com" });
    assert.equal(pending?.status, "pending", "the request pre-creates a pending member");
    const linkRow = await site.deps.magicLinkRepo.findByTokenHash({ workspaceId, tokenHash: sha256(token) });
    assert.deepEqual(
      { memberId: linkRow?.memberId, purpose: linkRow?.purpose, consumedAt: linkRow?.consumedAt ?? null },
      { memberId: pending?.id, purpose: "signin", consumedAt: null },
      "only the token HASH is stored, and it is unconsumed"
    );

    const complete = await anonymousPost(site, memberRoute(site, "sign-in/complete"), { token });
    const setCookie = complete.headers.get("set-cookie") ?? "";
    const body = await expectJson<{ member: { id: string; email: string; status: string } }>(complete, 200);
    assert.deepEqual({ id: body.member.id, email: body.member.email, status: body.member.status }, { id: pending?.id, email: "reader@example.com", status: "active" });
    assert.match(setCookie, /^tovu_member_session=[a-f0-9]{64};/);
    const attributes = setCookie.split("; ").slice(1);
    assert.ok(attributes.includes("HttpOnly"));
    assert.ok(attributes.includes("Secure"));
    assert.ok(attributes.includes("Path=/"));
    assert.ok(attributes.includes("SameSite=Lax"));
    assert.equal(attributes.filter((attribute) => attribute.startsWith("Max-Age=")).length, 1);
    assert.doesNotMatch(setCookie, /tovu_session=/, "the member route never writes the admin cookie");
    const maxAge = Number(setCookie.match(/Max-Age=(\d+)/)?.[1]);
    assert.ok(maxAge > 30 * 24 * 3600 - 60 && maxAge <= 30 * 24 * 3600, `Max-Age ${maxAge} is the 30-day session TTL`);

    const sessionToken = setCookie.match(/^tovu_member_session=([a-f0-9]{64});/)![1];
    const session = await site.deps.memberSessionRepo.findByTokenHash({ workspaceId, tokenHash: sha256(sessionToken) });
    assert.equal(session?.memberId, pending?.id, "the cookie's token hashes to a persisted session row for this member");
    const active = await site.deps.memberRepo.findById({ workspaceId, id: pending!.id });
    assert.equal(active?.status, "active");
    assert.ok(active?.emailVerifiedAt, "completing the link verifies the email");
    assert.ok((await site.deps.magicLinkRepo.findByTokenHash({ workspaceId, tokenHash: sha256(token) }))?.consumedAt, "the token row is consumed");
  });

  test(`[unrun] member magic link [${dialect}]: a link is single-use, and an unknown token is refused`, async (t) => {
    const site = await bootSite(t, dialect);
    const mail = captureMail(site);
    await signIn(site, mail, "once@example.com");
    const token = tokenFrom(mail[0]);

    const replay = await anonymousPost(site, memberRoute(site, "sign-in/complete"), { token });
    assert.equal(replay.headers.get("set-cookie"), null);
    assert.deepEqual(await expectJson(replay, 401), { error: "sign-in link was already used", code: "MEMBER_AUTH_ERROR" });

    const forged = await anonymousPost(site, memberRoute(site, "sign-in/complete"), { token: "f".repeat(64) });
    assert.deepEqual(await expectJson(forged, 401), { error: "sign-in link is invalid", code: "MEMBER_AUTH_ERROR" });
  });

  test(`[unrun] member magic link [${dialect}]: known, unknown and disabled emails get byte-identical responses; only the disabled one is not mailed`, async (t) => {
    const site = await bootSite(t, dialect);
    const mail = captureMail(site);
    const { workspaceId } = site.deps;
    await signIn(site, mail, "known@example.com");
    const before = mail.length;

    const known = await anonymousPost(site, memberRoute(site, "sign-in"), { email: "known@example.com" });
    const unknown = await anonymousPost(site, memberRoute(site, "sign-in"), { email: "nobody@example.com" });
    const knownText = await known.text();
    const unknownText = await unknown.text();
    assert.deepEqual([known.status, unknown.status], [200, 200]);
    assert.equal(unknownText, knownText, "an unregistered email is indistinguishable from a registered one");
    assert.equal(knownText, JSON.stringify({ delivered: true }));
    assert.deepEqual(mail.slice(before).map((message) => message.to.email), ["known@example.com", "nobody@example.com"]);

    const created = await site.deps.memberRepo.findByEmail({ workspaceId, email: "nobody@example.com" });
    assert.equal(created?.status, "pending");
    const principal = await site.deps.principalRepo.findById({ workspaceId, id: created!.id });
    assert.equal(principal?.kind, "member", "the unknown email's pre-created member gets a member-kind principal");

    const knownMember = await site.deps.memberRepo.findByEmail({ workspaceId, email: "known@example.com" });
    await site.deps.memberRepo.save({ ...knownMember!, status: "disabled", version: knownMember!.version + 1, updatedAt: new Date().toISOString() });
    const afterDisable = mail.length;
    const disabled = await anonymousPost(site, memberRoute(site, "sign-in"), { email: "known@example.com" });
    assert.equal(disabled.status, 200);
    assert.equal(await disabled.text(), knownText);
    assert.equal(mail.length, afterDisable, "a disabled member is never mailed a link");
  });

  test(`[unrun] member magic link [${dialect}]: invalid input and a foreign workspace are refused before any token or mail`, async (t) => {
    const site = await bootSite(t, dialect);
    const mail = captureMail(site);

    assert.deepEqual(await expectJson(await anonymousPost(site, memberRoute(site, "sign-in"), { email: "" }), 400), { error: "'' is not a valid email address" });
    assert.deepEqual(await expectJson(await anonymousPost(site, memberRoute(site, "sign-in"), { email: "not-an-email" }), 400), {
      error: "'not-an-email' is not a valid email address",
    });
    const foreign = await anonymousPost(site, "/api/members/v1/workspaces/not-this-workspace/sign-in", { email: "a@example.com" });
    assert.deepEqual(await expectJson(foreign, 404), { error: "workspace was not found" });
    assert.equal(mail.length, 0);
    assert.equal(await site.deps.memberRepo.findByEmail({ workspaceId: site.deps.workspaceId, email: "a@example.com" }), null);
  });

  test(`[unrun] member magic link [${dialect}]: the sixth request for one email within the hour is 429 with Retry-After, case-insensitively; another email still passes`, async (t) => {
    const site = await bootSite(t, dialect);
    const mail = captureMail(site);
    const variants = ["limit@example.com", "LIMIT@example.com", " limit@example.com", "Limit@Example.com", "limit@EXAMPLE.com"];
    for (const email of variants) {
      assert.deepEqual(await expectJson(await anonymousPost(site, memberRoute(site, "sign-in"), { email }), 200), { delivered: true }, email);
    }
    assert.equal(mail.length, 5);

    const limited = await anonymousPost(site, memberRoute(site, "sign-in"), { email: "limit@example.com" });
    const retryAfter = Number(limited.headers.get("retry-after"));
    const body = await expectJson<{ error: string; code: string; details: { retryAfterSeconds: number } }>(limited, 429);
    assert.deepEqual({ error: body.error, code: body.code }, { error: "too many sign-in requests for this email", code: "RATE_LIMIT_EXCEEDED" });
    assert.ok(retryAfter >= 3590 && retryAfter <= 3600, `Retry-After ${retryAfter} is the rest of the one-hour window`);
    assert.equal(body.details.retryAfterSeconds, retryAfter);
    assert.equal(mail.length, 5, "a limited request mails nothing");

    assert.deepEqual(await expectJson(await anonymousPost(site, memberRoute(site, "sign-in"), { email: "other@example.com" }), 200), { delivered: true });
    assert.equal(mail.length, 6);
  });

  test(`[unrun] member magic link [${dialect}]: a signed-in member never gets admin access, even holding the "*" grant and a hand-minted operator session (F3144)`, async (t) => {
    const site = await bootSite(t, dialect);
    const mail = captureMail(site);
    const { workspaceId } = site.deps;
    const { memberId, sessionToken } = await signIn(site, mail, "f3144@example.com");

    const principal = await site.deps.principalRepo.findById({ workspaceId, id: memberId });
    assert.equal(principal?.kind, "member");

    // Hand the member the owner wildcard straight through the repos so only its kind can explain a denial.
    await site.deps.policyPermissionRepo.save({ id: "pp-unrun-f3144", workspaceId, policyId: "policy-unrun-f3144", permission: "*", resourceType: null, constraintJson: null });
    await site.deps.principalPolicyRepo.save({ id: "link-unrun-f3144", workspaceId, principalId: memberId, policyId: "policy-unrun-f3144" });
    const ownerId = await site.deps.ownerPrincipalId;
    for (const permission of ["*", "content.write", "user.manage"]) {
      assert.deepEqual(await site.deps.authorize({ principalId: memberId, permission, workspaceId }), { allowed: false, reason: "principal_kind_denied" }, permission);
      assert.equal((await site.deps.authorize({ principalId: ownerId, permission, workspaceId })).allowed, true, `owner control: ${permission}`);
    }

    const mint = async (principalId: string): Promise<string> => {
      const rawToken = site.deps.tokens.newToken({});
      await site.deps.sessionRepo.save({
        id: `session-unrun-${principalId}`,
        workspaceId,
        principalId,
        tokenHash: site.deps.tokens.hashToken({ rawToken }),
        createdAt: new Date().toISOString(),
        expiresAt: "2999-01-01T00:00:00.000Z",
      });
      return rawToken;
    };
    const memberOperatorCookie = `tovu_session=${await mint(memberId)}`;
    const ownerOperatorCookie = `tovu_session=${await mint(ownerId)}`;
    const memberSiteCookie = `tovu_member_session=${sessionToken}`;

    const gated = [
      { method: "GET", route: `${site.ws}/users` },
      { method: "GET", route: `${site.ws}/posts` },
      { method: "GET", route: `${site.ws}/assistant/settings` },
      { method: "POST", route: `${site.ws}/posts`, body: { title: "member write", slug: "member-write" } },
    ];
    for (const { method, route, body } of gated) {
      assert.equal((await send({ baseUrl: site.baseUrl, cookie: memberOperatorCookie }, method, route, body)).status, 401, `member operator session: ${method} ${route}`);
      assert.equal((await send({ baseUrl: site.baseUrl, cookie: memberSiteCookie }, method, route, body)).status, 401, `member site cookie: ${method} ${route}`);
    }
    assert.equal((await send({ baseUrl: site.baseUrl, cookie: ownerOperatorCookie }, "GET", `${site.ws}/users`)).status, 200, "owner control");

    const posts = await expectJson<{ posts: Array<{ post: { slug: string } }> }>(await send(site, "GET", `${site.ws}/posts`), 200);
    assert.equal(posts.posts.some((row) => row.post.slug === "member-write"), false, "the refused member write left nothing behind");
  });
}
