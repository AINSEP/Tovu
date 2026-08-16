import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";

import { createRouteDeps } from "#src/server/app";

import type { StaticPublishDeps, StaticPublishInput } from "../adapter";
import { InMemoryPublishHistoryStore } from "../publish-history";
import { getPublishRunSnapshot, runPublishAndAwait, startPublishRun } from "../publish-run";
import type { PublishCredentialSource } from "../types";

/**
 * @file `publish-run.ts`'s publish-history wiring (Defect 2, 2026-08-16) — the single-flight guard
 * itself (`currentRun`) has no dedicated suite prior to this file (it was previously only exercised
 * indirectly through `publish-agent-tools.unit.test.ts`'s tool-level tests); this file adds direct
 * coverage for the NEW behavior only — recording history through both of this module's entry points,
 * and only when a publish actually produced something to record.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-run-test-"));
process.env.TOVU_PUBLISH_DIR = publishOutputDir;
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

const clock = { nowIso: () => "2026-08-16T12:00:00.000Z" };

function fakeDeployTarget(url = "https://example.test/published", status = "ready", deploymentId?: string): DeployTarget {
  return {
    id: "fake",
    async publish(_input: DeployPublishInput): Promise<DeployPublishResult> {
      return { targetId: "fake", url, status, ...(deploymentId !== undefined ? { deploymentId } : {}) };
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
    routeDeps,
    config: { target: "github-pages", owner: "octo", repo: "my-site" },
    projectName: "my-site-release",
  };
}

test("runPublishAndAwait: a full success records history with owner/repo/basePath/branch/commitSha, reachable:true, triggeredBy:agent_tool", async () => {
  const routeDeps = createRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), buildTarget: () => fakeDeployTarget("https://example.test/published", "ready", "commit-sha-abc123") };
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
  // github-pages only: `branch` defaults to 'gh-pages' when `config.branch` was omitted (matches
  // `GitHubPagesDeployTarget`'s own default), and `commitSha` is the outcome's `deploymentId` —
  // genuinely a commit sha for THIS target, per `toHistoryEntry`'s own doc.
  assert.equal(recorded!.branch, "gh-pages");
  assert.equal(recorded!.deploymentId, "commit-sha-abc123");
  assert.equal(recorded!.commitSha, "commit-sha-abc123");
  assert.equal(recorded!.triggeredBy, "agent_tool", "runPublishAndAwait is the agent tool's own entry point");
});

test("runPublishAndAwait: a non-github-pages target never carries commitSha/branch, even though deploymentId is still recorded verbatim", async () => {
  const routeDeps = createRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), buildTarget: () => fakeDeployTarget("https://demo.vercel.app", "ready", "dpl_not_a_commit") };
  const history = new InMemoryPublishHistoryStore();
  const input: StaticPublishInput = { workspaceId: routeDeps.workspaceId, routeDeps, config: { target: "vercel" }, projectName: "demo" };

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
  const routeDeps = createRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), buildTarget: () => partialDeployTarget() };
  const history = new InMemoryPublishHistoryStore();
  const input: StaticPublishInput = { workspaceId: routeDeps.workspaceId, routeDeps, config: { target: "s3-compatible" }, projectName: "demo" };

  const outcome = await runPublishAndAwait(deps, input, clock, history);
  assert.equal(outcome.ok, "partial");

  const recorded = await history.getLast({ workspaceId: routeDeps.workspaceId, target: "s3-compatible" });
  assert.ok(recorded);
  assert.equal(recorded!.reachable, false);
  assert.equal(recorded!.url, "https://example.test/bucket");
});

test("runPublishAndAwait: a failed outcome is never recorded — no history for a publish that did not happen", async () => {
  const routeDeps = createRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), buildTarget: () => failingDeployTarget() };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  const outcome = await runPublishAndAwait(deps, input, clock, history);
  assert.equal(outcome.ok, false);

  assert.equal(await history.getLast({ workspaceId: routeDeps.workspaceId, target: "github-pages" }), null);
});

test("runPublishAndAwait: a history-store failure never changes the reported outcome — best-effort only", async () => {
  const routeDeps = createRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), buildTarget: () => fakeDeployTarget() };
  const brokenHistory = {
    async getLast() {
      return null;
    },
    async recordSuccess() {
      throw new Error("disk full");
    },
  };
  const input = githubInput(routeDeps);

  const outcome = await runPublishAndAwait(deps, input, clock, brokenHistory);
  assert.equal(outcome.ok, true, "the real, successful outcome must still be returned even though recording it failed");
});

test("startPublishRun: the fire-and-forget path records history too, once the background publish settles", async () => {
  const routeDeps = createRouteDeps();
  const deps: StaticPublishDeps = { credentialSource: fakeCredentialSource(), buildTarget: () => fakeDeployTarget("https://example.test/bg", "ready") };
  const history = new InMemoryPublishHistoryStore();
  const input = githubInput(routeDeps);

  startPublishRun(deps, input, clock, history);

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
