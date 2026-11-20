import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { collectSiteBackupFiles } from "../sources.js";
import { SiteBackupPlanStore } from "@jini-ai/devops/backup/plan-store";
import type { SiteBackupPlanContent } from "../plan-content.js";
import { SiteBackupPushJobs } from "@jini-ai/devops/backup/push-jobs";
import { pushSiteBackup, type PushResult, type SiteBackupToolDeps } from "../backup-service.js";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential } from "../../custom-credentials/store.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { type LoadSourceControlProviders } from "../../source-control/provider-registry.js";
import { githubFromSource } from "../../source-control/__tests__/fixtures/github-from-source.js";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { FakeGitHub } from "./fixtures/fake-github.js";
import { importFixture } from "./import.fixture.js";

const key = { planId: "cancel-plan", principalId: "owner", workspaceId: "ws" };
const include = { database: true, media: true, themes: true, plugins: true, settings: true };

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const blobsOnly: LoadSourceControlProviders = async input => {
  const registry = await githubFromSource(input);
  const loaded = registry.get({ providerId: "github" });
  assert.ok(loaded);
  const provider = { ...loaded, module: { ...loaded.module, create: (context: Parameters<typeof loaded.module.create>[0]) => ({
    ...loaded.module.create(context), backupInlineTextMaxBytes: 0,
  }) } };
  return { list: () => [provider], get: ({ providerId }) => providerId === "github" ? provider : undefined, refusals: [] };
};

async function fixture(required: { t: TestContext }) {
  const { root } = await importFixture(required.t);
  fs.mkdirSync(path.join(root, "themes"));
  fs.writeFileSync(path.join(root, "themes/one.txt"), "first file");
  fs.writeFileSync(path.join(root, "themes/two.txt"), "second file");
  const sources = { siteDir: root, themesDir: path.join(root, "themes"), mediaUploadsDir: null,
    skillsDir: path.join(root, "skills"), agentPlugins: resolveAgentPluginLayout({ siteDir: root }, { env: {} }), tovuVersion: "test" };
  const collected = await collectSiteBackupFiles({ sources, include: { ...include, database: false } });
  assert.equal(collected.files.length, 2);
  const github = new FakeGitHub();
  const loaded = (await blobsOnly({ workspaceId: "ws" })).get({ providerId: "github" });
  assert.ok(loaded);
  const baseUrl = loaded.descriptor.apiOrigin;
  const content: SiteBackupPlanContent = { credentialLabel: "github", owner: "octo", repo: "backups", folder: "demo-site", commitMessage: "backup",
    repository: { branch: "main", parentCommitSha: "tip-1", baseTreeSha: "tree-of-tip-1", folderExists: false, htmlUrl: baseUrl },
    include, database: null, files: collected.files, skipped: [], scopeNotes: {}, totalBytes: collected.files.reduce((sum, file) => sum + file.bytes, 0),
    site: { name: "Cancel", folderName: "demo-site" }, schema: runtimeSchemaVersion(), tovuVersion: "test", createdAt: "2026-11-18T00:00:00Z" };
  const store = new SiteBackupPlanStore<SiteBackupPlanContent>({}, { newId: () => key.planId });
  const plan = store.save({ principalId: key.principalId, workspaceId: key.workspaceId, content });
  return { root, sources, github, baseUrl, store, plan };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function serviceDeps(required: { f: Fixture }): Promise<SiteBackupToolDeps> {
  const { f } = required, repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring(), sealer = new AesGcmSecretSealer(keyring);
  await createCustomCredential({ repo, keyring, sealer,
    clock: { nowMs: () => Date.parse(f.plan.createdAt) }, idGen: { newId: () => "cancel-credential" } }, {
    workspaceId: "ws", label: "github", category: "source-control", baseUrl: f.baseUrl, additionalHosts: [], connection: { token: "fixture-token" },
  });
  return { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer, customCredentialsHttpClient: f.github, loadSourceControlProviders: blobsOnly,
    siteBackupPlanStore: f.store, siteBackupPushJobs: new SiteBackupPushJobs<PushResult>({}), siteBackupSources: f.sources,
    siteBackupSanitize: async () => assert.fail("push must not recapture"), siteBackupSiteKeyStatus: () => ({ active: true }),
    dbOps: { getCapabilities: async () => assert.fail("push must not recapture"), captureRestorePoint: async () => assert.fail("push must not recapture"),
      restoreFromArtifact: async () => assert.fail("push must not restore") } };
}

function assertNoCommit(required: { github: FakeGitHub }): void {
  assert.deepEqual(required.github.unexpected, []);
  assert.equal(required.github.writes().some(request => /\/git\/(?:trees|commits|refs)/.test(new URL(request.url).pathname)), false);
  assert.equal(required.github.state.tip, "tip-1");
}

for (const point of ["repository inspection", "last manifest upload"] as const) {
  // Mutations: remove runBounded's pre-index abort gate / backup-service's post-upload abort check.
  test(`abort during ${point} leaves a terminal job and never commits`, async t => {
    const f = await fixture({ t }), deps = await serviceDeps({ f });
    let stopped = false;
    const http: NonNullable<SiteBackupToolDeps["siteBackupHttpClient"]> = { send: async request => {
      const response = await f.github.send(request);
      const inspecting = request.method === "GET" && new URL(request.url).pathname === "/repos/octo/backups";
      const manifest = request.method === "POST" && request.url.endsWith("/git/blobs") &&
        Buffer.from(JSON.parse(Buffer.from(request.body!).toString()).content, "base64").toString().includes('"tovu-site-backup"');
      if ((point === "repository inspection" && inspecting) || (point === "last manifest upload" && manifest)) {
        const job = deps.siteBackupPushJobs!.find(key);
        assert.ok(job); job.controller.abort(); stopped = true;
      }
      return response;
    } };
    const result = await pushSiteBackup({ deps: { ...deps, siteBackupHttpClient: http }, call: {
      principal: { id: key.principalId }, signal: new AbortController().signal, input: { planId: key.planId },
    } });
    assert.equal(stopped, true);
    assert.deepEqual(result, { pushed: false, cancelled: false, reason: "abandoned" });
    assert.equal(f.github.blobContents.length, point === "repository inspection" ? 0 : 3);
    assert.equal(deps.siteBackupPushJobs!.find(key), undefined);
    assertNoCommit(f);
  });
}

for (const outcome of ["complete", "abort"] as const) {
  // Mutations: remove jobs.delete after wait / clearTimeout in wait's finally.
  test(`job ${outcome} is terminal and cancels its budget timer under a fake clock`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const scheduled = t.mock.method(globalThis, "setTimeout");
    const cleared = t.mock.method(globalThis, "clearTimeout");
    const jobs = new SiteBackupPushJobs<number>({}, { now: () => 100 });
    const complete = gate<number>(), caller = new AbortController();
    const job = jobs.start({ key, progress: { filesDone: 0, filesTotal: 1, bytesDone: 0, bytesTotal: 1 }, run: () => complete.promise });
    const waiting = jobs.wait({ job, signal: caller.signal, budgetMs: 1000 });
    if (outcome === "complete") complete.resolve(42);
    else caller.abort();
    assert.deepEqual(await waiting, outcome === "complete" ? { state: "done", result: 42 } : { state: "abandoned" });
    assert.equal(job.controller.signal.aborted, outcome === "abort");
    assert.equal(jobs.find(key), undefined);
    assert.equal(scheduled.mock.callCount(), 1);
    assert.equal(cleared.mock.callCount(), 1);
    assert.equal(cleared.mock.calls[0]!.arguments[0], scheduled.mock.calls[0]!.result);
    t.mock.timers.tick(1001);
    complete.resolve(42);
    await job.settled;
    assert.equal(jobs.find(key), undefined);
  });
}
