import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { PUBLISH_CONTENT_CONNECT_TOOL_ID } from "@jini-ai/cms/publish/content/agent-tools";
import { PUBLISH_TRUST_CONFIG_PATH } from "@jini-ai/cms/publish/trust/provisioning";
import { InMemoryPublishContentPeerRepo } from "../peers.js";
import { registerPublishContentContributor, resetPublishContentContributorsForTests } from "../type-registry.js";
import type { PublishContentToolDeps } from "../tool-deps.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file Pins which committed config file the assistant's connect tool provisions, when the tool is
 * built through the real composition manifest and the deps bag carries no provisioning port. The
 * file must live under `TOVU_REPO_ROOT` (the desktop shell's repo root), never under the process's
 * working directory, and a malformed existing config must be left untouched. Both roots are
 * temporary fixtures so a cwd-relative resolver cannot satisfy the assertions by accident.
 */

const WORKSPACE_ID = "ws-provisioning-root";
const NO_SURFACES = {} as AssistantSurfaceDeps;

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

function deps({ repo, handshakeOrigins }: { repo: InMemoryPublishContentPeerRepo; handshakeOrigins: string[] }): PublishContentToolDeps {
  return {
    ...createRouteDeps(),
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test-always-allow" }),
    clock: createFakeClock({ startIso: "2026-09-19T00:00:00.000Z" }),
    idGen: { newId: () => "id-1" },
    pluginBeforeSaveHook: undefined as never,
    outbox: null as never,
    workspaceRepo: { findById: async () => ({ name: "Test Site" }) },
    publishContentPeerRepo: repo,
    publishContentPeerHttpClient: { send: async ({ url }: { url: string }) => {
      handshakeOrigins.push(new URL(url).origin);
      return { status: 200, headers: {}, bodyText: JSON.stringify({
        installationId: "remote-install", workspaceId: "remote-workspace", origin: "https://example.com",
      }) };
    } },
    siteAssistantSecretSealer: null as never,
    siteAssistantSecretKeyring: { derive: async () => new Uint8Array(32).fill(7) } as never,
  } as unknown as PublishContentToolDeps;
}

async function connectThroughManifest(options: { repoRoot: string; cwd: string; input: Record<string, unknown> }): Promise<{ result: Record<string, unknown>; repo: InMemoryPublishContentPeerRepo; handshakeOrigins: string[] }> {
  const previousRoot = process.env.TOVU_REPO_ROOT;
  const previousCwd = process.cwd();
  process.env.TOVU_REPO_ROOT = options.repoRoot;
  process.chdir(options.cwd);
  try {
    resetPublishContentContributorsForTests();
    registerPublishContentContributor({ contributor: { entityType: "post", dependsOn: [], build: () => null as never } });
    contributions.contributors.clear({});
    const { installFirstPartyToolContributors } = await import("../../../server/runtime/composition/tool-catalog-manifest.js");
    installFirstPartyToolContributors({ contributions });
    const contributor = contributions.contributors.list({}).find((c) => c.domain === "publish-content");
    assert.ok(contributor, "publish-content contributor not installed");
    const repo = new InMemoryPublishContentPeerRepo();
    const handshakeOrigins: string[] = [];
    const registration = contributor.build(deps({ repo, handshakeOrigins }) as never, NO_SURFACES).find((r: ToolRegistration) => r.descriptor.id === PUBLISH_CONTENT_CONNECT_TOOL_ID);
    assert.ok(registration, "connect tool not built");
    const result = await registration.handler({
      executionId: "exec-1", principal: { id: "principal" }, run: { id: "run-1" }, input: options.input, signal: new AbortController().signal,
    } as unknown as ToolExecutionContext);
    return { result: result as Record<string, unknown>, repo, handshakeOrigins };
  } finally {
    process.chdir(previousCwd);
    if (previousRoot === undefined) delete process.env.TOVU_REPO_ROOT; else process.env.TOVU_REPO_ROOT = previousRoot;
    resetPublishContentContributorsForTests();
  }
}

test("assistant connect provisions the committed config under TOVU_REPO_ROOT, not the working directory", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "provision-root-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "provision-cwd-"));
  const { result, repo } = await connectThroughManifest({ repoRoot, cwd, input: { siteUrl: "https://example.com" } });
  assert.equal(result.connected, true);
  assert.equal((await repo.listByWorkspace({ workspaceId: WORKSPACE_ID })).length, 1);
  const written = JSON.parse(await readFile(path.join(repoRoot, PUBLISH_TRUST_CONFIG_PATH), "utf8"));
  assert.ok(JSON.stringify(written).includes("remote-workspace"));
  assert.deepEqual(await readdir(cwd), [], "nothing may be written under the working directory");
});

test("assistant connect without siteUrl uses the committed deploy candidate", async t => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "provision-root-candidate-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "provision-cwd-candidate-"));
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "provision-candidate-bundle-"));
  const pluginRoot = path.join(sourceRoot, "example-host");
  await mkdir(pluginRoot);
  await writeFile(path.join(pluginRoot, "plugin.json"), "{}");
  await writeFile(path.join(pluginRoot, "jini-deploy-configs.json"), JSON.stringify({ schemaVersion: 1, generators: [{
    id: "example-host", label: "Example host", module: "generator.mjs",
    candidatePaths: [{ path: "example-deploy.yml", order: 1 }],
  }] }));
  await writeFile(path.join(repoRoot, "example-deploy.yml"), "TOVU_PUBLIC_URL: https://example.com\n");
  const previousBundle = process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = sourceRoot;
  t.after(() => {
    if (previousBundle === undefined) delete process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
    else process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = previousBundle;
  });

  const { result, repo, handshakeOrigins } = await connectThroughManifest({ repoRoot, cwd, input: {} });
  assert.equal(result.connected, true);
  assert.deepEqual(handshakeOrigins, ["https://example.com"]);
  const peers = await repo.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.equal(peers.length, 1);
  assert.equal(peers[0]!.baseUrl, "https://example.com");
  const written = JSON.parse(await readFile(path.join(repoRoot, PUBLISH_TRUST_CONFIG_PATH), "utf8"));
  assert.ok(JSON.stringify(written).includes("remote-workspace"));
  assert.deepEqual(await readdir(cwd), [], "nothing may be written under the working directory");
});

test("assistant connect refuses a malformed committed config and writes nothing", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "provision-root-bad-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "provision-cwd-bad-"));
  const configFile = path.join(repoRoot, PUBLISH_TRUST_CONFIG_PATH);
  await mkdir(path.dirname(configFile), { recursive: true });
  await writeFile(configFile, "{broken config");
  const { result, repo } = await connectThroughManifest({ repoRoot, cwd, input: { siteUrl: "https://example.com" } });
  assert.equal(result.connected, false);
  assert.equal(result.message, "This site's publishing settings could not be saved on this computer.");
  assert.equal((await repo.listByWorkspace({ workspaceId: WORKSPACE_ID })).length, 0);
  assert.equal(await readFile(configFile, "utf8"), "{broken config");
  assert.deepEqual(await readdir(cwd), []);
});
