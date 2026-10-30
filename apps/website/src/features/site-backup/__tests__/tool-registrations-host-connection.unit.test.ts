/**
 * Pins the plan's handling of a host-connection lookup that fails with something other than the
 * unconfigured-store error. The real source-control store converts every failure into that error,
 * so the propagate branch is only reachable by replacing the store's resolver at the module seam.
 * The contract: an unexpected failure propagates unchanged instead of being reported as an
 * unreadable credential, and the plan stops before any snapshot.
 */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { githubFromSource } from "../../source-control/__tests__/fixtures/github-from-source.js";
import { InMemorySourceControlCredentialSetRepo } from "../../source-control/repo.memory.js";
import * as sourceControlStore from "../../source-control/store.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { FakeGitHub } from "./fixtures/fake-github.js";

/** A database port the plan must never reach in this scenario. */
class UntouchedDbOps implements DbOpsPort {
  captures = 0;
  async getCapabilities(): Promise<{ restorePoint: RestoreCapability }> { return { restorePoint: { costClass: "cheap", kind: "file-snapshot" } }; }
  async captureRestorePoint(): Promise<{ artifactRef: string; watermarkAtCapture: number }> { this.captures++; throw new Error("no snapshot expected"); }
  async restoreFromArtifact(): Promise<{ restartRequired: boolean }> { throw new Error("a backup must never restore"); }
}

test("an unexpected host-connection lookup failure propagates unchanged and takes no snapshot", async t => {
  const failure = new Error("source-control store offline");
  t.mock.module("../../source-control/store.js", {
    namedExports: { ...sourceControlStore, resolveDefaultForSourceControl: async () => { throw failure; } },
  });
  const { buildSiteBackupRegistrations } = await import("../tool-registrations.js");
  const siteDir = mkdtempSync(path.join(tmpdir(), "site-backup-host-connection-"));
  t.after(() => rmSync(siteDir, { recursive: true, force: true }));
  const dbOps = new UntouchedDbOps();
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const registrations = buildSiteBackupRegistrations({
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: "ws-site-backup",
    customCredentialSetRepo: new InMemoryCustomCredentialSetRepo(),
    sourceControlCredentialSetRepo: new InMemorySourceControlCredentialSetRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(new InMemoryKeyring()),
    customCredentialsHttpClient: new FakeGitHub(),
    loadSourceControlProviders: githubFromSource,
    dbOps,
    siteBackupSanitize: async () => assert.fail("must not sanitize before resolving the host connection"),
    siteBackupSources: { siteDir, mediaUploadsDir: null, themesDir: path.join(siteDir, "themes"), skillsDir: path.join(siteDir, "skills"), tovuVersion: "0.1.0",
      agentPlugins: resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(siteDir, "agent-plugins") } }) },
    siteBackupFailureLog: () => {},
  }, { surfaceExchanges });
  const planTool = registrations.find(registration => registration.descriptor.id === "site_backup_plan");
  assert.ok(planTool);
  const outcome = await Promise.resolve(planTool.handler({ executionId: "exec-1", principal: { id: "principal-owner" }, run: { id: "run-1" }, input: { owner: "octo", repo: "backups" }, signal: new AbortController().signal }))
    .then(() => "resolved", (error: unknown) => error);
  assert.deepEqual({ propagated: outcome === failure, captures: dbOps.captures }, { propagated: true, captures: 0 });
});
