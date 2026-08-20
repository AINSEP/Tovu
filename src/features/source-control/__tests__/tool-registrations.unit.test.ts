import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/app";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/core/tool-surface-exchanges";
import type { GitHubCommitAdapter, GitHubCommitAdapterResult } from "../commit-site.js";
import { createSourceControlCredential } from "../store.js";

import { buildSourceControlRegistrations, sourceControlAgentToolCatalog, sourceControlDerivedRisk, type SourceControlToolDeps } from "../tool-registrations.js";

/**
 * @file `tool-registrations.ts` wiring proof — modelled on `deployments/__tests__/
 * publish-agent-tools.unit.test.ts`'s own shape: the same MCP-UI held-open exchange mechanism, so
 * the same certification shape applies. `source_control_execute_commit`'s gate is exercised with a
 * FAKE `gitAdapter` (never real GitHub `fetch` — the real adapter lands in a follow-up commit, per
 * this dispatch's own checkpoint: gate first, network path after).
 */

const PRINCIPAL_ID = "principal-under-test";

const exportDir = mkdtempSync(path.join(tmpdir(), "tovu-source-control-tools-test-"));
test.after(() => rmSync(exportDir, { recursive: true, force: true }));

/** Real hermetic `RouteDeps` (`createRouteDeps()`), with `authorize` overridden and this file's own
 *  test-only `gitAdapter` seam optionally set — mirrors `publish-agent-tools.unit.test.ts`'s own
 *  `fakeDeps` shape. `sourceControlExportRootDir` is redirected to this file's own throwaway temp
 *  dir — `commitSiteToSourceControl` reads that `RouteDeps` field instead of
 *  `process.env.TOVU_SOURCE_CONTROL_EXPORT_DIR` (commit-site.ts no longer reads env vars at all),
 *  so overriding it here is what keeps this suite's real `exportSite` writes off the checked-out
 *  repo. */
function fakeDeps(options: { allow?: boolean; gitAdapter?: GitHubCommitAdapter } = {}): {
  deps: SourceControlToolDeps;
  authorizeCalls: Record<string, unknown>[];
  setAllow: (value: boolean) => void;
} {
  let allow = options.allow ?? true;
  const authorizeCalls: Record<string, unknown>[] = [];
  const base = createRouteDeps();

  const deps: SourceControlToolDeps = {
    ...base,
    sourceControlExportRootDir: exportDir,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    ...(options.gitAdapter ? { gitAdapter: options.gitAdapter } : {}),
  };

  return { deps, authorizeCalls, setAllow: (value: boolean) => { allow = value; } };
}

async function seedGithubCredential(deps: SourceControlToolDeps, token = "ghp_fake_token_never_real"): Promise<void> {
  await createSourceControlCredential(
    { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "Test", connection: { providerId: "github", token } }
  );
}

function buildRegistrations(deps: SourceControlToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildSourceControlRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input,
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — same technique
 *  `publish-agent-tools.unit.test.ts`'s own `exchangeIdFromSurface` uses. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Raises the commit confirmation dialog and returns everything a test needs to answer it. */
async function raiseDialog(executeTool: ToolRegistration, input: Record<string, unknown>) {
  const emitted: unknown[] = [];
  const pending = call(executeTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, html, exchangeId };
}

const FAKE_SUCCESS: GitHubCommitAdapterResult = { ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://github.com/octo/demo/commit/abc123", filesChanged: 2, filesDeleted: 0 };

function fakeGitAdapter(result: GitHubCommitAdapterResult): GitHubCommitAdapter {
  return { async commit() { return result; } };
}

function neverCalledGitAdapter(): GitHubCommitAdapter {
  return { async commit() { throw new Error("gitAdapter.commit must not be called on this path"); } };
}

// ---------------------------------------------------------------------------
// 1. Wiring shape — both tools
// ---------------------------------------------------------------------------

test("buildSourceControlRegistrations wires both tools, each with an input schema", () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildSourceControlRegistrations(deps, { surfaceExchanges });
  const ids = registrations.map((r) => r.descriptor.id).sort();
  assert.deepEqual(ids, ["source_control_execute_commit", "source_control_get_capabilities"]);
  for (const entry of registrations) {
    assert.ok(entry.descriptor.inputSchema, `${entry.descriptor.id} must publish an input schema`);
  }
});

test("the catalog's risk map has an entry for every wired tool, matching its declared sideEffects", () => {
  for (const entry of sourceControlAgentToolCatalog) {
    assert.equal(sourceControlDerivedRisk.get(entry.name), entry.sideEffects, `${entry.name}'s derived risk must match its declared sideEffects`);
  }
  assert.equal(sourceControlDerivedRisk.get("source_control_execute_commit"), "mutates-durable-state");
});

test("source_control_execute_commit's schema carries no token/credential field of any kind, and 'provider' only accepts 'github'", () => {
  const entry = sourceControlAgentToolCatalog.find((t) => t.name === "source_control_execute_commit")!;
  const schema = entry.inputSchema as { properties: Record<string, unknown>; additionalProperties?: boolean; required: string[] };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["branch", "commitMessage", "owner", "provider", "repo"]);
  assert.deepEqual(schema.required.sort(), ["commitMessage", "owner", "provider", "repo"]);
  assert.deepEqual((schema.properties.provider as { enum: string[] }).enum, ["github"]);
});

// ---------------------------------------------------------------------------
// 2. source_control_get_capabilities
// ---------------------------------------------------------------------------

test("source_control_get_capabilities reports all three providers, honestly distinguishing configured from commitSupported", async () => {
  const { deps } = fakeDeps();
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "source_control_get_capabilities");

  const result = (await call(capabilities)) as { providers: { providerId: string; configured: boolean; commitSupported: boolean; guidance?: string }[] };
  const byId = new Map(result.providers.map((p) => [p.providerId, p]));

  assert.equal(byId.get("github")?.configured, true);
  assert.equal(byId.get("github")?.commitSupported, true);
  assert.equal(byId.get("github")?.guidance, undefined, "configured AND commit-supported has nothing to tell the human");

  assert.equal(byId.get("gitlab")?.configured, false);
  assert.equal(byId.get("gitlab")?.commitSupported, false);
  assert.match(byId.get("gitlab")?.guidance ?? "", /not supported yet/);

  assert.equal(byId.get("bitbucket")?.configured, false);
  assert.equal(byId.get("bitbucket")?.commitSupported, false);
});

test("source_control_get_capabilities: a SAVED gitlab credential is still honestly reported as commitSupported:false — never silently omitted, never implied as ready", async () => {
  const { deps } = fakeDeps();
  await createSourceControlCredential(
    { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "GL", connection: { providerId: "gitlab", token: "glpat_secret" } }
  );
  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "source_control_get_capabilities");

  const result = (await call(capabilities)) as { providers: { providerId: string; configured: boolean; commitSupported: boolean; guidance?: string; savedCredentials: unknown[] }[] };
  const gitlab = result.providers.find((p) => p.providerId === "gitlab")!;

  assert.equal(gitlab.configured, true, "a saved credential must be reported as configured, not hidden");
  assert.equal(gitlab.commitSupported, false, "commit support must stay false even though a credential exists");
  assert.equal(gitlab.savedCredentials.length, 1);
  assert.match(gitlab.guidance ?? "", /credential is saved.*committing.*not supported yet/is);
  assert.doesNotMatch(JSON.stringify(result), /glpat_secret/);
});

test("source_control_get_capabilities never touches the sealer — a broken sealer does not fail it", async () => {
  const { deps } = fakeDeps();
  await seedGithubCredential(deps);
  const brokenSealerDeps: SourceControlToolDeps = {
    ...deps,
    siteAssistantSecretSealer: { async seal() { throw new Error("must not be called"); }, async open() { throw new Error("must not be called — this is a read-only capabilities check"); } },
  };
  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(brokenSealerDeps, surfaceExchanges), "source_control_get_capabilities");

  const result = (await call(capabilities)) as { providers: { providerId: string; configured: boolean }[] };
  assert.equal(result.providers.find((p) => p.providerId === "github")?.configured, true);
});

// ---------------------------------------------------------------------------
// 3. source_control_execute_commit — gate mechanics (no real network)
// ---------------------------------------------------------------------------

test("requires source-control.commit, checked before any dialog is raised", async () => {
  const { deps, authorizeCalls, setAllow } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  setAllow(false);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(() => call(executeTool, { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async () => {} }));
  assert.equal(surfaceExchanges.size(), 0, "no dialog may be raised before the permission check passes");
  assert.ok(authorizeCalls.some((c) => c.permission === "source-control.commit"));
});

test("with no emitSurface, the commit is refused outright — no exchange is ever opened", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(() => call(executeTool, { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" } }));
  assert.equal(surfaceExchanges.size(), 0);
});

test("an unsupported provider throws before any permission check, dialog, or credential lookup", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "gitlab", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async () => {} }),
    /'provider' must be 'github'/
  );
  assert.equal(surfaceExchanges.size(), 0);
});

test("an invalid target (bad owner) throws before any dialog is raised", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "github", owner: "not valid!!", repo: "demo", commitMessage: "x" }, emitSurface: async () => {} }),
    /invalid GitHub owner/
  );
  assert.equal(surfaceExchanges.size(), 0);
});

test("no saved github credential: refused with reason 'no-credential', WITHOUT ever opening a dialog", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const result = (await call(executeTool, { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async () => undefined })) as {
    committed: boolean;
    reason: string;
  };
  assert.equal(result.committed, false);
  assert.equal(result.reason, "no-credential");
  assert.equal(surfaceExchanges.size(), 0);
});

test("the dialog names the repository, branch, and commit message, so consent is informed", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const { html, exchangeId, pending } = await raiseDialog(executeTool, { provider: "github", owner: "octo", repo: "my-site", branch: "main", commitMessage: "content update" });
  assert.match(html, /octo\/my-site/);
  assert.match(html, /main/);
  assert.match(html, /content update/);

  surfaceExchanges.deliver({ exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("cancel: nothing is committed, the git adapter is never called", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const { exchangeId, pending } = await raiseDialog(executeTool, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });
  surfaceExchanges.deliver({ exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { committed: boolean; cancelled: boolean };
  assert.equal(result.committed, false);
  assert.equal(result.cancelled, true);
});

test("expired: nothing is committed, reported honestly as 'expired' not 'cancelled'", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const result = (await call(executeTool, { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async () => undefined })) as {
    committed: boolean;
    cancelled: boolean;
    reason: string;
  };
  assert.equal(result.committed, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
});

test("abandoned: aborting the run's signal closes the exchange and resolves the call, not left hanging", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const controller = new AbortController();
  const pending = call(executeTool, { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();

  const result = (await pending) as { committed: boolean; cancelled: boolean; reason: string };
  assert.equal(result.committed, false);
  assert.equal(result.reason, "abandoned");
});

test("re-calling the tool while a dialog is pending opens a SEPARATE dialog — it does not answer the first one", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const first = await raiseDialog(executeTool, { provider: "github", owner: "octo", repo: "demo-1", commitMessage: "x" });
  const second = await raiseDialog(executeTool, { provider: "github", owner: "octo", repo: "demo-2", commitMessage: "y" });

  assert.notEqual(first.exchangeId, second.exchangeId);
  assert.equal(surfaceExchanges.size(), 2);

  surfaceExchanges.deliver({ exchangeId: first.exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  surfaceExchanges.deliver({ exchangeId: second.exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await Promise.all([first.pending, second.pending]);
});

// ---------------------------------------------------------------------------
// 4. source_control_execute_commit — confirmed path, fake gitAdapter (still no real network)
// ---------------------------------------------------------------------------

test("confirm: a successful commit reports committed:true with every field from the adapter's result", async () => {
  const { deps } = fakeDeps({ gitAdapter: fakeGitAdapter(FAKE_SUCCESS) });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const { exchangeId, pending } = await raiseDialog(executeTool, { provider: "github", owner: "octo", repo: "demo", branch: "main", commitMessage: "content update" });
  surfaceExchanges.deliver({ exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  const result = (await pending) as { committed: boolean; owner: string; repo: string; branch: string; commitSha: string; filesChanged: number; filesDeleted: number };
  assert.equal(result.committed, true);
  assert.equal(result.owner, "octo");
  assert.equal(result.repo, "demo");
  assert.equal(result.branch, "main");
  assert.equal(result.commitSha, "abc123");
  assert.equal(result.filesChanged, 2);
  assert.equal(result.filesDeleted, 0);
});

test("confirm: a DIVERGED_BRANCH result from the adapter is surfaced distinctly, never overwritten silently", async () => {
  const { deps } = fakeDeps({ gitAdapter: fakeGitAdapter({ ok: false, code: "diverged", message: "the branch has moved" }) });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const { exchangeId, pending } = await raiseDialog(executeTool, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });
  surfaceExchanges.deliver({ exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  const result = (await pending) as { committed: boolean; code: string; message: string };
  assert.equal(result.committed, false);
  assert.equal(result.code, "DIVERGED_BRANCH");
  assert.equal(result.message, "the branch has moved");
});

test("confirm: a NETWORK_UNREACHABLE result is distinct from a PROVIDER_ERROR result — never conflated", async () => {
  const { deps: unreachableDeps } = fakeDeps({ gitAdapter: fakeGitAdapter({ ok: false, code: "network-unreachable", message: "getaddrinfo ENOTFOUND" }) });
  await seedGithubCredential(unreachableDeps);
  const surfaceExchanges1 = createSurfaceExchangeStore();
  const executeTool1 = tool(buildRegistrations(unreachableDeps, surfaceExchanges1), "source_control_execute_commit");
  const dialog1 = await raiseDialog(executeTool1, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });
  surfaceExchanges1.deliver({ exchangeId: dialog1.exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  const unreachableResult = (await dialog1.pending) as { code: string };

  const { deps: rejectedDeps } = fakeDeps({ gitAdapter: fakeGitAdapter({ ok: false, code: "provider-error", message: "401 Bad credentials" }) });
  await seedGithubCredential(rejectedDeps);
  const surfaceExchanges2 = createSurfaceExchangeStore();
  const executeTool2 = tool(buildRegistrations(rejectedDeps, surfaceExchanges2), "source_control_execute_commit");
  const dialog2 = await raiseDialog(executeTool2, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });
  surfaceExchanges2.deliver({ exchangeId: dialog2.exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  const rejectedResult = (await dialog2.pending) as { code: string };

  assert.equal(unreachableResult.code, "NETWORK_UNREACHABLE");
  assert.equal(rejectedResult.code, "PROVIDER_ERROR");
  assert.notEqual(unreachableResult.code, rejectedResult.code);
});

test("with no gitAdapter configured at all, a confirmed commit fails safe with an explicit wiring-bug message — never crashes, never silently succeeds", async () => {
  const { deps } = fakeDeps(); // no gitAdapter override — production has none yet, per this file's header.
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const { exchangeId, pending } = await raiseDialog(executeTool, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });
  surfaceExchanges.deliver({ exchangeId, toolId: "source_control_execute_commit", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  const result = (await pending) as { committed: boolean; code: string; message: string };
  assert.equal(result.committed, false);
  assert.equal(result.code, "PROVIDER_ERROR");
  assert.match(result.message, /wiring bug/);
});
