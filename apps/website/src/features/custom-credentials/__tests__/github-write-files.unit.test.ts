import assert from "node:assert/strict";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { commitGitHubFiles, planGitHubFileWrite, type GitHubWriteFilesPlan } from "../github-write-files.js";
import { validateWriteFilesInput } from "../write-files-validation.js";

/**
 * @file `github-write-files.ts`'s proof — every call goes through a stubbed `HttpClientPort`, never
 * a real network call, mirroring `source-control/__tests__/github-git-provider.unit.test.ts`'s own
 * "EVERY call goes through a stub, order-verified" discipline, adapted from a stubbed `global.fetch`
 * to a stubbed `HttpClientPort` (this module's own dependency — see this file's header for why).
 */

type MockStep = { match: RegExp; method?: string; status: number; json?: unknown; networkError?: string };

/** Installs a sequential, order-verifying fake `HttpClientPort` — each `send()` call must match the
 *  NEXT queued step's URL pattern (and method, when given) or the fake throws loudly rather than
 *  silently answering the wrong step. Mirrors `github-git-provider.unit.test.ts`'s own
 *  `installMockFetch`, adapted to this module's `HttpClientPort` dependency. */
class SequentialFakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly remaining: MockStep[];

  constructor(steps: MockStep[]) {
    this.remaining = [...steps];
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const step = this.remaining.shift();
    if (!step) throw new Error(`unexpected HttpClientPort.send call (no more mock steps queued): ${request.method} ${request.url}`);
    if (!step.match.test(request.url)) throw new Error(`send() call ${request.method} ${request.url} did not match expected pattern ${step.match} — step order mismatch`);
    if (step.method !== undefined && step.method !== request.method) throw new Error(`send() call to ${request.url} expected method '${step.method}', got '${request.method}'`);
    if (step.networkError !== undefined) throw new Error(step.networkError);
    return { status: step.status, headers: {}, bodyText: JSON.stringify(step.json ?? {}) };
  }

  remainingCount(): number {
    return this.remaining.length;
  }
}

const CONNECTION = { token: "ghp_fake_token_never_real" };
const BASE_URL = "https://api.github.com";
const OWNER = "octo";
const REPO = "demo";
const BRANCH = "main";

function planInput(files: { path: string; content: string }[]) {
  return { baseUrl: BASE_URL, connection: CONNECTION, owner: OWNER, repo: REPO, branch: BRANCH, files };
}

// ---------------------------------------------------------------------------
// planGitHubFileWrite
// ---------------------------------------------------------------------------

test("plan: reports one existing and one new file, and returns the branch's tip/tree shas", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/fly\.toml\?ref=main$/, method: "GET", status: 200, json: { sha: "existing-blob-sha", type: "file" } },
    { match: /\/contents\/\.github\/workflows\/fly-deploy\.yml\?ref=main$/, method: "GET", status: 404, json: {} },
  ]);
  const result = await planGitHubFileWrite({ httpClient: client }, planInput([
    { path: "fly.toml", content: "app = 'demo'" },
    { path: ".github/workflows/fly-deploy.yml", content: "name: deploy" },
  ]));
  assert.deepEqual(result, {
    ok: true,
    plan: {
      parentCommitSha: "parent-sha",
      baseTreeSha: "parent-tree-sha",
      fileStates: [
        { path: "fly.toml", exists: true },
        { path: ".github/workflows/fly-deploy.yml", exists: false },
      ],
    },
  });
  assert.equal(client.remainingCount(), 0);
});

test("plan: a path that is a directory (array Contents API response) is refused, not planned as a file", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 200, json: { tree: { sha: "parent-tree-sha" } } },
    { match: /\/contents\/fly\.toml\?ref=main$/, method: "GET", status: 200, json: [{ name: "fly.toml", type: "dir" }] },
  ]);
  const result = await planGitHubFileWrite({ httpClient: client }, planInput([{ path: "fly.toml", content: "x" }]));
  assert.equal(result.ok, false);
  assert.equal((result as { code: string }).code, "provider-error");
  assert.match((result as { message: string }).message, /fly\.toml/, "the refusal must name the offending path");
});

test("plan: branch does not exist", async () => {
  const client = new SequentialFakeHttpClient([{ match: /\/git\/ref\/heads\/main$/, method: "GET", status: 404, json: {} }]);
  const result = await planGitHubFileWrite({ httpClient: client }, planInput([{ path: "fly.toml", content: "x" }]));
  assert.equal(result.ok, false);
  assert.equal((result as { code: string }).code, "branch-not-found");
});

test("plan: a network failure on the branch lookup is reported, never thrown", async () => {
  const client = new SequentialFakeHttpClient([{ match: /\/git\/ref\/heads\/main$/, method: "GET", status: 0, networkError: "DNS lookup failed" }]);
  const result = await planGitHubFileWrite({ httpClient: client }, planInput([{ path: "fly.toml", content: "x" }]));
  assert.deepEqual(result, { ok: false, code: "network-unreachable", message: "DNS lookup failed" });
});

test("plan: a provider error on the parent-commit lookup aborts before any file existence check", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, method: "GET", status: 500, json: { message: "internal error" } },
  ]);
  const result = await planGitHubFileWrite({ httpClient: client }, planInput([{ path: "fly.toml", content: "x" }]));
  assert.equal(result.ok, false);
  assert.equal((result as { code: string }).code, "provider-error");
  assert.equal(client.remainingCount(), 0, "no file-existence check should run once the parent-commit lookup fails");
});

// ---------------------------------------------------------------------------
// commitGitHubFiles
// ---------------------------------------------------------------------------

const PLAN: GitHubWriteFilesPlan = {
  parentCommitSha: "parent-sha",
  baseTreeSha: "parent-tree-sha",
  fileStates: [{ path: "fly.toml", exists: false }],
};

function commitInput(files: { path: string; content: string }[]) {
  return { baseUrl: BASE_URL, connection: CONNECTION, owner: OWNER, repo: REPO, branch: BRANCH, commitMessage: "deploy", files };
}

test("commit: one file — blob, tree (with base_tree), commit, non-force ref update, in order", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: { ref: "refs/heads/main" } },
  ]);
  const result = await commitGitHubFiles({ httpClient: client }, commitInput([{ path: "fly.toml", content: "app = 'demo'" }]), PLAN);
  assert.deepEqual(result, { ok: true, commitSha: "new-commit-sha", commitUrl: "https://github.com/octo/demo/commit/new-commit-sha" });

  const treeCall = client.calls.find((c) => c.url.endsWith("/git/trees"));
  assert.ok(treeCall, "the tree-creation call must have been made");
  const treeBody = JSON.parse(treeCall!.body!);
  // The 2026-08-19 data-loss class this must never regress: a tree POST with no `base_tree` REPLACES
  // the branch's entire file listing rather than adding to it. This asserts the exact field a future
  // edit could silently drop.
  assert.equal(treeBody.base_tree, "parent-tree-sha");
  assert.deepEqual(treeBody.tree, [{ path: "fly.toml", mode: "100644", type: "blob", sha: "blob-sha" }]);

  const refCall = client.calls.find((c) => c.url.endsWith("/git/refs/heads/main"));
  assert.equal(refCall!.method, "PATCH");
  const refBody = JSON.parse(refCall!.body!);
  assert.equal(refBody.force, undefined, "the ref update must never force — a real race must be refused, never overwritten");
  assert.equal(refBody.sha, "new-commit-sha");
});

test("commit: two files with identical content create exactly one blob", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "shared-blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 200, json: {} },
  ]);
  const plan: GitHubWriteFilesPlan = { ...PLAN, fileStates: [{ path: "a.txt", exists: false }, { path: "b.txt", exists: false }] };
  const result = await commitGitHubFiles(
    { httpClient: client },
    commitInput([{ path: "a.txt", content: "same content" }, { path: "b.txt", content: "same content" }]),
    plan
  );
  assert.equal(result.ok, true);
  const blobCalls = client.calls.filter((c) => c.url.endsWith("/git/blobs"));
  assert.equal(blobCalls.length, 1, "identical content must be uploaded as exactly one blob, reused for both paths");

  const treeCall = client.calls.find((c) => c.url.endsWith("/git/trees"));
  const treeBody = JSON.parse(treeCall!.body!);
  assert.deepEqual(treeBody.tree, [
    { path: "a.txt", mode: "100644", type: "blob", sha: "shared-blob-sha" },
    { path: "b.txt", mode: "100644", type: "blob", sha: "shared-blob-sha" },
  ]);
});

test("commit: a diverged branch (422 on ref update) is refused, not overwritten", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "new-tree-sha" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit-sha" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: 422, json: { message: "Update is not a fast forward" } },
  ]);
  const result = await commitGitHubFiles({ httpClient: client }, commitInput([{ path: "fly.toml", content: "x" }]), PLAN);
  assert.deepEqual(result, { ok: false, code: "diverged", message: "the branch has moved since this write was confirmed — refusing to overwrite it" });
});

test("commit: a network failure creating the blob aborts before the tree/commit/ref calls", async () => {
  const client = new SequentialFakeHttpClient([{ match: /\/git\/blobs$/, method: "POST", status: 0, networkError: "connection reset" }]);
  const result = await commitGitHubFiles({ httpClient: client }, commitInput([{ path: "fly.toml", content: "x" }]), PLAN);
  assert.deepEqual(result, { ok: false, code: "network-unreachable", message: "connection reset" });
  assert.equal(client.remainingCount(), 0);
});

test("commit: a provider error creating the tree is reported with the provider's own message", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha" } },
    { match: /\/git\/trees$/, method: "POST", status: 422, json: { message: "invalid tree entry" } },
  ]);
  const result = await commitGitHubFiles({ httpClient: client }, commitInput([{ path: "fly.toml", content: "x" }]), PLAN);
  assert.equal(result.ok, false);
  assert.equal((result as { code: string }).code, "provider-error");
  assert.match((result as { message: string }).message, /invalid tree entry/);
});

// ---------------------------------------------------------------------------
// branch validation (write-files-validation)
// ---------------------------------------------------------------------------

function branchValidationInput(branch: string) {
  return { owner: OWNER, repo: REPO, branch, commitMessage: "deploy", files: [{ path: "fly.toml", content: "x" }] };
}

test("validation: a branch containing a '..' segment is refused before any URL is built", () => {
  assert.throws(() => validateWriteFilesInput(branchValidationInput("../tags/release")), /invalid branch name/);
});

test("validation: a branch with a leading, trailing, or doubled slash is refused", () => {
  for (const branch of ["/main", "main/", "feature//x"]) {
    assert.throws(() => validateWriteFilesInput(branchValidationInput(branch)), /invalid branch name/, `branch '${branch}' must be refused`);
  }
});
