import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createRouteDeps } from "#src/server/app";
import type { RouteDeps } from "#src/server/routes/types";

import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { createSourceControlCredential } from "../store.js";
import { commitSiteToSourceControl, toCommitFile, validateCommitTarget, type CommitFile, type GitHubCommitAdapter, type GitHubCommitAdapterResult } from "../commit-site.js";

/**
 * @file `commit-site.ts`'s business-logic proof — mirrors
 * `static-publish/__tests__/adapter.unit.test.ts`'s own shape: real `createRouteDeps()` (in-process,
 * no external network) runs a REAL export, with only the `GitHubCommitAdapter` seam faked, so this
 * file never touches `fetch`. Every test redirects `RouteDeps.sourceControlExportRootDir` to a
 * throwaway temp directory (via {@link testRouteDeps} below, matching `adapter.unit.test.ts`'s own
 * `publishOutputRootDir` redirect).
 */

const exportDir = mkdtempSync(path.join(tmpdir(), "tovu-source-control-commit-test-"));
test.after(() => rmSync(exportDir, { recursive: true, force: true }));

/** The hermetic fixture, with `sourceControlExportRootDir` redirected to this file's own throwaway
 *  temp dir — `commitSiteToSourceControl` reads this field instead of
 *  `process.env.TOVU_SOURCE_CONTROL_EXPORT_DIR` (commit-site.ts no longer reads env vars at all),
 *  so overriding it here is what keeps this suite's real `exportSite` writes off the checked-out
 *  repo. */
function testRouteDeps(): RouteDeps {
  return { ...createRouteDeps(), sourceControlExportRootDir: exportDir };
}

function neverCalledGitAdapter(): GitHubCommitAdapter {
  return {
    async commit() {
      throw new Error("gitAdapter.commit must not be called on this path");
    },
  };
}

function fakeGitAdapter(result: GitHubCommitAdapterResult, captured: { files: readonly CommitFile[] | null; input: unknown }): GitHubCommitAdapter {
  return {
    async commit(input) {
      captured.files = input.files;
      captured.input = input;
      return result;
    },
  };
}

async function withGithubCredential(deps: RouteDeps, token = "ghp_fake_token_never_real"): Promise<RouteDeps> {
  await createSourceControlCredential(
    { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "Test", connection: { providerId: "github", token } }
  );
  return deps;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("validateCommitTarget accepts a well-formed target", () => {
  assert.equal(validateCommitTarget({ owner: "octo", repo: "my-site", commitMessage: "content update" }), null);
  assert.equal(validateCommitTarget({ owner: "octo", repo: "my-site", branch: "main", commitMessage: "content update" }), null);
});

test("validateCommitTarget rejects an invalid owner, repo, branch, or commit message", () => {
  assert.match(validateCommitTarget({ owner: "not valid!!", repo: "my-site", commitMessage: "x" }) ?? "", /invalid GitHub owner/);
  assert.match(validateCommitTarget({ owner: "octo", repo: "..", commitMessage: "x" }) ?? "", /invalid GitHub repo/);
  assert.match(validateCommitTarget({ owner: "octo", repo: "my-site", branch: "not a branch", commitMessage: "x" }) ?? "", /invalid branch name/);
  assert.match(validateCommitTarget({ owner: "octo", repo: "my-site", commitMessage: "" }) ?? "", /commitMessage must be/);
});

test("toCommitFile normalizes to forward slashes and drops no field static-publish's DeployFile has that this feature doesn't need", () => {
  assert.deepEqual(toCommitFile({ outputFile: "about/index.html", data: "<html></html>" }), { path: "about/index.html", data: "<html></html>" });
});

// ---------------------------------------------------------------------------
// commitSiteToSourceControl
// ---------------------------------------------------------------------------

test("commitSiteToSourceControl: an invalid target is rejected before credentials or the git adapter are ever touched", async () => {
  const deps = testRouteDeps();
  const result = await commitSiteToSourceControl(
    { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, routeDeps: deps, owner: "not valid owner!!", repo: "demo", commitMessage: "x" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "INVALID_CONFIG");
  assert.match(result.message, /invalid GitHub owner/);
});

test("commitSiteToSourceControl: no saved credential fails cleanly with NO_CREDENTIALS_CONFIGURED, before any export or commit attempt", async () => {
  const deps = testRouteDeps();
  const result = await commitSiteToSourceControl(
    { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, routeDeps: deps, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.doesNotMatch(JSON.stringify(result), /ghp_|Bearer /i);
});

/**
 * Live-found (2026-08-16), the daemon-side twin of `static-publish/adapter.ts`'s own
 * `publishStaticSite` guard around `credentialSource.resolve()`: `commitSiteToSourceControl`'s own
 * doc claims "Never throws: every failure... is returned as `{ok: false, code, message}`", but before
 * this fix the call to `resolveDefaultForSourceControl` below had no try/catch at all, so a genuine
 * decrypt failure (a process boot with no `TOVU_INTEGRATIONS_ROOT_KEY`, or any other sealer/keyring
 * error) broke that contract silently. Worse than the publish-credentials sibling's own version of
 * this bug: this function is reached from `tool-registrations.ts`'s `source_control_execute_commit`,
 * which runs inside `agent-daemon-server.ts` — a SEPARATE OS process from Tovu's main server with no
 * `installUnhandledRejectionGuard()` of its own and no restart supervisor (`index.ts`'s
 * `spawnAgentDaemon()`: "there is no retry path today"), so the escaped rejection would have taken
 * down the daemon process outright, not just answered one request with a 500.
 */
test("commitSiteToSourceControl: a genuine decrypt failure (e.g. a boot with no root key) returns {ok:false, NO_CREDENTIALS_CONFIGURED} — the SAME 'never throws' contract every other failure mode already gets, never an unhandled rejection", async () => {
  const deps = await withGithubCredential(testRouteDeps());
  // A sealer backed by a DIFFERENT keyring than the one the credential was actually sealed under —
  // `sealer.open()` fails auth-tag verification, the same shape a missing root key produces live.
  const brokenSealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const result = await commitSiteToSourceControl(
    { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: brokenSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, routeDeps: deps, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
});

test("commitSiteToSourceControl: a real export runs and its files reach the git adapter, deploy-relative and forward-slashed", async () => {
  const deps = await withGithubCredential(testRouteDeps());
  const captured: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
  const result = await commitSiteToSourceControl(
    { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://github.com/octo/demo/commit/abc123", filesChanged: 1, filesDeleted: 0 }, captured) },
    { workspaceId: deps.workspaceId, routeDeps: deps, owner: "octo", repo: "demo", branch: "main", commitMessage: "content update" }
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.owner, "octo");
  assert.equal(result.repo, "demo");
  assert.equal(result.branch, "main");
  assert.equal(result.commitSha, "abc123");
  assert.ok(captured.files && captured.files.length > 0, "the real export must produce at least one file");
  for (const file of captured.files ?? []) {
    assert.ok(!file.path.includes("\\"), `file path '${file.path}' must be forward-slash normalized`);
  }
  const passedInput = captured.input as { token: string; owner: string; repo: string; branch?: string; commitMessage: string };
  assert.equal(passedInput.token, "ghp_fake_token_never_real");
  assert.equal(passedInput.owner, "octo");
  assert.equal(passedInput.repo, "demo");
  assert.equal(passedInput.branch, "main");
  assert.equal(passedInput.commitMessage, "content update");
});

test("commitSiteToSourceControl: branch omitted is forwarded to the git adapter as omitted, not a guessed default", async () => {
  const deps = await withGithubCredential(testRouteDeps());
  const captured: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
  await commitSiteToSourceControl(
    { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://github.com/octo/demo/commit/abc123", filesChanged: 1, filesDeleted: 0 }, captured) },
    { workspaceId: deps.workspaceId, routeDeps: deps, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  const passedInput = captured.input as { branch?: string };
  assert.equal("branch" in passedInput, false, "commitSiteToSourceControl must not invent a branch — that decision belongs to the git adapter");
});

const ADAPTER_FAILURE_CASES: { adapterCode: GitHubCommitAdapterResult extends { ok: false; code: infer C } ? C : never; expected: string }[] = [
  { adapterCode: "repository-not-found", expected: "REPOSITORY_NOT_FOUND" },
  { adapterCode: "no-changes", expected: "NO_CHANGES" },
  { adapterCode: "diverged", expected: "DIVERGED_BRANCH" },
  { adapterCode: "network-unreachable", expected: "NETWORK_UNREACHABLE" },
  { adapterCode: "provider-error", expected: "PROVIDER_ERROR" },
];

for (const { adapterCode, expected } of ADAPTER_FAILURE_CASES) {
  test(`commitSiteToSourceControl: a '${adapterCode}' adapter result maps to '${expected}', distinct from every other failure code`, async () => {
    const deps = await withGithubCredential(testRouteDeps());
    const captured: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
    const result = await commitSiteToSourceControl(
      { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: false, code: adapterCode, message: `fake ${adapterCode}` }, captured) },
      { workspaceId: deps.workspaceId, routeDeps: deps, owner: "octo", repo: "demo", commitMessage: "content update" }
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.code, expected);
    assert.equal(result.message, `fake ${adapterCode}`);
  });
}

test("commitSiteToSourceControl: a network-unreachable result is NEVER conflated with a provider-error result", () => {
  const codes = new Set(ADAPTER_FAILURE_CASES.map((c) => c.expected));
  assert.ok(codes.has("NETWORK_UNREACHABLE"));
  assert.ok(codes.has("PROVIDER_ERROR"));
  assert.notEqual(
    ADAPTER_FAILURE_CASES.find((c) => c.adapterCode === "network-unreachable")?.expected,
    ADAPTER_FAILURE_CASES.find((c) => c.adapterCode === "provider-error")?.expected
  );
});
