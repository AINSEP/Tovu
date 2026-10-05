// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { loginAsOwner } from "../helpers/http-test-server.js";
import { bootSite, expectJson, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #3 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — `POST
 * /api/admin/v1/auth/logout` (`inbound/admin-http/dev-auth.ts`). No test file anywhere in the repo
 * references this route: the sign-out half of the admin session lifecycle is unproven at every tier.
 * Run through the real site composition on both dialects, because what logout must do is revoke the
 * persisted `sessions` row, so an old cookie stops working — a cleared browser cookie alone would
 * leave a copied token live.
 */

const CLEARED_COOKIE = "tovu_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure";

async function me(site: Pick<BootedSite, "baseUrl">, cookie: string): Promise<Response> {
  return fetch(`${site.baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
}

async function logout(site: Pick<BootedSite, "baseUrl">, cookie?: string): Promise<Response> {
  return fetch(`${site.baseUrl}/api/admin/v1/auth/logout`, { method: "POST", headers: cookie === undefined ? {} : { cookie } });
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] admin logout [${dialect}]: revokes the session server-side — the old cookie is 401 on /auth/me and on a gated route`, async (t) => {
    const site = await bootSite(t, dialect);
    const signedIn = await expectJson<{ user: { username: string } }>(await me(site, site.cookie), 200);
    assert.equal(signedIn.user.username, "admin");

    const res = await logout(site, site.cookie);
    assert.equal(res.headers.get("set-cookie"), CLEARED_COOKIE);
    assert.deepEqual(await expectJson(res, 200), { ok: true });

    assert.deepEqual(await expectJson(await me(site, site.cookie), 401), { error: "unauthenticated", code: "UNAUTHENTICATED" });
    const gated = await fetch(`${site.baseUrl}${site.ws}/trash`, { headers: { cookie: site.cookie } });
    assert.deepEqual(await expectJson(gated, 401), { error: "unauthenticated", code: "UNAUTHENTICATED" });
  });

  test(`[unrun] admin logout [${dialect}]: ends only the caller's session — a second session for the same owner stays valid`, async (t) => {
    const site = await bootSite(t, dialect);
    const second = await loginAsOwner(site.baseUrl);
    assert.notEqual(second, site.cookie, "each login mints its own session token");

    await expectJson(await logout(site, site.cookie), 200);

    assert.equal((await me(site, site.cookie)).status, 401);
    const still = await expectJson<{ user: { username: string } }>(await me(site, second), 200);
    assert.equal(still.user.username, "admin");
  });

  test(`[unrun] admin logout [${dialect}]: without a cookie is a harmless 200 that still clears the cookie and revokes nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const res = await logout(site);
    assert.equal(res.headers.get("set-cookie"), CLEARED_COOKIE);
    assert.deepEqual(await expectJson(res, 200), { ok: true });
    assert.equal((await me(site, site.cookie)).status, 200, "the existing session is untouched");
  });

  test(`[unrun] admin logout [${dialect}]: an unknown or already-revoked token is a 200, not a 500`, async (t) => {
    const site = await bootSite(t, dialect);
    assert.deepEqual(await expectJson(await logout(site, "tovu_session=not-a-real-token"), 200), { ok: true });
    await expectJson(await logout(site, site.cookie), 200);
    assert.deepEqual(await expectJson(await logout(site, site.cookie), 200), { ok: true }, "a second logout of the same token");
  });
}
