import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
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
import { buildVaultAad } from "@jini-ai/platform/secrets/credential-sets";
import {
  commitSiteToSourceControl,
  previewCommitExport,
  type CommitSiteInput,
  toCommitFile,
  validateCommitTarget,
  commitExportDir,
  type CommitFile,
  type SourceControlCommitAdapter,
  type SourceControlCommitResult,
} from "../commit-site.js";
import type { ExportReport } from "#src/features/site-export/index";
import { exampleProvidersWithoutProbe } from './fixtures/example-provider.js';
import type { RepositoryTargetValidator } from '../provider-module.js';

const exampleValidator: RepositoryTargetValidator = ({ owner, repo }) => {
  if (!/^[A-Za-z0-9-]+$/.test(owner)) return `invalid Example Git owner '${owner}'`;
  if (!/^[A-Za-z0-9_.-]+$/.test(repo) || repo === '.' || repo === '..') return `invalid Example Git repo '${repo}'`;
  return null;
};

/**
 * @file `commit-site.ts`'s business-logic proof — mirrors
 * `static-publish/__tests__/adapter.unit.test.ts`'s own shape: real `createRouteDeps()` (in-process,
 * no external network) runs a REAL export, with only the `SourceControlCommitAdapter` seam faked, so this
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
function testRouteDeps(): ReturnType<typeof createRouteDeps> {
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
function createSiteAppWithFailingAsset(failingPath: string, routeDeps: ReturnType<typeof createRouteDeps>): () => ReturnType<typeof createApp> {
  return () => {
    const wrapper = express();
    wrapper.get(failingPath, (_req, res) => {
      res.status(500).json({ error: "forced failure for export-engine asset regression test" });
    });
    wrapper.use(createApp(routeDeps));
    return wrapper;
  };
}

function neverCalledGitAdapter(): SourceControlCommitAdapter {
  return {
    async commit() {
      throw new Error("gitAdapter.commit must not be called on this path");
    },
  };
}

function fakeGitAdapter(result: SourceControlCommitResult, captured: { files: readonly CommitFile[] | null; input: unknown }): SourceControlCommitAdapter {
  return {
    async commit(input) {
      captured.files = input.files;
      captured.input = input;
      return result;
    },
  };
}

async function withExampleGitCredential<TDeps extends RouteDeps>(deps: TDeps, token = "fixture_fake_token_never_real"): Promise<TDeps> {
  await createSourceControlCredential(
    { deps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen, loadSourceControlProviders: exampleProvidersWithoutProbe }, input: { workspaceId: deps.workspaceId, label: "Test", connection: { providerId: "example-git", token } } }
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
  assert.equal(validateCommitTarget({ owner: "not valid!!", repo: "my-site", commitMessage: "x" }, exampleValidator), "invalid Example Git owner 'not valid!!'");
  assert.equal(validateCommitTarget({ owner: "octo", repo: "..", commitMessage: "x" }, exampleValidator), "invalid Example Git repo '..'");
  assert.equal(validateCommitTarget({ owner: "octo", repo: "my-site", branch: "not a branch", commitMessage: "x" }), "invalid branch name 'not a branch'");
  for (const branch of ["topic@{1}", "topic\tname", "x".repeat(251)]) {
    assert.equal(validateCommitTarget({ owner: "octo", repo: "my-site", branch, commitMessage: "x" }), `invalid branch name '${branch.slice(0, 60)}'`);
  }
  assert.equal(validateCommitTarget({ owner: "octo", repo: "my-site", branch: "release/2", commitMessage: "x" }), null);
  assert.equal(validateCommitTarget({ owner: "octo", repo: "my-site", commitMessage: "" }), "commitMessage must be 1-500 characters");
});

test('T28: commit targets reject traversal and malformed Git branch names', () => {
  const target = { owner: 'octo', repo: 'my-site', commitMessage: 'content update' };
  assert.equal(validateCommitTarget({ ...target, branch: 'release/2' }), null);
  for (const branch of ['../../x', 'topic..name', 'release//2', '/main', 'main/', 'release.lock', 'release.lock/topic']) {
    assert.match(validateCommitTarget({ ...target, branch }) ?? '', /invalid branch name/, branch);
  }
});

/**
 * Branch-coverage fill (2026-09-04): `REPO_PATTERN`'s own regex-fails case and the exact `"."` literal
 * case are each their own `||` arm in `validateCommitTarget`'s repo check — the suite above only ever
 * exercised the `".."` arm (REPO_PATTERN accepts a lone/double dot, so that arm is reached only via the
 * literal-equality check, never via the regex). Both remaining arms are proven here, distinctly.
 */
test("validateCommitTarget rejects a repo with characters REPO_PATTERN itself refuses (not merely '.' or '..')", () => {
  assert.match(validateCommitTarget({ owner: "octo", repo: "not/a valid repo!", commitMessage: "x" }, exampleValidator) ?? "", /invalid Example Git repo/);
});

test("validateCommitTarget rejects a repo that is the single-character literal '.', distinctly from the '..' case", () => {
  assert.match(validateCommitTarget({ owner: "octo", repo: ".", commitMessage: "x" }, exampleValidator) ?? "", /invalid Example Git repo/);
});

test("validateCommitTarget without a host check applies only the generic one-path-segment rule, naming no host", () => {
  assert.equal(validateCommitTarget({ owner: "not valid!!", repo: "my-site", commitMessage: "x" }), "invalid owner 'not valid!!'");
  assert.equal(validateCommitTarget({ owner: "octo", repo: "a/b", commitMessage: "x" }), "invalid repo 'a/b'");
  assert.equal(validateCommitTarget({ owner: "octo", repo: "..", commitMessage: "x" }), "invalid repo '..'");
  assert.equal(validateCommitTarget({ owner: "", repo: "my-site", commitMessage: "x" }), "invalid owner ''");
  // A name Example Git would refuse but another host may allow passes the generic rule.
  assert.equal(validateCommitTarget({ owner: "group_name", repo: "my-site", commitMessage: "x" }), null);
});

test("validateCommitTarget: the host's own check runs first and its message is returned as-is", () => {
  const calls: unknown[] = [];
  const host = (target: { owner: string; repo: string }) => {
    calls.push(target);
    return target.owner === "bad" ? "invalid Example owner 'bad'" : null;
  };
  assert.equal(validateCommitTarget({ owner: "bad", repo: "a/b", commitMessage: "" }, host), "invalid Example owner 'bad'");
  assert.equal(validateCommitTarget({ owner: "ok", repo: "a/b", commitMessage: "x" }, host), "invalid repo 'a/b'", "the generic rule still applies after the host's check");
  assert.deepEqual(calls, [{ owner: "bad", repo: "a/b" }, { owner: "ok", repo: "a/b" }]);
});

/**
 * Branch-coverage fill (2026-09-04): the suite above only ever exercised the FIRST arm of
 * `commitMessage.trim() === "" || commitMessage.length > MAX_COMMIT_MESSAGE_LENGTH` — the empty-string
 * case. This proves the length arm independently, one character over the documented 500-character cap.
 */
test("validateCommitTarget rejects a commit message one character over the 500-character cap, distinctly from the empty-message case", () => {
  const tooLong = "x".repeat(501);
  const message = validateCommitTarget({ owner: "octo", repo: "my-site", commitMessage: tooLong });
  assert.match(message ?? "", /commitMessage must be 1-500 characters/);
  // The boundary itself (exactly 500) must still be accepted — proves this is a `>`, not a `>=`, cap.
  assert.equal(validateCommitTarget({ owner: "octo", repo: "my-site", commitMessage: "x".repeat(500) }), null);
});

test("toCommitFile normalizes to forward slashes and drops no field static-publish's DeployFile has that this feature doesn't need", () => {
  assert.deepEqual(toCommitFile({ outputFile: "about/index.html", data: "<html></html>" }), { path: "about/index.html", data: "<html></html>" });
  // path.join supplies backslashes on Windows, where this assertion detects an unchanged outputFile.
  const data = Buffer.from([0, 128, 255]);
  assert.deepEqual(toCommitFile({ outputFile: path.join("theme-assets", "fixture", "image.png"), data }), { path: "theme-assets/fixture/image.png", data });
});

// ---------------------------------------------------------------------------
// commitSiteToSourceControl
// ---------------------------------------------------------------------------

test("commitSiteToSourceControl: an invalid target is rejected before credentials or the git adapter are ever touched", async () => {
  const deps = testRouteDeps();
  const reads: unknown[] = [];
  deps.sourceControlCredentialSetRepo.findDefaultByProvider = async (...args) => { reads.push(args); assert.fail("credentials read for invalid input"); };
  deps.exportSiteBound = async () => { assert.fail("export started for invalid input"); };
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter(), validateTarget: exampleValidator },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "not valid owner!!", repo: "demo", commitMessage: "x" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "INVALID_CONFIG");
  assert.match(result.message, /invalid Example Git owner/);
  assert.deepEqual(reads, []);
});

test("commitSiteToSourceControl: no saved credential fails cleanly with NO_CREDENTIALS_CONFIGURED, before any export or commit attempt", async () => {
  const deps = testRouteDeps();
  deps.exportSiteBound = async () => { assert.fail("export before missing credential refusal"); };
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.doesNotMatch(JSON.stringify(result), /fixture_|Bearer /i);
});

/**
 * Live-found (2026-08-16), the daemon-side twin of `static-publish/adapter.ts`'s own
 * `publishStaticSite` guard around `credentialSource.resolve()`: `commitSiteToSourceControl`'s own
 * doc claims "Never throws: every failure... is returned as `{ok: false, code, message}`", but before
 * this fix the call to `resolveDefaultForSourceControl` below had no try/catch at all, so a genuine
 * decrypt failure (a process boot with no `TOVU_SITE_KEY`, or any other sealer/keyring
 * error) broke that contract silently. Worse than the publish-credentials sibling's own version of
 * this bug: this function is reached from `tool-registrations.ts`'s `source_control_execute_commit`,
 * which runs inside `agent-daemon-server.ts` — a SEPARATE OS process from Tovu's main server with no
 * `installUnhandledRejectionGuard()` of its own and no restart supervisor (`index.ts`'s
 * `spawnAgentDaemon()`: "there is no retry path today"), so the escaped rejection would have taken
 * down the daemon process outright, not just answered one request with a 500.
 */
test("commitSiteToSourceControl: a genuine decrypt failure (e.g. a boot with no site key) returns {ok:false, NO_CREDENTIALS_CONFIGURED} — the SAME 'never throws' contract every other failure mode already gets, never an unhandled rejection", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  // A sealer backed by a DIFFERENT keyring than the one the credential was actually sealed under —
  // `sealer.open()` fails auth-tag verification, the same shape a missing site key produces live.
  const brokenSealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: brokenSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
});

/** Provider metadata is authoritative after a provider-only move (S3dr); sealed providerId may
 * retain its old value. The security invariant is that a stale selection (here the provider listing
 * returns a row from another group) is never opened: Jini checks the group before the envelope.
 */
test("commitSiteToSourceControl: a vault result from another provider group is rejected as NO_CREDENTIALS_CONFIGURED before opening or forwarding its token", async (t) => {
  const deps = testRouteDeps();
  const { workspaceId } = deps;
  const id = deps.idGen.newId();
  const aad = buildVaultAad({ workspaceId, id, kind: "source-control", ownerKey: "tovu", principalId: null, binding: null });
  const sealed = await deps.siteAssistantSecretSealer.seal({
    plaintext: JSON.stringify({ providerId: "example-token", token: "evil-mismatched-token" }),
    key: await deps.siteAssistantSecretKeyring.activeKey(),
    aad,
  });
  await deps.sourceControlCredentialSetRepo.insert({
    workspaceId,
    id,
    providerId: "example-token",
    label: "Wrong provider group",
    sealed,
    isDefault: true,
    accountLabel: null,
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
  });
  const wrongGroup = await deps.sourceControlCredentialSetRepo.listByProvider({ workspaceId, providerId: "example-token" });
  assert.equal(wrongGroup.length, 1);
  const lookup = t.mock.method(deps.sourceControlCredentialSetRepo, "listByProvider", async () => wrongGroup, {});
  const open = t.mock.method(deps.siteAssistantSecretSealer, "open", async () => {
    assert.fail("a wrong-provider envelope must not be opened");
  });
  deps.exportSiteBound = async () => { assert.fail("export must not start for a wrong-provider credential"); };

  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(result.message, "credential could not be resolved: The credential could not be saved or unlocked. Check the site credential store.");
  assert.equal(lookup.mock.callCount(), 1);
  assert.deepEqual(lookup.mock.calls[0]!.arguments, [{ workspaceId, providerId: "example-git" }]);
  assert.equal(open.mock.callCount(), 0);
  assert.doesNotMatch(JSON.stringify(result), /evil-mismatched-token/);
});

/** Vault failures use the store's safe public message, including non-Error adapter failures. */
test("commitSiteToSourceControl: a vault repo throwing a non-Error value produces a safe NO_CREDENTIALS_CONFIGURED message without exposing adapter details", async (t) => {
  const deps = testRouteDeps();
  const failure = "raw string repo failure with private token fixture_adapter_detail";
  const lookup = t.mock.method(deps.sourceControlCredentialSetRepo.vault!, "list", async () => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal -- deliberate non-Error adapter failure.
    throw failure;
  }, {});
  deps.exportSiteBound = async () => { assert.fail("export must not start after a credential lookup fails"); };
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(result.message, "credential could not be resolved: The credential could not be saved or unlocked. Check the site credential store.");
  assert.equal(lookup.mock.callCount(), 1);
  assert.equal((lookup.mock.calls[0]!.arguments[0] as { provider?: string }).provider, "example-git");
  assert.equal(JSON.stringify(result).includes(failure), false);
  assert.doesNotMatch(JSON.stringify(result), /fixture_adapter_detail/);
});

test("commitSiteToSourceControl: a real export runs and its files reach the git adapter, deploy-relative and forward-slashed", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const originalExport = deps.exportSiteBound;
  let exported: ExportReport | undefined;
  deps.exportSiteBound = async (options) => { exported = await originalExport(options); return exported; };
  const captured: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://example-git.com/octo/demo/commit/abc123", filesChanged: 1, filesDeleted: 0 }, captured) },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", branch: "main", commitMessage: "content update" }
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.owner, "octo");
  assert.equal(result.repo, "demo");
  assert.equal(result.branch, "main");
  assert.equal(result.commitSha, "abc123");
  assert.ok(captured.files && captured.files.length > 0, "the real export must produce at least one file");
  assert.ok(exported);
  assert.ok(exported.assets.succeeded.some((asset) => asset.outputFile === path.join("theme-assets", "tovu-starter", "css", "theme.css")));
  assert.ok(captured.files.some((file) => file.path === "index.html"));
  assert.deepEqual(captured.files, [...exported.routes.succeeded, ...exported.assets.succeeded].map((entry) => ({ path: entry.outputFile.split(path.sep).join("/"), data: entry.data })));
  for (const file of captured.files) assert.equal(path.isAbsolute(file.path), false);
  for (const file of captured.files ?? []) {
    assert.ok(!file.path.includes("\\"), `file path '${file.path}' must be forward-slash normalized`);
  }
  const passedInput = captured.input as { token: string; owner: string; repo: string; branch?: string; commitMessage: string };
  assert.equal(passedInput.token, "fixture_fake_token_never_real");
  assert.equal(passedInput.owner, "octo");
  assert.equal(passedInput.repo, "demo");
  assert.equal(passedInput.branch, "main");
  assert.equal(passedInput.commitMessage, "content update");
});

/**
 * Branch-coverage fill (2026-09-04): every other test in this file supplies `deps.gitAdapter` — the
 * "no adapter configured" wiring-bug guard (documented as production-unreachable, since
 * `tool-registrations.ts` always supplies the plugin provider's adapter) was never
 * exercised at all. `CommitSiteDeps.gitAdapter` is optional precisely so this direct-invoke proof is
 * possible without touching `tool-registrations.ts`'s own wiring.
 */
test("commitSiteToSourceControl: an omitted gitAdapter fails loudly as PROVIDER_ERROR, a wiring bug never silently no-op'd", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer } },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "PROVIDER_ERROR");
  assert.match(result.message, /no source control commit adapter is configured — this is a wiring bug/);
});

/**
 * Branch-coverage fill (2026-09-04): `divergedPaths: result.divergedPaths ?? []` — every other success
 * test's `fakeGitAdapter` result omits `divergedPaths` entirely (proving only the `??` fallback side).
 * This proves the adapter's own real value passes through unchanged when present.
 */
test("commitSiteToSourceControl: a git adapter result WITH divergedPaths passes them through verbatim, not just the [] fallback", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const captured: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
  const result = await commitSiteToSourceControl(
    {
      providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer },
      gitAdapter: fakeGitAdapter(
        { ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://example-git.com/octo/demo/commit/abc123", filesChanged: 1, filesDeleted: 1, divergedPaths: ["old-page.html"] },
        captured
      ),
    },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.deepEqual(result.divergedPaths, ["old-page.html"]);
});

test("commitSiteToSourceControl: branch omitted is forwarded to the git adapter as omitted, not a guessed default", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const captured: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
  await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://example-git.com/octo/demo/commit/abc123", filesChanged: 1, filesDeleted: 0 }, captured) },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );
  const passedInput = captured.input as { branch?: string };
  assert.equal("branch" in passedInput, false, "commitSiteToSourceControl must not invent a branch — that decision belongs to the git adapter");
});

const ADAPTER_FAILURE_CASES: { adapterCode: Extract<SourceControlCommitResult, { ok: false }>["code"]; expected: string }[] = [
  { adapterCode: "repository-not-found", expected: "REPOSITORY_NOT_FOUND" },
  { adapterCode: "no-changes", expected: "NO_CHANGES" },
  { adapterCode: "diverged", expected: "DIVERGED_BRANCH" },
  { adapterCode: "network-unreachable", expected: "NETWORK_UNREACHABLE" },
  { adapterCode: "provider-error", expected: "PROVIDER_ERROR" },
];

for (const { adapterCode, expected } of ADAPTER_FAILURE_CASES) {
  test(`commitSiteToSourceControl: a '${adapterCode}' adapter result maps to '${expected}', distinct from every other failure code`, async () => {
    const deps = await withExampleGitCredential(testRouteDeps());
    const captured: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
    const result = await commitSiteToSourceControl(
      { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: false, code: adapterCode, message: `fake ${adapterCode}` }, captured) },
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
  const deps = await withExampleGitCredential(testRouteDeps());
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
  deps.createSiteApp = createSiteAppWithFailingAsset("/theme-assets/tovu-starter/css/theme.css", deps);

  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "content update" }
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "EXPORT_FAILED");
  assert.equal(
    result.message,
    "refused to commit: 1 asset(s) failed to export (first: '/theme-assets/tovu-starter/css/theme.css' — GET /theme-assets/tovu-starter/css/theme.css -> 500)"
  );
});

/**
 * Branch-coverage fill (2026-09-04): `exportForCommit`'s own `try { report = await
 * input.exportSiteBound(...) } catch (err) { ... }` — every OTHER test in this file passes the real
 * `deps.exportSiteBound`, which only ever RETURNS a report (with `routes.failed`/`assets.failed`
 * entries for an export-level failure, proven by the "an asset that fails to export" test above); none
 * ever make the call itself throw. `CommitSiteInput.exportSiteBound` is a plain injected function,
 * so a THROWING fake proves this catch block directly, distinct from the report-shaped failure path.
 */
test("commitSiteToSourceControl: exportSiteBound throwing (not merely returning a failed report) is caught and reported as EXPORT_FAILED, never an unhandled rejection", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    {
      workspaceId: deps.workspaceId,
      sourceControlExportRootDir: deps.sourceControlExportRootDir,
      idGen: deps.idGen,
      exportSiteBound: async () => {
        throw new Error("export engine exploded before producing a report");
      },
      owner: "octo",
      repo: "demo",
      commitMessage: "content update",
    }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "EXPORT_FAILED");
  assert.equal(result.message, "export failed before committing could start: export engine exploded before producing a report");
});

/** Same catch block, the `err instanceof Error` ternary's OTHER arm — a thrown non-`Error` value must
 *  still produce a readable message via `String(err)`, never `[object Object]` or a crash formatting it. */
test("commitSiteToSourceControl: exportSiteBound throwing a non-Error value still produces a readable EXPORT_FAILED message via String(err)", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    {
      workspaceId: deps.workspaceId,
      sourceControlExportRootDir: deps.sourceControlExportRootDir,
      idGen: deps.idGen,
      exportSiteBound: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal -- deliberate: proving the `err
        // instanceof Error` ternary's non-Error arm, not simulating a realistic throw site.
        throw "raw string failure, not an Error instance";
      },
      owner: "octo",
      repo: "demo",
      commitMessage: "content update",
    }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "EXPORT_FAILED");
  assert.equal(result.message, "export failed before committing could start: raw string failure, not an Error instance");
});

/**
 * MEDIUM audit finding (2026-08-19, Codex sol bug/architecture audit): `commitExportDir` used to
 * return one FIXED directory (`<parent>/example-git`) for every commit, and this feature has no
 * concurrency guard at all — not even the process-local single-flight `static-publish/adapter.ts`
 * gets from `publish-run.ts`. Two overlapping commits could `clean:true` and rewrite the same
 * directory out from under each other. See `adapter.unit.test.ts`'s identical `publishOutputDir`
 * test for why this is a direct proof of the fix mechanism (unique per-run isolation) rather than an
 * attempted same-process corruption reproduction — `ExportedRoute`/`ExportedAsset.data` are captured
 * in memory at write time and never re-read from disk, so a same-process race never actually
 * corrupted the returned `CommitFile[]` payload even before this fix.
 */
test("commitExportDir: two different run ids produce two DIFFERENT, non-overlapping directories", () => {
  const a = commitExportDir({ parent: "/source-control-root", providerId: "example-git", runId: "run-a" });
  const b = commitExportDir({ parent: "/source-control-root", providerId: "example-git", runId: "run-b" });
  assert.notEqual(a, b);
  assert.equal(a, path.join("/source-control-root", "example-git", "run-a"));
  assert.equal(b, path.join("/source-control-root", "example-git", "run-b"));
  assert.ok(!a.startsWith(b) && !b.startsWith(a), "neither run's directory may be a parent/child of the other's");
});

/** End-to-end smoke test alongside the direct `commitExportDir` proof above — two concurrent commits
 *  against the identical fixture must both still succeed with a correct, non-empty file set once
 *  `idGen.newId()` is a required part of computing `outputDir`. */
test("commitSiteToSourceControl: two concurrent commits both still succeed with correct file sets", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const capturedA: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };
  const capturedB: { files: readonly CommitFile[] | null; input: unknown } = { files: null, input: null };

  const [resultA, resultB] = await Promise.all([
    commitSiteToSourceControl(
      { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "sha-a", commitUrl: "https://example-git.com/octo/demo/commit/sha-a", filesChanged: 1, filesDeleted: 0 }, capturedA) },
      { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "run a" }
    ),
    commitSiteToSourceControl(
      { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "main", branchCreated: false, commitSha: "sha-b", commitUrl: "https://example-git.com/octo/demo/commit/sha-b", filesChanged: 1, filesDeleted: 0 }, capturedB) },
      { workspaceId: deps.workspaceId, sourceControlExportRootDir: deps.sourceControlExportRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound, owner: "octo", repo: "demo", commitMessage: "run b" }
    ),
  ]);

  assert.equal(resultA.ok, true, `run A must succeed: ${JSON.stringify(resultA)}`);
  assert.equal(resultB.ok, true, `run B must succeed: ${JSON.stringify(resultB)}`);
  assert.ok(capturedA.files && capturedA.files.length > 0, "run A's git adapter must have received a non-empty file set");
  assert.ok(capturedB.files && capturedB.files.length > 0, "run B's git adapter must have received a non-empty file set");
  assert.equal(capturedA.files!.length, capturedB.files!.length, "both concurrent runs against the identical fixture must produce the SAME file count");
});

function controlledReport(outputDir: string, label = "canary"): ExportReport {
  return {
    outputDir,
    routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: `<html>${label} é</html>` }], failed: [] },
    assets: { succeeded: [{ url: "/theme-assets/fixture/image.png", outputFile: path.join("theme-assets", "fixture", "image.png"), data: Buffer.from([0, 128, 255]) }], failed: [] },
    skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [],
  };
}

function controlledInput(deps: RouteDeps, exportSiteBound: CommitSiteInput["exportSiteBound"]): CommitSiteInput {
  return { workspaceId: deps.workspaceId, sourceControlExportRootDir: exportDir, idGen: deps.idGen, exportSiteBound, owner: "octo", repo: "demo", branch: "release/2", commitMessage: "controlled commit" };
}

test('T37: plugin exceptions and unknown error codes become safe PROVIDER_ERROR outcomes', async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const adapters: SourceControlCommitAdapter[] = [
    { commit: async () => { throw new Error('fixture_adapter_detail: fixture_fake_token_never_real'); } },
    { commit: async () => ({ ok: false, code: 'unexpected-plugin-code', message: 'Provider refused the commit.' } as unknown as SourceControlCommitResult) },
  ];
  const outcomes = await Promise.allSettled(adapters.map(gitAdapter => commitSiteToSourceControl({
    providerId: 'example-git',
    credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer },
    gitAdapter,
  }, controlledInput(deps, async ({ outputDir }) => controlledReport(outputDir)))));

  assert.deepEqual(outcomes.map(outcome => outcome.status), ['fulfilled', 'fulfilled']);
  for (const outcome of outcomes) {
    assert.equal(outcome.status, 'fulfilled');
    if (outcome.status !== 'fulfilled') throw new Error('commit must return a typed failure');
    assert.equal(outcome.value.ok, false);
    if (outcome.value.ok) throw new Error('a failed plugin must not report success');
    assert.equal(outcome.value.code, 'PROVIDER_ERROR');
    assert.ok(outcome.value.message.trim().length > 0);
    assert.doesNotMatch(outcome.value.message, /fixture_adapter_detail|fixture_fake_token_never_real/);
  }
});

test("previewCommitExport: counts UTF-8 route bytes and binary assets, sorts and caps paths at 50", async () => {
  const deps = testRouteDeps();
  const expectedPaths = Array.from({ length: 55 }, (_, index) => `page-${String(index).padStart(2, "0")}/index.html`);
  const input = controlledInput(deps, async ({ outputDir }) => {
    const report = controlledReport(outputDir);
    report.routes.succeeded = expectedPaths.slice().reverse().map((outputFile) => ({ path: `/${outputFile}`, kind: "post", outputFile, data: "é" }));
    return report;
  });
  assert.deepEqual(await previewCommitExport(input), { ok: true, fileCount: 56, totalBytes: 55 * 2 + 3, paths: [...expectedPaths, "theme-assets/fixture/image.png"].sort().slice(0, 50) });
  let exports = 0;
  const invalid = { ...input, owner: "invalid owner", exportSiteBound: async () => { exports += 1; assert.fail("invalid preview exported"); } };
  assert.deepEqual(await previewCommitExport(invalid), { ok: false, code: "INVALID_CONFIG", message: "invalid owner 'invalid owner'" });
  assert.equal(exports, 0);
  assert.deepEqual(await previewCommitExport({ ...input, exportSiteBound: async () => { throw new Error("preview canary"); } }), { ok: false, code: "EXPORT_FAILED", message: "export failed before committing could start: preview canary" });
});

test("commitSiteToSourceControl: one failed route blocks all adapter work", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const result = await commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: neverCalledGitAdapter() },
    controlledInput(deps, async ({ outputDir }) => {
      const report = controlledReport(outputDir);
      report.routes.failed = [{ path: "/missing", kind: "post", reason: "expected 200, got 500" }];
      return report;
    }),
  );
  assert.deepEqual(result, { ok: false, code: "EXPORT_FAILED", message: "refused to commit: 1 route(s) failed to export (first: '/missing' — expected 200, got 500)" });
});

test("commitSiteToSourceControl: overlapping exports use distinct run directories and preserve each run's route and asset bytes", async () => {
  const deps = await withExampleGitCredential(testRouteDeps());
  const directories: string[] = [];
  let release!: () => void;
  const overlap = new Promise<void>((resolve) => { release = resolve; });
  const captured = [{ files: null, input: null }, { files: null, input: null }] as Array<{ files: readonly CommitFile[] | null; input: unknown }>;
  const results = await Promise.all(["run-a", "run-b"].map((runId, index) => commitSiteToSourceControl(
    { providerId: "example-git", credentialDeps: { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer }, gitAdapter: fakeGitAdapter({ ok: true, branch: "release/2", branchCreated: true, commitSha: runId, commitUrl: `https://example.test/${runId}`, filesChanged: 2, filesDeleted: 0 }, captured[index]!) },
    { ...controlledInput(deps, async ({ outputDir, clean }) => {
      directories.push(outputDir);
      assert.equal(clean, true);
      if (directories.length === 2) release();
      await overlap;
      const report = controlledReport(outputDir, runId);
      report.assets.succeeded[0]!.data = Buffer.from(runId);
      return report;
    }), idGen: { newId: () => runId } },
  )));
  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.deepEqual(directories.sort(), [commitExportDir({ parent: exportDir, providerId: "example-git", runId: "run-a" }), commitExportDir({ parent: exportDir, providerId: "example-git", runId: "run-b" })].sort());
  assert.notEqual(directories[0], directories[1]);
  for (const [index, runId] of ["run-a", "run-b"].entries()) {
    assert.deepEqual(captured[index]!.input, { token: "fixture_fake_token_never_real", owner: "octo", repo: "demo", branch: "release/2", commitMessage: "controlled commit", files: [
      { path: "index.html", data: `<html>${runId} é</html>` }, { path: "theme-assets/fixture/image.png", data: Buffer.from(runId) },
    ] });
  }
});

test('staging directories isolate providers even when their run ids match', () => {
  const parent = '/source-control-root';
  assert.equal(commitExportDir({ parent, providerId: 'example-a', runId: 'same-run' }), path.join(parent, 'example-a', 'same-run'));
  assert.notEqual(commitExportDir({ parent, providerId: 'example-a', runId: 'same-run' }), commitExportDir({ parent, providerId: 'example-b', runId: 'same-run' }));
});

test('preview passes its provider id to the same isolated exporter used by a commit', async () => {
  let captured: string | undefined;
  const result = await previewCommitExport({
    workspaceId: 'example-workspace', owner: 'acme', repo: 'site', commitMessage: 'preview',
    sourceControlExportRootDir: exportDir, idGen: { newId: () => 'preview-run' },
    exportSiteBound: async ({ outputDir }) => {
      captured = outputDir;
      return { outputDir, routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
    },
  }, { providerId: 'example-b', validateTarget: () => null });
  assert.equal(captured, path.join(exportDir, 'example-b', 'preview-run'));
  assert.deepEqual(result, { ok: true, fileCount: 0, totalBytes: 0, paths: [] });
});
