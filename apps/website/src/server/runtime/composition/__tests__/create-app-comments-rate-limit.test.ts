import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { COMMENTS_SUBMIT_PROFILE } from "#src/features/comments/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { createApp, createRouteDeps } from "../app.js";

/**
 * @file The comment handler must receive its required HTTP budget and host IP resolver through
 * every app builder. Rejected submissions still consume the HTTP budget, independently of
 * ingress; changing an untrusted forwarded header must never reset that budget.
 */

/** Records each submission's IP hash and rejects it, injected at the door the route dispatches
 *  through. Stale-test fix: since 65882a7e a composed provider registry routes public submissions to
 *  the ACTIVE stored provider, so a fake on `deps.commentIngressPolicy` alone is never called. */
function rejectAtActiveProvider(
  { deps, authorIpHashes }: { deps: ReturnType<typeof createRouteDeps>; authorIpHashes: string[] },
  _options: Record<string, never> = {},
): void {
  const registry = deps.commentsProviders!;
  deps.commentsProviders = { ...registry, active: async (input) => {
    const current = await registry.active(input);
    assert.equal(current.adapter?.kind, "stored", "precondition: the built-in stored provider is active");
    const submission = { submit: async ({ authorIpHash }: { authorIpHash: string }) => {
      authorIpHashes.push(authorIpHash);
      return { ok: false as const, reason: "entry-not-found" as const };
    } };
    return { ...current, adapter: { ...current.adapter!, submission } as typeof current.adapter };
  } };
}

/** Posts through the real HTTP boundary and returns the exact public rejection contract. */
async function submitComment(
  { baseUrl, forwardedFor }: { baseUrl: string; forwardedFor: string },
  _options: Record<string, never> = {},
): Promise<{ error: string; reason: string }> {
  const response = await fetch(`${baseUrl}/api/site/comments`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
    body: JSON.stringify({ entryId: "missing-entry", body: "Hello" }),
  });
  assert.equal(response.status, 422);
  return await response.json() as { error: string; reason: string };
}

for (const builder of ["createApp", "createSiteApp"] as const) {
  test(`${builder}: real comment HTTP budget, trusted IP policy, expiry and app isolation`, async (t) => {
    const deps = createRouteDeps();
    let nowMs = Date.parse("2026-10-08T00:00:00.000Z");
    deps.clock = { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() };
    const calls: string[] = [];
    // A rejected ingress fake proves the HTTP budget counts requests before any accepted write.
    rejectAtActiveProvider({ deps, authorIpHashes: calls });
    const app = builder === "createApp" ? createApp(deps) : deps.createSiteApp();
    app.set("trust proxy", false);
    const baseUrl = await startTestServer(app, t);
    const rejected = { error: "comment was not accepted", reason: "entry-not-found" };
    const limited = { error: "comment was not accepted", reason: "rate-limited" };

    for (let attempt = 0; attempt < COMMENTS_SUBMIT_PROFILE.max; attempt += 1) {
      assert.deepEqual(await submitComment({ baseUrl, forwardedFor: `203.0.113.${attempt + 1}` }), rejected);
    }
    assert.equal(calls.length, COMMENTS_SUBMIT_PROFILE.max);
    assert.equal(new Set(calls).size, 1);
    assert.match(String(calls[0]), /^[a-f0-9]{64}$/);
    assert.deepEqual(await submitComment({ baseUrl, forwardedFor: "198.51.100.1" }), limited);
    assert.equal(calls.length, COMMENTS_SUBMIT_PROFILE.max, "exhausted HTTP budget must not call ingress");

    // A second app over the same deps owns a separate HTTP counter, as exporter apps must.
    const secondApp = builder === "createApp" ? createApp(deps) : deps.createSiteApp();
    secondApp.set("trust proxy", false);
    const secondUrl = await startTestServer(secondApp, t);
    assert.deepEqual(await submitComment({ baseUrl: secondUrl, forwardedFor: "198.51.100.1" }), rejected);
    assert.deepEqual(await submitComment({ baseUrl, forwardedFor: "198.51.100.2" }), limited);

    nowMs += COMMENTS_SUBMIT_PROFILE.windowSeconds * 1000;
    assert.deepEqual(await submitComment({ baseUrl, forwardedFor: "198.51.100.2" }), rejected);

    // With an explicitly trusted edge hop, different visitor addresses must get different keys.
    app.set("trust proxy", 1);
    assert.deepEqual(await submitComment({ baseUrl, forwardedFor: "203.0.113.100" }), rejected);
    const firstVisitorHash = calls.at(-1);
    assert.deepEqual(await submitComment({ baseUrl, forwardedFor: "203.0.113.101" }), rejected);
    assert.notEqual(calls.at(-1), firstVisitorHash);
  });
}

test("createApp with default dependencies mounts the required comment handler", async (t) => {
  const bootWork: Promise<void>[] = [];
  const app = createApp(undefined, { onBootWork: work => bootWork.push(work) });
  await Promise.all(bootWork);
  const baseUrl = await startTestServer(app, t);
  assert.deepEqual(await submitComment({ baseUrl, forwardedFor: "203.0.113.1" }), {
    error: "comment was not accepted", reason: "entry-not-found",
  });
});

// REGRESSION (2026-10-08 hardwiring audit #4): fails if createApp's comment route salts with
// `COMMENTS_IP_SALT ?? "dev-only-insecure-salt"` again instead of the root's site-key keyring.
test("createApp salts comment IP hashes from its site-key keyring when COMMENTS_IP_SALT is unset", async (t) => {
  const previous = process.env.COMMENTS_IP_SALT;
  delete process.env.COMMENTS_IP_SALT;
  t.after(() => {
    if (previous !== undefined) process.env.COMMENTS_IP_SALT = previous;
  });
  const hashWithSiteKey = async (siteKeyHex: string) => {
    const deps = createRouteDeps();
    deps.siteAssistantSecretKeyring = new FixedSiteKeyKeyring(siteKeyHex);
    const calls: string[] = [];
    rejectAtActiveProvider({ deps, authorIpHashes: calls });
    const app = createApp(deps);
    app.set("trust proxy", false);
    await submitComment({ baseUrl: await startTestServer(app, t), forwardedFor: "203.0.113.9" });
    assert.equal(calls.length, 1);
    return String(calls[0]);
  };
  const first = await hashWithSiteKey("11".repeat(32));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(await hashWithSiteKey("11".repeat(32)), first, "the same site key must give the same salt across app builds (restarts)");
  assert.notEqual(await hashWithSiteKey("22".repeat(32)), first, "a different install's site key must give a different salt");
});
