import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createPublishCredential, type PublishCredentialWriteDeps } from "../../publish-credentials/store.js";
import { InMemoryPublishCredentialSetRepo } from "../../publish-credentials/repo.memory.js";
import type { PublishCredentialSource } from "../types.js";
import {
  canYieldAccountLabel,
  InMemoryPublishCredentialVerificationCache,
  listGitHubReposByCredentialId,
  verifyPublishCredential,
  verifyPublishCredentialById,
  type PublishCredentialVerificationCache,
} from "../verify.js";

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

test("verifyPublishCredential: no credential configured returns null, makes no network call, clears any stale cache entry", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  cache.set({ workspaceId: WORKSPACE, target: "github-pages" }, { status: "valid", message: "stale", checkedAt: "2020-01-01T00:00:00.000Z" });
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
  // Deliberately `null`, not a fabricated `status: "invalid"`/`"unreachable"` — see `verify.ts`'s own
  // doc on why "nothing to check" is not one of the three real states.
  assert.equal(result, null);
  assert.equal(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), undefined, "a stale cached entry must not survive a credential that no longer exists");
});

test("verifyPublishCredential: GitHub accepts (200) — status:'valid', cached, and captures ONLY `login` as accountLabel", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const requestedUrls: string[] = [];
  // A real `GET /user` response carries far more than `login` — `email`/`plan`/org membership/etc.
  // This fixture includes two of those on purpose, so the assertions below prove they are excluded
  // by what the code does, not merely absent from a minimal fixture.
  const fetchFn = (async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify({ login: "octo", email: "octo@example.com", plan: { name: "pro" } }), { status: 200 });
  }) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "real-token-must-not-appear" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.ok(result);
  assert.equal(result!.status, "valid");
  assert.match(result!.message, /GitHub accepted/);
  assert.equal(requestedUrls[0], "https://api.github.com/user");
  assert.deepEqual(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), result);
  assert.equal(JSON.stringify(result).includes("real-token-must-not-appear"), false);
  // 2026-08-16 (Defect 1, live-publish finding): `login` IS now captured deliberately — it is about
  // to be printed in a public URL a real publish already prints (`https://<login>.github.io/<repo>/`),
  // so withholding it from the agent performing the publish protected nothing and forced it to guess
  // an owner instead (the incident this fix exists for). This is a narrowing of the old "never reads
  // the body at all" rule, not a reversal of it — everything else in the body must still never
  // surface in the cached result.
  assert.equal(result!.accountLabel, "octo");
  assert.equal(JSON.stringify(result).includes("octo@example.com"), false, "email must never be captured");
  assert.equal(JSON.stringify(result).includes("pro"), false, "plan must never be captured");
});

test("verifyPublishCredential: Vercel accepts (200) — captures ONLY `user.username` as accountLabel, never email/billing", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () =>
    new Response(JSON.stringify({ user: { id: "u1", username: "acme-han", email: "han@example.com", billing: { plan: "pro" } } }), { status: 200 })) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "vercel" }
  );

  assert.ok(result);
  assert.equal(result!.status, "valid");
  assert.equal(result!.accountLabel, "acme-han");
  assert.equal(JSON.stringify(result).includes("han@example.com"), false, "email must never be captured");
  assert.equal(JSON.stringify(result).includes("billing"), false, "billing must never be captured");
});

test("verifyPublishCredential: Netlify and Cloudflare Pages acceptances leave accountLabel undefined — neither's checked endpoint carries a safe public identity field", async () => {
  for (const target of ["netlify", "cloudflare-pages"] as const) {
    const cache = new InMemoryPublishCredentialVerificationCache();
    const fetchFn = (async () => new Response(JSON.stringify({ id: "x", email: "x@example.test", full_name: "X" }), { status: 200 })) as typeof fetch;
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn }, { workspaceId: WORKSPACE, target });
    assert.ok(result);
    assert.equal(result!.status, "valid");
    assert.equal(result!.accountLabel, undefined, `${target} must not fabricate an accountLabel from a field it has no reviewed mapping for`);
  }
});

test("verifyPublishCredential: a 200 response with an unparseable body still returns status:'valid' with no accountLabel — never throws", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => new Response("not json", { status: 200 })) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.ok(result);
  assert.equal(result!.status, "valid");
  assert.equal(result!.accountLabel, undefined);
});

test("verifyPublishCredential: GitHub rejects (401) — status:'invalid', distinct from 'unreachable', never the token or the provider's response body", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "ghp_should_never_leak" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.ok(result);
  assert.equal(result!.status, "invalid");
  assert.match(result!.message, /GitHub rejected this credential \(HTTP 401\)/);
  assert.equal(JSON.stringify(result).includes("ghp_should_never_leak"), false);
  assert.equal(JSON.stringify(result).includes("Bad credentials"), false, "the provider's own response body must never be echoed");
});

test("verifyPublishCredential: a network failure (DNS/timeout/etc.) never throws — status:'unreachable', distinct from 'invalid'", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "vercel" }
  );

  assert.ok(result);
  // The regression this status distinction exists for: a transient network failure must read as
  // "we couldn't check", never as "the provider said no" — collapsing the two would risk sending a
  // human to regenerate a perfectly good token.
  assert.equal(result!.status, "unreachable");
  assert.notEqual(result!.status, "invalid");
  assert.match(result!.message, /Could not reach Vercel/);
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
  assert.ok(result);
  assert.equal(result!.status, "valid");
  assert.equal(JSON.stringify(result).includes("s3-secret-should-never-leak"), false);
});

test("verifyPublishCredential: GitHub rejects with 403 (not just 401) — status:'invalid', the other half of classifyProviderResponse's rejected check", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => new Response("", { status: 403 })) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.ok(result);
  assert.equal(result!.status, "invalid");
  assert.match(result!.message, /GitHub rejected this credential \(HTTP 403\)/);
});

test("verifyPublishCredential: an HTTP-level provider failure (5xx, not a network throw) is status:'unreachable' WITH the status code in the message", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => new Response("", { status: 503 })) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn },
    { workspaceId: WORKSPACE, target: "vercel" }
  );

  assert.ok(result);
  assert.equal(result!.status, "unreachable");
  assert.match(result!.message, /Could not reach Vercel to verify this credential \(HTTP 503\)/, "an HTTP-level unreachable must carry the status code, unlike a network throw's message");
});

test("verifyPublishCredential: a valid JSON body that is not an object (extractGitHubLogin's own type guard) yields no accountLabel, never throws", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  for (const literal of ['"just a string"', "42", "null"]) {
    const fetchFn = (async () => new Response(literal, { status: 200 })) as typeof fetch;
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn }, { workspaceId: WORKSPACE, target: "github-pages" });
    assert.ok(result, literal);
    assert.equal(result!.status, "valid", literal);
    assert.equal(result!.accountLabel, undefined, `a non-object JSON body (${literal}) must never crash extractGitHubLogin or fabricate a label`);
  }
});

test("verifyPublishCredential: GitHub accepts but the body carries no usable login (missing, empty, or non-string) — accountLabel stays undefined", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  for (const body of [{}, { login: "" }, { login: 12345 }]) {
    const fetchFn = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn }, { workspaceId: WORKSPACE, target: "github-pages" });
    assert.ok(result, JSON.stringify(body));
    assert.equal(result!.accountLabel, undefined, JSON.stringify(body));
  }
});

test("verifyPublishCredential: Vercel accepts but the body's `user` is missing/not-an-object, or `username` is missing/empty/non-string — accountLabel stays undefined", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  for (const body of [{}, { user: "not-an-object" }, { user: null }, { user: {} }, { user: { username: "" } }, { user: { username: 7 } }]) {
    const fetchFn = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn }, { workspaceId: WORKSPACE, target: "vercel" });
    assert.ok(result, JSON.stringify(body));
    assert.equal(result!.accountLabel, undefined, JSON.stringify(body));
  }
});

test("verifyPublishCredential: s3-compatible uses an explicit, non-blank endpoint verbatim (trailing slash stripped) instead of deriving one from region", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  let seenUrl = "";
  const fetchFn = (async (input: RequestInfo | URL) => {
    seenUrl = input instanceof Request ? input.url : String(input);
    return new Response("", { status: 200 });
  }) as typeof fetch;

  await verifyPublishCredential(
    {
      credentialSource: fakeSource({ ok: true, token: "secret", accessKeyId: "AKIA", bucket: "my-bucket", region: "auto", endpoint: "https://abc123.r2.cloudflarestorage.com/" }),
      cache,
      clock,
      fetchFn,
    },
    { workspaceId: WORKSPACE, target: "s3-compatible" }
  );

  assert.equal(seenUrl, "https://abc123.r2.cloudflarestorage.com/my-bucket");
});

/** The truthiness guard tests `.trim()`, but the OLD code used the raw, untrimmed endpoint in the
 *  signed URL — a stray leading/trailing space (a paste artifact `publish-credentials/store.ts`'s own
 *  `optionalString` no longer persists going forward, but this file must not depend on that) would
 *  survive into `client.sign()`, which throws on the resulting invalid URL and folds into a misleading
 *  "unreachable" instead of a clear "there's a space in your endpoint." */
test("verifyPublishCredential: s3-compatible trims a leading/trailing-whitespace endpoint before signing, instead of failing to sign an invalid URL", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  let seenUrl = "";
  const fetchFn = (async (input: RequestInfo | URL) => {
    seenUrl = input instanceof Request ? input.url : String(input);
    return new Response("", { status: 200 });
  }) as typeof fetch;

  await verifyPublishCredential(
    {
      credentialSource: fakeSource({ ok: true, token: "secret", accessKeyId: "AKIA", bucket: "my-bucket", region: "auto", endpoint: "  https://abc123.r2.cloudflarestorage.com/  " }),
      cache,
      clock,
      fetchFn,
    },
    { workspaceId: WORKSPACE, target: "s3-compatible" }
  );

  assert.equal(seenUrl, "https://abc123.r2.cloudflarestorage.com/my-bucket");
});

test("verifyPublishCredential: s3-compatible signing failure (a malformed derived URL) folds into status:'unreachable', never throws", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    throw new Error("must not be called — signing must fail before any network call");
  }) as typeof fetch;

  const result = await verifyPublishCredential(
    {
      // Not a valid absolute URL once `/${bucket}` is appended — `aws4fetch`'s own `sign()` throws a
      // `TypeError: Invalid URL` for this, before ever touching the network (verified directly against
      // `aws4fetch` — signing is pure local computation, no I/O).
      credentialSource: fakeSource({ ok: true, token: "secret", accessKeyId: "AKIA", bucket: "my-bucket", region: "auto", endpoint: "not-a-valid-url" }),
      cache,
      clock,
      fetchFn,
    },
    { workspaceId: WORKSPACE, target: "s3-compatible" }
  );

  assert.equal(fetchCalls, 0, "a signing failure must never reach the network");
  assert.ok(result);
  assert.equal(result!.status, "unreachable");
});

test("canYieldAccountLabel: true only for the providers with a reviewed account-identity field (github-pages, vercel)", () => {
  assert.equal(canYieldAccountLabel("github-pages"), true);
  assert.equal(canYieldAccountLabel("vercel"), true);
  assert.equal(canYieldAccountLabel("netlify"), false);
  assert.equal(canYieldAccountLabel("cloudflare-pages"), false);
  assert.equal(canYieldAccountLabel("s3-compatible"), false);
});

// ---------------------------------------------------------------------------
// PublishCredentialVerificationCache
// ---------------------------------------------------------------------------

test("InMemoryPublishCredentialVerificationCache: isolates by workspace AND target", () => {
  const cache: PublishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  cache.set({ workspaceId: "ws-a", target: "github-pages" }, { status: "valid", message: "a", checkedAt: NOW });
  cache.set({ workspaceId: "ws-a", target: "vercel" }, { status: "invalid", message: "b", checkedAt: NOW });
  cache.set({ workspaceId: "ws-b", target: "github-pages" }, { status: "unreachable", message: "c", checkedAt: NOW });

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
  assert.equal(result!.status, "invalid");
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
  cache.set({ workspaceId: WORKSPACE, target: "github-pages" }, { status: "valid", message: "default row is fine", checkedAt: NOW });

  const fetchFn = (async () => new Response("", { status: 401 })) as typeof fetch; // the second row is BAD

  const result = await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn }, { workspaceId: WORKSPACE, id: secondRow.id });

  assert.ok(result);
  assert.equal(result!.status, "invalid", "the row that was actually checked (the second, bad one) still gets an honest own result");
  assert.equal(
    cache.get({ workspaceId: WORKSPACE, target: "github-pages" })?.message,
    "default row is fine",
    "checking a non-default row must never change what a real publish (which always uses the default) would report as ready"
  );
});

test("verifyPublishCredentialById: an s3-compatible row is mapped through toCheckableCredential's s3-compatible branch (token carries secretAccessKey, endpoint forwarded)", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "bucket",
    connection: {
      providerId: "s3-compatible",
      accessKeyId: "AKIA",
      secretAccessKey: "s3cr3t-must-not-leak",
      bucket: "my-bucket",
      region: "auto",
      endpoint: "https://r2.example.com",
      publicUrl: "https://cdn.example.com",
    },
  });
  const cache = new InMemoryPublishCredentialVerificationCache();
  let seenUrl = "";
  const fetchFn = (async (input: RequestInfo | URL) => {
    seenUrl = input instanceof Request ? input.url : String(input);
    return new Response("", { status: 200 });
  }) as typeof fetch;

  const result = await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "valid");
  assert.equal(seenUrl, "https://r2.example.com/my-bucket");
  assert.equal(JSON.stringify(result).includes("s3cr3t-must-not-leak"), false);
});

test("verifyPublishCredentialById: an s3-compatible row with no endpoint configured derives the plain-AWS-S3 host from region", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "bucket",
    connection: { providerId: "s3-compatible", accessKeyId: "AKIA", secretAccessKey: "s3cr3t", bucket: "my-bucket", region: "us-east-1", publicUrl: "https://cdn.example.com" },
  });
  const cache = new InMemoryPublishCredentialVerificationCache();
  let seenUrl = "";
  const fetchFn = (async (input: RequestInfo | URL) => {
    seenUrl = input instanceof Request ? input.url : String(input);
    return new Response("", { status: 200 });
  }) as typeof fetch;

  await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.equal(seenUrl, "https://s3.us-east-1.amazonaws.com/my-bucket");
});

test("verifyPublishCredentialById: a row deleted between the two concurrent reads (findById vs resolveForPublish's own findById) returns null rather than throwing", async () => {
  // `verifyPublishCredentialById` runs `deps.repo.findById(input)` directly AND
  // `resolveForPublish(...)` (which does its OWN internal `findById`) concurrently via
  // `Promise.all` — two independent reads of the same row, not one atomic snapshot. This wraps a
  // real repo to make its SECOND `findById` call (the one inside `resolveForPublish`) observe the
  // row as already gone, simulating a real delete landing in the gap between the two reads —
  // the one `!record || !resolved` combination the happy-path tests above cannot produce, since an
  // in-memory repo answers both reads from the same unchanging snapshot otherwise.
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  let findByIdCalls = 0;
  const racyRepo: typeof writeDeps.repo = {
    ...writeDeps.repo,
    findById: async (input) => {
      findByIdCalls += 1;
      if (findByIdCalls === 1) return writeDeps.repo.findById(input);
      return null; // the row is "gone" by the time resolveForPublish's own read lands
    },
  };
  const cache = new InMemoryPublishCredentialVerificationCache();
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;

  const result = await verifyPublishCredentialById({ repo: racyRepo, sealer: writeDeps.sealer, cache, clock, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.equal(result, null);
  assert.equal(fetchCalls, 0);
});

// ---------------------------------------------------------------------------
// listGitHubReposByCredentialId — the GitHub owner/repo picker's real seam (source-control-ui's
// dependency, adapted by route-quality's admin route)
// ---------------------------------------------------------------------------

/** A raw GitHub `/user/repos` entry — deliberately carries extra fields real GitHub responses do
 *  (`html_url`, `description`) so assertions below prove they are excluded by what the code does,
 *  same discipline `verifyPublishCredential`'s own fixtures already use. */
function rawGitHubRepo(overrides: Partial<{ name: string; full_name: string; owner: { login: string }; private: boolean; default_branch: string }> = {}) {
  return {
    name: "demo",
    full_name: "octo/demo",
    owner: { login: "octo" },
    private: false,
    default_branch: "main",
    html_url: "https://github.com/octo/demo",
    description: "a repo",
    ...overrides,
  };
}

test("listGitHubReposByCredentialId: no such row returns null, makes no network call", async () => {
  const writeDeps = makeWriteDeps();
  let fetchCalls = 0;
  const fetchFn = (async () => {
    fetchCalls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: "no-such-id" });

  assert.equal(result, null);
  assert.equal(fetchCalls, 0);
});

test("listGitHubReposByCredentialId: a non-github-pages credential throws — the caller's own pre-check (providerId === 'github-pages') is a wiring bug if skipped, not a result this function's return type should have to express", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "prod", connection: { providerId: "vercel", token: "vercel-tok" } });
  const fetchFn = (async () => {
    throw new Error("must not be called");
  }) as typeof fetch;

  await assert.rejects(
    () => listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id }),
    /is a 'vercel' connection, not 'github-pages'/
  );
});

test("listGitHubReposByCredentialId: a real page of repos maps to the closed GitHubRepoSummary shape, drops a malformed entry, and reports truncated:false with no Link header and an under-full page", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "real-token-must-not-leak" } });

  const requestedUrls: string[] = [];
  let seenAuthHeader = "";
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrls.push(String(input));
    seenAuthHeader = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify([rawGitHubRepo(), rawGitHubRepo({ name: "private-thing", full_name: "octo/private-thing", private: true }), { name: "malformed, no owner" }]), {
      status: 200,
    });
  }) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "valid");
  assert.equal(result!.message, undefined, "a valid result needs no explanatory message");
  assert.equal(result!.truncated, false);
  assert.deepEqual(result!.repos, [
    { owner: "octo", name: "demo", fullName: "octo/demo", private: false, defaultBranch: "main" },
    { owner: "octo", name: "private-thing", fullName: "octo/private-thing", private: true, defaultBranch: "main" },
  ]);
  assert.equal(requestedUrls[0], "https://api.github.com/user/repos?affiliation=owner,organization_member&sort=updated&per_page=100");
  assert.equal(seenAuthHeader, "Bearer real-token-must-not-leak");
  assert.equal(JSON.stringify(result).includes("real-token-must-not-leak"), false, "the token itself must never appear in the returned result");
  assert.equal(JSON.stringify(result).includes("html_url"), false, "must never surface a field beyond the closed GitHubRepoSummary shape");
});

test("listGitHubReposByCredentialId: truncated:true when GitHub's Link header names a rel=\"next\" page, even if fewer than 100 repos came back", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const fetchFn = (async () =>
    new Response(JSON.stringify([rawGitHubRepo()]), {
      status: 200,
      headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=5>; rel="last"' },
    })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.truncated, true, "the Link header is the authoritative signal, independent of how many repos this page happened to carry");
});

test("listGitHubReposByCredentialId: truncated:true falls back to 'page came back exactly full' when GitHub's Link header is absent — under-reporting truncation is the worse failure mode", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const fullPage = Array.from({ length: 100 }, (_, i) => rawGitHubRepo({ name: `repo-${i}`, full_name: `octo/repo-${i}` }));
  const fetchFn = (async () => new Response(JSON.stringify(fullPage), { status: 200 })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.repos.length, 100);
  assert.equal(result!.truncated, true);
});

test("listGitHubReposByCredentialId: GitHub rejects (401) — status:'invalid', empty repos, never the token or the provider's response body", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "ghp_should_never_leak" } });
  const fetchFn = (async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "invalid");
  assert.deepEqual(result!.repos, []);
  assert.equal(result!.truncated, false);
  assert.match(result!.message ?? "", /GitHub rejected this credential \(HTTP 401\)/);
  assert.equal(JSON.stringify(result).includes("ghp_should_never_leak"), false);
  assert.equal(JSON.stringify(result).includes("Bad credentials"), false, "the provider's own response body must never be echoed");
});

test("listGitHubReposByCredentialId: a network failure never throws — status:'unreachable', distinct from 'invalid'", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const fetchFn = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "unreachable");
  assert.notEqual(result!.status, "invalid");
  assert.deepEqual(result!.repos, []);
});

test("listGitHubReposByCredentialId: an authenticated 200 with an unparseable body degrades to status:'unreachable' rather than throwing", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const fetchFn = (async () => new Response("not json", { status: 200 })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "unreachable");
  assert.deepEqual(result!.repos, []);
});

test("listGitHubReposByCredentialId: an HTTP-level failure that is neither 401 nor 403 (e.g. 500) is status:'unreachable', not 'invalid'", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const fetchFn = (async () => new Response("", { status: 500 })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "unreachable");
  assert.match(result!.message ?? "", /GitHub/);
  assert.deepEqual(result!.repos, []);
});

test("listGitHubReposByCredentialId: a 200 body that parses but is not an array (Array.isArray's own false arm) yields an empty, non-truncated repo list rather than throwing", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const fetchFn = (async () => new Response(JSON.stringify({ message: "not the array shape this endpoint documents" }), { status: 200 })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "valid", "an authenticated 2xx with an unexpected body shape is still a valid credential — the shape mismatch degrades to an empty list, not a failure");
  assert.deepEqual(result!.repos, []);
  assert.equal(result!.truncated, false);
});

test("listGitHubReposByCredentialId: a Link header present but naming no rel=\"next\" page reports truncated:false even on an under-full page — proves the regex is checked, not merely header presence", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const fetchFn = (async () =>
    new Response(JSON.stringify([rawGitHubRepo()]), {
      status: 200,
      headers: { link: '<https://api.github.com/user/repos?page=1>; rel="prev", <https://api.github.com/user/repos?page=1>; rel="last"' },
    })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.truncated, false);
});

test("listGitHubReposByCredentialId: a repo entry with a non-object, null, or wrong-typed owner is dropped, never crashes the whole listing", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const badOwnerEntries = [
    { ...rawGitHubRepo(), owner: null },
    { ...rawGitHubRepo(), owner: "not-an-object" },
    { ...rawGitHubRepo(), owner: {} },
  ];
  const fetchFn = (async () => new Response(JSON.stringify(badOwnerEntries), { status: 200 })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.deepEqual(result!.repos, [], "every entry with an unreadable owner.login must be dropped, not defaulted or half-populated");
});

test("listGitHubReposByCredentialId: an entry with a wrong-typed private flag or default_branch is dropped even though name/full_name/owner are all valid", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "tok" } });
  const entries = [rawGitHubRepo({ private: "yes" as unknown as boolean }), rawGitHubRepo({ default_branch: undefined as unknown as string })];
  const fetchFn = (async () => new Response(JSON.stringify(entries), { status: 200 })) as typeof fetch;

  const result = await listGitHubReposByCredentialId({ repo: writeDeps.repo, sealer: writeDeps.sealer, fetchFn }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.deepEqual(result!.repos, [], "a wrong-typed private/default_branch field must drop the whole entry, never coerce or default it");
});
