import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";

import { createRouteDeps } from "#src/server/runtime/composition/app";

import type { StaticPublishDeps, StaticPublishInput } from "../adapter.js";
import { InMemoryPublishHistoryStore, listStaticPublishDestinations } from "../publish-history.js";
import { getPublishRunSnapshot, startPublishRun } from "../publish-run.js";
import type { PublishCredentialSource } from "../types.js";
import { createDbPublishCredentialSource } from "../credentials.js";
import { createPublishCredential, deletePublishCredential } from "../../publish-credentials/store.js";
import { InMemoryVendorCredentialSetRepo } from "../../publish-credentials/repo.memory.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file `publish-run.ts`'s publish-history wiring (Defect 2, 2026-08-16) — the single-flight guard
 * itself (`currentRun`) has no dedicated suite prior to this file (it was previously only exercised
 * indirectly through `publish-agent-tools.unit.test.ts`'s tool-level tests); this file adds direct
 * coverage for the NEW behavior only — recording history through the shared production entrypoint,
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

/** Await the production entrypoint's settlement hook, without polling or sleeping. */
function runPublishForTest(deps: StaticPublishDeps, input: StaticPublishInput, clock: { nowIso(): string }, history: InMemoryPublishHistoryStore): Promise<import('../types.js').StaticPublishOutcome> {
  return new Promise((resolve, reject) => startPublishRun(deps, input, clock, history, {
    triggeredBy: "agent_tool",
    onSettled: () => {
      const snapshot = getPublishRunSnapshot();
      if (snapshot.result) resolve(snapshot.result);
      else reject(new Error(snapshot.error));
    },
  }));
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

/** The run owner mints its operation id first (product events); the next id is the one
 *  `publishStaticSite` mints inside the started run, so throwing there is an unexpected publish failure. */
let failingOperationId = 0;
function idGenFailingInsidePublish(failure: unknown): StaticPublishInput["idGen"] {
  let calls = 0;
  return { newId: () => { if (calls++ === 0) return `operation-${++failingOperationId}`; throw failure; } };
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

test("startPublishRun: a full success records history with owner/repo/basePath/branch/commitSha, reachable:true, triggeredBy:agent_tool", async () => {
  const routeDeps = testRouteDeps();
  // owner/repo/branch/commitSha are the HOST's own facts (`providerMetadata`), not the request's:
  // the branch here differs from the config's (absent) one to prove which side is read.
  const providerMetadata = { owner: "octo", repo: "my-site", branch: "gh-pages", commitSha: "commit-sha-abc123", branchCreated: false };
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://example.test/published", "ready", "commit-sha-abc123", providerMetadata) };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  const outcome = await runPublishForTest(deps, input, clock, history);
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
  assert.equal(recorded!.triggeredBy, "agent_tool", "runPublishForTest is the agent tool's own entry point");
});

test("startPublishRun: history's owner/repo/branch/commitSha come from providerMetadata, never the request config; non-string metadata is dropped", async () => {
  const routeDeps = testRouteDeps();
  const providerMetadata = { owner: "octo", repo: "my-site", branch: "main", commitSha: "sha-from-host", branchCreated: true };
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://example.test/p", "ready", "dpl-other", providerMetadata) };
  const history = new InMemoryPublishHistoryStore();

  await runPublishForTest(deps, { ...githubInput(routeDeps), config: { target: "github-pages", owner: "octo", repo: "my-site", branch: "gh-pages" } }, clock, history);

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" });
  assert.ok(recorded);
  assert.equal(recorded!.branch, "main");
  assert.equal(recorded!.commitSha, "sha-from-host");
  assert.equal(recorded!.deploymentId, "dpl-other");

  const invalidMetadata = { owner: 123, repo: {}, branch: false, commitSha: null };
  const invalidDeps = { ...deps, buildTarget: () => fakeDeployTarget("https://example.test/invalid", "ready", "dpl-invalid", invalidMetadata) };
  const outcome = await runPublishForTest(invalidDeps, githubInput(routeDeps), clock, history);
  assert.equal(outcome.ok, true);
  const dropped = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" });
  assert.ok(dropped);
  for (const key of ["owner", "repo", "branch", "commitSha"] as const) {
    assert.equal(Object.hasOwn(dropped, key), false, `${key} must be absent for non-string metadata`);
  }
  assert.equal(dropped.deploymentId, "dpl-invalid");
});

test("startPublishRun: a non-github-pages target never carries commitSha/branch, even though deploymentId is still recorded verbatim", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://demo.vercel.app", "ready", "dpl_not_a_commit") };
  const history = new InMemoryPublishHistoryStore();
  const input: StaticPublishInput = { workspaceId: routeDeps.workspaceId, publishOutputRootDir: routeDeps.publishOutputRootDir, idGen: routeDeps.idGen, exportSiteBound: routeDeps.exportSiteBound, config: { target: "vercel" }, projectName: "demo" };

  await runPublishForTest(deps, input, clock, history);

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "vercel" });
  assert.ok(recorded);
  assert.equal(recorded!.deploymentId, "dpl_not_a_commit", "deploymentId is carried through for every target");
  assert.equal(recorded!.commitSha, undefined, "vercel's deploymentId is a Vercel deploy id, NOT a git commit sha");
  assert.equal(recorded!.branch, undefined);
  assert.equal(recorded!.owner, undefined);
  assert.equal(recorded!.repo, undefined);
});

test("startPublishRun: a partial (uploaded, not yet reachable) outcome is still recorded, with reachable:false", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => partialDeployTarget() };
  const history = new InMemoryPublishHistoryStore();
  const input: StaticPublishInput = { workspaceId: routeDeps.workspaceId, publishOutputRootDir: routeDeps.publishOutputRootDir, idGen: routeDeps.idGen, exportSiteBound: routeDeps.exportSiteBound, config: { target: "s3-compatible" }, projectName: "demo" };

  const outcome = await runPublishForTest(deps, input, clock, history);
  assert.equal(outcome.ok, "partial");

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "s3-compatible" });
  assert.ok(recorded);
  assert.equal(recorded!.reachable, false);
  assert.equal(recorded!.url, "https://example.test/bucket");
});

test("startPublishRun: a failed outcome is never recorded — no history for a publish that did not happen", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => failingDeployTarget() };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  const outcome = await runPublishForTest(deps, input, clock, history);
  assert.equal(outcome.ok, false);

  assert.equal(await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" }), null);
});

test("startPublishRun: a history-store failure never changes the reported outcome — best-effort only", async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget() };
  /** The real in-memory store, except every write fails. */
  class BrokenHistoryStore extends InMemoryPublishHistoryStore {
    override async recordSuccess(): Promise<never> {
      throw new Error("disk full; database parameters: PRIVATE_TOKEN");
    }
  }
  const brokenHistory = new BrokenHistoryStore();
  const input = githubInput(routeDeps);

  const outcome = await runPublishForTest(deps, input, clock, brokenHistory);
  assert.equal(outcome.ok, true, "the real, successful outcome must still be returned even though recording it failed");
  assert.deepEqual(warnings, [["[static-publish] destination history write failed after publish"]]);
});

test("a registry reload failure logs a sanitized warning and preserves outcome-only history", async (t) => {
  const routeDeps = testRouteDeps();
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  let loads = 0;
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), buildTarget: () => fakeDeployTarget(),
    loadDeployTargets: async workspaceId => {
      if (++loads > 1) throw new Error("plugin config: PRIVATE_TOKEN");
      return routeDeps.loadDeployTargets(workspaceId);
    } };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);
  assert.equal((await runPublishForTest(deps, input, clock, history)).ok, true);
  const recorded = await history.getLast({ workspaceId: input.workspaceId, target: input.config.target });
  assert.equal(recorded?.url, "https://example.test/published");
  assert.equal(recorded?.configFields, undefined);
  assert.deepEqual(warnings, [["[static-publish] destination registry reload failed; recording outcome only"]]);
});

test("startPublishRun: the fire-and-forget path records history too, once the background publish settles", async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget("https://example.test/bg", "ready") };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  let finish!: () => void;
  const completed = new Promise<void>(resolve => { finish = resolve; });
  const started = startPublishRun(deps, input, clock, history, { onSettled: () => finish() });
  assert.equal(started.status, "running");
  assert.equal(getPublishRunSnapshot().status, "running");
  await completed;
  assert.equal(getPublishRunSnapshot().status, "completed");

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" });
  assert.ok(recorded, "startPublishRun's background settlement must record history the same way runPublishForTest does");
  assert.equal(recorded!.url, "https://example.test/bg");
  assert.equal(recorded!.triggeredBy, "admin_ui", "startPublishRun is the admin route's own entry point");
});


test("an unexpected publish failure settles the run with its error and permits the next run", { timeout: 5000 }, async () => {
    const routeDeps = testRouteDeps();
    const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget() }; // built before export (it names the URL); idGen fails next
    const history = new InMemoryPublishHistoryStore();
    const failure = new Error("run ID generation failed");
    const input = { ...githubInput(routeDeps), idGen: idGenFailingInsidePublish(failure), exportSiteBound: async () => assert.fail("must not export") };
    const run = runPublishForTest(deps, input, clock, history);
    assert.equal(getPublishRunSnapshot().status, "running");
    await assert.rejects(run, { message: failure.message });
    assert.deepEqual(getPublishRunSnapshot(), { status: "errored", startedAtIso: "2026-08-16T12:00:00.000Z", finishedAtIso: "2026-08-16T12:00:00.000Z", target: "github-pages", error: "run ID generation failed", jobId: getPublishRunSnapshot().jobId, progress: { phase: "exporting", deploymentCreated: false, uploadedFiles: 0 } });
    assert.equal(await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" }), null);
    // A normal refusal can start and settle after the unexpected failure.
    const recovered = await runPublishForTest(deps, { ...input, idGen: routeDeps.idGen, projectName: "" }, clock, history);
    assert.deepEqual(recovered, { ok: false, code: "INVALID_CONFIG", message: "projectName must be 1-200 characters" });
    assert.equal(getPublishRunSnapshot().error, undefined);
});

test("Publish destinations: successful Vercel-like run records replay config and credential binding; failed run adds none", async () => {
  const routeDeps = testRouteDeps();
  const history = new InMemoryPublishHistoryStore();
  const input: StaticPublishInput = {
    ...githubInput(routeDeps),
    config: { target: "vercel", teamId: "team-a", token: "SECRET", undeclared: "SECRET" },
    projectName: "my-site",
    credentialId: "connection-a",
  };
  const deps: StaticPublishDeps = {
    credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets,
    buildTarget: () => fakeDeployTarget("https://my-site.vercel.app"),
  };
  assert.equal((await runPublishForTest(deps, input, clock, history)).ok, true);
  const rows = await listStaticPublishDestinations({ workspaceId: input.workspaceId, historyStore: history, registry: await routeDeps.loadDeployTargets(input.workspaceId) });
  assert.deepEqual(rows, [{
    id: "static:vercel:my-site", kind: "static", label: "Vercel: my-site", url: "https://my-site.vercel.app",
    lastPublishedAt: clock.nowIso(),
    target: "vercel", projectName: "my-site", credentialId: "connection-a", configFields: { teamId: "team-a" },
  }]);
  assert.deepEqual((await history.getLast({ workspaceId: input.workspaceId, target: "vercel" }))!.configFields, { teamId: "team-a" });
  assert.equal((await runPublishForTest({ ...deps, buildTarget: () => failingDeployTarget() }, { ...input, projectName: "failed" }, clock, history)).ok, false);
  assert.equal((await history.listDestinationHistory({ workspaceId: input.workspaceId })).length, 1);
});

for (const explicit of [false, true]) {
  test(`replay refuses a deleted ${explicit ? "explicit" : "default"} credential even after a replacement default is saved`, async () => {
    const routeDeps = testRouteDeps();
    const keyring = new InMemoryKeyring();
    let id = 0;
    const writeDeps = { repo: new InMemoryVendorCredentialSetRepo({}), keyring,
      sealer: new AesGcmSecretSealer(keyring), clock: createFakeClock({ startIso: clock.nowIso() }),
      idGen: { newId: () => `saved-${++id}` }, loadDeployTargets: routeDeps.loadDeployTargets };
    const saved = await createPublishCredential(writeDeps, { workspaceId: routeDeps.workspaceId, label: "Original",
      connection: { providerId: "vercel", token: "ORIGINAL_SECRET" }, isDefault: true });
    const input = { ...githubInput(routeDeps), config: { target: "vercel" },
      ...(explicit ? { credentialId: saved.id } : {}) };
    let publishes = 0;
    const deps: StaticPublishDeps = { credentialSource: createDbPublishCredentialSource(writeDeps),
      loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: (_config, credential) => {
        assert.equal("credentialId" in credential, false, "saved row metadata must not enter the plugin credential");
        publishes++;
        return fakeDeployTarget();
      } };
    const history = new InMemoryPublishHistoryStore();
    assert.equal((await runPublishForTest(deps, input, clock, history)).ok, true);
    const [destination] = await listStaticPublishDestinations({ workspaceId: input.workspaceId,
      historyStore: history, registry: await routeDeps.loadDeployTargets(input.workspaceId) });
    assert.equal(destination!.credentialId, saved.id);
    await deletePublishCredential(writeDeps, { workspaceId: input.workspaceId, id: saved.id });
    const replacement = await createPublishCredential(writeDeps, { workspaceId: input.workspaceId, label: "Replacement",
      connection: { providerId: "vercel", token: "REPLACEMENT_SECRET" }, isDefault: true });
    assert.notEqual(replacement.id, saved.id);
    const replay = await runPublishForTest(deps, { ...input, credentialId: destination!.credentialId! }, clock, history);
    assert.equal(replay.ok, false);
    if (replay.ok === false) assert.equal(replay.code, "NO_CREDENTIALS_CONFIGURED");
    assert.equal(publishes, 1, "replay must never publish using the replacement account");
    assert.equal((await history.list({ workspaceId: input.workspaceId })).length, 1);
  });
}

test("an unexpected non-Error publish failure settles the run with its string form and is reported through the snapshot", { timeout: 5000 }, async () => {
  const routeDeps = testRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => fakeDeployTarget() }; // built before export (it names the URL); idGen fails next
  const history = new InMemoryPublishHistoryStore();
  const input = { ...githubInput(routeDeps), idGen: idGenFailingInsidePublish("opaque failure value"), exportSiteBound: async () => assert.fail("must not export") };
  await assert.rejects(runPublishForTest(deps, input, clock, history), { message: "opaque failure value" });
  assert.equal(getPublishRunSnapshot().status, "errored");
  assert.equal(getPublishRunSnapshot().error, "opaque failure value");
});

test("a host's destinationConfig refines the recorded replay config from the provider's own metadata", async () => {
  const routeDeps = testRouteDeps();
  const history = new InMemoryPublishHistoryStore();
  const seen: unknown[] = [];
  const loadDeployTargets: StaticPublishDeps["loadDeployTargets"] = async (workspaceId) => {
    const registry = await routeDeps.loadDeployTargets(workspaceId);
    return { ...registry, get: (id) => {
      const target = registry.get(id);
      return target && id === "vercel" ? { ...target, module: { ...target.module, destinationConfig: (input: { providerMetadata?: unknown }) => { seen.push(input.providerMetadata); return { teamId: "team-from-provider" }; } } } : target;
    } };
  };
  const input: StaticPublishInput = { ...githubInput(routeDeps), config: { target: "vercel", teamId: "team-a" }, projectName: "my-site", credentialId: "connection-a" };
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), loadDeployTargets, buildTarget: () => fakeDeployTarget("https://my-site.vercel.app") };
  assert.equal((await runPublishForTest(deps, input, clock, history)).ok, true);
  assert.equal(seen.length, 1);
  assert.deepEqual((await history.getLast({ workspaceId: input.workspaceId, target: "vercel" }))!.configFields, { teamId: "team-from-provider" });
});

for (const failure of ["returned", "thrown"] as const) {
  test(`a ${failure} provider build failure leaves the job failed and writes no publish history`, async () => {
    const routeDeps = testRouteDeps();
    const history = new InMemoryPublishHistoryStore();
    const message = "Vercel build failed. Deployment ID: dpl_failed; provider status: ERROR. Check the Vercel dashboard before publishing again.";
    const target = fakeDeployTarget();
    target.publish = async () => {
      if (failure === "thrown") throw new Error(message);
      return { targetId: "vercel", status: "failed", url: "https://failed.vercel.app", deploymentId: "dpl_failed", statusMessage: message };
    };
    const input = { ...githubInput(routeDeps), config: { target: "vercel" } };
    await new Promise<void>(resolve => startPublishRun({ credentialSource: fakeCredentialSource(), loadDeployTargets: routeDeps.loadDeployTargets, buildTarget: () => target }, input, clock, history, { onSettled: () => resolve() }));
    assert.equal(getPublishRunSnapshot().status, "errored");
    assert.deepEqual(getPublishRunSnapshot().result, { ok: false, code: "PROVIDER_ERROR", message });
    assert.equal(await history.getLast({ workspaceId: input.workspaceId, target: "vercel" }), null);
  });
}
