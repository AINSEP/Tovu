import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { agentPluginActivations } from "../../agent-plugins/activation-effects.js";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { createTovuAgentPluginLifecycle, installAgentPlugin, recordBundledAgentPluginDigests, type AgentPluginArchiveEntry } from "#src/features/agent-plugins/lifecycle";
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import { resolveSiteRoot } from "#src/platform/site-dir/index";
import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import { sourceControlKeyBinding } from "#src/server/runtime/composition/source-control-key-binding";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import type { CustomCredentialWriteDeps } from "#src/features/custom-credentials/store";
import { createCustomCredential } from "#src/features/custom-credentials/store";
import type { CustomCredentialSetRepoPort } from "#src/features/custom-credentials/types";
import { SOURCE_CONTROL_PROVIDERS_FILENAME, loadBundledSourceControlProviderRegistry, loadSourceControlProviderRegistry } from "../provider-registry.js";
import { createSourceControlProviderKit } from "../provider-kit.js";
import { sourceControlSavedApiKeyLabels, type SourceControlProviderKit } from "../provider-module.js";
import { commitSiteToSourceControl, type SourceControlCommitAdapter } from "../commit-site.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import { createSourceControlCredential } from "../store.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { buildSourceControlRegistrations, type SourceControlToolDeps } from "../tool-registrations.js";
import { exampleRegistry } from "./fixtures/example-provider.js";
import { githubFromSource } from "./fixtures/github-from-source.js";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { SecretSealerPort } from "../../webhooks/index.js";

/**
 * @file Gate tests for the source-control credential and outbound-call paths: each test names the ONE
 * mutation that turns it red (lo-SC-0). They pin what the gates do TODAY; they change no behaviour.
 *
 * Loader tests install REAL packages and run the real plugin lifecycle, because the activation,
 * digest and containment checks live there; every other port is a recording fake of its interface.
 * The bundled loader (`loadBundledSourceControlProviderRegistry`) applies NO activation or digest
 * check: its only gate is that its root is the product payload (`bundledAgentPluginsDir()`), never an
 * operator-writable directory. The bundled tests below pin exactly that.
 */

const WORKSPACE_ID = "workspace-local";
/** A module that records its own import, so a test can tell "dropped" from "dropped after running". */
const IMPORT_MARKER = "__scGateModuleImported";
const MARKING_MODULE = `globalThis.${IMPORT_MARKER} = true;\nexport default { create() { return {}; } };\n`;
const PLAIN_MODULE = "export default { create() { return {}; } };\n";

function fileEntry(entryPath: string, content: string): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return { kind: "file", entryPath, declaredSize: bytes.byteLength, executable: false, async *openReadStream() { yield bytes; } };
}

function descriptorJson(providers: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 1, providers });
}

function provider(id: string, modulePath: string): Record<string, unknown> {
  return { id, label: id, apiOrigin: `https://${id}.example.test`, module: modulePath };
}

function pluginsLayout() {
  return resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() });
}

async function installPackage(pluginId: string, files: Readonly<Record<string, string>>): Promise<string> {
  const entries = [
    fileEntry("plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" })),
    ...Object.entries(files).map(([entryPath, content]) => fileEntry(entryPath, content)),
  ];
  const archive = new Uint8Array(Buffer.from(`${pluginId}:${JSON.stringify(files)}`));
  const installed = await installAgentPlugin({
    archive, expectedSha256: createHash("sha256").update(archive).digest("hex"),
    archiveReader: { async *entries() { yield* entries; } },
    layout: pluginsLayout(), workspaceId: WORKSPACE_ID,
  });
  return installed.archiveDigest;
}

async function withWorkspace<T>(fn: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-sc-gates-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  Reflect.deleteProperty(globalThis, IMPORT_MARKER);
  try {
    return await fn(pluginsLayout().forWorkspace({ workspaceId: WORKSPACE_ID }).root);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    Reflect.deleteProperty(globalThis, IMPORT_MARKER);
    await forceRemove(dir);
  }
}

async function markBundled(workspaceRoot: string, pluginId: string, archiveDigest: string, enabled: boolean): Promise<void> {
  await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest }] });
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId, enabled, actor: "test" }, { origin: "bundled" });
}

function loadInstalled() {
  const lifecycle = createTovuAgentPluginLifecycle({ layout: pluginsLayout() }, { bundledSourceRoot: bundledAgentPluginsDir() });
  return loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: lifecycle.loadPluginContributions });
}

function moduleWasImported(): boolean {
  return Reflect.get(globalThis, IMPORT_MARKER) === true;
}

// ---------------------------------------------------------------------------
// 1. Installed loader
// ---------------------------------------------------------------------------

// Mutation: delete the `onInactive` callback in `loadSourceControlProviderRegistry` -> `switchedOff` is empty (RED);
// or delete the activation check in the plugin lifecycle -> the provider is listed and its module runs (RED).
test("installed loader: an inactive plugin contributes no provider, is remembered in switchedOff, and its module never runs", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("gate-git", {
      [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([provider("gate-host", "source-control/gate.mjs")]),
      "source-control/gate.mjs": MARKING_MODULE,
    });
    await markBundled(workspaceRoot, "gate-git", digest, false);

    const registry = await loadInstalled();

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, []);
    assert.deepEqual([...(registry.switchedOff ?? [])], [["gate-host", "gate-git"]]);
    assert.equal(moduleWasImported(), false, "a switched-off plugin's JSON is read as data; its module is not imported");
  });
});

// Mutation: delete the digest comparison in the plugin lifecycle's trusted-file gate -> the provider loads (RED).
test("installed loader: a digest mismatch drops that plugin's providers and its module never runs", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("gate-git", {
      [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([provider("gate-host", "source-control/gate.mjs")]),
      "source-control/gate.mjs": MARKING_MODULE,
    });
    // Enabled, but installed by an operator: no recorded Tovu-shipped digest exists for it.
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: "gate-git", enabled: true, actor: "test" }, { origin: "operator-installed" });

    const registry = await loadInstalled();

    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, [
      `source-control providers from 'gate-git' were not loaded: only plugins shipped with Tovu may add source-control providers (installed digest ${digest.slice(0, 12)} is not the one this build shipped)`,
    ]);
    assert.equal(moduleWasImported(), false);
  });
});

// Mutation: delete the containment check on the module path in the trusted-file gate -> the escaping provider
// is no longer refused by name (RED).
test("installed loader: a module path escaping the plugin root drops only that provider", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("gate-git", {
      [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([provider("gate-good", "source-control/good.mjs"), provider("gate-escapes", "../escape.mjs")]),
      "source-control/good.mjs": PLAIN_MODULE,
    });
    await markBundled(workspaceRoot, "gate-git", digest, true);

    const registry = await loadInstalled();

    assert.deepEqual(registry.list().map((loaded) => loaded.descriptor.id), ["gate-good"]);
    assert.deepEqual(registry.refusals, ["source-control provider 'gate-escapes' from 'gate-git' was not loaded: module path '../escape.mjs' escapes the plugin root"]);
  });
});

// Today a non-.mjs module path makes the descriptor FILE invalid, so it drops every provider that file
// declares (the plan wording "drops only that provider" is not today's behaviour: reported, not committed).
// Mutation: loosen the ".mjs" rule of `parseSourceControlProvidersFile` -> the module path is accepted and the
// `.js` provider is listed or refused by a different sentence (RED).
test("installed loader: a non-.mjs module path invalidates the descriptor file and no module of that plugin runs", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const digest = await installPackage("gate-git", {
      [SOURCE_CONTROL_PROVIDERS_FILENAME]: descriptorJson([provider("gate-good", "source-control/good.mjs"), provider("gate-script", "source-control/script.js")]),
      "source-control/good.mjs": MARKING_MODULE,
      "source-control/script.js": MARKING_MODULE,
    });
    await markBundled(workspaceRoot, "gate-git", digest, true);

    const registry = await loadInstalled();

    assert.deepEqual(registry.list(), []);
    assert.equal(registry.refusals.length, 1);
    assert.match(registry.refusals[0]!, /^source-control providers from 'gate-git' were not loaded: .*\.mjs/);
    assert.equal(moduleWasImported(), false);
  });
});

// ---------------------------------------------------------------------------
// 2. Bundled loader: its only gate is its root
// ---------------------------------------------------------------------------

// Mutation: pass an activation or digest argument as a second argument of `load` (or filter `sources` by activation)
// -> the recorded call is no longer the package alone (RED).
test("bundled loader: imports a package with NO activation or digest input (its only gate is the product-payload root)", async () => {
  const pkg = { pluginId: "gate-bundled", packageRoot: "/product/content/agent-plugins/gate-bundled" };
  const sourceRequests: unknown[] = [];
  const loadCalls: unknown[][] = [];
  const registry = await loadBundledSourceControlProviderRegistry({ sourceRoot: "/product/content/agent-plugins" }, {
    sources: (required) => { sourceRequests.push(required); return [pkg]; },
    load: async (...args) => { loadCalls.push(args); return exampleRegistry({ probe: false, ids: ["example-git"] }); },
  });

  assert.deepEqual(sourceRequests, [{ sourceRoot: "/product/content/agent-plugins", filename: SOURCE_CONTROL_PROVIDERS_FILENAME }]);
  assert.equal(loadCalls.length, 1);
  assert.equal(loadCalls[0]!.length, 1, "no activation state, digest or workspace is passed to the bundled import");
  assert.equal(loadCalls[0]![0], pkg, "the package reaches the importer unchanged");
  assert.deepEqual(registry.list().map((loaded) => loaded.descriptor.id), ["example-git"]);
  assert.equal(registry.switchedOff, undefined, "a bundled registry has no notion of a switched-off plugin");
});

// Mutation: append the caught error's message to the refusal sentence in `loadBundledSourceControlProviderRegistry` -> the exact-sentence assertion is RED.
test("bundled loader: a throwing source enumeration yields zero providers and the fixed refusal, never the error text", async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  let imports = 0;
  const registry = await loadBundledSourceControlProviderRegistry({ sourceRoot: "/product/root" }, {
    sources: () => { throw new Error("enumeration failed with /private/path"); },
    load: async () => { imports++; return exampleRegistry({ probe: false }); },
  });

  assert.deepEqual(registry.list(), []);
  assert.deepEqual(registry.refusals, ["bundled source-control provider sources could not be read"]);
  assert.equal(imports, 0);
  assert.equal(warnings.length, 1, "the detail goes to the log once");
  assert.equal(JSON.stringify(registry.refusals).includes("/private/path"), false);
});

// Mutation: delete the duplicate-id sweep (the `for (const id of duplicates)` loop) -> the last claimant wins (RED).
test("bundled loader: an id two packages declare is refused for both claimants", async () => {
  const claimant = (ids: readonly string[]) => async () => exampleRegistry({ probe: false, ids });
  const registry = await loadBundledSourceControlProviderRegistry({ sourceRoot: "/product/root" }, {
    sources: () => [{ pluginId: "first", packageRoot: "/product/first" }, { pluginId: "second", packageRoot: "/product/second" }],
    load: async (plugin) => (plugin.pluginId === "first" ? claimant(["example-git", "example-token"]) : claimant(["example-git"]))(),
  });

  assert.equal(registry.get({ providerId: "example-git" }), undefined);
  assert.deepEqual(registry.list().map((loaded) => loaded.descriptor.id), ["example-token"]);
  assert.deepEqual(registry.refusals, ["source-control provider 'example-git' was not loaded: declared more than once"]);
});

// ---------------------------------------------------------------------------
// 3. Kit transports (the production kit)
// ---------------------------------------------------------------------------

interface RecordedTransports {
  readonly kit: SourceControlProviderKit;
  readonly fetched: { url: string; init: RequestInit | undefined }[];
  readonly sent: unknown[];
  readonly client: HttpClientPort;
}

function recordingKit(): RecordedTransports {
  const fetched: RecordedTransports["fetched"] = [];
  const sent: unknown[] = [];
  const client: HttpClientPort = { send: async (request) => { sent.push(request); return { status: 204, headers: {}, bodyText: "" }; } };
  const fetchFn = (async (url: string, init?: RequestInit) => { fetched.push({ url, init }); return new Response(null, { status: 204 }); }) as typeof fetch;
  return { kit: createSourceControlProviderKit({ httpClient: client, fetchFn }), fetched, sent, client };
}

// Mutation: in `provider-kit.ts` change `fetchRedirectPolicy: "caller"` to `"guard"` -> `init` reaches `fetchFn`
// rewritten by the redirect guard, so the unchanged-init assertion is RED.
test("kit.fetch reaches the native fetch only, with init UNCHANGED (the plugin applies the redirect guard itself)", async () => {
  const { kit, fetched, sent } = recordingKit();
  const init: RequestInit = { method: "GET", headers: { accept: "application/json" } };
  const before = JSON.stringify(init);

  await kit.fetch("https://api.example.test/user", init);

  assert.equal(fetched.length, 1);
  assert.equal(fetched[0]!.url, "https://api.example.test/user");
  assert.equal(fetched[0]!.init, init, "the same init object, not a copy with a redirect option added");
  assert.equal(JSON.stringify(fetched[0]!.init), before);
  assert.equal("redirect" in (fetched[0]!.init ?? {}), false);
  assert.deepEqual(sent, [], "kit.fetch never uses the guarded client");
});

// Mutation: route `kit.fetch` through `httpClient.send` (or `kit.httpClient` through `fetchFn`) -> the other recorder is non-empty (RED).
test("kit.httpClient.send reaches the guarded client only", async () => {
  const { kit, fetched, sent, client } = recordingKit();
  const request = { method: "POST" as const, url: "https://api.example.test/files", headers: {}, body: "{}", idleTimeoutMs: 1000 };

  assert.equal(kit.httpClient, client);
  await kit.httpClient.send(request);

  assert.deepEqual(sent, [request]);
  assert.equal(sent[0], request);
  assert.deepEqual(fetched, [], "the guarded client never falls back to the native fetch");
});

// Mutation: make `NO_HTTP_CLIENT.send` resolve (or fall back to `fetchFn`) -> `assert.rejects` is RED.
test("without a guarded client, httpClient.send rejects with a transport error and sends nothing", async () => {
  const fetched: string[] = [];
  const kit = createSourceControlProviderKit({ fetchFn: (async (url: string) => { fetched.push(url); return new Response(null); }) as typeof fetch });
  const request = { method: "GET" as const, url: "https://api.example.test/user", headers: { authorization: "Bearer fixture" }, idleTimeoutMs: 1000 };

  await assert.rejects(() => kit.httpClient.send(request), { message: "no outbound HTTP client is wired for this call" });
  assert.deepEqual(fetched, []);
});

// ---------------------------------------------------------------------------
// 4. describeTransportError
// ---------------------------------------------------------------------------

// Mutation: in `provider-kit.ts` return `error.message` as `refusal` for any error -> the non-refusal cases are RED.
test("describeTransportError: only an egress refusal supplies a caller-safe refusal; no other error text reaches it", () => {
  const { kit } = recordingKit();
  const refused = kit.describeTransportError(new EgressRefusedError(
    { message: "host 'meta.internal' resolved to 169.254.169.254" },
    { callerSafeMessage: "host 'meta.internal' resolves to a non-public address" },
  ));
  assert.equal(refused.refusal, "host 'meta.internal' resolves to a non-public address");

  const secretText = "connect ECONNREFUSED 10.0.0.7 token=fixture_secret";
  for (const error of [new Error(secretText), new TypeError(secretText), secretText, { message: secretText }, null, undefined]) {
    const described = kit.describeTransportError(error);
    assert.equal(described.refusal, undefined);
    assert.equal(JSON.stringify(described.refusal ?? "").includes("fixture_secret"), false);
  }
});

// ---------------------------------------------------------------------------
// 6. Saved-key fallback
// ---------------------------------------------------------------------------

test("saved-key labels: exactly one provider id may borrow a saved custom API key", () => {
  assert.deepEqual([...sourceControlSavedApiKeyLabels], [["github", "github"]]);
});

interface FallbackHarness {
  readonly asked: unknown[];
  readonly committed: string[];
  readonly run: (repo: InMemorySourceControlCredentialSetRepo, sealer?: SecretSealerPort) => ReturnType<typeof commitSiteToSourceControl>;
}

function fallbackHarness(): FallbackHarness {
  const asked: unknown[] = [];
  const committed: string[] = [];
  const gitAdapter: SourceControlCommitAdapter = {
    async commit(input) {
      committed.push(input.token);
      return { ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://git.example.test/c/abc123", filesChanged: 1, filesDeleted: 0 };
    },
  };
  const unusedSealer: SecretSealerPort = { seal: async () => { throw new Error("not used"); }, open: async () => { throw new Error("not used"); } };
  const run = async (repo: InMemorySourceControlCredentialSetRepo, sealer: SecretSealerPort = unusedSealer) => {
    const exportRoot = await mkdtemp(path.join(tmpdir(), "tovu-sc-gates-export-"));
    try {
      return await commitSiteToSourceControl(
        { providerId: "github", gitAdapter, credentialDeps: {
          repo, sealer,
          resolveSavedApiKey: async (input) => { asked.push(input); return { token: "fixture_saved_token" } as never; },
        } },
        {
          workspaceId: "ws-1", owner: "octo", repo: "demo", commitMessage: "gate", sourceControlExportRootDir: exportRoot,
          idGen: { newId: () => "run-1" }, staticSiteContext: async () => ({ name: "Demo", slug: "demo", theme: "Fixture", themeId: "fixture" }),
          exportSiteBound: async ({ outputDir }) => ({ outputDir, routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<html></html>" }], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] }),
        },
      );
    } finally { await forceRemove(exportRoot); }
  };
  return { asked, committed, run };
}

// Mutation: in `resolveCommitCredential` ask the saved key even when the default lookup threw (catch and continue) -> `asked` is non-empty (RED).
test("saved-key fallback: never asked when the credential store throws; the outcome is the fixed storage sentence", async (t) => {
  const harness = fallbackHarness();
  const repo = new InMemorySourceControlCredentialSetRepo();
  t.mock.method(repo.vault!, "list", async () => { throw new Error("store failed with fixture_private_detail"); }, {});

  const result = await harness.run(repo);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(result.message, "credential could not be resolved: The credential could not be saved or unlocked. Check the site credential store.");
  assert.deepEqual(harness.asked, []);
  assert.deepEqual(harness.committed, []);
});

// Mutation: drop the `!credential &&` condition so the saved key is asked first -> the explicit-credential case asks it (RED); or
// never ask it -> the no-credential case commits nothing (RED).
test("saved-key fallback: asked only when no source-control credential exists", async () => {
  const none = fallbackHarness();
  const outcome = await none.run(new InMemorySourceControlCredentialSetRepo());
  assert.equal(outcome.ok, true);
  assert.deepEqual(none.asked, [{ workspaceId: "ws-1", providerId: "github" }]);
  assert.deepEqual(none.committed, ["fixture_saved_token"]);

  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const repo = new InMemorySourceControlCredentialSetRepo();
  await createSourceControlCredential({ deps: {
    repo, sealer, keyring, clock: createSystemClock(), idGen: createRandomUuidGenerator(),
    loadSourceControlProviders: githubFromSource, httpClient: { send: async () => ({ status: 200, headers: {}, bodyText: '{"login":"octo"}' }) },
  }, input: { workspaceId: "ws-1", label: "Explicit", connection: { providerId: "github", token: "fixture_explicit_token" } } });
  const explicit = fallbackHarness();
  assert.equal((await explicit.run(repo, sealer)).ok, true);
  assert.deepEqual(explicit.asked, [], "an existing connection is never overridden by the saved key");
  assert.deepEqual(explicit.committed, ["fixture_explicit_token"]);
});

type CustomRepo = CustomCredentialSetRepoPort;

function recordingCustomRepo(): { repo: CustomRepo; touched: string[] } {
  const touched: string[] = [];
  const repo = new Proxy({}, { get: (_target, name) => { touched.push(String(name)); return () => Promise.reject(new Error("a store was touched")); } }) as CustomRepo;
  return { repo, touched };
}

// Mutation: in `source-control-key-binding.ts` make `labelFor` fall back to the provider id (`?? providerId`) -> the
// undeclared id reads the store (RED).
test("saved-key binding: only a declared provider id reaches the custom-credential store", async () => {
  const { repo, touched } = recordingCustomRepo();
  const credentials = { repo, sealer: { seal: async () => { throw new Error("not used"); }, open: async () => { throw new Error("not used"); } } } as unknown as CustomCredentialWriteDeps;
  const binding = sourceControlKeyBinding({ credentials, loadProviders: async () => exampleRegistry({ probe: false }) });

  assert.equal(binding.supports({ providerId: "github" }), true);
  assert.equal(binding.supports({ providerId: "example-git" }), false);
  await assert.rejects(binding.describe({ workspaceId: "ws-1", providerId: "example-git" }), /has no saved key label/);
  await assert.rejects(binding.resolve({ workspaceId: "ws-1", providerId: "example-git" }), /has no saved key label/);
  assert.deepEqual(touched, [], "an undeclared provider never opens the store");

  await assert.rejects(binding.describe({ workspaceId: "ws-1", providerId: "github" }), /a store was touched/);
  assert.notDeepEqual(touched, [], "the declared provider does read it (positive control)");
});

// The tool path: a saved custom key labelled with an UNDECLARED provider id never stands in for it.
const TOOL_PRINCIPAL = "principal-under-test";

function toolFor(deps: SourceControlToolDeps, id: string): ToolRegistration {
  const exchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const found = new Map(buildSourceControlRegistrations(deps, { surfaceExchanges: exchanges }).map((registration) => [registration.descriptor.id, registration])).get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function callTool(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: TOOL_PRINCIPAL }, run: { id: "run-1" }, input, signal: new AbortController().signal };
  return registration.handler(ctx);
}

// Mutation: in `tool-registrations.ts` `resolveSavedApiKey`/`findSavedApiKey` use `?? providerId` as the label -> the
// example-git commit below is committed with the saved key (RED).
test("saved-key fallback through the commit tool: a key saved under an undeclared provider id is never used for it", async () => {
  const exportRoot = await mkdtemp(path.join(tmpdir(), "tovu-sc-gates-tool-"));
  try {
    const tokens: string[] = [];
    const base = createRouteDeps();
    const deps = {
      ...base,
      sourceControlExportRootDir: exportRoot,
      authorize: async () => ({ allowed: true, reason: "matched" }),
      staticSiteContext: async () => ({ name: "Demo", slug: "demo", theme: "Fixture", themeId: "fixture" }),
      exportSiteBound: async ({ outputDir }: { outputDir: string }) => ({ outputDir, routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<html></html>" }], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] }),
      gitAdapter: { async commit(input) { tokens.push(input.token); return { ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://git.example.test/c/abc123", filesChanged: 1, filesDeleted: 0 } as const; } } satisfies SourceControlCommitAdapter,
      loadSourceControlProviders: async ({ workspaceId }: { workspaceId: string }) => {
        const github = await githubFromSource({ workspaceId });
        const other = exampleRegistry({ probe: false, ids: ["example-git"] });
        return { list: () => [...github.list(), ...other.list()], get: (required: { providerId: string }) => github.get(required) ?? other.get(required), refusals: [] };
      },
    } as unknown as SourceControlToolDeps & { customCredentialSetRepo: CustomCredentialSetRepoPort };
    const save = (label: string, token: string) => createCustomCredential({ repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen }, {
      workspaceId: deps.workspaceId, scope: "site", label, category: "source-control", baseUrl: "https://git.example.test", connection: { token },
    });
    await save("example-git", "fixture_undeclared_key");
    const execute = toolFor(deps, "source_control_execute_commit");

    const refused = await callTool(execute, { provider: "example-git", owner: "octo", repo: "demo", commitMessage: "gate" }) as { committed: boolean; reason?: string };
    assert.equal(refused.committed, false);
    assert.equal(refused.reason, "no-credential");
    assert.deepEqual(tokens, []);

    await save("github", "fixture_declared_key");
    const allowed = await callTool(execute, { provider: "github", owner: "octo", repo: "demo", commitMessage: "gate" }) as { committed: boolean };
    assert.equal(allowed.committed, true, "positive control: the declared provider id does use its saved key");
    assert.deepEqual(tokens, ["fixture_declared_key"]);
  } finally { await forceRemove(exportRoot); }
});
