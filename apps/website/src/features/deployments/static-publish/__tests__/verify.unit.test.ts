import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createPublishCredential, type PublishCredentialWriteDeps } from "../../publish-credentials/store.js";
import { InMemoryVendorCredentialSetRepo } from "#src/features/vendor-credentials/repo.memory";
import type { PublishCredentialSource } from "../types.js";
import {
  canYieldAccountLabel,
  InMemoryPublishCredentialVerificationCache,
  verifyPublishCredential,
  verifyPublishCredentialById,
  type PublishCredentialVerificationCache,
} from "../verify.js";
import { loadBundledDeployTargets } from "#src/features/deployments/deploy-targets/__tests__/bundled-deploy-targets.fixture";
import type { DeployTargetCredentialSpec, DeployTargetModule, DeployTargetRegistry, LoadedDeployTarget } from "#src/features/deployments/deploy-targets/types";

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
const clock = { nowMs: () => Date.parse(NOW), nowIso: () => NOW };

function makeWriteDeps(): PublishCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemoryVendorCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock,
    idGen: { newId: () => `cred-${(counter += 1)}` },
    loadDeployTargets: loadBundledDeployTargets,
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
    { credentialSource: fakeSource({ ok: false, reason: "no default 'github-pages' credential is saved" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
    { workspaceId: WORKSPACE, target: "github-pages" }
  );

  assert.equal(fetchCalls, 0);
  // Deliberately `null`, not a fabricated `status: "invalid"`/`"unreachable"` — see `verify.ts`'s own
  // doc on why "nothing to check" is not one of the three real states.
  assert.equal(result, null);
  assert.equal(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), undefined, "a stale cached entry must not survive a credential that no longer exists");
});

/** A one-target registry whose module is a stub, so a test can see core call the plugin's own check. */
function stubRegistry(module: DeployTargetModule, credential: Partial<DeployTargetCredentialSpec> = {}): () => Promise<DeployTargetRegistry> {
  const loaded: LoadedDeployTarget = {
    pluginId: "stub-plugin",
    module,
    descriptor: {
      id: "acme-host",
      label: "Acme Hosting",
      module: "targets/acme.mjs",
      configFields: [],
      credential: { vendorId: "acme", tokenField: "token", fields: [{ name: "token", label: "Token", required: true, secret: true }], ...credential },
    },
  };
  return async () => ({ get: (id) => (id === "acme-host" ? loaded : undefined), list: () => [loaded], refusals: [] });
}

test("verifyPublishCredential: a plugin host is checked by its own module's verifyCredential, labelled with its declared vendorLabel", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const seen: unknown[] = [];
  const module: DeployTargetModule = {
    create: () => {
      throw new Error("verify must never build a publish target");
    },
    async verifyCredential({ credential, kit }) {
      seen.push(credential.token, typeof kit.fetch);
      return { ok: true, accountLabel: "acme-user" };
    },
  };

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "acme-token" }), cache, clock, loadDeployTargets: stubRegistry(module, { vendorLabel: "Acme" }) },
    { workspaceId: WORKSPACE, target: "acme-host" }
  );

  assert.deepEqual(seen, ["acme-token", "function"]);
  assert.deepEqual(result, { status: "valid", message: "Acme accepted this credential.", checkedAt: NOW, accountLabel: "acme-user" });
});

test("verifyPublishCredential: a module whose check throws is 'unreachable', never a thrown error", async () => {
  const module: DeployTargetModule = {
    create: () => {
      throw new Error("unused");
    },
    async verifyCredential() {
      throw new Error("socket hang up");
    },
  };

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "t" }), cache: new InMemoryPublishCredentialVerificationCache(), clock, loadDeployTargets: stubRegistry(module) },
    { workspaceId: WORKSPACE, target: "acme-host" }
  );

  assert.equal(result!.status, "unreachable");
  assert.equal(result!.message, "Could not reach Acme Hosting to verify this credential — this does not necessarily mean the credential is bad.");
});

test("verifyPublishCredential: a target no installed plugin provides (or one with no check) is 'unreachable' with a turn-on hint, and makes no network call", async () => {
  const noCheck: DeployTargetModule = {
    create: () => {
      throw new Error("unused");
    },
  };
  for (const [target, loadDeployTargets] of [
    ["gone-host", stubRegistry(noCheck)],
    ["acme-host", stubRegistry(noCheck)],
  ] as const) {
    const result = await verifyPublishCredential(
      { credentialSource: fakeSource({ ok: true, token: "t" }), cache: new InMemoryPublishCredentialVerificationCache(), clock, loadDeployTargets, fetchFn: (async () => assert.fail("no network")) as typeof fetch },
      { workspaceId: WORKSPACE, target }
    );
    assert.equal(result!.status, "unreachable");
    assert.equal(result!.message, `Could not verify this credential: no turned-on deploy plugin can check '${target}' credentials.`);
  }
});

test("canYieldAccountLabel: follows the host's declared yieldsAccountLabel", async () => {
  assert.equal(canYieldAccountLabel(await stubRegistry({ create: () => assert.fail() }, { yieldsAccountLabel: true })(), "acme-host"), true);
  assert.equal(canYieldAccountLabel(await stubRegistry({ create: () => assert.fail() })(), "acme-host"), false);
  assert.equal(canYieldAccountLabel(await stubRegistry({ create: () => assert.fail() }, { yieldsAccountLabel: true })(), "gone-host"), false);
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
    { credentialSource: fakeSource({ ok: true, token: "real-token-must-not-appear" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
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
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
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
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, target });
    assert.ok(result);
    assert.equal(result!.status, "valid");
    assert.equal(result!.accountLabel, undefined, `${target} must not fabricate an accountLabel from a field it has no reviewed mapping for`);
  }
});

test("verifyPublishCredential: a 200 response with an unparseable body still returns status:'valid' with no accountLabel — never throws", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  const fetchFn = (async () => new Response("not json", { status: 200 })) as typeof fetch;

  const result = await verifyPublishCredential(
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
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
    { credentialSource: fakeSource({ ok: true, token: "ghp_should_never_leak" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
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
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
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
    const authentication: (string | null)[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requested.push(String(input));
      authentication.push(new Headers(init?.headers).get("authorization"));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, target });
    assert.equal(requested[0], url, `${target} must be checked against its own documented endpoint`);
    assert.deepEqual(authentication, ["Bearer tok"], target);
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
    { credentialSource: fakeSource({ ok: true, token: "s3-secret-should-never-leak", accessKeyId: "AKIA_FAKE", bucket: "my-bucket", region: "us-east-1" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
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
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
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
    { credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
    { workspaceId: WORKSPACE, target: "vercel" }
  );

  assert.ok(result);
  assert.equal(result!.status, "unreachable");
  assert.match(result!.message, /Could not reach Vercel to verify this credential \(HTTP 503\)/, "an HTTP-level unreachable must carry the status code, unlike a network throw's message");
});

test("verifyPublishCredential: a valid JSON body that is not an object (the module's own type guard) yields no accountLabel, never throws", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  for (const literal of ['"just a string"', "42", "null"]) {
    const fetchFn = (async () => new Response(literal, { status: 200 })) as typeof fetch;
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, target: "github-pages" });
    assert.ok(result, literal);
    assert.equal(result!.status, "valid", literal);
    assert.equal(result!.accountLabel, undefined, `a non-object JSON body (${literal}) must never crash the login read or fabricate a label`);
  }
});

test("verifyPublishCredential: GitHub accepts but the body carries no usable login (missing, empty, or non-string) — accountLabel stays undefined", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  for (const body of [{}, { login: "" }, { login: 12345 }]) {
    const fetchFn = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, target: "github-pages" });
    assert.ok(result, JSON.stringify(body));
    assert.equal(result!.accountLabel, undefined, JSON.stringify(body));
  }
});

test("verifyPublishCredential: Vercel accepts but the body's `user` is missing/not-an-object, or `username` is missing/empty/non-string — accountLabel stays undefined", async () => {
  const cache = new InMemoryPublishCredentialVerificationCache();
  for (const body of [{}, { user: "not-an-object" }, { user: null }, { user: {} }, { user: { username: "" } }, { user: { username: 7 } }]) {
    const fetchFn = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const result = await verifyPublishCredential({ credentialSource: fakeSource({ ok: true, token: "tok" }), cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, target: "vercel" });
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
      loadDeployTargets: loadBundledDeployTargets,
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
      loadDeployTargets: loadBundledDeployTargets,
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
      loadDeployTargets: loadBundledDeployTargets,
    },
    { workspaceId: WORKSPACE, target: "s3-compatible" }
  );

  assert.equal(fetchCalls, 0, "a signing failure must never reach the network");
  assert.ok(result);
  assert.equal(result!.status, "unreachable");
});

test("canYieldAccountLabel: true only for the bundled hosts with a reviewed account-identity field (github-pages, vercel)", async () => {
  const registry = await loadBundledDeployTargets();
  assert.equal(canYieldAccountLabel(registry, "github-pages"), true);
  assert.equal(canYieldAccountLabel(registry, "vercel"), true);
  assert.equal(canYieldAccountLabel(registry, "netlify"), false);
  assert.equal(canYieldAccountLabel(registry, "cloudflare-pages"), false);
  assert.equal(canYieldAccountLabel(registry, "s3-compatible"), false);
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
    { repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets },
    { workspaceId: WORKSPACE, id: "no-such-id" }
  );

  assert.equal(result, null);
  assert.equal(fetchCalls, 0);
});

test("verifyPublishCredentialById cannot probe another workspace's row or alter either cache", async () => {
  const writeDeps = makeWriteDeps();
  const row = await createPublishCredential(writeDeps, { workspaceId: "ws-other", label: "foreign", connection: { providerId: "github-pages", token: "foreign-secret" } });
  const cache = new InMemoryPublishCredentialVerificationCache();
  const cached = { status: "valid" as const, message: "existing", checkedAt: NOW };
  cache.set({ workspaceId: WORKSPACE, target: "github-pages" }, cached);
  cache.set({ workspaceId: "ws-other", target: "github-pages" }, cached);
  let probes = 0;
  let decryptions = 0;
  const sealer = { seal: writeDeps.sealer.seal.bind(writeDeps.sealer), open: async () => { decryptions++; assert.fail("must not decrypt a foreign row"); } };
  const result = await verifyPublishCredentialById({ ...writeDeps, sealer, cache, clock, fetchFn: (async () => { probes++; assert.fail("no foreign probe"); }) as typeof fetch }, { workspaceId: WORKSPACE, id: row.id });
  assert.equal(result, null);
  assert.equal(probes, 0);
  assert.equal(decryptions, 0);
  assert.deepEqual(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), cached);
  assert.deepEqual(cache.get({ workspaceId: "ws-other", target: "github-pages" }), cached);
});

test("verifyPublishCredentialById handles removed hosts and changed token fields without probing", async () => {
  for (const isDefault of [true, false]) {
    const writeDeps = makeWriteDeps();
    await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github-pages", token: "default-token" } });
    const row = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "chosen", connection: { providerId: "github-pages", token: "chosen-token" }, isDefault });
    for (const mode of ["removed", "missing-token"] as const) {
      const cache = new InMemoryPublishCredentialVerificationCache();
      const stale = { status: "valid" as const, message: "cached default", checkedAt: NOW };
      cache.set({ workspaceId: WORKSPACE, target: "github-pages" }, stale);
      const bundled = await loadBundledDeployTargets();
      const hosts = bundled.list().filter((host) => mode !== "removed" || host.descriptor.id !== "github-pages").map((host) => host.descriptor.id !== "github-pages" ? host : {
        ...host, descriptor: { ...host.descriptor, credential: { ...host.descriptor.credential!, tokenField: "newToken" } },
      });
      let probes = 0;
      const result = await verifyPublishCredentialById({ ...writeDeps, cache, clock,
        loadDeployTargets: async () => ({ get: (id) => hosts.find((host) => host.descriptor.id === id), list: () => hosts, refusals: [] }),
        fetchFn: (async () => { probes++; assert.fail("must not probe an unprojectable row"); }) as typeof fetch,
      }, { workspaceId: WORKSPACE, id: row.id });
      assert.equal(probes, 0);
      if (mode === "removed") {
        assert.equal(result, null);
      } else {
        assert.equal(result?.status, "unreachable");
        assert.match(result!.message, /has no newToken/);
      }
      assert.deepEqual(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), mode === "missing-token" && isDefault ? result : stale);
    }
  }
});

test("verifyPublishCredentialById: the provider's DEFAULT row updates the shared (workspaceId, target) cache", async () => {
  const writeDeps = makeWriteDeps();
  const summary = await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "work", connection: { providerId: "github-pages", token: "real-secret" } });
  assert.equal(summary.isDefault, true, "first row for a provider auto-defaults");

  const cache = new InMemoryPublishCredentialVerificationCache();
  let authentication: string | null = null;
  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    authentication = new Headers(init?.headers).get("authorization");
    return new Response("", { status: 401 });
  }) as typeof fetch;

  const result = await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "invalid");
  assert.deepEqual(cache.get({ workspaceId: WORKSPACE, target: "github-pages" }), result, "the default row's result IS the target's ready-signal");
  assert.equal(authentication, "Bearer real-secret");
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

  let authentication: string | null = null;
  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    authentication = new Headers(init?.headers).get("authorization");
    return new Response("", { status: 401 });
  }) as typeof fetch; // the second row is BAD

  const result = await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, id: secondRow.id });

  assert.ok(result);
  assert.equal(result!.status, "invalid", "the row that was actually checked (the second, bad one) still gets an honest own result");
  assert.equal(authentication, "Bearer second-secret");
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
  let signedRequest: Request | undefined;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = input instanceof Request ? input.url : String(input);
    signedRequest = new Request(seenUrl, init);
    return new Response("", { status: 200 });
  }) as typeof fetch;

  const result = await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, id: summary.id });

  assert.ok(result);
  assert.equal(result!.status, "valid");
  assert.equal(seenUrl, "https://r2.example.com/my-bucket");
  assert.ok(signedRequest);
  const authorization = signedRequest.headers.get("authorization")!;
  const match = /^AWS4-HMAC-SHA256 Credential=AKIA\/(\d{8}\/auto\/s3\/aws4_request), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/.exec(authorization);
  assert.ok(match, "the saved access key and region must be used");
  const names = match[2].split(";");
  const canonicalHeaders = names.map((name) => `${name}:${name === "host" ? new URL(seenUrl).host : signedRequest!.headers.get(name)}`).join("\n");
  const canonicalRequest = ["HEAD", "/my-bucket", "", `${canonicalHeaders}\n`, match[2], signedRequest.headers.get("x-amz-content-sha256")!].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", signedRequest.headers.get("x-amz-date"), match[1], createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  let signingKey = Buffer.from("AWS4s3cr3t-must-not-leak");
  for (const part of match[1].split("/")) signingKey = createHmac("sha256", signingKey).update(part).digest();
  assert.equal(match[3], createHmac("sha256", signingKey).update(stringToSign).digest("hex"), "the signature must authenticate with the independently expected saved secret");
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

  await verifyPublishCredentialById({ repo: writeDeps.repo, sealer: writeDeps.sealer, cache, clock, fetchFn, loadDeployTargets: loadBundledDeployTargets }, { workspaceId: WORKSPACE, id: summary.id });

  assert.equal(seenUrl, "https://s3.us-east-1.amazonaws.com/my-bucket");
});
