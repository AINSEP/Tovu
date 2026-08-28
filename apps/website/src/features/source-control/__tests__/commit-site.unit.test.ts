import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { createSourceControlCredential } from "../store.js";
import {
  commitSiteToSourceControl,
  toCommitFile,
  validateCommitTarget,
  commitExportDir,
  type CommitFile,
  type GitHubCommitAdapter,
  type GitHubCommitAdapterResult,
} from "../commit-site.js";

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
 *  repo.
 *
 *  MUTATES the object `createRouteDeps()` returns rather than spreading a copy
 *  (`{ ...createRouteDeps(), sourceControlExportRootDir: exportDir }`) — deliberately, since
 *  2026-08-20 (RouteDeps-narrowing fix): `RouteDeps.exportSiteBound` is a closure bound to ONE
 *  object identity, at construction time, inside `createRouteDeps()` itself. A spread here would
 *  produce a logically-overridden but DIFFERENT object that closure never sees, so ANY later
 *  override of a field the real `exportSite` reads internally (e.g. `createSiteApp`, see the
 *  "an asset that fails to export" test below) would silently never apply. See
 *  `routes/types.ts`'s `exportSiteBound` doc for this same gotcha, generalized. */
function testRouteDeps(): RouteDeps {
  const deps = createRouteDeps();
  deps.sourceControlExportRootDir = exportDir;
  return deps;
}

/** Wraps the real `createApp` so ONE exact asset path always 500s, while every other route/asset
 *  still round-trips through the real app unchanged — this file's own copy of
 *  `static-publish/adapter.unit.test.ts`'s identical helper (same "no dependency on
 *  `features/deployments/**`" reason `commit-site.ts` itself gives for its own duplicated
 *  `exportSiteLazily`), injected via `RouteDeps.createSiteApp` since neither `/theme-assets/*` nor
 *  `/agent-icons/*` is backed by an injectable Port.
 *
 *  Takes `routeDeps` as an explicit argument (not a parameter of the returned function) since
 *  2026-08-20 (RouteDeps-narrowing pass 2): `RouteDeps.createSiteApp` itself is now NULLARY (`() =>
 *  Express`, closed over its own `routeDeps` at composition-root construction time — see that
 *  field's doc in `server/routes/types.ts`), so the fake assigned to `deps.createSiteApp` below must
 *  match that same nullary shape. */
function createSiteAppWithFailingAsset(failingPath: string, routeDeps: RouteDeps): () => ReturnType<typeof createApp> {
  return () => {
    const wrapper = express();
    wrapper.get(failingPath, (_req, res) => {
      res.status(500).json({ error: "forced failure for export-engine asset regression test" });
    });
    wrapper.use(createApp(routeDeps));
    return wrapper;
  };
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
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "not valid owner!!", repo: "demo", commitMessage: "x" }
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
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
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
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
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
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", branch: "main", commitMessage: "content update" }
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
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
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
      { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
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

/**
 * HIGH audit finding (2026-08-19, Codex sol bug/architecture audit): `commitSiteToSourceControl`
 * used to reject only `report.routes.failed`, ignoring `report.assets.failed` entirely — a page
 * could export fine while its stylesheet or hero image 404s, and the commit would still go
 * through, silently dropping the broken asset from the committed tree. Mirrors this file's own
 * "no saved credential fails cleanly... before any export or commit attempt" proof style: the FAKE
 * git adapter must never fire.
 */
test("commitSiteToSourceControl: an asset that fails to export blocks the commit, the same as a failed route", async () => {
  const deps = await withGithubCredential(testRouteDeps());
  // MUTATED in place, not spread into a copy (`{...deps, createSiteApp: X}`) — `deps.exportSiteBound`
  // (2026-08-20 RouteDeps-narrowing fix) is a closure bound ONCE, over this exact object, inside
  // `createRouteDeps()` itself. A spread produces a logically-overridden but DIFFERENT object
  // identity that closure never sees, so `createSiteApp`'s override would silently not apply and
  // this test would exercise the real, non-failing app instead of the forced-failure one. Mutating
  // the SAME object `exportSiteBound` already closed over is what makes the override visible —
  // property reads happen at call time, not at closure-creation time. See `routes/types.ts`'s
  // `exportSiteBound` doc for this same gotcha, generalized (as of 2026-08-20 pass 2, `createSiteApp`
  // ITSELF is now one of the closure-bound fields the generalized rule covers, not just
  // `exportSiteBound` — one more reason this must stay a mutation, not a spread).
  deps.createSiteApp = createSiteAppWithFailingAsset("/theme-assets/basic/css/theme.css", deps);

  const result = await commitSiteToSourceControl(
    { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "EXPORT_FAILED");
  assert.equal(
    result.message,
    "refused to commit: 1 asset(s) failed to export (first: '/theme-assets/basic/css/theme.css' — GET /theme-assets/basic/css/theme.css -> 500)"
  );
});

/**
 * MEDIUM audit finding (2026-08-19, Codex sol bug/architecture audit): `commitExportDir` used to
 * return one FIXED directory (`<parent>/github`) for every commit, and this feature has no
 * concurrency guard at all — not even the process-local single-flight `static-publish/adapter.ts`
 * gets from `publish-run.ts`. Two overlapping commits could `clean:true` and rewrite the same
 * directory out from under each other. See `adapter.unit.test.ts`'s identical `publishOutputDir`
 * test for why this is a direct proof of the fix mechanism (unique per-run isolation) rather than an
 * attempted same-process corruption reproduction — `ExportedRoute`/`ExportedAsset.data` are captured
 * in memory at write time and never re-read from disk, so a same-process race never actually
 * corrupted the returned `CommitFile[]` payload even before this fix.
 */
test("commitExportDir: two different run ids produce two DIFFERENT, non-overlapping directories", () => {
  const a = commitExportDir("/source-control-root", "run-a");
  const b = commitExportDir("/source-control-root", "run-b");
  assert.notEqual(a, b);
  assert.equal(a, path.join("/source-control-root", "github", "run-a"));
  assert.equal(b, path.join("/source-control-root", "github", "run-b"));
  assert.ok(!a.startsWith(b) && !b.startsWith(a), "neither run's directory may be a parent/child of the other's");
});

/** End-to-end smoke test alongside the direct `commitExportDir` proof above — two concurrent commits
 *  against the identical fixture must both still succeed with a correct, non-empty file set once
 *  `idGen.newId()` is a required part of computing `outputDir`. */
test("commitSiteToSourceControl: two concurrent commits both still succeed with correct file sets", async () => {
  const deps = await withGithubCredential(testRouteDeps());
  const capturedA: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
  const capturedB: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };

  const [resultA, resultB] = await Promise.all([
    commitSiteToSourceControl(
      { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "sha-a", commitUrl: "https://github.com/octo/demo/commit/sha-a", filesChanged: 1 }, capturedA) },
      { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "run a" }
    ),
    commitSiteToSourceControl(
      { credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "sha-b", commitUrl: "https://github.com/octo/demo/commit/sha-b", filesChanged: 1 }, capturedB) },
      { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "run b" }
    ),
  ]);

  assert.equal(resultA.ok, true, `run A must succeed: ${JSON.stringify(resultA)}`);
  assert.equal(resultB.ok, true, `run B must succeed: ${JSON.stringify(resultB)}`);
  assert.ok(capturedA.files && capturedA.files.length > 0, "run A's git adapter must have received a non-empty file set");
  assert.ok(capturedB.files && capturedB.files.length > 0, "run B's git adapter must have received a non-empty file set");
  assert.equal(capturedA.files!.length, capturedB.files!.length, "both concurrent runs against the identical fixture must produce the SAME file count");
});
