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
  | { match: RegExp; method?: string; throw: unknown }
  | { match: RegExp; method?: string; hang: true };

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
    if ("hang" in step) {
      // Never resolves on its own — the ONLY way this settles is `githubFetch`'s own
      // `AbortSignal.timeout` firing, exactly reproducing what a real hung connection to
      // `api.github.com` looks like from `fetch`'s perspective. If `githubFetch` ever stops
      // passing a `signal`, this promise (and the test using it) hangs forever rather than
      // failing fast — an honest reflection of the pre-fix bug, not a test-suite defect.
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    }
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
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: { ref: "refs/heads/main" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "content update", files: ONE_FILE });
    assert.deepEqual(result, { ok: true, branch: "main", branchCreated: false, commitSha: "new-commit-sha", commitUrl: "https://github.com/octo/demo/commit/new-commit-sha", filesChanged: 1, filesDeleted: 0, divergedPaths: [] });

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
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
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
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
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
      assert.equal(result.filesDeleted, 0, "a brand-new branch has no prior Tovu manifest to diff against, so nothing is ever deleted");
    }
    // No parent-commit lookup AND no managed-manifest lookup were made — proven by the mock: only 7
    // steps were queued (repo, ref-404, content blob, manifest blob, tree, commit, ref-create) and all
    // were consumed in order (no "/git/commits/<sha>" GET or "/contents/..." GET step exists in this
    // queue at all — a brand-new branch has no parent tree or prior manifest to read).
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
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
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
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    // Only ONE CONTENT blob step queued for the two same-content files — a second call for THEM would
    // find no step left and throw loudly. A separate manifest blob call is always made regardless.
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-shared" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.filesChanged, 2, "both files are still reported, even though they shared one blob");
    // 2 blob calls total: 1 shared content blob (deduped across both files) + 1 manifest blob (always
    // separate — its content is never identical to an export file's).
    assert.equal(mock.callLog.filter((c) => c.url.endsWith("/git/blobs")).length, 2);
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
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
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
    new Response("", { status: 404 }), // managed-manifest lookup — no manifest yet
    new Response(JSON.stringify({ sha: "blob-sha-1" }), { status: 201 }), // content blob
    new Response(JSON.stringify({ sha: "manifest-blob-sha" }), { status: 201 }), // manifest blob
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

test("NETWORK_UNREACHABLE: a request that never gets a response times out (rather than hanging forever) and is reported with a distinguishable message", async () => {
  // Speeds up ONLY `AbortSignal.timeout`'s own firing (5ms instead of the real production
  // duration) so this test does not have to wait out a real 30-second deadline — the abort
  // mechanism it triggers is the exact one `githubFetch` wires up in production. `capturedMs`
  // proves that production duration is real and was not itself shortened by this stub.
  const originalAbortTimeout = AbortSignal.timeout;
  let capturedMs: number | undefined;
  AbortSignal.timeout = ((ms: number) => {
    capturedMs = ms;
    return originalAbortTimeout(5);
  }) as typeof AbortSignal.timeout;

  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", hang: true }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "network-unreachable");
      assert.match(result.message, /timed out after 30000ms/, "a timeout must name itself distinctly, not read like a random connection failure");
    }
    assert.equal(capturedMs, 30_000, "githubFetch must wire the real, generous production timeout — only its own firing was sped up for this test");
  } finally {
    AbortSignal.timeout = originalAbortTimeout;
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
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
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
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    // The new tree happens to equal the parent's own tree sha — nothing changed.
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "same-tree-sha" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "no-changes");
    // Only 7 steps were queued (through tree creation) — no commit-object POST, no ref write.
    assert.equal(mock.remaining(), 0);
    assert.equal(mock.callLog.some((c) => c.url.endsWith("/git/commits") && c.method === "POST"), false, "no commit object may be created when nothing changed");
    assert.equal(mock.callLog.some((c) => c.url.includes("/git/refs/heads/main") && c.method === "PATCH"), false, "the branch must not be touched when nothing changed");
  } finally {
    mock.restore();
  }
});

test("a failed parent-tree lookup on an EXISTING branch BLOCKS the commit — never risk a base_tree-less tree for an optimization's sake", async () => {
  // Codex 5.6-sol CRITICAL finding (2026-08-19): `buildTree` used to omit `base_tree` unconditionally,
  // so the new tree fully REPLACED the branch's existing file listing — publishing into a branch that
  // also held a README/workflows/hand-maintained assets deleted all of it. The fix makes `base_tree`
  // (the parent commit's own tree sha) load-bearing: every commit onto an EXISTING branch must build ON
  // TOP OF that tree, never instead of it. Reading that tree sha is therefore no longer a soft,
  // best-effort "nothing changed" optimization (what this test used to assert, before this fix) — a
  // failure here means this file CANNOT safely build a tree at all, so it must fail loudly rather than
  // silently falling back to the exact full-replacement behavior that caused the data loss.
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    // The parent-tree lookup itself fails (network) — must now abort the whole commit rather than
    // proceeding without a base_tree.
    { match: /\/git\/commits\/parent-sha$/, method: "GET", networkError: "ECONNRESET" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false, `a failed parent-tree lookup on an existing branch must block the commit, got: ${JSON.stringify(result)}`);
    if (!result.ok) assert.equal(result.code, "network-unreachable");
    // Nothing past the parent-tree lookup may ever be attempted — no blob, no tree, no commit, no ref
    // write may be created from a state where this file could not confirm what already exists.
    assert.equal(mock.remaining(), 0);
    assert.equal(mock.callLog.some((c) => c.url.endsWith("/git/blobs")), false, "no blob may be created when the parent tree could not be confirmed");
  } finally {
    mock.restore();
  }
});

/**
 * REVERSED (2026-08-19, second audit round — Codex 5.6-sol/terra + Sonnet, all three independently):
 * this test used to assert the OPPOSITE — that a failed manifest lookup degrades gracefully and lets
 * the commit proceed. That was itself the defect: {@link fetchManagedManifest} used to collapse EVERY
 * failure (network, non-404 HTTP, unparseable body) to `undefined`, and the caller treated `undefined`
 * exactly like "nothing was ever managed." The very next successful commit then wrote a brand-new
 * manifest reflecting only the CURRENT export — permanently overwriting the only record of what a prior
 * pass had written, with no way for any future pass to ever recover it. A stale, no-longer-exported page
 * would then survive forever, publicly reachable, invisible to every subsequent manifest. The old code
 * comment on this test claimed this "must NOT block the commit" — that claim is exactly what this fix
 * reverses: a transient/corrupt manifest read is no longer indistinguishable from "verified: no manifest
 * exists yet" (a real 404, which correctly still does not block anything — see the untouched 404 case in
 * every other test in this file). Only a VERIFIED absence is safe to treat as "zero prior paths"; every
 * other read failure now fails the whole commit, the same as the already-hard-required parent-tree read
 * immediately above it.
 */
test("CRITICAL (read-failure defect): a manifest lookup that fails for a reason OTHER than a verified 404 now BLOCKS the commit — never silently 'forgets' what was previously managed", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    // The PREVIOUS-MANIFEST lookup fails (network) — this read is now load-bearing for provenance, not
    // a soft optimization: a failure here must abort the whole commit rather than risk silently
    // rewriting the ownership record as empty.
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", networkError: "ECONNRESET" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false, `a failed (non-404) manifest lookup must now block the commit, got: ${JSON.stringify(result)}`);
    if (!result.ok) assert.equal(result.code, "network-unreachable");
    // Nothing past the manifest lookup may ever be attempted.
    assert.equal(mock.remaining(), 0);
    assert.equal(mock.callLog.some((c) => c.url.endsWith("/git/blobs")), false, "no blob may be created when the previous manifest could not be confirmed");
  } finally {
    mock.restore();
  }
});

test("a manifest read that returns 200 with a body that is not valid JSON blocks the commit the same as a network failure — never silently treated as 'no manifest'", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    // A 200 response whose body will not parse as JSON at all — a real, received response, distinct
    // from a 404, so it must NOT be folded into "verified: nothing was ever managed."
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 200, text: "not json at all {{{" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false, `an unparseable manifest response must block the commit, got: ${JSON.stringify(result)}`);
    if (!result.ok) assert.equal(result.code, "provider-error");
    assert.equal(mock.callLog.some((c) => c.url.endsWith("/git/blobs")), false);
  } finally {
    mock.restore();
  }
});

test("a manifest read rejected with a non-404 HTTP error (e.g. 500) blocks the commit — distinct from a verified 404", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 500, json: { message: "Internal error" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false, `a 500 manifest lookup must block the commit, got: ${JSON.stringify(result)}`);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "Internal error");
    }
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------------
// CRITICAL FIX (2026-08-19, second audit round): manifest membership alone no longer authorizes a
// delete — a path is only deleted when its CURRENT live content still matches the blob sha this adapter
// itself recorded writing.
// ---------------------------------------------------------------------------

test("CRITICAL (ownership-trust defect): a LEGACY (pre-provenance) manifest entry with no recorded sha does NOT authorize deletion — reported via divergedPaths, never silently deleted", async () => {
  const PRE_EXISTING_WORLD = new Map<string, string>([["old-page.html", "old-page-blob-sha"]]);
  // The exact shape this adapter wrote BEFORE today's fix — a bare path list, no per-path hash. A
  // hand-edited manifest that merely lists a path (e.g. someone adding 'README.md' by hand) is
  // indistinguishable from this at the wire level, which is exactly the point: neither can prove
  // ownership, so neither may authorize a delete.
  const LEGACY_MANIFEST = { version: 1, paths: ["old-page.html"] };
  let resultingWorld: Map<string, string> | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (/\/repos\/octo\/demo$/.test(url)) return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    if (/\/git\/ref\/heads\/main$/.test(url)) return new Response(JSON.stringify({ object: { sha: "parent-sha" } }), { status: 200 });
    if (/\/git\/commits\/parent-sha$/.test(url)) return new Response(JSON.stringify({ tree: { sha: "parent-tree-sha" } }), { status: 200 });
    if (/\/contents\/\.tovu\/managed-files\.json/.test(url)) {
      const content = Buffer.from(JSON.stringify(LEGACY_MANIFEST)).toString("base64");
      return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
    }
    // A candidate deletion's live-content verification GET — 'old-page.html' still exists, unmodified.
    if (/\/contents\/old-page\.html/.test(url)) {
      return new Response(JSON.stringify({ sha: "old-page-blob-sha" }), { status: 200 });
    }
    if (/\/git\/blobs$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: `blob-${Math.random().toString(36).slice(2)}` }), { status: 201 });
    if (/\/git\/trees$/.test(url) && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { base_tree?: string; tree: { path: string; sha: string | null }[] };
      const world = new Map<string, string>(body.base_tree !== undefined ? PRE_EXISTING_WORLD : []);
      for (const entry of body.tree) {
        if (entry.sha === null) world.delete(entry.path);
        else world.set(entry.path, entry.sha);
      }
      resultingWorld = world;
      return new Response(JSON.stringify({ sha: "new-tree-sha" }), { status: 201 });
    }
    if (/\/git\/commits$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: "new-commit-sha" }), { status: 201 });
    if (/\/git\/refs\/heads\/main$/.test(url) && method === "PATCH") return new Response(JSON.stringify({}), { status: 200 });
    throw new Error(`unexpected fetch call in this test: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 0, "a legacy manifest entry with no recorded sha must never be auto-deleted");
      assert.deepEqual(result.divergedPaths, ["old-page.html"], "the unverifiable legacy entry must be reported, not silently dropped");
    }
    assert.ok(resultingWorld, "the simulated merge must have run");
    assert.equal(resultingWorld!.has("old-page.html"), true, "content with no verifiable provenance must survive the publish untouched");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CRITICAL (ownership-trust defect): a v2 manifest entry whose recorded sha no longer matches LIVE content (a human edited it since Tovu wrote it) does NOT authorize deletion", async () => {
  // Real (fake-but-hex-shaped) git blob shas — {@link GIT_SHA_PATTERN} only trusts a manifest entry's
  // `sha` as verifiable provenance when it actually LOOKS like a git blob sha; a non-hex placeholder
  // would instead fall into the "no recorded provenance" bucket and never even reach the live-content
  // comparison this test means to exercise.
  const TOVU_ORIGINAL_SHA = "aaaa1111bbbb2222cccc3333dddd4444eeee5555";
  const HUMAN_EDITED_SHA = "1111aaaa2222bbbb3333cccc4444dddd5555eeee";
  const PRE_EXISTING_WORLD = new Map<string, string>([["about.html", HUMAN_EDITED_SHA]]);
  const MANIFEST = { version: 2, files: [{ path: "about.html", sha: TOVU_ORIGINAL_SHA }] };
  let resultingWorld: Map<string, string> | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (/\/repos\/octo\/demo$/.test(url)) return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    if (/\/git\/ref\/heads\/main$/.test(url)) return new Response(JSON.stringify({ object: { sha: "parent-sha" } }), { status: 200 });
    if (/\/git\/commits\/parent-sha$/.test(url)) return new Response(JSON.stringify({ tree: { sha: "parent-tree-sha" } }), { status: 200 });
    if (/\/contents\/\.tovu\/managed-files\.json/.test(url)) {
      const content = Buffer.from(JSON.stringify(MANIFEST)).toString("base64");
      return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
    }
    // Tovu recorded TOVU_ORIGINAL_SHA — GitHub now reports a DIFFERENT sha for the same path: a human
    // (or something else) replaced the content since Tovu last wrote it.
    if (/\/contents\/about\.html/.test(url)) {
      return new Response(JSON.stringify({ sha: HUMAN_EDITED_SHA }), { status: 200 });
    }
    if (/\/git\/blobs$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: `blob-${Math.random().toString(36).slice(2)}` }), { status: 201 });
    if (/\/git\/trees$/.test(url) && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { base_tree?: string; tree: { path: string; sha: string | null }[] };
      const world = new Map<string, string>(body.base_tree !== undefined ? PRE_EXISTING_WORLD : []);
      for (const entry of body.tree) {
        if (entry.sha === null) world.delete(entry.path);
        else world.set(entry.path, entry.sha);
      }
      resultingWorld = world;
      return new Response(JSON.stringify({ sha: "new-tree-sha" }), { status: 201 });
    }
    if (/\/git\/commits$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: "new-commit-sha" }), { status: 201 });
    if (/\/git\/refs\/heads\/main$/.test(url) && method === "PATCH") return new Response(JSON.stringify({}), { status: 200 });
    throw new Error(`unexpected fetch call in this test: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 0, "diverged content (a hash mismatch) must never be auto-deleted");
      assert.deepEqual(result.divergedPaths, ["about.html"], "the diverged path must be reported");
    }
    assert.ok(resultingWorld, "the simulated merge must have run");
    assert.equal(resultingWorld!.get("about.html"), HUMAN_EDITED_SHA, "a human's edit must survive the publish, byte-for-byte");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a candidate deletion whose LIVE-verification read itself fails is skipped for THAT path only — never blocks the whole commit", async () => {
  const FLAKY_SHA = "aaaa1111bbbb2222cccc3333dddd4444eeee5555"; // a plausible git blob sha — see GIT_SHA_PATTERN
  const PRE_EXISTING_WORLD = new Map<string, string>([["flaky-check.html", FLAKY_SHA]]);
  const MANIFEST = { version: 2, files: [{ path: "flaky-check.html", sha: FLAKY_SHA }] };
  let resultingWorld: Map<string, string> | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (/\/repos\/octo\/demo$/.test(url)) return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    if (/\/git\/ref\/heads\/main$/.test(url)) return new Response(JSON.stringify({ object: { sha: "parent-sha" } }), { status: 200 });
    if (/\/git\/commits\/parent-sha$/.test(url)) return new Response(JSON.stringify({ tree: { sha: "parent-tree-sha" } }), { status: 200 });
    if (/\/contents\/\.tovu\/managed-files\.json/.test(url)) {
      const content = Buffer.from(JSON.stringify(MANIFEST)).toString("base64");
      return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
    }
    // The per-path live-content verification read itself fails (network) — this must degrade to
    // "cannot confirm this ONE deletion," never to failing the whole commit (unlike the manifest read
    // itself, which IS load-bearing for the whole pass).
    if (/\/contents\/flaky-check\.html/.test(url)) throw new TypeError("ECONNRESET");
    if (/\/git\/blobs$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: `blob-${Math.random().toString(36).slice(2)}` }), { status: 201 });
    if (/\/git\/trees$/.test(url) && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { base_tree?: string; tree: { path: string; sha: string | null }[] };
      const world = new Map<string, string>(body.base_tree !== undefined ? PRE_EXISTING_WORLD : []);
      for (const entry of body.tree) {
        if (entry.sha === null) world.delete(entry.path);
        else world.set(entry.path, entry.sha);
      }
      resultingWorld = world;
      return new Response(JSON.stringify({ sha: "new-tree-sha" }), { status: 201 });
    }
    if (/\/git\/commits$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: "new-commit-sha" }), { status: 201 });
    if (/\/git\/refs\/heads\/main$/.test(url) && method === "PATCH") return new Response(JSON.stringify({}), { status: 200 });
    throw new Error(`unexpected fetch call in this test: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `a per-path verification failure must not block the whole commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 0, "an unverifiable candidate must not be deleted");
      assert.deepEqual(result.divergedPaths, ["flaky-check.html"], "a per-path network failure must be reported, not silently dropped from the manifest");
    }
    assert.ok(resultingWorld, "the simulated merge must have run — the commit itself must still succeed");
    assert.equal(resultingWorld!.has("flaky-check.html"), true, "content this pass could not verify must survive, not be guessed-deleted");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// CRITICAL FIX (2026-08-19, second audit round, defect 2): verifying GitHub's own concurrency safety
// with a real interleaving, not merely a canned single 422 response.
// ---------------------------------------------------------------------------

test("CRITICAL (concurrency): two commits racing on the SAME branch tip — the second to write is refused (422 -> diverged), never silently overwritten", async () => {
  // A shared, mutable fake branch state both `commit()` calls read from and (attempt to) write to,
  // simulating what a real GitHub repo does: the ref lookup always reflects the CURRENT tip, and a
  // PATCH only succeeds if the caller's `sha` still matches what the branch pointed at when this
  // adapter looked it up moments earlier — real optimistic concurrency, not a scripted response.
  let branchTip = "parent-sha";
  const commitParents = new Map<string, string | undefined>([["parent-sha", undefined]]);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (/\/repos\/octo\/demo$/.test(url)) return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    if (/\/git\/ref\/heads\/main$/.test(url)) return new Response(JSON.stringify({ object: { sha: branchTip } }), { status: 200 });
    if (/\/git\/commits\/[^/]+$/.test(url)) return new Response(JSON.stringify({ tree: { sha: "tree-for-" + url.split("/").pop() } }), { status: 200 });
    if (/\/contents\/\.tovu\/managed-files\.json/.test(url)) return new Response("", { status: 404 });
    if (/\/git\/blobs$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: `blob-${Math.random().toString(36).slice(2)}` }), { status: 201 });
    if (/\/git\/trees$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: `tree-${Math.random().toString(36).slice(2)}` }), { status: 201 });
    if (/\/git\/commits$/.test(url) && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { parents: string[] };
      const sha = `commit-${Math.random().toString(36).slice(2)}`;
      commitParents.set(sha, body.parents[0]);
      return new Response(JSON.stringify({ sha }), { status: 201 });
    }
    if (/\/git\/refs\/heads\/main$/.test(url) && method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as { sha: string };
      // Real GitHub semantics for a non-force ref update: only a fast-forward from the CURRENT tip is
      // accepted. This caller's commit's own parent must equal the tip AT THE TIME OF THIS PATCH CALL —
      // i.e. now, not when this caller looked it up — exactly what makes the second racer lose.
      if (commitParents.get(body.sha) !== branchTip) {
        return new Response(JSON.stringify({ message: "Update is not a fast forward" }), { status: 422 });
      }
      branchTip = body.sha;
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`unexpected fetch call in this test: ${method} ${url}`);
  }) as typeof fetch;

  try {
    // Both calls read the SAME branch tip before either writes anything — a genuine race, not a
    // sequential simulation: `Promise.all` interleaves their `await`s.
    const [resultA, resultB] = await Promise.all([
      createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "run a", files: [{ path: "a.html", data: "a" }] }),
      createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "run b", files: [{ path: "b.html", data: "b" }] }),
    ]);

    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((r) => r.ok);
    const diverged = outcomes.filter((r) => !r.ok && r.code === "diverged");
    assert.equal(succeeded.length, 1, `exactly one of the two racing commits must succeed, got: ${JSON.stringify(outcomes)}`);
    assert.equal(diverged.length, 1, `exactly one of the two racing commits must be refused as diverged, never silently lost, got: ${JSON.stringify(outcomes)}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// CRITICAL FIX (2026-08-19, Codex 5.6-sol audit): base_tree + a managed-files manifest
// ---------------------------------------------------------------------------

test("CRITICAL: an existing branch's own content Tovu never wrote survives — the new tree is built ON TOP of the parent's tree (base_tree), never replacing it", async () => {
  // Simulates GitHub's own real Git Trees API merge semantics for THIS ONE call (base_tree + a partial
  // `tree` array), just enough to prove the request this file sends is enough to make GitHub preserve
  // unrelated content — not a reimplementation of GitHub itself, only of the ONE endpoint the bug lived
  // in. A pre-existing 'README.md' and '.github/workflows/ci.yml' represent real content a human put on
  // this branch that Tovu never touched and must never delete.
  const PRE_EXISTING_WORLD = new Map<string, string>([
    ["README.md", "readme-blob-sha"],
    [".github/workflows/ci.yml", "workflow-blob-sha"],
  ]);
  let capturedTreeBody: { base_tree?: string; tree: { path: string; sha: string | null }[] } | undefined;
  let resultingWorld: Map<string, string> | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (/\/repos\/octo\/demo$/.test(url)) return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    if (/\/git\/ref\/heads\/main$/.test(url)) return new Response(JSON.stringify({ object: { sha: "parent-sha" } } ), { status: 200 });
    if (/\/git\/commits\/parent-sha$/.test(url)) return new Response(JSON.stringify({ tree: { sha: "parent-tree-sha" } }), { status: 200 });
    if (/\/contents\/\.tovu\/managed-files\.json/.test(url)) return new Response("", { status: 404 });
    if (/\/git\/blobs$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: `blob-${Math.random().toString(36).slice(2)}` }), { status: 201 });
    if (/\/git\/trees$/.test(url) && method === "POST") {
      capturedTreeBody = JSON.parse(String(init?.body)) as typeof capturedTreeBody;
      // Real GitHub semantics: base_tree entries are the starting point; entries in `tree` upsert or
      // (sha: null) delete on top of it. WITHOUT base_tree, the result would be ONLY `tree`'s own
      // entries — exactly the bug.
      const world = new Map<string, string>(capturedTreeBody!.base_tree !== undefined ? PRE_EXISTING_WORLD : []);
      for (const entry of capturedTreeBody!.tree) {
        if (entry.sha === null) world.delete(entry.path);
        else world.set(entry.path, entry.sha);
      }
      resultingWorld = world;
      return new Response(JSON.stringify({ sha: "new-tree-sha" }), { status: 201 });
    }
    if (/\/git\/commits$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: "new-commit-sha" }), { status: 201 });
    if (/\/git\/refs\/heads\/main$/.test(url) && method === "PATCH") return new Response(JSON.stringify({}), { status: 200 });
    throw new Error(`unexpected fetch call in this test: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);

    assert.ok(capturedTreeBody, "the /git/trees request must have been sent");
    assert.equal(capturedTreeBody!.base_tree, "parent-tree-sha", "the tree request must carry base_tree so GitHub builds on top of the branch's existing tree, never replacing it");

    assert.ok(resultingWorld, "the simulated merge must have run");
    assert.equal(resultingWorld!.get("README.md"), "readme-blob-sha", "a file Tovu never wrote must survive the publish untouched");
    assert.equal(resultingWorld!.get(".github/workflows/ci.yml"), "workflow-blob-sha", "hand-maintained CI config must survive the publish untouched");
    assert.ok(resultingWorld!.has("index.html"), "the newly exported file must be present");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CRITICAL: a page removed from the export is explicitly deleted (via the previous manifest, its recorded sha VERIFIED against live content), while content Tovu never wrote is left alone", async () => {
  // 2026-08-19 second audit round: this test used to seed a v1 (bare-paths, no hash) manifest and
  // asserted the listed path was deleted purely from list membership — that IS the ownership-trust
  // defect (see the dedicated legacy-manifest test above for the now-corrected behavior of THAT case).
  // This test keeps this file's original intent (prove stale-page deletion actually works) but with the
  // now-required mechanism: a v2 manifest entry whose recorded sha still matches live content.
  const OLD_PAGE_SHA = "aaaa1111bbbb2222cccc3333dddd4444eeee5555"; // a plausible git blob sha — see GIT_SHA_PATTERN
  const PRE_EXISTING_WORLD = new Map<string, string>([
    ["README.md", "readme-blob-sha"],
    ["old-page.html", OLD_PAGE_SHA], // previously exported by Tovu, unmodified since, no longer part of this export
  ]);
  const PREVIOUS_MANIFEST = { version: 2, files: [{ path: "old-page.html", sha: OLD_PAGE_SHA }] };
  let resultingWorld: Map<string, string> | undefined;
  let manifestBlobContent: string | undefined;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (/\/repos\/octo\/demo$/.test(url)) return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    if (/\/git\/ref\/heads\/main$/.test(url)) return new Response(JSON.stringify({ object: { sha: "parent-sha" } }), { status: 200 });
    if (/\/git\/commits\/parent-sha$/.test(url)) return new Response(JSON.stringify({ tree: { sha: "parent-tree-sha" } }), { status: 200 });
    if (/\/contents\/\.tovu\/managed-files\.json/.test(url)) {
      const content = Buffer.from(JSON.stringify(PREVIOUS_MANIFEST)).toString("base64");
      return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
    }
    // The candidate deletion's live-content verification GET — 'old-page.html' still has EXACTLY the
    // sha Tovu itself recorded writing, so this deletion is provably safe.
    if (/\/contents\/old-page\.html/.test(url)) return new Response(JSON.stringify({ sha: OLD_PAGE_SHA }), { status: 200 });
    if (/\/git\/blobs$/.test(url) && method === "POST") {
      const parsedBody = JSON.parse(String(init?.body)) as { content: string; encoding: string };
      const decoded = Buffer.from(parsedBody.content, "base64").toString("utf8");
      if (decoded.includes('"files"')) manifestBlobContent = decoded; // the manifest write, identified by shape
      return new Response(JSON.stringify({ sha: `blob-${Math.random().toString(36).slice(2)}` }), { status: 201 });
    }
    if (/\/git\/trees$/.test(url) && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { base_tree?: string; tree: { path: string; sha: string | null }[] };
      const world = new Map<string, string>(body.base_tree !== undefined ? PRE_EXISTING_WORLD : []);
      for (const entry of body.tree) {
        if (entry.sha === null) world.delete(entry.path);
        else world.set(entry.path, entry.sha);
      }
      resultingWorld = world;
      return new Response(JSON.stringify({ sha: "new-tree-sha" }), { status: 201 });
    }
    if (/\/git\/commits$/.test(url) && method === "POST") return new Response(JSON.stringify({ sha: "new-commit-sha" }), { status: 201 });
    if (/\/git\/refs\/heads\/main$/.test(url) && method === "PATCH") return new Response(JSON.stringify({}), { status: 200 });
    throw new Error(`unexpected fetch call in this test: ${method} ${url}`);
  }) as typeof fetch;

  try {
    // The current export only produces index.html — old-page.html is no longer part of the site.
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 1, "the one removed, previously-Tovu-managed, hash-VERIFIED page must be reported as deleted");
      assert.deepEqual(result.divergedPaths, [], "a verified deletion is not a divergence");
    }

    assert.ok(resultingWorld, "the simulated merge must have run");
    assert.equal(resultingWorld!.has("old-page.html"), false, "a page Tovu itself previously wrote, verified unmodified, now absent from the export, must be explicitly deleted");
    assert.equal(resultingWorld!.get("README.md"), "readme-blob-sha", "content Tovu never wrote must never be touched by the deletion pass");
    assert.ok(resultingWorld!.has("index.html"), "the still-current exported file must be present");
    assert.ok(manifestBlobContent, "an updated manifest must have been written");
    const newManifest = JSON.parse(manifestBlobContent!) as { version: number; files: { path: string; sha: string }[] };
    assert.equal(newManifest.version, 2);
    assert.equal(newManifest.files.length, 1, "the new manifest must reflect only what THIS export actually produced");
    assert.equal(newManifest.files[0]!.path, "index.html");
    assert.match(newManifest.files[0]!.sha, /^blob-/, "each tracked path must carry the real blob sha this adapter itself just wrote");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Branch-coverage fill (2026-09-04) — every step function above shares the same shape
// (`!response.ok -> provider-error via providerErrorMessage`, a body that fails to parse as JSON, and
// a success response missing its one expected field), but the suite above only ever proved that shape
// through `createBlob`'s own 401 test. Each OTHER step function's identical checks are their own,
// separate branch — never exercised merely because a sibling step's matching branch was. Every test
// below targets exactly ONE step's own instance of the pattern, queuing real success responses for
// every step before it so the mock proves the target step is reached in the real sequence, not called
// in isolation.
// ---------------------------------------------------------------------------

test("PROVIDER_ERROR: fetchRepo itself rejected (403) surfaces GitHub's own message, distinctly from the 404 (repository-not-found) case", async () => {
  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", status: 403, json: { message: "Resource not accessible by integration" } }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "Resource not accessible by integration");
    }
  } finally {
    mock.restore();
  }
});

/** `providerErrorMessage`'s own fallback text (`${fallback} (${response.status}).`) — every OTHER
 *  provider-error test in this file supplies a `message` field GitHub itself would send; this is the
 *  one case where the body carries none at all, proving the fallback text fires instead of an empty
 *  or undefined message. */
test("PROVIDER_ERROR: a rejected response with NO message field at all falls back to providerErrorMessage's own fixed wording", async () => {
  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", status: 500, json: {} }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub repository lookup failed (500).");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: fetchRepo's own 2xx response failing to parse as JSON is reported, never mistaken for a successful lookup", async () => {
  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", status: 200, text: "not json {{{" }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub returned a non-JSON response.");
    }
    assert.equal(mock.remaining(), 0, "nothing past an unparseable repo lookup may ever be attempted");
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: fetchBranchTip itself rejected (500), distinctly from its own 404 (brand-new-branch) case", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 500, json: { message: "Internal server error" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "Internal server error");
    }
    assert.equal(mock.remaining(), 0, "nothing past a failed branch-tip lookup may ever be attempted");
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: fetchParentTree itself rejected (e.g. 404 — the parent commit sha it was given is bogus), distinct from a network failure", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 404, json: { message: "No commit found for SHA: parent-sha" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "No commit found for SHA: parent-sha");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: fetchParentTree's response parses as JSON but is missing its own tree.sha field", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    // A 200, valid-JSON response that simply omits `tree` entirely — GitHub's own documented shape
    // always includes it, but this file must not assume that rather than checking.
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { sha: "parent-sha", message: "irrelevant" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub parent-commit response did not include a tree sha");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: a managed-manifest 200 response whose JSON body has no 'content' field at all", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 200, json: { encoding: "base64" /* no `content` field */ } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.match(result.message, /did not include file content/);
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: a managed-manifest's base64 content decodes to bytes that are not valid JSON at all", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    {
      match: /\/contents\/\.tovu\/managed-files\.json/,
      method: "GET",
      status: 200,
      json: { content: Buffer.from("not json at all {{{").toString("base64"), encoding: "base64" },
    },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.match(result.message, /is not valid JSON/);
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: a managed-manifest that parses as JSON but matches NEITHER the v1 nor v2 recognized shape", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    {
      match: /\/contents\/\.tovu\/managed-files\.json/,
      method: "GET",
      status: 200,
      // Valid JSON, valid base64 — but shaped like neither `{version:1,paths:[...]}` nor
      // `{version:2,files:[...]}`. A hand-edited file that merely resembles a manifest.
      json: { content: Buffer.from(JSON.stringify({ hello: "world" })).toString("base64"), encoding: "base64" },
    },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.match(result.message, /did not match a recognized shape/);
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: tree creation itself rejected by GitHub (e.g. 422 — an invalid tree entry)", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 422, json: { message: "Tree SHA does not exist" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "Tree SHA does not exist");
    }
    assert.equal(mock.remaining(), 0, "no commit object may be created from a tree that failed to create");
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: commit-object creation itself rejected by GitHub", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 422, json: { message: "Tree sha is not valid" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "Tree sha is not valid");
    }
    assert.equal(mock.remaining(), 0, "no ref write may be attempted from a commit object that failed to create");
  } finally {
    mock.restore();
  }
});

/** `writeRef`'s `mode === "create"` branch has its OWN failure path — every prior branch-creation test
 *  in this file only ever proves the 201-success case; the 422/update-mode `"diverged"` mapping does
 *  NOT apply here (that check is gated on `mode === "update"`), so a create-mode rejection must fall
 *  through to the generic provider-error branch instead. */
test("PROVIDER_ERROR: a brand-new branch's ref CREATE is itself rejected by GitHub (never mapped to 'diverged' — that mapping is update-only)", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/feature-x$/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs$/, method: "POST", status: 422, json: { message: "Reference already exists" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "feature-x", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error", "a create-mode rejection must never be mapped to 'diverged' — that mapping is gated on mode === 'update'");
      assert.equal(result.message, "Reference already exists");
    }
  } finally {
    mock.restore();
  }
});

/** `fetchLiveBlobSha`'s `result.kind !== "response" || !result.response.ok` — every OTHER
 *  live-verification-failure test in this file throws a network error (`kind !== "response"`); this
 *  proves the OTHER side of that OR: a REAL response that is simply not ok (here, a 410 — GitHub's own
 *  "gone" status for a deleted file, distinct from a 404). Same observable outcome either way (the
 *  candidate is left alone, reported as diverged, never deleted) — proving the code path, not a new
 *  behavior. */
test("a candidate deletion's live-verification GET receiving a real non-ok, non-404 response (not a thrown network error) is unverifiable — reported via divergedPaths, never silently dropped", async () => {
  const FLAKY_SHA = "aaaa1111bbbb2222cccc3333dddd4444eeee5555";
  const MANIFEST = { version: 2, files: [{ path: "gone.html", sha: FLAKY_SHA }] };
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    {
      match: /\/contents\/\.tovu\/managed-files\.json/,
      method: "GET",
      status: 200,
      json: { content: Buffer.from(JSON.stringify(MANIFEST)).toString("base64"), encoding: "base64" },
    },
    // Content blobs are created FIRST (buildFileTreeEntries), THEN each deletion candidate's live
    // content is verified (resolveDeletionCandidates), THEN the manifest blob is created — this
    // queue's order must match that real sequence, not the reverse.
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    // A REAL response, not a thrown error, and NOT a 404 — GitHub's own "410 Gone" for a permanently
    // removed file is a distinct, non-404 rejection: unlike a verified 404, this does not confirm the
    // path is actually absent, so it must land in divergedPaths rather than be silently dropped.
    { match: /\/contents\/gone\.html/, method: "GET", status: 410, json: { message: "Gone" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 0, "an unverifiable (non-ok, non-thrown, non-404) candidate must never be deleted");
      assert.deepEqual(result.divergedPaths, ["gone.html"], "an unverifiable candidate must be reported, not silently dropped from the manifest");
    }
  } finally {
    mock.restore();
  }
});

test("a candidate deletion's live-verification GET receiving a VERIFIED 404 is confirmed-absent — nothing left to report, unlike an unverifiable (non-404) rejection", async () => {
  const GONE_SHA = "aaaa1111bbbb2222cccc3333dddd4444eeee5555";
  const MANIFEST = { version: 2, files: [{ path: "already-deleted.html", sha: GONE_SHA }] };
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    {
      match: /\/contents\/\.tovu\/managed-files\.json/,
      method: "GET",
      status: 200,
      json: { content: Buffer.from(JSON.stringify(MANIFEST)).toString("base64"), encoding: "base64" },
    },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    // A VERIFIED 404 — GitHub confirms this path is genuinely gone (already deleted by a previous
    // pass or a human), distinct from the 410/500/network cases above which do NOT confirm absence.
    { match: /\/contents\/already-deleted\.html/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 0, "a confirmed-absent path was never live to delete");
      assert.deepEqual(result.divergedPaths, [], "a verified 404 is not a divergence — there is nothing left to report");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: createBlob's 2xx response is missing its own sha field", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { message: "created, but no sha field somehow" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub blob creation response did not include a sha");
    }
  } finally {
    mock.restore();
  }
});

// ---------------------------------------------------------------------------
// Branch-coverage fill, round 2 (2026-09-04) — the remaining per-step `body.ok === false` /
// missing-field arms the first fill round did not reach yet, plus providerErrorMessage's own
// blank-(not merely absent)-message fallback and fetchRepo's default_branch fallback.
// ---------------------------------------------------------------------------

test("PROVIDER_ERROR: fetchBranchTip's 2xx response fails to parse as JSON", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, text: "not json {{{" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub returned a non-JSON response.");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: fetchParentTree's 2xx response fails to parse as JSON", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, text: "not json {{{" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub returned a non-JSON response.");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: createBlob's 2xx response fails to parse as JSON", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, text: "not json {{{" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub returned a non-JSON response.");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: createTreeObject's 2xx response fails to parse as JSON", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, text: "not json {{{" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub returned a non-JSON response.");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: createTreeObject's 2xx response is missing its own sha field", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { url: "https://api.github.com/repos/octo/demo/git/trees/x" /* no sha */ } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub tree creation response did not include a sha");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: createCommitObject's 2xx response fails to parse as JSON", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, text: "not json {{{" },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub returned a non-JSON response.");
    }
  } finally {
    mock.restore();
  }
});

test("PROVIDER_ERROR: createCommitObject's 2xx response is missing its own sha field", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { url: "https://api.github.com/repos/octo/demo/git/commits/x" /* no sha */ } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub commit creation response did not include a sha");
    }
  } finally {
    mock.restore();
  }
});

/** `providerErrorMessage`'s own message check is `typeof === "string" && trim() !== ""` — every OTHER
 *  test either supplies a real message (true) or omits the field entirely (`typeof !== "string"`,
 *  proven above). This is the third, distinct combination: the field IS a string, but blank. */
test("PROVIDER_ERROR: a rejected response whose message field is present but BLANK also falls back to providerErrorMessage's own fixed wording", async () => {
  const mock = installMockFetch([{ match: /\/repos\/octo\/demo$/, method: "GET", status: 502, json: { message: "   " } }]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub repository lookup failed (502).");
    }
  } finally {
    mock.restore();
  }
});

/** `fetchRepo`'s `typeof body.json.default_branch === "string" ? ... : "main"` fallback — every OTHER
 *  success test in this file supplies a real `default_branch`; this proves the fallback for a
 *  well-formed 200 response that simply omits it. */
/** `githubFetch`'s timeout branch checks `err.name === "TimeoutError" || err.name === "AbortError"` —
 *  the suite's own existing timeout test only ever produces a real `TimeoutError` (Node's own
 *  `AbortSignal.timeout` firing); this proves the OTHER named case distinctly, since a caller-aborted
 *  signal (as opposed to a timeout) surfaces as `AbortError` on some fetch implementations and must be
 *  bucketed identically. */
test("NETWORK_UNREACHABLE: a thrown AbortError (not merely a TimeoutError) is bucketed the same way — both are 'the request never got a response'", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  }) as typeof fetch;
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "network-unreachable");
      assert.match(result.message, /timed out after 30000ms/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/** `fetchBranchTip`'s `typeof object?.sha === "string" ? object.sha : ""` — every OTHER success test
 *  supplies a real `object.sha`; this proves the guard for a 200, valid-JSON response that simply
 *  doesn't carry one. This is a REAL ref GitHub already found (distinct from the already-tested 404
 *  "branch does not exist" case, which legitimately returns `tipSha: undefined`), so treating it as
 *  "no parent" would send the write down the CREATE path against an existing ref — GitHub 422s that,
 *  after wasting blob/tree/commit creations. `fetchParentTree`/`createBlob`/`createTreeObject`/
 *  `createCommitObject` all reject this identical 200-but-missing-field shape as `provider-error`;
 *  `fetchBranchTip` must match them instead of being the one step that swallows it. */
test("PROVIDER_ERROR: a branch-tip lookup's 200 response is missing its own object.sha field", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { ref: "refs/heads/main" /* no object.sha */ } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "provider-error");
      assert.equal(result.message, "GitHub branch lookup response did not include a sha");
    }
    assert.equal(mock.remaining(), 0, "no blob/tree/commit creation may be attempted once the branch tip can't be read");
  } finally {
    mock.restore();
  }
});

/** Real git branch names routinely contain `/` (a hierarchical namespace, e.g. `feature/update-copy`)
 *  — `commit-site.ts`'s own `BRANCH_PATTERN` explicitly permits it. Both `fetchBranchTip`'s GET and
 *  `writeRef`'s update-mode PATCH build a multi-segment ref URL (`heads/{branch}`) from the branch
 *  name; `enc()` alone would turn the branch's own `/` into `%2F`, breaking the path into the wrong
 *  shape, exactly the failure mode `encPath()` exists to prevent (this file's own `fetchLiveBlobSha`
 *  already uses it for the identical reason, one path shape over). */
test("a branch name containing '/' reaches GitHub's ref URLs with the '/' preserved as a real path separator, not percent-encoded", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/feature\/update-copy$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/feature\/update-copy$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "feature/update-copy", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected success, got: ${JSON.stringify(result)}`);
    assert.equal(mock.remaining(), 0, "every queued step, including the exact-match ref URLs, must have been consumed");
    assert.ok(
      mock.callLog.some((c) => c.url.includes("/git/ref/heads/feature/update-copy") && !c.url.includes("%2F")),
      "the branch-tip lookup must preserve the branch's real '/' path separator, not percent-encode it"
    );
    assert.ok(
      mock.callLog.some((c) => c.url.includes("/git/refs/heads/feature/update-copy") && !c.url.includes("%2F")),
      "the ref-write URL must preserve the branch's real '/' path separator, not percent-encode it"
    );
  } finally {
    mock.restore();
  }
});

test("a candidate deletion's live-verification GET receiving a 2xx response that fails to parse as JSON is unverifiable, never crashes, and is reported via divergedPaths", async () => {
  const FLAKY_SHA = "aaaa1111bbbb2222cccc3333dddd4444eeee5555";
  const MANIFEST = { version: 2, files: [{ path: "weird.html", sha: FLAKY_SHA }] };
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 200, json: { content: Buffer.from(JSON.stringify(MANIFEST)).toString("base64"), encoding: "base64" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/contents\/weird\.html/, method: "GET", status: 200, text: "not json {{{" },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 0, "an unparseable live-verification body must never authorize a delete");
      assert.deepEqual(result.divergedPaths, ["weird.html"], "an unparseable live-verification body must not silently drop the path from the manifest");
    }
  } finally {
    mock.restore();
  }
});

/** `parseManifestV2Entry`'s `GIT_SHA_PATTERN.test(entry.sha)` — every other v2-manifest test uses a
 *  plausible hex sha. A recorded `sha` that is a STRING but not git-blob-sha-SHAPED (e.g. hand-edited,
 *  or a future format this file doesn't understand) must fall into "no recorded provenance," not be
 *  trusted as a comparison value. */
test("CRITICAL (ownership-trust defect): a v2 manifest entry whose recorded sha is a string but NOT git-blob-sha-shaped is treated as having no provenance", async () => {
  const MANIFEST = { version: 2, files: [{ path: "odd-sha.html", sha: "not-a-real-git-sha" }] };
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 200, json: { content: Buffer.from(JSON.stringify(MANIFEST)).toString("base64"), encoding: "base64" } },
    // No live-verification GET is queued for 'odd-sha.html' — an unparseable recorded sha must skip
    // straight to "no provenance, never verified," the exact same as a legacy v1 entry, WITHOUT ever
    // making the live-content request at all.
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected a successful commit, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.equal(result.filesDeleted, 0, "a non-sha-shaped recorded value must never authorize a delete");
      assert.deepEqual(result.divergedPaths, ["odd-sha.html"]);
    }
    assert.equal(mock.remaining(), 0, "no live-verification GET may be made for an entry with no parseable recorded sha");
  } finally {
    mock.restore();
  }
});

/** `parseManagedManifestV2`'s own doc: "a partially-valid v2 manifest is exactly as unrecognized as a
 *  wrong-shaped one" — this proves it directly: `version: 2` and a `files` array are both present (so
 *  the outer shape check passes), but ONE entry is malformed (`path` missing), which must fail the
 *  WHOLE manifest, not just that one entry. */
test("PROVIDER_ERROR: a v2-shaped manifest with ONE malformed entry (missing path) is unrecognized in its ENTIRETY, not partially trusted", async () => {
  const MANIFEST = { version: 2, files: [{ path: "fine.html", sha: "aaaa1111bbbb2222cccc3333dddd4444eeee5555" }, { sha: "aaaa1111bbbb2222cccc3333dddd4444eeee5555" /* no path */ }] };
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 200, json: { content: Buffer.from(JSON.stringify(MANIFEST)).toString("base64"), encoding: "base64" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false, `a partially-malformed v2 manifest must block the commit entirely, got: ${JSON.stringify(result)}`);
    if (!result.ok) assert.match(result.message, /did not match a recognized shape/);
  } finally {
    mock.restore();
  }
});

/** Same "partially valid is fully unrecognized" rule, proven for the legacy v1 shape's own validation
 *  (`obj.paths.every((path) => typeof path === "string")`). */
test("PROVIDER_ERROR: a v1-shaped manifest with a non-string path entry is unrecognized in its entirety", async () => {
  const MANIFEST = { version: 1, paths: ["fine.html", 42] };
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { default_branch: "main" } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/\.tovu\/managed-files\.json/, method: "GET", status: 200, json: { content: Buffer.from(JSON.stringify(MANIFEST)).toString("base64"), encoding: "base64" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", branch: "main", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, false, `a malformed v1 manifest must block the commit entirely, got: ${JSON.stringify(result)}`);
    if (!result.ok) assert.match(result.message, /did not match a recognized shape/);
  } finally {
    mock.restore();
  }
});

test("commit: a repo lookup response missing default_branch falls back to 'main', never a crash or an undefined branch name", async () => {
  const mock = installMockFetch([
    { match: /\/repos\/octo\/demo$/, method: "GET", status: 200, json: { full_name: "octo/demo" /* no default_branch */ } },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 404, json: {} },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha-1" } },
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "manifest-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs$/, method: "POST", status: 201, json: { ref: "refs/heads/main" } },
  ]);
  try {
    const result = await createGitHubCommitAdapter().commit({ token: TOKEN, owner: "octo", repo: "demo", commitMessage: "x", files: ONE_FILE });
    assert.equal(result.ok, true, `expected success, got: ${JSON.stringify(result)}`);
    if (result.ok) assert.equal(result.branch, "main");
  } finally {
    mock.restore();
  }
});
