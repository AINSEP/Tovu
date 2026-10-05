import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";

import { createRouteDeps } from "#src/server/runtime/composition/app";

import type { StaticPublishDeps, StaticPublishInput } from "../adapter.js";
import { InMemoryPublishHistoryStore } from "../publish-history.js";
import { getPublishRunSnapshot, runPublishAndAwait, startPublishRun } from "../publish-run.js";
import type { PublishCredentialSource } from "../types.js";

/**
 * @file `publish-run.ts`'s publish-history wiring (Defect 2, 2026-08-16) — the single-flight guard
 * itself (`currentRun`) has no dedicated suite prior to this file (it was previously only exercised
 * indirectly through `publish-agent-tools.unit.test.ts`'s tool-level tests); this file adds direct
 * coverage for the NEW behavior only — recording history through both of this module's entry points,
 * and only when a publish actually produced something to record.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-run-test-"));
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

const clock = { nowIso: () => "2026-08-16T12:00:00.000Z" };

/** The hermetic fixture, with `publishOutputRootDir` redirected to this file's own throwaway temp
 *  dir — `publishStaticSite` reads this field instead of `process.env.TOVU_PUBLISH_DIR` (adapter.ts
 *  no longer reads env vars at all), so overriding it here is what keeps this suite's real
 *  `exportSite` writes off the checked-out repo.
 *
 *  MUTATES the object `createRouteDeps()` returns rather than spreading a copy — same
 *  `RouteDeps.exportSiteBound` closure-identity gotcha `adapter.unit.test.ts`'s identical fixture
 *  documents (2026-08-20 RouteDeps-narrowing fix); no test in THIS file currently overrides a field
 *  the closure reads internally, but mutating keeps this fixture consistent with its siblings rather
 *  than reintroducing the trap for a future test here. */
function testRouteDeps(): ReturnType<typeof createRouteDeps> {
  const deps = createRouteDeps();
  deps.publishOutputRootDir = publishOutputDir;
  return deps;
}

function fakeDeployTarget(url = "https://example.test/published", status: DeployPublishResult["status"] = "ready", deploymentId?: string, providerMetadata?: Record<string, unknown>): DeployTarget {
  return {
    id: "fake",
    async publish(_input: DeployPublishInput): Promise<DeployPublishResult> {
      return { targetId: "fake", url, status, ...(deploymentId !== undefined ? { deploymentId } : {}), ...(providerMetadata !== undefined ? { providerMetadata } : {}) };
    },
    async checkReachability() {
      return { reachable: true, status: "ready" as const };
    },
  };
}

function partialDeployTarget(): DeployTarget {
  return {
    id: "fake-partial",
    async publish(): Promise<DeployPublishResult> {
      return { targetId: "fake-partial", url: "https://example.test/bucket", status: "link-delayed", statusMessage: "not reachable yet" };
    },
    async checkReachability() {
      return { reachable: false };
    },
  };
}

function failingDeployTarget(): DeployTarget {
  return {
    id: "fake-failing",
    async publish() {
      throw new Error("provider rejected the request");
    },
    async checkReachability() {
      return { reachable: true, status: "ready" as const };
    },
  };
}

function fakeCredentialSource(): PublishCredentialSource {
  return {
    async resolve() {
      return { ok: true, token: "fake-token-never-real" };
    },
    async isConfigured() {
      throw new Error("not used by publishStaticSite");
    },
  };
}

function githubInput(routeDeps: ReturnType<typeof createRouteDeps>): StaticPublishInput {
  return {
    workspaceId: routeDeps.workspaceId,
    publishOutputRootDir: routeDeps.publishOutputRootDir,
    idGen: routeDeps.idGen,
    exportSiteBound: routeDeps.exportSiteBound,
    config: { target: "github-pages", owner: "octo", repo: "my-site" },
    projectName: "my-site-release",
  };
}

test("the snapshot is idle with no timestamps, target, result, or error before the first run", () => {
  assert.deepEqual(getPublishRunSnapshot(), { status: "idle", startedAtIso: null, finishedAtIso: null, target: null });
});

test("runPublishAndAwait: a full success records history with owner/repo/basePath/branch/commitSha, reachable:true, triggeredBy:agent_tool", async () => {
  const routeDeps = testRouteDeps();
  // owner/repo/branch/commitSha are the HOST's own facts (`providerMetadata`), not the request's:
  // the branch here differs from the config's (absent) one to prove which side is read.
  const providerMetadata = { owner: "octo", repo: "my-site", branch: "gh-pages", commitSha: "commit-sha-abc123", branchCreated: false };
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://example.test/published", "ready", "commit-sha-abc123", providerMetadata) };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  const outcome = await runPublishAndAwait(deps, input, clock, history);
  assert.equal(outcome.ok, true);

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" });
  assert.ok(recorded, "a successful publish must be recorded");
  assert.equal(recorded!.url, "https://example.test/published");
  assert.equal(recorded!.reachable, true);
  assert.equal(recorded!.status, "ready");
  assert.equal(recorded!.projectName, "my-site-release");
  assert.equal(recorded!.publishedAt, "2026-08-16T12:00:00.000Z");
  assert.equal(recorded!.owner, "octo");
  assert.equal(recorded!.repo, "my-site");
  assert.equal(recorded!.basePath, "/my-site");
  // Read off the outcome's providerMetadata (strings only), so core names no host.
  assert.equal(recorded!.branch, "gh-pages");
  assert.equal(recorded!.deploymentId, "commit-sha-abc123");
  assert.equal(recorded!.commitSha, "commit-sha-abc123");
  assert.equal(recorded!.triggeredBy, "agent_tool", "runPublishAndAwait is the agent tool's own entry point");
});

test("runPublishAndAwait: history's owner/repo/branch/commitSha come from providerMetadata, never the request config; non-string metadata is dropped", async () => {
  const routeDeps = testRouteDeps();
  const providerMetadata = { owner: "octo", repo: "my-site", branch: "main", commitSha: "sha-from-host", branchCreated: true };
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://example.test/p", "ready", "dpl-other", providerMetadata) };
  const history = new InMemoryPublishHistoryStore();

  await runPublishAndAwait(deps, { ...githubInput(routeDeps), config: { target: "github-pages", owner: "octo", repo: "my-site", branch: "gh-pages" } }, clock, history);

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" });
  assert.ok(recorded);
  assert.equal(recorded!.branch, "main");
  assert.equal(recorded!.commitSha, "sha-from-host");
  assert.equal(recorded!.deploymentId, "dpl-other");

  const invalidMetadata = { owner: 123, repo: {}, branch: false, commitSha: null };
  const invalidDeps = { ...deps, buildTarget: () => fakeDeployTarget("https://example.test/invalid", "ready", "dpl-invalid", invalidMetadata) };
  const outcome = await runPublishAndAwait(invalidDeps, githubInput(routeDeps), clock, history);
  assert.equal(outcome.ok, true);
  const dropped = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" });
  assert.ok(dropped);
  for (const key of ["owner", "repo", "branch", "commitSha"] as const) {
    assert.equal(Object.hasOwn(dropped, key), false, `${key} must be absent for non-string metadata`);
  }
  assert.equal(dropped.deploymentId, "dpl-invalid");
});

test("runPublishAndAwait: a non-github-pages target never carries commitSha/branch, even though deploymentId is still recorded verbatim", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://demo.vercel.app", "ready", "dpl_not_a_commit") };
  const history = new InMemoryPublishHistoryStore();
  const input: StaticPublishInput = { workspaceId: routeDeps.workspaceId, publishOutputRootDir: routeDeps.publishOutputRootDir, idGen: routeDeps.idGen, exportSiteBound: routeDeps.exportSiteBound, config: { target: "vercel" }, projectName: "demo" };

  await runPublishAndAwait(deps, input, clock, history);

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "vercel" });
  assert.ok(recorded);
  assert.equal(recorded!.deploymentId, "dpl_not_a_commit", "deploymentId is carried through for every target");
  assert.equal(recorded!.commitSha, undefined, "vercel's deploymentId is a Vercel deploy id, NOT a git commit sha");
  assert.equal(recorded!.branch, undefined);
  assert.equal(recorded!.owner, undefined);
  assert.equal(recorded!.repo, undefined);
});

test("runPublishAndAwait: a partial (uploaded, not yet reachable) outcome is still recorded, with reachable:false", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => partialDeployTarget() };
  const history = new InMemoryPublishHistoryStore();
  const input: StaticPublishInput = { workspaceId: routeDeps.workspaceId, publishOutputRootDir: routeDeps.publishOutputRootDir, idGen: routeDeps.idGen, exportSiteBound: routeDeps.exportSiteBound, config: { target: "s3-compatible" }, projectName: "demo" };

  const outcome = await runPublishAndAwait(deps, input, clock, history);
  assert.equal(outcome.ok, "partial");

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "s3-compatible" });
  assert.ok(recorded);
  assert.equal(recorded!.reachable, false);
  assert.equal(recorded!.url, "https://example.test/bucket");
});

test("runPublishAndAwait: a failed outcome is never recorded — no history for a publish that did not happen", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => failingDeployTarget() };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  const outcome = await runPublishAndAwait(deps, input, clock, history);
  assert.equal(outcome.ok, false);

  assert.equal(await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" }), null);
});

test("runPublishAndAwait: a history-store failure never changes the reported outcome — best-effort only", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget() };
  /** The real in-memory store, except every write fails. */
  class BrokenHistoryStore extends InMemoryPublishHistoryStore {
    override async recordSuccess(): Promise<never> {
      throw new Error("disk full");
    }
  }
  const brokenHistory = new BrokenHistoryStore();
  const input = githubInput(routeDeps);

  const outcome = await runPublishAndAwait(deps, input, clock, brokenHistory);
  assert.equal(outcome.ok, true, "the real, successful outcome must still be returned even though recording it failed");
});

test("startPublishRun: the fire-and-forget path records history too, once the background publish settles", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://example.test/bg", "ready") };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  const started = startPublishRun(deps, input, clock, history);
  assert.equal(started.status, "running");
  assert.equal(getPublishRunSnapshot().status, "running");

  // Bounded poll — the same "wait for the shared snapshot to leave 'running'" contract this file's
  // own `getPublishRunSnapshot` exists to answer; a real export against the hermetic fixture is fast
  // but genuinely asynchronous (real route fetches), so a single microtask flush is not sufficient.
  const deadline = Date.now() + 5000;
  while (getPublishRunSnapshot().status === "running" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(getPublishRunSnapshot().status, "completed");

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" });
  assert.ok(recorded, "startPublishRun's background settlement must record history the same way runPublishAndAwait does");
  assert.equal(recorded!.url, "https://example.test/bg");
  assert.equal(recorded!.triggeredBy, "admin_ui", "startPublishRun is the admin route's own entry point");
});


for (const mode of ["awaited", "background"] as const) {
  test(`${mode} unexpected publish failure settles the run with its error and permits the next run`, { timeout: 5000 }, async () => {
    const routeDeps = testRouteDeps();
    const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => assert.fail("must not build") };
    const history = new InMemoryPublishHistoryStore();
    const failure = new Error("run ID generation failed");
    const input = { ...githubInput(routeDeps), idGen: { newId: () => { throw failure; } }, exportSiteBound: async () => assert.fail("must not export") };
    if (mode === "awaited") {
      const run = runPublishAndAwait(deps, input, clock, history);
      assert.equal(getPublishRunSnapshot().status, "running");
      await assert.rejects(run, (error) => error === failure);
    } else {
      assert.equal(startPublishRun(deps, input, clock, history).status, "running");
      const deadline = Date.now() + 2000;
      while (getPublishRunSnapshot().status === "running" && Date.now() < deadline) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    assert.deepEqual(getPublishRunSnapshot(), { status: "errored", startedAtIso: "2026-08-16T12:00:00.000Z", finishedAtIso: "2026-08-16T12:00:00.000Z", target: "github-pages", error: "run ID generation failed" });
    assert.equal(await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" }), null);
    // A normal refusal can start and settle after the unexpected failure.
    const recovered = await runPublishAndAwait(deps, { ...input, projectName: "" }, clock, history);
    assert.deepEqual(recovered, { ok: false, code: "INVALID_CONFIG", message: "projectName must be 1-200 characters" });
    assert.equal(getPublishRunSnapshot().error, undefined);
  });
}
