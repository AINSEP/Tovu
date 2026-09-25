import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import type { ExportReport } from "#src/platform/export/index";

import type { ExportSiteBoundFn, GitHubCommitAdapter } from "../commit-site.js";
import { createSourceControlCredential } from "../store.js";
import { buildSourceControlRegistrations, type SourceControlToolDeps } from "../tool-registrations.js";

/**
 * @file S8 (`dryRun` preview for `source_control_execute_commit`) proof. A fake `exportSiteBound`
 * writes two files to a throwaway temp dir, standing in for a real `exportSite` pass, so this file
 * proves the dry-run branch itself rather than the real exporter: no confirmation dialog, no
 * `GitHubCommitAdapter.commit()` call, and the same `cleanupCommitRunDir` disposal a real commit
 * gets (`commit-site.ts`'s `previewCommitExport`). Modelled on `tool-registrations.unit.test.ts`'s
 * own `fakeDeps`/`call` shape.
 */

const exportRootDir = mkdtempSync(path.join(tmpdir(), "tovu-source-control-dry-run-test-"));
test.after(() => rmSync(exportRootDir, { recursive: true, force: true }));

function neverCalledGitAdapter(calls: { count: number }): GitHubCommitAdapter {
  return {
    async commit() {
      calls.count += 1;
      throw new Error("gitAdapter.commit must not be called on a dry run");
    },
  };
}

/** Writes two files under `options.outputDir` (one route, one asset) and reports them, exactly like
 *  a real `exportSite` pass would — real enough that `cleanupCommitRunDir`'s removal of that
 *  directory (asserted below) is a genuine check, not a vacuous one over a directory that was never
 *  created. */
function fakeExportSiteBound(captured: { outputDir: string | null }): ExportSiteBoundFn {
  return async (options) => {
    captured.outputDir = options.outputDir;
    mkdirSync(options.outputDir, { recursive: true });
    writeFileSync(path.join(options.outputDir, "index.html"), "<html>home</html>");
    writeFileSync(path.join(options.outputDir, "style.css"), "body{}");
    const report: ExportReport = {
      outputDir: options.outputDir,
      routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<html>home</html>" }], failed: [] },
      assets: { succeeded: [{ url: "/style.css", outputFile: "style.css", data: Buffer.from("body{}") }], failed: [] },
      skippedManifestEntries: [],
      unreferencedThemeFiles: [],
    };
    return report;
  };
}

function fakeDeps(options: { gitAdapter: GitHubCommitAdapter; exportSiteBound: ExportSiteBoundFn }): SourceControlToolDeps {
  const base = createRouteDeps();
  return {
    ...base,
    sourceControlExportRootDir: exportRootDir,
    exportSiteBound: options.exportSiteBound,
    gitAdapter: options.gitAdapter,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };
}

async function seedGithubCredential(deps: SourceControlToolDeps, token = "ghp_fake_token_never_real"): Promise<void> {
  await createSourceControlCredential(
    { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "Test", connection: { providerId: "github", token } }
  );
}

function buildExecuteCommitTool(deps: SourceControlToolDeps): ToolRegistration {
  const surfaceExchanges: SurfaceExchangeStore = createSurfaceExchangeStore();
  const registrations = buildSourceControlRegistrations(deps, { surfaceExchanges });
  const found = registrations.find((r) => r.descriptor.id === "source_control_execute_commit");
  assert.ok(found, "source_control_execute_commit must be wired");
  return found;
}

function call(registration: ToolRegistration, input: unknown, emitSurface?: SurfaceEmitter) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: "principal-under-test" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...(emitSurface ? { emitSurface } : {}),
  };
  return registration.handler(ctx);
}

test("source_control_execute_commit dryRun:true previews the export without committing, raising no dialog and calling gitAdapter zero times", async () => {
  const gitAdapterCalls = { count: 0 };
  const captured: { outputDir: string | null } = { outputDir: null };
  const deps = fakeDeps({ gitAdapter: neverCalledGitAdapter(gitAdapterCalls), exportSiteBound: fakeExportSiteBound(captured) });
  await seedGithubCredential(deps);
  const executeCommit = buildExecuteCommitTool(deps);

  const emitted: unknown[] = [];
  const result = (await call(
    executeCommit,
    { provider: "github", owner: "octo", repo: "my-site", commitMessage: "content update", dryRun: true },
    async (s) => void emitted.push(s)
  )) as { dryRun: boolean; committed: boolean; fileCount: number; totalBytes: number; credentialConfigured: boolean };

  assert.equal(result.dryRun, true);
  assert.equal(result.committed, false);
  assert.equal(result.fileCount, 2);
  assert.ok(result.totalBytes > 0);
  assert.equal(result.credentialConfigured, true);
  assert.equal(gitAdapterCalls.count, 0, "gitAdapter.commit must never be called on a dry run");
  assert.equal(emitted.length, 0, "no confirmation dialog must be emitted on a dry run");
  assert.ok(captured.outputDir, "exportSiteBound must have been called");
  assert.equal(existsSync(captured.outputDir!), false, "the temp export dir must be cleaned up after a dry run preview");
});

test("source_control_execute_commit dryRun:true reports credentialConfigured:false honestly when no GitHub credential is saved, still without a dialog", async () => {
  const gitAdapterCalls = { count: 0 };
  const captured: { outputDir: string | null } = { outputDir: null };
  const deps = fakeDeps({ gitAdapter: neverCalledGitAdapter(gitAdapterCalls), exportSiteBound: fakeExportSiteBound(captured) });
  const executeCommit = buildExecuteCommitTool(deps);

  const emitted: unknown[] = [];
  const result = (await call(
    executeCommit,
    { provider: "github", owner: "octo", repo: "my-site", commitMessage: "content update", dryRun: true },
    async (s) => void emitted.push(s)
  )) as { dryRun: boolean; credentialConfigured: boolean };

  assert.equal(result.dryRun, true);
  assert.equal(result.credentialConfigured, false);
  assert.equal(gitAdapterCalls.count, 0);
  assert.equal(emitted.length, 0);
});
