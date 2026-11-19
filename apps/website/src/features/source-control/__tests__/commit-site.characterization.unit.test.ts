import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { SecretSealerPort } from "@jini-ai/integrations/webhooks";
import type { ExportReport } from "#src/contracts/core/export-report";
import {
  commitExportDir,
  commitSiteToSourceControl,
  previewCommitExport,
  type CommitSiteDeps,
  type CommitSiteInput,
  type SourceControlCommitAdapter,
  type SourceControlCommitOutcome,
} from "../commit-site.js";
import type { SourceControlCommitResult, RepositoryTargetValidator } from "../provider-module.js";
import { createStaticSitePackager } from "../../site-backup/static-site-packager.js";
import type { SourceControlCredentialSetRepoPort } from "../types.js";

/**
 * @file Characterization of `commit-site.ts` BEFORE it becomes a binding over Jini's orchestration
 * (left-out-areas sheet SC-2a). Every test is green on the unmodified file; each carries the one-line
 * V3 mutation that must turn it red. Everything the file depends on is an in-memory fake of its
 * interface (credential reader, sealer, export call, id source, git adapter) so a pin here can only
 * break because `commit-site.ts` changed, never because a database or network did.
 *
 * Messages below are pinned byte for byte on purpose: they are what a person reads in the assistant.
 */

const TOKEN = "fixture_fake_token_never_real";
const PROVIDER = "example-git";
const STORAGE_MESSAGE = "credential could not be resolved: The credential could not be saved or unlocked. Check the site credential store.";
const NO_CREDENTIAL_MESSAGE = "No source control credential is configured for 'example-git'. Connect one in the admin's Source Control page first.";
const PROVIDER_FAILED_MESSAGE = "the source control provider failed while committing";
const ok = { ok: true, branch: "main", branchCreated: false, commitSha: "sha", commitUrl: "https://example.test/sha", filesChanged: 5, filesDeleted: 0 } as const;

const root = mkdtempSync(path.join(tmpdir(), "tovu-commit-site-characterization-"));
test.after(() => rmSync(root, { recursive: true, force: true }));

type CredentialMode = "default" | "absent" | "throws" | "wrong-provider";
interface Scenario {
  credential?: CredentialMode;
  /** `undefined` = the host passes no saved-key reader at all. */
  savedKey?: "token" | "absent" | "throws";
  adapter?: "none" | ((input: Parameters<SourceControlCommitAdapter["commit"]>[0]) => Promise<SourceControlCommitResult>);
  report?: (outputDir: string) => ExportReport;
  exportThrows?: unknown;
  contextThrows?: unknown;
  supportsFolder?: boolean;
  validateTarget?: RepositoryTargetValidator;
  input?: Partial<CommitSiteInput>;
}
interface Run {
  events: string[];
  outputDirs: string[];
  adapterInputs: Parameters<SourceControlCommitAdapter["commit"]>[0][];
  deps: CommitSiteDeps;
  input: CommitSiteInput;
}

function report(outputDir: string): ExportReport {
  return {
    outputDir,
    routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<html>home</html>" }], failed: [] },
    assets: { succeeded: [{ url: "/theme-assets/fixture/image.png", outputFile: path.join("theme-assets", "fixture", "image.png"), data: Buffer.from([0, 128, 255]) }], failed: [] },
    skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [],
  };
}

async function repoNeverRead(): Promise<never> {
  throw new Error("the repository must not be read: the canonical reader answers");
}

function credentialRepo(run: Pick<Run, "events">, mode: CredentialMode): SourceControlCredentialSetRepoPort {
  const resolve: NonNullable<SourceControlCredentialSetRepoPort["canonical"]>["resolve"] = async () => {
    run.events.push("credential");
    if (mode === "throws") throw new Error("vault exploded with private detail");
    if (mode === "absent") return null;
    return { id: "cred-1", label: "Test", connection: { providerId: mode === "default" ? PROVIDER : "other-git", token: TOKEN } };
  };
  return {
    canonical: { supports: () => true, describe: repoNeverRead, resolve },
    insert: repoNeverRead, update: repoNeverRead, findById: repoNeverRead,
    findDefaultByProvider: repoNeverRead, listByProvider: repoNeverRead, listByWorkspace: repoNeverRead, delete: repoNeverRead,
  };
}

const sealerNeverUsed: SecretSealerPort = { seal: repoNeverRead, open: repoNeverRead };

function savedKeyReader(run: Pick<Run, "events">, kind: Scenario["savedKey"]): NonNullable<CommitSiteDeps["credentialDeps"]["resolveSavedApiKey"]> | undefined {
  if (kind === undefined) return undefined;
  return async () => {
    run.events.push("saved-key");
    if (kind === "throws") throw new Error("saved key reader exploded");
    return kind === "token" ? { token: "saved_api_key_value" } : null;
  };
}

function gitAdapter(run: Run, behavior: Exclude<Scenario["adapter"], "none">): SourceControlCommitAdapter {
  return {
    commit: async (input) => {
      run.events.push("adapter");
      run.adapterInputs.push(input);
      return (behavior ?? (async () => ({ ...ok })))(input);
    },
  };
}

function setup(scenario: Scenario = {}): Run {
  const run = { events: [], outputDirs: [], adapterInputs: [] } as unknown as Run;
  let nextRun = 0;
  const validateTarget: RepositoryTargetValidator = (target) => { run.events.push("validate"); return scenario.validateTarget?.(target) ?? null; };
  run.deps = {
    providerId: PROVIDER,
    supportsFolder: scenario.supportsFolder,
    validateTarget,
    credentialDeps: { repo: credentialRepo(run, scenario.credential ?? "default"), sealer: sealerNeverUsed, resolveSavedApiKey: savedKeyReader(run, scenario.savedKey) },
    ...(scenario.adapter === "none" ? {} : { gitAdapter: gitAdapter(run, scenario.adapter) }),
  };
  run.input = {
    workspaceId: "11111111-1111-4111-8111-111111111111" as CommitSiteInput["workspaceId"],
    sourceControlExportRootDir: root,
    idGen: { newId: () => { nextRun += 1; return `run-${nextRun}`; } },
    packager: createStaticSitePackager(),
    staticSiteContext: async () => {
      if (scenario.contextThrows !== undefined) throw scenario.contextThrows;
      return { name: "Demo", slug: "demo", theme: "Fixture", themeId: "fixture" };
    },
    exportSiteBound: async ({ outputDir }) => {
      run.events.push("export");
      run.outputDirs.push(outputDir);
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, "marker.txt"), "written by the export");
      if (scenario.exportThrows !== undefined) throw scenario.exportThrows;
      return (scenario.report ?? report)(outputDir);
    },
    owner: "octo", repo: "demo", commitMessage: "content update",
    ...scenario.input,
  };
  return run;
}

function failure(outcome: SourceControlCommitOutcome | Awaited<ReturnType<typeof previewCommitExport>>): { code: string; message: string } {
  if (outcome.ok) assert.fail(`expected a refusal, got success: ${JSON.stringify(outcome)}`);
  return { code: outcome.code, message: outcome.message };
}

// V3: in `validateCommitTarget` (commit-site.ts:92) change the `commitMessage must be 1-` text, the `invalid branch name '` text,
// or drop the `folder && deps.supportsFolder !== true` guard (:477): the matching row goes red.
test("every target refusal is returned byte for byte, before any credential or export work", async () => {
  const long = "x".repeat(501);
  const cases: { name: string; scenario: Scenario; message: string }[] = [
    { name: "host owner rule", scenario: { validateTarget: () => "invalid Example owner 'bad'" }, message: "invalid Example owner 'bad'" },
    { name: "generic owner rule", scenario: { input: { owner: "a/b" } }, message: "invalid owner 'a/b'" },
    { name: "generic repo rule", scenario: { input: { repo: ".." } }, message: "invalid repo '..'" },
    { name: "invalid branch", scenario: { input: { branch: "not a branch" } }, message: "invalid branch name 'not a branch'" },
    { name: "empty commit message", scenario: { input: { commitMessage: "  " } }, message: "commitMessage must be 1-500 characters" },
    { name: "commit message too long", scenario: { input: { commitMessage: long } }, message: "commitMessage must be 1-500 characters" },
    { name: "folder unsupported by the provider", scenario: { input: { folder: "docs" } }, message: "This provider does not support folder commits." },
  ];
  for (const { name, scenario, message } of cases) {
    const run = setup(scenario);
    const outcome = failure(await commitSiteToSourceControl(run.deps, run.input));
    assert.deepEqual(outcome, { code: "INVALID_CONFIG", message }, name);
    assert.ok(!run.events.includes("credential") && !run.events.includes("export") && !run.events.includes("adapter"), `${name}: nothing else may run (${run.events.join(",")})`);
  }
});

// V3: in `normalizeRepositoryFolder`'s caller (commit-site.ts:104-105) replace `(error as Error).message` with a fixed string.
test("an invalid folder returns the folder rule's own sentence as INVALID_CONFIG", async () => {
  const run = setup({ supportsFolder: true, input: { folder: "../escape" } });
  const outcome = failure(await commitSiteToSourceControl(run.deps, run.input));
  assert.deepEqual(outcome, { code: "INVALID_CONFIG", message: "Target folder cannot contain . or .. segments." });
  assert.deepEqual(run.events, ["validate"]);
});

// V3: in `resolveCommitCredential` (commit-site.ts:346) change the `credential could not be resolved: ` prefix, or
// (:353) the `No source control credential is configured for` text, or (:362) the wrong-provider sentence.
test("every credential refusal is returned byte for byte and stops before the export", async () => {
  const cases: { name: string; scenario: Scenario; message: string }[] = [
    { name: "credential storage failure", scenario: { credential: "throws" }, message: STORAGE_MESSAGE },
    { name: "no credential", scenario: { credential: "absent" }, message: NO_CREDENTIAL_MESSAGE },
    { name: "wrong provider", scenario: { credential: "wrong-provider" }, message: "The resolved default credential is not a 'example-git' connection." },
    { name: "saved key reader throws", scenario: { credential: "absent", savedKey: "throws" }, message: STORAGE_MESSAGE },
    { name: "saved key reader finds nothing", scenario: { credential: "absent", savedKey: "absent" }, message: NO_CREDENTIAL_MESSAGE },
  ];
  for (const { name, scenario, message } of cases) {
    const run = setup(scenario);
    const outcome = failure(await commitSiteToSourceControl(run.deps, run.input));
    assert.deepEqual(outcome, { code: "NO_CREDENTIALS_CONFIGURED", message }, name);
    assert.ok(!run.events.includes("export") && !run.events.includes("adapter"), `${name}: export and adapter must not run (${run.events.join(",")})`);
    assert.doesNotMatch(outcome.message, new RegExp(`${TOKEN}|private detail|exploded`), name);
  }
});

// V3: in `exportForCommit` (commit-site.ts:385) change `export failed before committing could start: `, or (:399) the
// `refused to commit:` summary, or (:412) the `Static site destination validation failed: ` prefix, or (:414) the generic sentence.
test("every export refusal is returned byte for byte and the adapter is never called", async () => {
  const collide = (outputDir: string) => {
    const base = report(outputDir);
    base.assets.succeeded = ["css/main.css", "styles/main.css/child.css"].map((asset) => ({ url: `/theme-assets/fixture/${asset}`, outputFile: `theme-assets/fixture/${asset}`, data: Buffer.from("body {}") }));
    return base;
  };
  const failedRoute = (outputDir: string) => ({ ...report(outputDir), routes: { succeeded: [], failed: [{ path: "/missing", kind: "post", reason: "expected 200, got 500" }] } });
  const failedAsset = (outputDir: string) => ({ ...report(outputDir), assets: { succeeded: [], failed: [{ url: "/m/photo.png", reason: "expected 200, got 404" }] } });
  const escaping = (outputDir: string) => { const base = report(outputDir); base.routes.succeeded[0]!.outputFile = "../outside.html"; return base; };
  const cases: { name: string; scenario: Scenario; message: string | RegExp }[] = [
    { name: "export throws an Error", scenario: { exportThrows: new Error("export engine exploded") }, message: "export failed before committing could start: export engine exploded" },
    { name: "export throws a non-Error", scenario: { exportThrows: "plain text failure" }, message: "export failed before committing could start: plain text failure" },
    { name: "site context throws", scenario: { contextThrows: new Error("no site context") }, message: "export failed before committing could start: no site context" },
    { name: "route failed", scenario: { report: failedRoute }, message: "refused to commit: 1 route(s) failed to export (first: '/missing' — expected 200, got 500)" },
    { name: "asset failed", scenario: { report: failedAsset }, message: "refused to commit: 1 asset(s) failed to export (first: '/m/photo.png' — expected 200, got 404)" },
    { name: "packaging collision", scenario: { report: collide }, message: /^Static site destination validation failed: .*collision/i },
    { name: "packaging generic", scenario: { report: escaping }, message: "Static site packaging failed before committing could start." },
  ];
  for (const { name, scenario, message } of cases) {
    const run = setup(scenario);
    const outcome = failure(await commitSiteToSourceControl(run.deps, run.input));
    assert.equal(outcome.code, "EXPORT_FAILED", name);
    if (typeof message === "string") assert.equal(outcome.message, message, name);
    else assert.match(outcome.message, message, name);
    assert.ok(!run.events.includes("adapter"), `${name}: adapter must not run (${run.events.join(",")})`);
  }
});

// V3: in `commitSiteToSourceControl` (commit-site.ts:508) change the fixed sentence, or return `error.message` instead.
test("a provider that throws returns one fixed sentence and logs detail only to the log", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args); });
  const run = setup({ adapter: async () => { throw new Error(`provider detail with ${TOKEN}`); } });
  const outcome = failure(await commitSiteToSourceControl(run.deps, run.input));
  assert.deepEqual(outcome, { code: "PROVIDER_ERROR", message: PROVIDER_FAILED_MESSAGE });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]![0], "[source-control] source control provider could not commit; the commit remains incomplete");
});

// V3: in `commitSiteToSourceControl` (commit-site.ts:490) change the wiring-bug sentence or drop the `!gitAdapter` guard's return.
test("a missing git adapter is a loud wiring refusal after the export, never a silent success", async () => {
  const run = setup({ adapter: "none" });
  const outcome = failure(await commitSiteToSourceControl(run.deps, run.input));
  assert.deepEqual(outcome, { code: "PROVIDER_ERROR", message: "no source control commit adapter is configured — this is a wiring bug, not a credential or network problem" });
  assert.deepEqual(run.events, ["validate", "credential", "export"]);
});

// V3: in `commitOutcome` (commit-site.ts:536-546) drop `folder`, `entryPath`, or the `divergedPaths ?? []` default: the deepEqual goes red.
test("the success object carries folder, entryPath, the commit facts and a defaulted divergedPaths", async () => {
  const root1 = setup({});
  assert.deepEqual(await commitSiteToSourceControl(root1.deps, { ...root1.input, branch: "release/2" }), {
    ok: true, owner: "octo", repo: "demo", folder: "", entryPath: "index.html", branch: "main", branchCreated: false,
    commitSha: "sha", commitUrl: "https://example.test/sha", filesChanged: 5, filesDeleted: 0, divergedPaths: [],
  });
  const folder = setup({ supportsFolder: true, adapter: async () => ({ ...ok, branchCreated: true, filesDeleted: 2, divergedPaths: ["old/a.html"] }), input: { folder: "nested\\static_sites//" } });
  assert.deepEqual(await commitSiteToSourceControl(folder.deps, folder.input), {
    ok: true, owner: "octo", repo: "demo", folder: "nested/static_sites", entryPath: "nested/static_sites/index.html", branch: "main", branchCreated: true,
    commitSha: "sha", commitUrl: "https://example.test/sha", filesChanged: 5, filesDeleted: 2, divergedPaths: ["old/a.html"],
  });
});

// V3: in `commitSiteToSourceControl` (commit-site.ts:495-503) spread `branch: undefined` unconditionally, rename `files`, or pass a different token.
test("the adapter receives the token, target, normalized folder, message and the packaged files, and `branch` only when given", async () => {
  const withoutBranch = setup({});
  await commitSiteToSourceControl(withoutBranch.deps, withoutBranch.input);
  const first = withoutBranch.adapterInputs[0]!;
  assert.deepEqual(Object.keys(first).sort(), ["commitMessage", "files", "folder", "owner", "repo", "token"]);
  assert.deepEqual({ token: first.token, owner: first.owner, repo: first.repo, folder: first.folder, commitMessage: first.commitMessage },
    { token: TOKEN, owner: "octo", repo: "demo", folder: "", commitMessage: "content update" });
  assert.deepEqual(first.files.map((file) => file.path).sort(), ["README.txt", "index.html", "sites/fixture/images/image.png", "sites/fixture/index.html"]);
  const withBranch = setup({});
  await commitSiteToSourceControl(withBranch.deps, { ...withBranch.input, branch: "release/2" });
  assert.equal(withBranch.adapterInputs[0]!.branch, "release/2");
});

// V3: in `commitOutcome` (commit-site.ts:530) return `result.message` unredacted; in :527 use `result.code in codeByAdapterCode`.
test("a provider's refusal never carries the token, maps each known code, and sends an unknown code to PROVIDER_ERROR", async () => {
  const mapped = { "repository-not-found": "REPOSITORY_NOT_FOUND", "no-changes": "NO_CHANGES", diverged: "DIVERGED_BRANCH", "network-unreachable": "NETWORK_UNREACHABLE", "provider-error": "PROVIDER_ERROR", "never-heard-of-it": "PROVIDER_ERROR", constructor: "PROVIDER_ERROR" };
  for (const [adapterCode, code] of Object.entries(mapped)) {
    const run = setup({ adapter: async () => ({ ok: false, code: adapterCode, message: `refused for ${TOKEN} by the host` } as unknown as SourceControlCommitResult) });
    const outcome = failure(await commitSiteToSourceControl(run.deps, run.input));
    assert.equal(outcome.code, code, adapterCode);
    assert.doesNotMatch(outcome.message, new RegExp(TOKEN), adapterCode);
    assert.equal(outcome.message, "refused for [REDACTED:exact_secret] by the host", adapterCode);
  }
});

// V3: reorder the four phases in `commitSiteToSourceControl` (commit-site.ts:473-483), e.g. call `exportForCommit` before `resolveCommitCredential`.
test("the phases run in the order validate, credential, export, adapter", async () => {
  const run = setup({});
  const outcome = await commitSiteToSourceControl(run.deps, run.input);
  assert.equal(outcome.ok, true);
  assert.deepEqual(run.events, ["validate", "credential", "export", "adapter"]);
});

// V3: in `resolveCommitCredential` (commit-site.ts:330) delete the `!credential &&` condition (always ask the saved-key reader),
// or move the `resolveSavedApiKey` call out of the `try` (:334).
test("the saved API key is asked only when the default credential is absent, and not when the store throws", async () => {
  const present = setup({ credential: "default", savedKey: "token" });
  await commitSiteToSourceControl(present.deps, present.input);
  assert.deepEqual(present.events, ["validate", "credential", "export", "adapter"]);
  assert.equal(present.adapterInputs[0]!.token, TOKEN);

  const absent = setup({ credential: "absent", savedKey: "token" });
  await commitSiteToSourceControl(absent.deps, absent.input);
  assert.deepEqual(absent.events, ["validate", "credential", "saved-key", "export", "adapter"]);
  assert.equal(absent.adapterInputs[0]!.token, "saved_api_key_value");

  const storeThrows = setup({ credential: "throws", savedKey: "token" });
  const outcome = failure(await commitSiteToSourceControl(storeThrows.deps, storeThrows.input));
  assert.equal(outcome.message, STORAGE_MESSAGE);
  assert.deepEqual(storeThrows.events, ["validate", "credential"]);
});

// V3: delete the `cleanupCommitRunDir({ outputDir })` call at commit-site.ts:387 (after a return) or at :384 (after a throw).
test("the run directory is gone after a success, after a provider throw, after an export throw and after a failed report", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const scenarios: [string, Scenario][] = [
    ["success", {}],
    ["provider throw", { adapter: async () => { throw new Error("boom"); } }],
    ["export throw", { exportThrows: new Error("boom") }],
    ["failed report", { report: (outputDir) => ({ ...report(outputDir), routes: { succeeded: [], failed: [{ path: "/x", kind: "post", reason: "no" }] } }) }],
  ];
  for (const [name, scenario] of scenarios) {
    const run = setup(scenario);
    await commitSiteToSourceControl(run.deps, run.input);
    assert.deepEqual(run.outputDirs.length, 1, name);
    assert.equal(run.outputDirs[0], commitExportDir({ parent: root, providerId: PROVIDER, runId: "run-1" }), name);
    assert.equal(existsSync(run.outputDirs[0]!), false, `${name}: the run directory must be removed`);
  }
});

// V3: in `previewCommitExport` (commit-site.ts:436-444) call `resolveCommitCredential`, change the `providerId = "preview"` default, the sort, or the 50 cap.
test("previewCommitExport summarizes the real export, refuses like the commit, and never touches the credential or the adapter", async () => {
  const committed = setup({});
  await commitSiteToSourceControl(committed.deps, committed.input);
  const files = committed.adapterInputs[0]!.files;
  const run = setup({});
  assert.deepEqual(await previewCommitExport(run.input, { validateTarget: run.deps.validateTarget }), {
    ok: true,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.data), 0),
    paths: ["README.txt", "index.html", "sites/fixture/images/image.png", "sites/fixture/index.html"],
  });
  assert.equal(files.length, 4);
  assert.deepEqual(run.events, ["validate", "export"]);
  assert.equal(run.outputDirs[0], commitExportDir({ parent: root, providerId: "preview", runId: "run-1" }));
  assert.equal(existsSync(run.outputDirs[0]!), false);

  const invalid = setup({ input: { owner: "a/b" } });
  assert.deepEqual(await previewCommitExport(invalid.input), { ok: false, code: "INVALID_CONFIG", message: "invalid owner 'a/b'" });
  const failed = setup({ exportThrows: new Error("boom") });
  assert.deepEqual(await previewCommitExport(failed.input), { ok: false, code: "EXPORT_FAILED", message: "export failed before committing could start: boom" });
});
