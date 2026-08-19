import assert from "node:assert/strict";
import test from "node:test";

import { DeployError } from "@jini-ai/devops/deploy";

import { createGitHubCommitAdapter } from "../github-git-provider.js";
import type { CommitFile } from "../commit-site.js";

/**
 * @file `github-git-provider.ts`'s proof — EVERY call goes through a stubbed `global.fetch`. No real
 * network call is made anywhere in this file, per the owner's explicit instruction: this is Milestone
 * 2's whole contract — prove every branch (success, diverged, network-unreachable, provider-rejected,
 * nothing-to-commit) against a fake, never a live credential. `source_control_credential_sets` stays
 * empty; the real end-to-end run happens later, with the owner present, against a repo they nominate.
 */

type MockStep =
  | { match: RegExp; method?: string; status: number; json?: unknown; text?: string }
  | { match: RegExp; method?: string; networkError: string }
  | { match: RegExp; method?: string; throw: unknown };

/** Installs a sequential, order-verifying fake for `global.fetch` — each call must match the NEXT
 *  queued step's URL pattern (and method, when given) or the mock fails loudly rather than silently
 *  answering the wrong step. Restores the real `fetch` via the returned `restore()`, always called in
 *  `finally` so a failing assertion never leaks a stubbed `fetch` into a later test. */
function installMockFetch(steps: MockStep[]): { restore: () => void; callLog: { method: string; url: string }[]; remaining: () => number } {
  const originalFetch = globalThis.fetch;
  const remaining = [...steps];
  const callLog: { method: string; url: string }[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    callLog.push({ method, url });

    const step = remaining.shift();
    if (!step) throw new Error(`unexpected fetch call (no more mock steps queued): ${method} ${url}`);
    if (!step.match.test(url)) throw new Error(`fetch call ${method} ${url} did not match expected pattern ${step.match} — step order mismatch`);
    if (step.method !== undefined && step.method !== method) throw new Error(`fetch call to ${url} expected method '${step.method}', got '${method}'`);

    if ("networkError" in step) throw new TypeError(step.networkError);
    if ("throw" in step) throw step.throw;
    if (step.text !== undefined) return new Response(step.text, { status: step.status });
    return new Response(JSON.stringify(step.json ?? {}), { status: step.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  return { restore: () => { globalThis.fetch = originalFetch; }, callLog, remaining: () => remaining.length };
}

const TOKEN = "ghp_fake_token_never_real";
const ONE_FILE: CommitFile[] = [{ path: "index.html", data: "<html></html>" }];

// ---------------------------------------------------------------------------
// Success paths
// ---------------------------------------------------------------------------

test("commit: existing branch, real content change — advances the branch, never force", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: { ref: "refs/heads/main" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "content update", files: ONE_FILE });
    assert.deepEqual(result, { ok: true, branch: "main", branchCreated: false, commitSha: "new-commit-sha", commitUrl: "https://github.com/octo/demo/commit/new-commit-sha", filesChanged: 1 });

    const refCall = mock.callLog.find((c) => c.url.includes("/git/refs/heads/main"));
    assert.ok(refCall);
    assert.equal(refCall!.method, "PATCH", "an existing branch must be advanced with PATCH, matching a plain non-force ref update");
  } finally {
    mock.restore();
  }
});

test("commit: branch omitted — resolves the repo's own default branch, never invents one", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "trunk" } },
    { match: /\/git\/ref\/heads\/trunk$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/trunk$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.branch, "trunk");
  } finally {
    mock.restore();
  }
});

test("commit: branch does not exist yet — CREATEs the ref, reports branchCreated:true, and the commit has no parents", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/feature-x$/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs$/, method: "POST", status: 201, json: { ref: "refs/heads/feature-x" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "feature-x", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.branchCreated, true);
      assert.equal(result.branch, "feature-x");
    }
    // No parent-commit lookup call was made — proven by the mock: only 6 steps were queued and all
    // were consumed in order (no "/git/commits/<sha>" GET step exists in this queue at all).
    assert.equal(mock.remaining(), 0);
  } finally {
    mock.restore();
  }
});

test("commit: a 2xx ref-write response whose body fails to parse as JSON is STILL success — the irreversible step never depends on the body", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    // 200 OK — the branch WAS updated — but a body that will not parse as JSON (an empty string, a
    // proxy hiccup, whatever). Must not be reported as a failure: the commit already, irreversibly,
    // happened.
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, text: "" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected success despite the unparseable ref-write body, got: ${JSON.stringify(result)}`);
    if (result.ok) assert.equal(result.commitSha, "new-commit-sha");
  } finally {
    mock.restore();
  }
});

test("commit: two files with IDENTICAL content dedupe to ONE blob call", async () => {
  const files: CommitFile[] = [
    { path: "a.html", data: "same content" },
    { path: "b.html", data: "same content" },
  ];
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    // Only ONE blob step queued — a second blob call would find no step left and throw loudly.
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-shared" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.filesChanged, 2, "both files are still reported, even though they shared one blob");
    assert.equal(mock.callLog.filter((c) => c.url.endsWith("/git/blobs")).length, 1);
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------------
// Failure paths — the required distinct codes
// ---------------------------------------------------------------------------

test("REPOSITORY_NOT_FOUND: repo lookup 404s, no dialog-adjacent call happens after it", async () => {
  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", status: 404, json: {} }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "repository-not-found");
    assert.equal(mock.remaining(), 0, "nothing beyond the repo lookup should ever be called");
  } finally {
    mock.restore();
  }
});

test("DIVERGED_BRANCH: a non-fast-forward ref update (422) is refused, never overwritten — the ref write is attempted WITHOUT force", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 422, json: { message: "Update is not a fast forward" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "diverged");

    // The request body sent for the ref write must never carry `force`.
    const patchCall = mock.callLog.find((c) => c.method === "PATCH");
    assert.ok(patchCall);
  } finally {
    mock.restore();
  }
});

test("the ref-write request body never carries force:true — the ONE structural proof for the no-force decision", async () => {
  let capturedBody: string | undefined;
  const originalFetch = globalThis.fetch;
  let call = 0;
  const responses: Response[] = [
    new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }),
    new Response(JSON.stringify({ object: { sha: "parent-sha" } }), { status: 200 }),
    new Response(JSON.stringify({ tree: { sha: "parent-tree-sha" } }), { status: 200 }),
    new Response(JSON.stringify({ sha: "blob-sha-1" }), { status: 201 }),
    new Response(JSON.stringify({ sha: "new-tree-sha" }), { status: 201 }),
    new Response(JSON.stringify({ sha: "new-commit-sha" }), { status: 201 }),
    new Response(JSON.stringify({}), { status: 200 }),
  ];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/git/refs/heads/main") && init?.method === "PATCH") capturedBody = String(init.body);
    const response = responses[call]!;
    call += 1;
    return response;
  }) as typeof fetch;
  try {
    await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.ok(capturedBody, "the PATCH call must have happened");
    const parsed = JSON.parse(capturedBody!) as Record<string, unknown>;
    assert.equal("force" in parsed, false, "the ref-write body must not include a force field at all");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NETWORK_UNREACHABLE: a thrown fetch error on the FIRST call maps distinctly from a rejected response", async () => {
  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", networkError: "getaddrinfo ENOTFOUND api.github.com" }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "network-unreachable");
      assert.match(result.message, /ENOTFOUND/);
    }
  } finally {
    mock.restore();
  }
});

test("NETWORK_UNREACHABLE on the irreversible ref-write call itself is STILL reported honestly — never silently treated as success", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", networkError: "socket hang up" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "network-unreachable");
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: a rejected (401) blob creation is reported with GitHub's own message, distinct from NETWORK_UNREACHABLE", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/git\/blobs$/, method: "POST", status: 401, json: { message: "Bad credentials" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "Bad credentials");
    }
  } finally {
    mock.restore();
  }
});

test("a redirect refusal (DeployError thrown by the shared redirect guard) maps to provider-error, never network-unreachable", async () => {
  // Simulates what `assertNotRedirected` throws for an opaque-redirect response — proves THIS file's
  // own mapping (`err instanceof DeployError -> provider-rejected -> 'provider-error'`), not Jini's
  // already-reviewed redirect-refusal logic itself.
  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", throw: new DeployError("GitHub attempted to redirect an authenticated request — refused to follow it.", 502) }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.match(result.message, /redirect/i);
    }
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------------
// Nothing-to-commit
// ---------------------------------------------------------------------------

test("NO_CHANGES: the new tree matches the parent's tree — no commit, no ref write", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "same-tree-sha" } } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    // The new tree happens to equal the parent's own tree sha — nothing changed.
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "same-tree-sha" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "no-changes");
    // Only 5 steps were queued (through tree creation) — no commit-object POST, no ref write.
    assert.equal(mock.remaining(), 0);
    assert.equal(mock.callLog.some((c) => c.url.endsWith("/git/commits") && c.method === "POST"), false, "no commit object may be created when nothing changed");
    assert.equal(mock.callLog.some((c) => c.url.includes("/git/refs/heads/main") && c.method === "PATCH"), false, "the branch must not be touched when nothing changed");
  } finally {
    mock.restore();
  }
});

test("NO_CHANGES check degrades gracefully: a failed parent-tree lookup does NOT block a real, wanted commit", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    // The parent-tree lookup itself fails (network) — must NOT abort the whole commit.
    { match: /\/git\/commits\/parent-sha$/, method: "GET", networkError: "ECONNRESET" },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `a failed no-changes pre-check must not block a real commit, got: ${JSON.stringify(result)}`);
  } finally {
    mock.restore();
  }
});
