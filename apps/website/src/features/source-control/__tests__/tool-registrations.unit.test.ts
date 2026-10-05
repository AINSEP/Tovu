import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { registerMcpUiToolCallsRoute } from "#src/assistant/mcp-ui-tool-calls-route";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import type { SourceControlCommitAdapter, SourceControlCommitResult } from "../commit-site.js";
import { loadSourceControlProviderRegistryFromSource, type LoadSourceControlProviders } from "../provider-registry.js";
import { createSourceControlCredential } from "../store.js";

import { buildSourceControlRegistrations, sourceControlAgentToolCatalog, sourceControlDerivedRisk, type SourceControlToolDeps } from "../tool-registrations.js";

/**
 * @file `tool-registrations.ts` wiring proof — modelled on `deployments/__tests__/
 * publish-agent-tools.unit.test.ts`'s own shape: the same MCP-UI held-open exchange mechanism, so
 * the same certification shape applies. `source_control_execute_commit`'s gate is exercised with a
 * FAKE `gitAdapter`; the one test that proves the real adapter is the default stubs `fetch` for
 * `api.github.com` only.
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
/** The bundled `github` plugin read from its source directory (no install or activation gate). */
const GITHUB_PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugins/github");
const githubFromSource: LoadSourceControlProviders = () => loadSourceControlProviderRegistryFromSource({ pluginId: "github", packageRoot: GITHUB_PACKAGE_ROOT });
/** A workspace where no plugin provides a git host (the github plugin turned off). */
const noProviders: LoadSourceControlProviders = async () => ({ list: () => [], get: () => undefined, refusals: [] });

function fakeDeps(options: { allow?: boolean; gitAdapter?: SourceControlCommitAdapter; loadSourceControlProviders?: LoadSourceControlProviders } = {}): {
  deps: SourceControlToolDeps;
  authorizeCalls: Record<string, unknown>[];
  setAllow: (value: boolean) => void;
} {
  let allow = options.allow ?? true;
  const authorizeCalls: Record<string, unknown>[] = [];
  const base = createRouteDeps();

  const deps: SourceControlToolDeps = {
    ...base,
    exportSiteBound: async ({outputDir}) => ({outputDir, routes: {succeeded: [{path: "/", kind: "home", outputFile: "index.html", data: "<html>export fixture</html>"}], failed: []}, assets: {succeeded: [], failed: []}, skippedManifestEntries: [], unreferencedThemeFiles: []}),
    sourceControlExportRootDir: exportDir,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    loadSourceControlProviders: options.loadSourceControlProviders ?? githubFromSource,
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
async function beginCall(executeTool: ToolRegistration, input: Record<string, unknown>) {
  return {pending: call(executeTool, {input})};
}

/** Execute the emitted action script over its button ids; route the resulting call through
 * the real MCP-UI callback handler. The DOM and trusted browser event are the test seam. */
async function clickDialogAction(html: string, action: "confirm" | "cancel", surfaceExchanges: SurfaceExchangeStore): Promise<void> {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(script);
  const apiName = /var api = window\.(\w+)/.exec(script)?.[1];
  assert.ok(apiName);
  const buttons = [...html.matchAll(/data-mcpui-action="([^"]+)"/g)].map((match) => ({
    id: match[1]!, disabled: false,
    listeners: new Map<string, (event: unknown) => void>(),
    getAttribute(name: string) { return name === "data-mcpui-action" ? this.id : null; },
    addEventListener(name: string, fn: (event: unknown) => void) { this.listeners.set(name, fn); },
  }));
  let route!: (req: unknown, res: unknown) => Promise<void>;
  registerMcpUiToolCallsRoute({ post: (_path: string, handler: typeof route) => { route = handler; } } as never, {
    surfaceExchanges, toolExecutor: { execute: async () => { assert.fail("an exchange answer must not execute a fresh tool"); } } as never,
  });
  const routed: Promise<void>[] = [];
  let time = 0;
  const api = {
    callTool: (toolName: string, params: Record<string, unknown>) => {
      const response = { statusCode: 0, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { assert.equal(this.statusCode, 202); assert.deepEqual(body, { delivered: true }); } };
      const pending = route({ get: () => PRINCIPAL_ID, body: { toolName, params } }, response);
      routed.push(pending);
      return pending;
    },
    requestTeardown: () => {},
  };
  runInNewContext(script, {
    window: { [apiName]: api }, performance: { now: () => time },
    document: { visibilityState: "visible", getElementById: () => ({ textContent: "", setAttribute: () => {} }),
      querySelectorAll: (selector: string) => selector === "[data-mcpui-action]" ? buttons : [], addEventListener: () => {} },
    setTimeout: () => 1, clearTimeout: () => {},
  });
  time = 1500; // Complete the confirmation surface's dwell without a wall-clock sleep.
  const button = buttons.find((candidate) => candidate.id === action);
  assert.ok(button);
  const click = button.listeners.get("click");
  assert.ok(click);
  click({ isTrusted: true, currentTarget: button });
  assert.equal(routed.length, 1, "the actual emitted action must issue one callback");
  await routed[0];
}

function dialogDetails(html: string): Record<string, string> {
  return Object.fromEntries([...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map((match) => [match[1], match[2]!.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")]));
}

const FAKE_SUCCESS: SourceControlCommitResult = { ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://github.com/octo/demo/commit/abc123", filesChanged: 2, filesDeleted: 0 };

function fakeGitAdapter(result: SourceControlCommitResult): SourceControlCommitAdapter {
  return { async commit() { return result; } };
}

function neverCalledGitAdapter(): SourceControlCommitAdapter {
  return { async commit() { throw new Error("gitAdapter.commit must not be called on this path"); } };
}

// ---------------------------------------------------------------------------
// 1. Wiring shape — all tools
// ---------------------------------------------------------------------------

test("buildSourceControlRegistrations wires all tools, each with an input schema", () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildSourceControlRegistrations(deps, { surfaceExchanges });
  const ids = registrations.map((r) => r.descriptor.id).sort();
  assert.deepEqual(ids, ["source_control_execute_commit", "source_control_get_capabilities", "source_control_propose_credential"]);
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

test("source_control_execute_commit's schema carries no token/credential field of any kind, and 'provider' names no host (the registry decides)", () => {
  const entry = sourceControlAgentToolCatalog.find((t) => t.name === "source_control_execute_commit")!;
  const schema = entry.inputSchema as { properties: Record<string, unknown>; additionalProperties?: boolean; required: string[] };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["branch", "commitMessage", "dryRun", "owner", "provider", "repo"]);
  assert.deepEqual(schema.required.sort(), ["commitMessage", "owner", "provider", "repo"]);
  assert.equal((schema.properties.provider as { type: string; enum?: unknown }).type, "string");
  assert.equal((schema.properties.provider as { enum?: unknown }).enum, undefined);
  assert.doesNotMatch(JSON.stringify(entry), /github/i, "tool copy names no host; source_control_get_capabilities lists them");
});

// ---------------------------------------------------------------------------
// 2. source_control_get_capabilities
// ---------------------------------------------------------------------------

test("source_control_get_capabilities reports the hosts the registry provides, with their declared facts, honestly distinguishing configured from commitSupported", async () => {
  const { deps } = fakeDeps();
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "source_control_get_capabilities");

  const result = (await call(capabilities)) as { providers: { providerId: string; label?: string; apiOrigin?: string; maxFileBytes?: number; configured: boolean; commitSupported: boolean; guidance?: string }[] };

  // Only what the registry provides (the github plugin, from source) plus saved hosts: no fixed list.
  assert.deepEqual(result.providers.map((p) => p.providerId), ["github"]);
  const github = result.providers[0]!;
  assert.equal(github.label, "GitHub");
  assert.equal(github.apiOrigin, "https://api.github.com");
  assert.equal(github.maxFileBytes, 100 * 1024 * 1024);
  assert.equal(github.configured, true);
  assert.equal(github.commitSupported, true);
  assert.equal(github.guidance, undefined, "configured AND commit-supported has nothing to tell the human");
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
  assert.match(gitlab.guidance ?? "", /credential is saved.*no enabled Agent Plugin supports committing/is);
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

test("a provider no plugin declares and no credential can be saved for throws before any permission check, dialog, or credential lookup", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "not-a-host", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async () => {} }),
    { message: "source_control_execute_commit: 'not-a-host' is not a source control host. Hosts: 'github' (see source_control_get_capabilities)." },
  );
  assert.equal(surfaceExchanges.size(), 0);
});

// ---------------------------------------------------------------------------
// 3a. 500-redact defect (RED->GREEN): both `parseCommitCommand` checks used to throw a bare
// `Error`, tagged `errorKind: 'internal'` by `@jini-ai/daemon`'s `ToolExecutor` and redacted to a
// message-stripped 500 by `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` (SEC-005). Both now
// throw `ToolInputError`, mirroring `features/post/tool-registrations.ts`'s fix shape.
// ---------------------------------------------------------------------------

test("an unsupported provider is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "not-a-host", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async () => {} }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    },
  );
});

test("a saved gitlab credential with no plugin providing gitlab is refused as 'no-provider' before any dialog", async () => {
  const { deps } = fakeDeps({ gitAdapter: undefined });
  await createSourceControlCredential(
    { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "GL", connection: { providerId: "gitlab", token: "glpat_secret" } }
  );
  const emitted: unknown[] = [];
  const result = await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), "source_control_execute_commit"), { input: { provider: "gitlab", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async (s) => void emitted.push(s) });
  assert.deepEqual(result, {
    committed: false,
    reason: "no-provider",
    message: "No enabled Agent Plugin provides 'gitlab' source control, and no installed one declares it. Open the admin's Add-Ons > Agent Plugins screen to install or turn on a plugin that provides it.",
  });
  assert.equal(emitted.length, 0);
});

test("an invalid target (bad owner) is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "github", owner: "not valid!!", repo: "demo", commitMessage: "x" }, emitSurface: async () => {} }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    },
  );
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

// REGRESSION (fix-plan C6c): a non-string `branch` (123) was silently dropped, so the commit went to
// the repository's DEFAULT branch instead of the one the model named.
test("a present non-string branch is a ToolInputError naming the field, before any dialog or adapter call", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x", branch: 123 }, emitSurface: async () => {} }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.equal((err as Error).message, "source_control_execute_commit: 'branch' must be a string when provided");
      return true;
    },
  );
  assert.equal(surfaceExchanges.size(), 0);
});

// The descriptions gave a failed commit the `reason` shape (it returns `code`; only an unavailable
// credential/provider returns `reason`) and pointed at a "DIVERGED_BRANCH result below" that nothing
// below described.
test("source_control_execute_commit's copy names the failure shape the handler actually returns", () => {
  const { deps } = fakeDeps();
  const descriptor = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "source_control_execute_commit").descriptor;
  const branch = (descriptor.inputSchema as { properties: { branch: { description: string } } }).properties.branch.description;
  assert.match(descriptor.description, /\{committed:false, reason, message\} when the credential or provider is unavailable/);
  assert.match(descriptor.description, /\{committed:false, cancelled:false, code, message\} when the commit itself fails/);
  assert.match(branch, /\{committed:false, code:'DIVERGED_BRANCH'\}/);
  assert.doesNotMatch(branch, /result below/);
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

// ---------------------------------------------------------------------------
// 4. source_control_execute_commit — confirmed path, fake gitAdapter (still no real network)
// ---------------------------------------------------------------------------

test("confirm: a successful commit reports committed:true with every field from the adapter's result", async () => {
  const success = { ...FAKE_SUCCESS, branch: "release/2", branchCreated: true, filesDeleted: 3, divergedPaths: ["kept-custom.html"] };
  const requests: unknown[] = [];
  const { deps } = fakeDeps({ gitAdapter: { commit: async (input) => { requests.push(input); return success; } } });
  deps.exportSiteBound = async ({ outputDir }) => ({ outputDir,
    routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<html>commit canary</html>" }], failed: [] },
    assets: { succeeded: [{ url: "/image.png", outputFile: "image.png", data: Buffer.from([0, 128, 255]) }], failed: [] },
    skippedManifestEntries: [], unreferencedThemeFiles: [],
  });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const { pending } = await beginCall(executeTool, { provider: "github", owner: "octo", repo: "demo", branch: "release/2", commitMessage: "content update" });

  const result = (await pending) as { committed: boolean; owner: string; repo: string; branch: string; commitSha: string; filesChanged: number; filesDeleted: number };
  assert.equal(result.committed, true);
  assert.equal(result.owner, "octo");
  assert.equal(result.repo, "demo");
  assert.equal(result.branch, "release/2");
  assert.equal(result.commitSha, "abc123");
  assert.equal(result.filesChanged, 2);
  assert.equal(result.filesDeleted, 3);
  assert.deepEqual(result, { committed: true, owner: "octo", repo: "demo", branch: "release/2", branchCreated: true, commitSha: "abc123", commitUrl: "https://github.com/octo/demo/commit/abc123", filesChanged: 2, filesDeleted: 3, divergedPaths: ["kept-custom.html"] });
  assert.deepEqual(requests, [{ token: "ghp_fake_token_never_real", owner: "octo", repo: "demo", branch: "release/2", commitMessage: "content update", files: [
    { path: "index.html", data: "<html>commit canary</html>" }, { path: "image.png", data: Buffer.from([0, 128, 255]) },
  ] }]);
  assert.equal(surfaceExchanges.size(), 0);
});

test("confirm: a DIVERGED_BRANCH result from the adapter is surfaced distinctly, never overwritten silently", async () => {
  const { deps } = fakeDeps({ gitAdapter: fakeGitAdapter({ ok: false, code: "diverged", message: "the branch has moved" }) });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const { pending } = await beginCall(executeTool, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });

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
  const dialog1 = await beginCall(executeTool1, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });
  const unreachableResult = (await dialog1.pending) as { code: string };

  const { deps: rejectedDeps } = fakeDeps({ gitAdapter: fakeGitAdapter({ ok: false, code: "provider-error", message: "401 Bad credentials" }) });
  await seedGithubCredential(rejectedDeps);
  const surfaceExchanges2 = createSurfaceExchangeStore();
  const executeTool2 = tool(buildRegistrations(rejectedDeps, surfaceExchanges2), "source_control_execute_commit");
  const dialog2 = await beginCall(executeTool2, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });
  const rejectedResult = (await dialog2.pending) as { code: string };

  assert.equal(unreachableResult.code, "NETWORK_UNREACHABLE");
  assert.equal(rejectedResult.code, "PROVIDER_ERROR");
  assert.notEqual(unreachableResult.code, rejectedResult.code);
});

// Regression (2026-09-24): production never passes `gitAdapter`, and the tool used to forward only an
// injected one, so every confirmed commit answered "no GitHub commit adapter is configured — this is
// a wiring bug". With no override, the confirmed call must reach the real GitHub adapter.
test("with no gitAdapter override, a confirmed commit reaches the real GitHub adapter", async () => {
  const { deps } = fakeDeps();
  await seedGithubCredential(deps, "ghp_wiring_probe");
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  const requested: { url: string; authorization: string | null }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    // The export step crawls the local site over real HTTP first; only GitHub is intercepted.
    if (!String(input).startsWith("https://api.github.com/")) return originalFetch(input, init);
    requested.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const { pending } = await beginCall(executeTool, { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" });

    const result = (await pending) as { committed: boolean; code: string; message: string };
    assert.equal(result.committed, false);
    assert.equal(result.code, "REPOSITORY_NOT_FOUND");
    assert.equal(result.message, "no repository 'octo/demo' is reachable with this token — it may not exist, or the token cannot see it");
    assert.deepEqual(requested, [{ url: "https://api.github.com/repos/octo/demo", authorization: "Bearer ghp_wiring_probe" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 2026-09-29: GitHub's owner/repo rules live in the plugin module (validateTarget). With no plugin
// providing the host, only core's generic rule applies and its text names no host.
test("with no plugin providing github, a malformed owner gets core's generic refusal, not GitHub's", async () => {
  const { deps } = fakeDeps({ loadSourceControlProviders: noProviders, gitAdapter: neverCalledGitAdapter() });
  await seedGithubCredential(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "github", owner: "has space", repo: "demo", commitMessage: "x" }, emitSurface: async () => {} }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError);
      assert.equal(err.message, "source_control_execute_commit: invalid owner 'has space'");
      return true;
    },
  );
  assert.equal(surfaceExchanges.size(), 0);
});

test("a dry run with a malformed owner is refused with the plugin's GitHub text before any export", async () => {
  const { deps } = fakeDeps({ gitAdapter: neverCalledGitAdapter() });
  const executeTool = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "source_control_execute_commit");

  await assert.rejects(
    () => call(executeTool, { input: { provider: "github", owner: "-leading-hyphen", repo: "demo", commitMessage: "x", dryRun: true } }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError);
      assert.equal(err.message, "source_control_execute_commit: invalid GitHub owner '-leading-hyphen'");
      return true;
    },
  );
});

// 2026-09-29: GitHub committing moved into the bundled `github` Agent Plugin. With that plugin off,
// the host is reported as not commit-ready and a commit is refused BEFORE any dialog opens.
test("with no plugin providing github, capabilities report commitSupported:false and say how to turn it on", async () => {
  const { deps } = fakeDeps({ loadSourceControlProviders: noProviders });
  await seedGithubCredential(deps);
  const capabilities = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "source_control_get_capabilities");

  const result = (await call(capabilities)) as { providers: { providerId: string; configured: boolean; commitSupported: boolean; guidance?: string }[] };
  const github = result.providers.find((p) => p.providerId === "github");
  assert.equal(github?.configured, true);
  assert.equal(github?.commitSupported, false);
  assert.equal(github?.guidance, "A github credential is saved, but no enabled Agent Plugin supports committing to github.");
});

test("with the github plugin switched off, capabilities and a commit both name the plugin and the screen that turns it back on", async () => {
  const switchedOff: LoadSourceControlProviders = async () => ({ list: () => [], get: () => undefined, refusals: [], switchedOff: new Map([["github", "github"]]) });
  const { deps } = fakeDeps({ loadSourceControlProviders: switchedOff });
  await seedGithubCredential(deps);
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  const howTo = "the 'github' Agent Plugin is switched off. To switch it back on, open the admin's Add-Ons > Agent Plugins screen and turn on 'github'.";

  const capabilities = (await call(tool(registrations, "source_control_get_capabilities"))) as { providers: { providerId: string; guidance?: string }[] };
  assert.equal(capabilities.providers.find((p) => p.providerId === "github")?.guidance, `A github credential is saved, but no enabled Agent Plugin supports committing to github: ${howTo}`);

  const emitted: unknown[] = [];
  const result = await call(tool(registrations, "source_control_execute_commit"), { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async (s) => void emitted.push(s) });
  assert.deepEqual(result, { committed: false, reason: "no-provider", message: `No enabled Agent Plugin provides 'github' source control: ${howTo}` });
  assert.equal(emitted.length, 0);
});

test("with no plugin providing github, a commit is refused with reason 'no-provider' and never raises a dialog", async () => {
  const { deps } = fakeDeps({ loadSourceControlProviders: noProviders });
  await seedGithubCredential(deps);
  const executeTool = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "source_control_execute_commit");

  const emitted: unknown[] = [];
  const result = await call(executeTool, { input: { provider: "github", owner: "octo", repo: "demo", commitMessage: "x" }, emitSurface: async (s) => void emitted.push(s) });
  assert.deepEqual(result, {
    committed: false,
    reason: "no-provider",
    message: "No enabled Agent Plugin provides 'github' source control, and no installed one declares it. Open the admin's Add-Ons > Agent Plugins screen to install or turn on a plugin that provides it.",
  });
  assert.equal(emitted.length, 0);
});

 test("n06: repository write runs without a confirmation channel", async (t) => {
  const {deps} = fakeDeps({gitAdapter: fakeGitAdapter(FAKE_SUCCESS)});
  await seedGithubCredential(deps);
  const store = createSurfaceExchangeStore();
  const result = await call(tool(buildRegistrations(deps, store), "source_control_execute_commit"), {input: {provider: "github", owner: "octo", repo: "demo", commitMessage: "Save"}}) as {committed: boolean; commitSha: string};
  assert.equal(result.committed, true);
  assert.equal(result.commitSha, "abc123");
  assert.equal(store.size(), 0);
});
