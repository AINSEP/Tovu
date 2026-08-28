import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createPublishCredential, type PublishCredentialWriteDeps } from "../../publish-credentials/store.js";
import { InMemoryPublishCredentialSetRepo } from "../../publish-credentials/repo.memory.js";
import type { PublishCredentialSource } from "../types.js";
import {
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
