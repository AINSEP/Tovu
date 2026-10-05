import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";

import { buildAuthorizationHeader } from "@jini-ai/integrations/credentialed-http";
import type { CustomProviderConnectionInput } from "#src/features/custom-credentials/types";
import { createSourceControlProviderKit } from "#src/features/source-control/provider-kit";
import type { CommitBackupTreeInput, SourceControlProviderOperations } from "#src/features/source-control/provider-module";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";

import { loadSourceControlProviderRegistryFromSource } from "#src/features/source-control/provider-registry";

const GITHUB_PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/github");
const registry = await loadSourceControlProviderRegistryFromSource({ pluginId: "github", packageRoot: GITHUB_PACKAGE_ROOT });

/** The bundled `github` plugin's provider over `httpClient`, built with the real kit. */
function githubProvider(httpClient: HttpClientPort): SourceControlProviderOperations {
  const loaded = registry.get("github");
  if (!loaded) throw new Error(`github provider did not load: ${registry.refusals.join("; ")}`);
  return loaded.module.create({ kit: createSourceControlProviderKit({ httpClient }) });
}

/** Core hands the provider the `Authorization` header it built from the saved connection. */
function withAuthorization<T extends { connection: CustomProviderConnectionInput }>(input: T): Omit<T, "connection"> & { authorization: string } {
  const { connection, ...rest } = input;
  return { ...rest, authorization: buildAuthorizationHeader({ connection, schemes: [] }) };
}

const inspectBackupRepository = (deps: { httpClient: HttpClientPort }, input: Omit<Parameters<SourceControlProviderOperations["inspectBackupRepository"]>[0], "authorization"> & { connection: CustomProviderConnectionInput }) =>
  githubProvider(deps.httpClient).inspectBackupRepository(withAuthorization(input));
const uploadBackupBlob = (deps: { httpClient: HttpClientPort }, target: { baseUrl: string; connection: CustomProviderConnectionInput; owner: string; repo: string }, file: { path: string; content: Uint8Array }) =>
  githubProvider(deps.httpClient).uploadBackupBlob(withAuthorization(target), file);
const commitBackupTree = (deps: { httpClient: HttpClientPort }, input: Omit<CommitBackupTreeInput, "authorization"> & { connection: CustomProviderConnectionInput }) =>
  githubProvider(deps.httpClient).commitBackupTree(withAuthorization(input));

/**
 * @file `github-push.ts`'s proof — every call goes through an order-verifying fake `HttpClientPort`
 * (the same discipline `custom-credentials/__tests__/github-write-files.unit.test.ts` uses); nothing
 * here ever reaches GitHub.
 */

type Step = { match: RegExp; method?: string; status: number; json?: unknown; bodyText?: string };

class SequentialFakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly remaining: Step[];
  constructor(steps: Step[]) {
    this.remaining = [...steps];
  }
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const step = this.remaining.shift();
    if (!step) throw new Error(`unexpected send(): ${request.method} ${request.url}`);
    if (!step.match.test(request.url)) throw new Error(`send() ${request.method} ${request.url} did not match ${step.match}`);
    if (step.method !== undefined && step.method !== request.method) throw new Error(`send() ${request.url} expected ${step.method}, got ${request.method}`);
    return { status: step.status, headers: {}, bodyText: step.bodyText ?? JSON.stringify(step.json ?? {}) };
  }
  remainingCount(): number {
    return this.remaining.length;
  }
}

const TARGET = { baseUrl: "https://api.github.com", connection: { token: "ghp_fake_never_real" }, owner: "octo", repo: "backups" };
const PRIVATE_REPO = { private: true, visibility: "private", default_branch: "main", html_url: "https://github.com/octo/backups", permissions: { push: true } };

function bodyOf(request: HttpRequest): Record<string, unknown> {
  return JSON.parse(request.body ?? "{}") as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// inspectBackupRepository
// ---------------------------------------------------------------------------

test("a private repo: resolves the default branch, its tip and tree, and whether the backup folder already exists", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/repos\/octo\/backups$/, method: "GET", status: 200, json: PRIVATE_REPO },
    { match: /\/git\/ref\/heads\/main$/, method: "GET", status: 200, json: { object: { sha: "tip-sha" } } },
    { match: /\/git\/commits\/tip-sha$/, method: "GET", status: 200, json: { tree: { sha: "tree-sha" } } },
    { match: /\/contents\/sites\/demo\?ref=main$/, method: "GET", status: 200, json: [{ name: "tovu-backup.json" }] },
  ]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, folder: "sites/demo" });
  assert.deepEqual(result, {
    ok: true,
    state: { branch: "main", parentCommitSha: "tip-sha", baseTreeSha: "tree-sha", htmlUrl: "https://github.com/octo/backups", folderExists: true },
  });
  assert.equal(client.remainingCount(), 0);
  assert.ok(client.calls.every((c) => c.method === "GET"), "inspection is read-only");
  for (const call of client.calls) {
    assert.equal(call.headers.Authorization, "Bearer ghp_fake_never_real");
    assert.equal((call.body ?? "").includes(TARGET.connection.token), false);
  }
});

test("a PUBLIC repo is refused before any branch lookup, and the message says why (user data would be exposed)", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/repos\/octo\/backups$/, status: 200, json: { ...PRIVATE_REPO, private: false, visibility: "public" } },
  ]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, folder: "demo" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "repo-not-private");
  assert.match(result.message, /public/);
  assert.match(result.message, /members|form submissions/);
  assert.equal(client.calls.length, 1);
});

test("an 'internal' (enterprise-wide) repo is refused too — private is the only accepted visibility", async () => {
  const client = new SequentialFakeHttpClient([{ match: /\/repos\/octo\/backups$/, status: 200, json: { ...PRIVATE_REPO, visibility: "internal" } }]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, folder: "demo" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "repo-not-private");
});

test("a repo the token cannot push to is refused up front", async () => {
  const client = new SequentialFakeHttpClient([{ match: /\/repos\/octo\/backups$/, status: 200, json: { ...PRIVATE_REPO, permissions: { push: false } } }]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, folder: "demo" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "no-push-permission");
});

test("an unknown repo is 'repo-not-found', naming it", async () => {
  const client = new SequentialFakeHttpClient([{ match: /\/repos\/octo\/backups$/, status: 404, json: { message: "Not Found" } }]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, folder: "demo" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "repo-not-found");
  assert.match(result.message, /octo\/backups/);
});

test("an empty repository (GitHub answers 409 on the ref) says to add a first commit, rather than a raw provider error", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/repos\/octo\/backups$/, status: 200, json: PRIVATE_REPO },
    { match: /\/git\/ref\/heads\/main$/, status: 409, json: { message: "Git Repository is empty." } },
  ]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, folder: "demo" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "repo-empty");
  assert.match(result.message, /README/);
});

test("a named branch that does not exist is 'branch-not-found' (never created)", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/repos\/octo\/backups$/, status: 200, json: PRIVATE_REPO },
    { match: /\/git\/ref\/heads\/backups$/, status: 404, json: {} },
  ]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, branch: "backups", folder: "demo" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "branch-not-found");
});

test("a backup folder that exists as a FILE on the branch is refused rather than replaced", async () => {
  const client = new SequentialFakeHttpClient([
    { match: /\/repos\/octo\/backups$/, status: 200, json: PRIVATE_REPO },
    { match: /\/git\/ref\/heads\/main$/, status: 200, json: { object: { sha: "tip-sha" } } },
    { match: /\/git\/commits\/tip-sha$/, status: 200, json: { tree: { sha: "tree-sha" } } },
    { match: /\/contents\/demo\?ref=main$/, status: 200, json: { type: "file", name: "demo" } },
  ]);
  const result = await inspectBackupRepository({ httpClient: client }, { ...TARGET, folder: "demo" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "folder-is-file");
});

// ---------------------------------------------------------------------------
// uploadBackupBlob — binary content, base64 on the wire
// ---------------------------------------------------------------------------

test("binary bytes (NUL, 0xFF, invalid UTF-8) are sent base64-encoded byte-for-byte, and the sha256 is recorded", async () => {
  const bytes = new Uint8Array([0x00, 0xff, 0xfe, 0x80, 0x53, 0x51, 0x4c]);
  const client = new SequentialFakeHttpClient([{ match: /\/git\/blobs$/, method: "POST", status: 201, json: { sha: "blob-sha" } }]);
  const result = await uploadBackupBlob({ httpClient: client }, TARGET, { path: "database/content.db", content: bytes });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const body = bodyOf(client.calls[0]!);
  assert.equal(body.encoding, "base64");
  assert.deepEqual([...Buffer.from(body.content as string, "base64")], [...bytes]);
  assert.equal(result.blob.blobSha, "blob-sha");
  assert.equal(result.blob.bytes, 7);
  assert.match(result.blob.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.blob.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(client.calls[0]!.headers.Authorization, "Bearer ghp_fake_never_real", "the token goes only in the header");
  assert.equal(JSON.stringify(body).includes(TARGET.connection.token), false);
});

// ---------------------------------------------------------------------------
// commitBackupTree — folder replaced, rest of repo inherited, non-force ref update
// ---------------------------------------------------------------------------

const BLOBS = [
  { path: "tovu-backup.json", blobSha: "b-manifest", bytes: 10, sha256: "1".repeat(64) },
  { path: "database/content.db", blobSha: "b-db", bytes: 6, sha256: "2".repeat(64) },
];

function commitSteps(refStatus: number): Step[] {
  return [
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "folder-tree" } },
    { match: /\/git\/trees$/, method: "POST", status: 201, json: { sha: "root-tree" } },
    { match: /\/git\/commits$/, method: "POST", status: 201, json: { sha: "new-commit" } },
    { match: /\/git\/refs\/heads\/main$/, method: "PATCH", status: refStatus, json: refStatus === 422 ? { message: "Update is not a fast forward" } : { object: { sha: "new-commit" } } },
  ];
}

const COMMIT_INPUT = {
  ...TARGET,
  branch: "main",
  folder: "sites/demo",
  commitMessage: "Tovu site backup",
  parentCommitSha: "tip-sha",
  baseTreeSha: "tree-sha",
  htmlUrl: "https://github.com/octo/backups",
  blobs: BLOBS,
};

test("the folder becomes a fresh tree (stale files inside it disappear) grafted onto the branch's tree (everything else kept), committed on the planned parent, ref moved WITHOUT force", async () => {
  const client = new SequentialFakeHttpClient(commitSteps(200));
  const result = await commitBackupTree({ httpClient: client }, COMMIT_INPUT);
  assert.deepEqual(result, { ok: true, commitSha: "new-commit", commitUrl: "https://github.com/octo/backups/commit/new-commit" });

  const folderTree = bodyOf(client.calls[0]!);
  assert.equal("base_tree" in folderTree, false, "the folder's own tree must not inherit its previous contents");
  assert.deepEqual(folderTree.tree, [
    { path: "tovu-backup.json", mode: "100644", type: "blob", sha: "b-manifest" },
    { path: "database/content.db", mode: "100644", type: "blob", sha: "b-db" },
  ]);

  const rootTree = bodyOf(client.calls[1]!);
  assert.equal(rootTree.base_tree, "tree-sha", "everything outside the folder is inherited unchanged");
  assert.deepEqual(rootTree.tree, [{ path: "sites/demo", mode: "040000", type: "tree", sha: "folder-tree" }]);

  const commit = bodyOf(client.calls[2]!);
  assert.deepEqual(commit, { message: "Tovu site backup", tree: "root-tree", parents: ["tip-sha"] });

  const ref = bodyOf(client.calls[3]!);
  assert.deepEqual(ref, { sha: "new-commit" });
  assert.equal("force" in ref, false, "never a force push");
  for (const call of client.calls) {
    assert.equal(call.headers.Authorization, "Bearer ghp_fake_never_real");
    assert.equal((call.body ?? "").includes(TARGET.connection.token), false);
  }
});

test("a branch that moved since the plan (GitHub 422 on the ref update) is a clear divergence error, never overwritten", async () => {
  const client = new SequentialFakeHttpClient(commitSteps(422));
  const result = await commitBackupTree({ httpClient: client }, COMMIT_INPUT);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "diverged");
  assert.match(result.message, /moved/);
  assert.equal(client.calls.filter((c) => c.method === "PATCH").length, 1, "exactly one attempt — no retry with force");
});

for (const status of [401, 422]) {
  test(`blob upload: GitHub ${status} is a provider-error with the provider message`, async () => {
    const client = new SequentialFakeHttpClient([{ match: /\/repos\/octo\/backups\/git\/blobs$/, method: "POST", status, json: { message: "Blob upload refused" } }]);
    const result = await uploadBackupBlob({ httpClient: client }, TARGET, { path: "database/content.db", content: new Uint8Array([1, 2]) });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("blob upload must fail");
    assert.equal(result.code, "provider-error");
    assert.match(result.message, /Blob upload refused/);
    assert.equal(client.calls.length, 1);
    assert.equal(client.remainingCount(), 0);
  });
}


test("blob upload: a non-JSON success response is a provider-error, never a recorded blob", async () => {
  const client = new SequentialFakeHttpClient([{ match: /\/repos\/octo\/backups\/git\/blobs$/, method: "POST", status: 201, bodyText: "<html>upstream failure</html>" }]);
  const result = await uploadBackupBlob({ httpClient: client }, TARGET, { path: "database/content.db", content: new Uint8Array([0, 255]) });
  assert.deepEqual(result, { ok: false, code: "provider-error", message: "GitHub returned a non-JSON response." });
  assert.equal(client.calls.length, 1);
  assert.equal(client.remainingCount(), 0);
});
