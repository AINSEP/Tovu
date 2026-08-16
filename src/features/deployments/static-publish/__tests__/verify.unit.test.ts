import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../../integrations/keyring.memory";
import { createPublishCredential, type PublishCredentialWriteDeps } from "../../publish-credentials/store";
import { InMemoryPublishCredentialSetRepo } from "../../publish-credentials/repo.memory";
import type { PublishCredentialSource } from "../types";
import {
  InMemoryPublishCredentialVerificationCache,
  verifyPublishCredential,
  verifyPublishCredentialById,
  type PublishCredentialVerificationCache,
} from "../verify";

/**
 * @file Verifies `verify.ts` in isolation — the fix for "ready means a row exists, not a working
 * credential" (see this file's own header for the full incident/design trail). Covers: every
 * provider checker's rejected/accepted/unreachable classification, the never-throws contract (a
 * network error must never propagate), the message never carrying the credential, the cache's own
 * read/write/delete contract, and `verifyPublishCredentialById`'s "only the DEFAULT row updates the
 * shared ready-signal" rule.
 */

const WORKSPACE = "ws-verify";
const NOW = "2026-08-16T00:00:00.000Z";
const clock = { nowIso: () => NOW };

function makeWriteDeps(): PublishCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemoryPublishCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock,
    idGen: { newId: () => `cred-${(counter += 1)}` },
  };
}

/** A `PublishCredentialSource` fake for `verifyPublishCredential`'s (target-scoped) tests — no real
 *  encryption needed since these tests only exercise the provider-check dispatch, not decryption. */
function fakeSource(resolved: Awaited<ReturnType<PublishCredentialSource["resolve"]>>): PublishCredentialSource {
  return {
    async resolve() {
      return resolved;
    },
    async isConfigured() {
      throw new Error("not used by these tests");
    },
  };
}

// ---------------------------------------------------------------------------
// verifyPublishCredential — target-scoped ("whichever credential is currently active")
// ---------------------------------------------------------------------------

test("verifyPublishCredential: no credential configured makes no network call, clears any stale cache entry", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  cache.set({ workspaceId: WORKSPACE, target: "github-pages" }, { ok: true, message: "stale", checkedAt: "2020-01-01T00:00:00.000Z" });
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: false, reason: "no default 'github-pages' credential is saved" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.equal(fetchCalls, 0);
  assert.equal(result.ok, false);
  assert.match(result.message, /no credential is configured/);
  assert.equal(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), undefined, "a stale cached entry must not survive a credential that no longer exists");
});

test("verifyPublishCredential: GitHub accepts (200) — ok:true, cached", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const requestedUrls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify({ login: "octo" }), { status: 200 });
  }) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "real-token-must-not-appear" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /GitHub accepted/);
  assert.equal(requestedUrls[0], "https://api.github.com/user");
  assert.deepEqual(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), result);
  assert.equal(JSON.stringify(result).includes("real-token-must-not-appear"), false);
});

test("verifyPublishCredential: GitHub rejects (401) — ok:false, reason surfaced, never the token", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "ghp_should_never_leak" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.equal(result.ok, false);
  assert.match(result.message, /GitHub rejected this credential \(HTTP 401\)/);
  assert.equal(JSON.stringify(result).includes("ghp_should_never_leak"), false);
  assert.equal(JSON.stringify(result).includes("Bad credentials"), false, "the provider's own response body must never be echoed");
});

test("verifyPublishCredential: a network failure (DNS/timeout/etc.) never throws — classified as unreachable, not rejected", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "vercel" }
  );

  assert.equal(result.ok, false);
  assert.match(result.message, /Could not reach Vercel/);
});

test("verifyPublishCredential: dispatches each provider to its own documented endpoint", async () => {
  const cases: { target: "github-pages" | "vercel" | "netlify" | "cloudflare-pages"; url: string }[] = [
    { target: "github-pages", url: "https://api.github.com/user" },
    { target: "vercel", url: "https://api.vercel.com/v2/user" },
    { target: "netlify", url: "https://api.netlify.com/api/v1/user" },
    { target: "cloudflare-pages", url: "https://api.cloudflare.com/client/v4/user/tokens/verify" },
  ];
  for (const { target, url } of cases) {
    const cache = new InMemoryPublishCredentialVerificationCache();
    const requested: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn }, { workspaceId: WORKSPACE, target });
    assert.equal(requested[0], url, `${target} must be checked against its own documented endpoint`);
  }
});

test("verifyPublishCredential: s3-compatible signs a HEAD against the bucket (via aws4fetch) and never leaks the secret key", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  let seenMethod = "";
  let seenAuthHeaderPresent = false;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // `client.sign()` returns a `Request` object as `input` with `init` folded in — this asserts
    // the SIGNED request (not a bare unsigned URL) is what actually reaches `fetchFn`.
    const req = input instanceof Request ? input : new Request(String(input), init);
    seenMethod = req.method;
    seenAuthHeaderPresent = req.headers.has("authorization");
    return new Response("", { status: 200 });
  }) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "s3-secret-should-never-leak", accessKeyId: "AKIA_FAKE", bucket: "my-bucket", region: "us-east-1" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "s3-compatible" }
  );

  assert.equal(seenMethod, "HEAD");
  assert.ok(seenAuthHeaderPresent, "aws4fetch must have signed the request with an Authorization header");
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes("s3-secret-should-never-leak"), false);
});

// ---------------------------------------------------------------------------
// PublishCredentialVerificationCache
// ---------------------------------------------------------------------------

test("InMemoryPublishCredentialVerificationCache: isolates by workspace AND target", () => {
  const cache: PublishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  cache.set({ workspaceId: "ws-a", target: "github-pages" }, { ok: true, message: "a", checkedAt: NOW });
  cache.set({ workspaceId: "ws-a", target: "vercel" }, { ok: false, message: "b", checkedAt: NOW });
  cache.set({ workspaceId: "ws-b", target: "github-pages" }, { ok: false, message: "c", checkedAt: NOW });

  assert.equal(cache.get({ workspaceId: "ws-a", target: "github-pages" })?.message, "a");
  assert.equal(cache.get({ workspaceId: "ws-a", target: "vercel" })?.message, "b");
  assert.equal(cache.get({ workspaceId: "ws-b", target: "github-pages" })?.message, "c");
  assert.equal(cache.get({ workspaceId: "ws-b", target: "vercel" }), undefined);

  cache.delete({ workspaceId: "ws-a", target: "github-pages" });
  assert.equal(cache.get({ workspaceId: "ws-a", target: "github-pages" }), undefined);
  assert.equal(cache.get({ workspaceId: "ws-a", target: "vercel" })?.message, "b", "deleting one entry must not disturb a sibling");
});

// ---------------------------------------------------------------------------
// verifyPublishCredentialById — row-scoped ("the one a human just saved/clicked")
// ---------------------------------------------------------------------------

test("verifyPublishCredentialById: no such row returns null, makes no network call", async () => {
  const writeDeps = makeWriteDeps();
  const cache = new InMemoryPublishCredentialVerificationCache();
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;

  const result = await verifyPublishCredentialById(
    { repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn },
    { workspaceId: WORKSPACE, id: "no-such-id" }
  );

  assert.equal(result, null);
  assert.equal(fetchCalls, 0);
});

test("verifyPublishCredentialById: the provider's DEFAULT row updates the shared (workspaceId, target) cache", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "real-secret" } });
  assert.equal(summary.isDefault, true, "first row for a provider auto-defaults");

  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => new Response("", { status: 401 })) as typeof fetch;

  const result = await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.ok, false);
  assert.deepEqual(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), result, "the default row's result IS the target's ready-signal");
});

test("verifyPublishCredentialById: a NON-default row's own result is returned but does NOT overwrite the default row's cached ready-signal", async () => {
  const writeDeps = makeWriteDeps();
  const defaultRow = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "default-secret" } });
  const secondRow = await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "personal",
    connection: { providerId: "github-pages", token: "second-secret" },
    isDefault: false,
  });
  assert.equal(defaultRow.isDefault, true);
  assert.equal(secondRow.isDefault, false);

  const cache = new InMemoryPublishCredentialVerificationCache();
  // Seed the cache as if the DEFAULT row was already verified and known-good — the invariant under
  // test is that checking the unrelated SECOND row must never clobber this.
  cache.set({ workspaceId: WORKSPACE, target: "github-pages" }, { ok: true, message: "default row is fine", checkedAt: NOW });

  const fetchFn = (async () => new Response("", { status: 401 })) as typeof fetch; // the second row is BAD

  const result = await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn }, { workspaceId: WORKSPACE, id: secondRow.id });

  assert.ok(result);
  assert.equal(result!.ok, false, "the row that was actually checked (the second, bad one) still gets an honest own result");
  assert.equal(
    cache.get({ workspaceId: WORKSPACE, target: "github-pages" })?.message,
    "default row is fine",
    "checking a non-default row must never change what a real publish (which always uses the default) would report as ready"
  );
});
