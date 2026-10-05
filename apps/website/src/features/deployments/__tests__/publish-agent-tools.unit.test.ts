import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";
import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort } from "../../vendor-credentials/types.js";
import { InMemoryPublishCredentialVerificationCache, InMemoryPublishHistoryStore, type PublishCredentialSource } from "../static-publish/index.js";
// Seeds vendor rows the way another feature (the vendor store) writes them.
import { createPublishCredential, resolveForPublish } from "../publish-credentials/store.js";

import type { LoadedDeployTarget } from "../deploy-targets/types.js";
import { loadBundledDeployTargets } from "../deploy-targets/__tests__/bundled-deploy-targets.fixture.js";
import { buildStaticPublishRegistrations, staticPublishAgentToolCatalog, staticPublishDerivedRisk, type StaticPublishToolDeps } from "../publish-agent-tools.js";

/**
 * @file `publish-agent-tools.ts` wiring proof, rewritten for the 2026-08-15 change that wired
 * `deployment_execute_static_publish` and added `deployment_get_static_publish_capabilities` (both
 * were previously either unwired or nonexistent — see this file's previous revision in git history for
 * what it certified before).
 *
 * Publishing runs immediately after permission, readiness and config checks. The publish adapter
 * reports the provider outcome through the same call; credential forms still use held exchanges.
 * Handler tests inject only the export and provider seams. The separate real-export test binds
 * loopback and runs only when TOVU_G3_REAL_EXPORT=1, retaining its body/base-path assertions.
 */

const WORKSPACE_ID_FALLBACK = "ws-static-publish-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-15T00:00:00.000Z";

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-agent-tools-test-"));
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

/** Real hermetic `RouteDeps` (`createRouteDeps()`, the same fixture `adapter.unit.test.ts` and the
 *  sibling `deployments` integration test use — real, in-process, no external network), with
 *  `authorize` overridden and this file's own test-only `credentialSource`/`buildTarget` seams
 *  optionally set. Mirrors `agent-tools.delete-confirmation.test.ts`'s `fakeRouteDeps` shape.
 *  `publishOutputRootDir` is redirected to this file's own throwaway temp dir — `publishStaticSite`
 *  reads that `RouteDeps` field instead of `process.env.TOVU_PUBLISH_DIR` (adapter.ts no longer
 *  reads env vars at all), so overriding it keeps exporter artifacts off the checked-out repo.
 *  Normal handler tests use an injected export; the explicitly enabled port test uses the real one. */
/** This file's own deps object, which its tests re-point field by field before building registrations
 *  (the interface's `readonly` only binds the handlers that read it). `loadDeployTargets` is always set. */
type FakeStaticPublishToolDeps = { -readonly [K in keyof StaticPublishToolDeps]: StaticPublishToolDeps[K] } & Required<Pick<StaticPublishToolDeps, "loadDeployTargets">>;

function fakeDeps(
  options: {
    allow?: boolean;
    credentialSource?: PublishCredentialSource;
    buildTarget?: StaticPublishToolDeps["buildTarget"];
  } = {}
): { deps: FakeStaticPublishToolDeps; authorizeCalls: Record<string, unknown>[]; setAllow: (value: boolean) => void } {
  let allow = options.allow ?? true;
  const authorizeCalls: Record<string, unknown>[] = [];
  const base = createRouteDeps();

  const deps: FakeStaticPublishToolDeps = {
    ...base,
    exportSiteBound: async ({outputDir}) => ({outputDir, routes: {succeeded: [{path: "/", kind: "home", outputFile: "index.html", data: "<html>export fixture</html>"}], failed: []}, assets: {succeeded: [], failed: []}, skippedManifestEntries: [], unreferencedThemeFiles: []}),
    publishOutputRootDir: publishOutputDir,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    loadDeployTargets: loadBundledDeployTargets,
    ...(options.credentialSource ? { credentialSource: options.credentialSource } : {}),
    ...(options.buildTarget ? { buildTarget: options.buildTarget } : {}),
  };

  return { deps, authorizeCalls, setAllow: (value: boolean) => { allow = value; } };
}

function buildRegistrations(deps: StaticPublishToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildStaticPublishRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
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
  return invokeFixtureHandler(registration, ctx);
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe would
 *  (same technique `agent-tools.delete-confirmation.test.ts`'s `exchangeIdFromSurface` uses). */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Bounded wait for a publish call to reach its park point: planning loads the deploy registry
 *  (async module imports) before the dialog is raised, so one `setImmediate` tick is not enough. */
async function untilParked(parked: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400 && !parked(); attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
}
async function beginCall(executeTool: ToolRegistration, input: Record<string, unknown>) {
  const emitted: unknown[] = [];
  return {pending: call(executeTool, {input, emitSurface: async s => void emitted.push(s)}), emitted};
}

/** Pulls a surface emission's rendered HTML text and its `ui://` URI — the shape both the
 *  confirmation and outcome resources share (`buildConfirmationSurface`/`buildOutcomeSurface`'s
 *  common `EmbeddedResource` wrapper). */
function surfaceHtmlAndUri(surface: unknown): { html: string; uri: string } {
  const resource = (surface as { payload: { resource: { resource: { text: string; uri: string } } } }).payload.resource.resource;
  return { html: resource.text, uri: resource.uri };
}

/** The outcome surface's own status region's `data-state` — NOT a plain substring search, because
 *  `document.ts`'s base stylesheet always emits `.mcpui-status[data-state="…"]` CSS rules for every
 *  known state regardless of which one this particular document is actually in, so a naive
 *  `html.includes('data-state="done"')` would pass on a document whose real status is "failed" just
 *  because the (irrelevant, unused) "done" CSS rule happens to be present in the shared stylesheet. */
function outcomeStatusState(html: string): string | null {
  const match = html.match(/id="mcpui-status"[^>]*\bdata-state="([^"]+)"/);
  return match ? match[1]! : null;
}

/** Records every `publish()` call's file set and returns a canned success result — never touches
 *  `fetch` (mirrors `static-publish/__tests__/adapter.unit.test.ts`'s identical helper). */
function fakeDeployTarget(captured: { value: DeployFile[] | null }, providerMetadata?: Record<string, unknown>): DeployTarget {
  return {
    id: "fake",
    async publish(input: DeployPublishInput): Promise<DeployPublishResult> {
      captured.value = input.files;
      return { targetId: "fake", url: "https://example.test/published", status: "ready", ...(providerMetadata !== undefined ? { providerMetadata } : {}) };
    },
    async checkReachability() {
      return { reachable: true, status: "ready" as const };
    },
  };
}

/** A `DeployTarget` whose `publish()` always rejects — proves a provider-side failure is surfaced as
 *  an actionable message, never a raw response body or a credential. */
function failingDeployTarget(message: string): DeployTarget {
  return {
    id: "failing",
    async publish() {
      throw new Error(message);
    },
    async checkReachability() {
      return { reachable: true, status: "ready" as const };
    },
  };
}

/** A saved `vendor_credential_sets` row for the capabilities tests; the sealed blob is never opened. */
function vendorRow(fields: Pick<VendorCredentialSetRecord, "workspaceId" | "id" | "vendorId" | "label" | "isDefault"> & Partial<VendorCredentialSetRecord>): VendorCredentialSetRecord {
  return { sealed: {} as never, tokenTail: "", accountLabel: null, createdAt: NOW, updatedAt: NOW, ...fields };
}

/** A `VendorCredentialSetRepoPort` whose only implemented method is `listByWorkspace` — every other
 *  method throws if ever called, so a test using it also proves the capabilities handler never reaches
 *  for anything beyond the read model (`describeCredential`/`listPublishCredentials`'s own contract). */
function fakeCredentialRepo(records: readonly VendorCredentialSetRecord[]): VendorCredentialSetRepoPort {
  return {
    async insert() { throw new Error("not used by this test"); },
    async update() { throw new Error("not used by this test"); },
    async findById() { throw new Error("not used by this test"); },
    async findDefaultByVendor() { throw new Error("not used by this test"); },
    async listByVendor() { throw new Error("not used by this test"); },
    async listByWorkspace(input) { return records.filter((r) => r.workspaceId === input.workspaceId); },
    async delete() { throw new Error("not used by this test"); },
    async updateAccountLabel() { throw new Error("not used by this test"); },
  };
}

// ---------------------------------------------------------------------------
// 1. Wiring shape — all five tools
// ---------------------------------------------------------------------------

test("buildStaticPublishRegistrations wires all five tools, each with an input schema", () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { return { ok: false, reason: "n/a" }; }, async isConfigured() { return { configured: false, reason: "n/a" }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildStaticPublishRegistrations(deps, { surfaceExchanges });
  const ids = registrations.map((r) => r.descriptor.id).sort();
  assert.deepEqual(ids, [
    "deployment_execute_static_publish",
    "deployment_generate_bucket_hosting_setup",
    "deployment_get_static_publish_capabilities",
    "deployment_preview_static_publish",
    "deployment_propose_custom_provider_credential",
  ]);
  for (const entry of registrations) {
    assert.ok(entry.descriptor.inputSchema, `${entry.descriptor.id} must publish an input schema`);
  }
});

test("the catalog's risk map has an entry for every wired tool, matching its declared sideEffects", () => {
  for (const entry of staticPublishAgentToolCatalog) {
    assert.equal(staticPublishDerivedRisk.get(entry.name), entry.sideEffects, `${entry.name}'s derived risk must match its declared sideEffects`);
  }
  assert.equal(staticPublishDerivedRisk.get("deployment_execute_static_publish"), "mutates-durable-state");
});

test("deployment_execute_static_publish's schema carries no token/credential field of any kind", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_execute_static_publish")!;
  const schema = entry.inputSchema as { properties: Record<string, unknown>; additionalProperties?: unknown; required: string[] };
  assert.deepEqual(schema.additionalProperties, { type: "string" }, "a host's config fields are top-level strings; the handler refuses any key its host does not declare");
  assert.deepEqual(Object.keys(schema.properties).sort(), ["projectName", "target"]);
  assert.deepEqual(schema.required.sort(), ["projectName", "target"]);
});

test("preview/execute schemas name no host: target is any id the capabilities tool lists, not a fixed enum", () => {
  for (const name of ["deployment_preview_static_publish", "deployment_execute_static_publish"]) {
    const entry = staticPublishAgentToolCatalog.find((t) => t.name === name)!;
    const target = (entry.inputSchema as { properties: { target: { enum?: unknown; description: string } } }).properties.target;
    assert.equal(target.enum, undefined, `${name}: no enum of host ids`);
    assert.match(target.description, /deployment_get_static_publish_capabilities/);
    assert.doesNotMatch(entry.description + target.description, /github|vercel|netlify|cloudflare/i, `${name}: host names live in the deploy plugin, not in core tool text`);
  }
});

test("deployment_preview_static_publish refuses a field its host does not declare (a credential can never ride in as config)", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: true }; } } });
  const preview = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "deployment_preview_static_publish");
  await assert.rejects(
    () => call(preview, { input: { target: "github-pages", owner: "octo", repo: "site", token: "ghp_secret" } }),
    (err: unknown) => err instanceof ToolInputError && err.message === "'token' is not a field of github-pages. It takes: owner, repo, branch."
  );
});

test("deployment_execute_static_publish refuses a field its host does not declare, before any dialog is raised", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: true }; } } });
  const execute = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "deployment_execute_static_publish");
  await assert.rejects(
    () => call(execute, { input: { target: "vercel", projectName: "p", owner: "octo" } }),
    (err: unknown) => err instanceof ToolInputError && err.message === "'owner' is not a field of vercel. It takes: teamId."
  );
});

// ---------------------------------------------------------------------------
// 2. deployment_preview_static_publish — unchanged behavior, adapted to the new deps/signature
// ---------------------------------------------------------------------------

test("deployment_preview_static_publish reports validity, computed base path, and credential presence — via isConfigured(), NEVER resolve()", async () => {
  let resolveCallCount = 0;
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() {
        resolveCallCount += 1;
        return { ok: true, token: "should-never-appear-in-output" };
      },
      async isConfigured() { return { configured: true }; },
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  const result = (await call(preview, { input: { target: "github-pages", owner: "octo", repo: "my-site" } })) as Record<string, unknown>;

  assert.equal(result.valid, true);
  assert.equal(result.basePath, "/my-site");
  assert.equal(result.credentialsConfigured, true);
  assert.equal("willInjectNojekyll" in result, false, "the .nojekyll marker is the github-pages module's business");
  assert.doesNotMatch(JSON.stringify(result), /should-never-appear-in-output/);
  assert.equal(resolveCallCount, 0, "deployment_preview_static_publish must never call PublishCredentialSource.resolve()");
});

test("deployment_preview_static_publish reports invalid config and false credentials without throwing", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { return { ok: false, reason: "GITHUB_TOKEN is not set" }; },
      async isConfigured() { return { configured: false, reason: "GITHUB_TOKEN is not set" }; },
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  const result = (await call(preview, { input: { target: "github-pages", owner: "not valid!!", repo: "demo" } })) as Record<string, unknown>;

  assert.equal(result.valid, false);
  assert.match(result.validationError as string, /invalid GitHub owner/);
  assert.equal(result.basePath, null);
  assert.equal(result.credentialsConfigured, false);
});

// ---------------------------------------------------------------------------
// 3. deployment_get_static_publish_capabilities — NEW
// ---------------------------------------------------------------------------

test("deployment_get_static_publish_capabilities's description forbids ever asking the user to paste a token into chat", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_get_static_publish_capabilities")!;
  assert.match(entry.description, /do not ask the user to paste/i);
  assert.ok(entry.description.includes("Do NOT ask the user to paste an API token, access key, or any other secret into this chat, ever, for any reason:"));
  assert.match(entry.description, /Static Site tab/);
});

test("deployment_get_static_publish_capabilities lists exactly the registry's hosts, each with its label, config fields and vendor group from the descriptor", async () => {
  // No credentialSource override: the real DB-backed source must find the vendor-group row below.
  const { deps } = fakeDeps();
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  const acme: LoadedDeployTarget = {
    pluginId: "deploy",
    module: { create: () => assert.fail("capabilities never builds a target") },
    descriptor: {
      id: "acme-host",
      label: "Acme Hosting",
      module: "targets/acme.mjs",
      configFields: [{ name: "site", label: "Site", required: true, help: "Your Acme site name." }],
      // Shares the s3-compatible vendor group, so the vendor-table row below must count for it.
      credential: { vendorId: "s3-compatible", tokenField: "token", fields: [{ name: "token", label: "Token", required: true, secret: true }] },
    },
  };
  deps.loadDeployTargets = async () => ({ get: (id) => (id === "acme-host" ? acme : undefined), list: () => [acme], refusals: [] });
  await createPublishCredential(
    { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen, loadDeployTargets: deps.loadDeployTargets },
    { workspaceId: deps.workspaceId, label: "bucket", connection: { providerId: "acme-host", token: "tok" } }
  );

  const capabilities = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; label: string; configFields: unknown[]; credentialConfigured: boolean }[] };

  assert.deepEqual(
    result.providers.map(({ providerId, label, configFields, credentialConfigured }) => ({ providerId, label, configFields, credentialConfigured })),
    [{ providerId: "acme-host", label: "Acme Hosting", configFields: [{ name: "site", label: "Site", required: true, help: "Your Acme site name." }], credentialConfigured: true }]
  );
});

test("deployment_get_static_publish_capabilities reports per-provider readiness and saved credentials by id/label only, scoped to this workspace, and NEVER calls resolve()", async () => {
  let resolveCallCount = 0;
  const records: VendorCredentialSetRecord[] = [
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", vendorId: "github", label: "work", isDefault: true }),
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-2", vendorId: "github", label: "personal", isDefault: false }),
    vendorRow({ workspaceId: "some-other-workspace", id: "cred-x", vendorId: "vercel", label: "not-mine", isDefault: true }),
  ];
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() {
        resolveCallCount += 1;
        return { ok: true, token: "should-never-appear" };
      },
      async isConfigured(input) {
        return input.target === "github-pages"
          ? { configured: true }
          : { configured: false, reason: `no default '${input.target}' credential is saved for this workspace yet — add one in the Static Site tab` };
      },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.vendorCredentialSetRepo = fakeCredentialRepo(records);
  // 2026-08-16: `ready` now additionally requires a CACHED `verified: "valid"` — a saved-but-never-
  // verified credential is no longer `ready` (that is exactly this defect's fix; see the dedicated
  // tests below for the unverified/invalid/unreachable cases). Seeding this here keeps this test's
  // github-pages assertions about the "fully ready" case meaningful.
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  deps.publishCredentialVerificationCache.set({ workspaceId: WORKSPACE_ID_FALLBACK, target: "github-pages" }, { status: "valid", message: "GitHub accepted this credential.", checkedAt: NOW });

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");

  const result = (await call(capabilities)) as {
    executionMode: string;
    providers: {
      providerId: string;
      ready: boolean;
      credentialConfigured: boolean;
      verified: "valid" | "invalid" | "unreachable" | null;
      verifiedAt: string | null;
      savedCredentials: { id: string; label: string; isDefault: boolean }[];
      guidance?: string;
    }[];
  };

  assert.equal(result.executionMode, deps.publishExecutionMode);
  // 5 providers as of the s3-compatible ("Custom" tab) addition — spec
  // `custom-publish-provider-contract.md` §10.7 — not 4.
  assert.equal(result.providers.length, 5);

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.credentialConfigured, true);
  assert.equal(github.verified, "valid");
  assert.equal(github.verifiedAt, NOW);
  assert.equal(github.ready, true);
  assert.equal(github.guidance, undefined);
  assert.deepEqual(github.savedCredentials.map((c) => c.label).sort(), ["personal", "work"]);
  assert.ok(github.savedCredentials.every((c) => !("token" in c) && !("sealed" in c)), "must never surface a token or ciphertext");

  const vercel = result.providers.find((p) => p.providerId === "vercel")!;
  assert.equal(vercel.credentialConfigured, false);
  assert.equal(vercel.verified, null);
  assert.equal(vercel.ready, false);
  assert.deepEqual(vercel.savedCredentials, [], "a credential saved for a DIFFERENT workspace must never leak into this one's readiness");
  assert.match(vercel.guidance!, /Static Site tab/);

  assert.equal(resolveCallCount, 0, "deployment_get_static_publish_capabilities must never call PublishCredentialSource.resolve()");
  assert.doesNotMatch(JSON.stringify(result), /should-never-appear/);
});

test("deployment_get_static_publish_capabilities: a saved credential surfaces its stored tokenTail and nothing more of the secret", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured() { return { configured: true }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  // Real `createPublishCredential`, not a hand-built record, so this exercises the exact seal/tokenTail
  // derivation production uses.
  await createPublishCredential(
    { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen, loadDeployTargets: deps.loadDeployTargets },
    { workspaceId: deps.workspaceId, label: "work", connection: { providerId: "github-pages", token: "ghp_aVeryRealLookingToken1234" } }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as {
    providers: { providerId: string; credentialConfigured: boolean; savedCredentials: { label: string; tokenTail: string | null }[] }[];
  };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.savedCredentials.length, 1);
  assert.equal(github.savedCredentials[0]!.tokenTail, "1234", "the entry must carry the stored last-4 tail");
  assert.doesNotMatch(JSON.stringify(result), /ghp_aVeryRealLookingToken/, "must NEVER surface anything beyond the last 4 characters");
});

test("deployment_get_static_publish_capabilities: a freshly saved s3-compatible credential reads as configured but not yet verified, through the real DB-backed credential source", async () => {
  // No credentialSource override: the production DB-backed source (`hasDefaultForPublish`, never
  // decrypts) reads the same vendor_credential_sets row the save below writes.
  const { deps } = fakeDeps();
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  await createPublishCredential(
    { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen, loadDeployTargets: deps.loadDeployTargets },
    { workspaceId: deps.workspaceId, label: "custom bucket", connection: { providerId: "s3-compatible", region: "us-east-1", bucket: "b", accessKeyId: "AKIA", secretAccessKey: "topsecret", publicUrl: "https://example.test" } }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; credentialConfigured: boolean; savedCredentials: unknown[]; guidance?: string }[] };

  const s3 = result.providers.find((p) => p.providerId === "s3-compatible")!;
  assert.equal(s3.credentialConfigured, true, "a fresh save must be reported as configured");
  assert.equal(s3.savedCredentials.length, 1);
  assert.match(s3.guidance!, /has not been verified/);
  assert.doesNotMatch(s3.guidance!, /no credential|nothing is saved|is not configured/i);
  assert.doesNotMatch(JSON.stringify(result), /topsecret/);
});

// 2026-08-16 — Defect fix: the assistant had no way to learn which GitHub account its own verified
// token belongs to, so it guessed one from the human's email address and published to a repo the
// human did not control (`leonaburime/tovu-demo1`, a 404 — the human's real account was
// `leonaburime-ucla`). `accountLabel` closes the gap: it is the verified credential's own public
// login/username, cached on `verify.ts`'s result and surfaced here, never re-derived or guessed.

test("deployment_get_static_publish_capabilities: a verified credential's accountLabel is surfaced so the model can default 'owner' instead of guessing", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  deps.publishCredentialVerificationCache.set(
    { workspaceId: WORKSPACE_ID_FALLBACK, target: "github-pages" },
    { status: "valid", message: "GitHub accepted this credential.", checkedAt: NOW, accountLabel: "leonaburime-ucla" }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; accountLabel: string | null }[] };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.accountLabel, "leonaburime-ucla");

  // Every OTHER provider has no cached verification at all in this test — `accountLabel` must degrade
  // to `null`, never `undefined` (an agent-facing JSON result should not drop the key) and never throw.
  for (const provider of result.providers.filter((p) => p.providerId !== "github-pages")) {
    assert.equal(provider.accountLabel, null);
  }
});

// Migration 0044 (2026-08-16, Defect B fix): the cache alone is `InMemoryPublishCredentialVerification
// Cache` — process memory, wiped by every server restart. Live reproduction: a real verify call
// returned `accountLabel: "leonaburime-ucla"`, then the very next capabilities check (after an
// unrelated `tsx watch` restart) reported "never verified" and the same `accountLabel` was gone —
// the assistant fell straight back to suggesting `leonaburime`, the ORIGINAL wrong guess this whole
// feature exists to prevent. The fix persists the label on the credential row itself, which a restart
// does not touch.

test("deployment_get_static_publish_capabilities: accountLabel is read from the default credential's DB column even when the in-memory verification cache is completely empty (Defect B — the cache is wiped by every process restart, the DB column is not)", async () => {
  const records: VendorCredentialSetRecord[] = [
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", vendorId: "github", label: "work", isDefault: true, accountLabel: "leonaburime-ucla" }),
  ];
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.vendorCredentialSetRepo = fakeCredentialRepo(records);
  // Deliberately empty — simulates the process having restarted since the credential was last
  // verified (this is exactly the "InMemoryPublishCredentialVerificationCache wiped, DB row intact"
  // scenario the fix is for).
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; accountLabel: string | null }[] };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.accountLabel, "leonaburime-ucla", "the DB column must survive an empty verification cache — this is the whole point of migration 0044");
});

test("deployment_get_static_publish_capabilities: accountLabel falls back to the cached verification result when the DEFAULT credential's DB column is null (an older row that has not healed yet)", async () => {
  const records: VendorCredentialSetRecord[] = [
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", vendorId: "github", label: "work", isDefault: true }),
  ];
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.vendorCredentialSetRepo = fakeCredentialRepo(records);
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  deps.publishCredentialVerificationCache.set(
    { workspaceId: WORKSPACE_ID_FALLBACK, target: "github-pages" },
    { status: "valid", message: "GitHub accepted this credential.", checkedAt: NOW, accountLabel: "leonaburime-ucla" }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; accountLabel: string | null }[] };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.accountLabel, "leonaburime-ucla", "a null column must still fall back to the cache, never surface null while the cache has a real answer");
});

test("deployment_get_static_publish_capabilities: the DB column wins over a stale/different cached value — the column is the healed, durable answer", async () => {
  const records: VendorCredentialSetRecord[] = [
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", vendorId: "github", label: "work", isDefault: true, accountLabel: "leonaburime-ucla" }),
  ];
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.vendorCredentialSetRepo = fakeCredentialRepo(records);
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  // A deliberately different, stale cached value — the column must win.
  deps.publishCredentialVerificationCache.set(
    { workspaceId: WORKSPACE_ID_FALLBACK, target: "github-pages" },
    { status: "valid", message: "GitHub accepted this credential.", checkedAt: NOW, accountLabel: "some-stale-value" }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; accountLabel: string | null }[] };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.accountLabel, "leonaburime-ucla");
});

test("deployment_get_static_publish_capabilities's description explains credentialConfigured as distinct from accountLabel — 'a credential exists but is unverified' must never read as 'nothing is saved'", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_get_static_publish_capabilities")!;
  assert.match(entry.description, /credentialConfigured/);
  assert.match(entry.description, /credentialConfigured:true with accountLabel:null/i);
  assert.ok(entry.description.includes("credentialConfigured:true with accountLabel:null means a credential EXISTS but its account identity is not yet known"));
});

test("deployment_get_static_publish_capabilities's description forbids ever offering an example/placeholder account name when accountLabel is unknown", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_get_static_publish_capabilities")!;
  assert.match(entry.description, /never offer an example, placeholder/i);
  assert.ok(entry.description.includes("NEVER offer an example, placeholder, or 'e.g. <name>' value to illustrate the answer, even a made-up-looking one"));

  const preview = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_preview_static_publish")!;
  assert.match(preview.description, /never soften that question with an illustrative example/i);
  assert.ok(preview.description.includes("Never soften that question with an illustrative example, placeholder, or 'e.g. <name>' value of any kind:"));
});

test("deployment_get_static_publish_capabilities: a recorded lastPublish is surfaced per provider, and defaults to null when nothing has been published there yet", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  const history = new InMemoryPublishHistoryStore();
  await history.recordSuccess({
    workspaceId: WORKSPACE_ID_FALLBACK,
    entry: { target: "github-pages", url: "https://leonaburime-ucla.github.io/tovu-demo/", reachable: true, status: "ready", projectName: "tovu-demo", publishedAt: NOW, owner: "leonaburime-ucla", repo: "tovu-demo", basePath: "/tovu-demo", triggeredBy: "agent_tool" },
  });
  deps.historyStore = history;

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; lastPublish: { url: string; owner?: string; repo?: string } | null }[] };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.lastPublish?.url, "https://leonaburime-ucla.github.io/tovu-demo/");
  assert.equal(github.lastPublish?.owner, "leonaburime-ucla");
  assert.equal(github.lastPublish?.repo, "tovu-demo");

  const vercel = result.providers.find((p) => p.providerId === "vercel")!;
  assert.equal(vercel.lastPublish, null);
});

test("confirm: a real publish records history in the injected historyStore, readable back through deployment_get_static_publish_capabilities", async () => {
  const captured: { value: DeployFile[] | null } = { value: null };
  const history = new InMemoryPublishHistoryStore();
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    // History's owner/repo are the host's own facts (`providerMetadata`), as the github-pages module reports them.
    buildTarget: () => fakeDeployTarget(captured, { owner: "octo", repo: "my-site", branch: "gh-pages" }),
  });
  deps.historyStore = history;
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildRegistrations(deps, surfaceExchanges);
  const executeTool = tool(registrations, "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "github-pages", owner: "octo", repo: "my-site", projectName: "my-site-release" });
  const outcome = (await pending) as { published: boolean };
  assert.equal(outcome.published, true);

  const capabilities = tool(registrations, "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; lastPublish: { url: string; owner?: string; repo?: string; projectName: string } | null }[] };
  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.lastPublish?.url, "https://example.test/published");
  assert.equal(github.lastPublish?.owner, "octo");
  assert.equal(github.lastPublish?.repo, "my-site");
  assert.equal(github.lastPublish?.projectName, "my-site-release");
});

test("publishing descriptions use known accountLabel and ask only for missing or ambiguous accounts", () => {
  const capabilities = staticPublishAgentToolCatalog.find(t => t.name === "deployment_get_static_publish_capabilities")!;
  const preview = staticPublishAgentToolCatalog.find(t => t.name === "deployment_preview_static_publish")!;
  assert.ok(capabilities.description.includes("Use it as the default for a config field that names the account to publish under, instead of guessing one from the human's name or email address, using the requested account when supplied."));
  assert.ok(capabilities.description.includes("Ask only when the account is missing or ambiguous"));
  assert.ok(preview.description.includes("Use the requested account, or default to accountLabel when present."));
  assert.ok(preview.description.includes("Ask only when the target account is missing or ambiguous."));
  assert.ok(preview.description.includes("If accountLabel is null and no account was supplied the account is UNKNOWN"));
  for (const entry of [capabilities, preview]) assert.doesNotMatch(entry.description, /still confirm|confirm the target account|confirm that target account/i);
});

// 2026-08-16 — Defect fix: "ready" used to mean only "a credential row/env-var exists"
// (`isConfigured()`), never whether the provider actually accepts it. These three tests are the
// regression: a saved-but-unverified credential, a saved-but-INVALID one, and a saved credential
// whose last check could not reach the provider must all read as NOT ready, but distinctly from
// each other and from "nothing saved at all" — collapsing "unreachable" into "invalid" would risk
// sending a human to regenerate a perfectly good token over a transient network blip (code review's
// explicit constraint on this fix).

test("deployment_get_static_publish_capabilities: a saved credential that has NEVER been verified is reported as configured but NOT ready", async () => {
  const records: VendorCredentialSetRecord[] = [
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", vendorId: "github", label: "work", isDefault: true }),
  ];
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must never be called from this read tool"); }, async isConfigured() { return { configured: true }; } },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.vendorCredentialSetRepo = fakeCredentialRepo(records);
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache(); // nothing cached — never verified

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as {
    providers: { providerId: string; ready: boolean; credentialConfigured: boolean; verified: "valid" | "invalid" | "unreachable" | null; guidance?: string }[];
  };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.credentialConfigured, true, "a row IS saved");
  assert.equal(github.verified, null, "never checked against the real provider");
  assert.equal(github.ready, false, "unverified must not render as ready");
  assert.match(github.guidance!, /has not been verified/);
});

test("deployment_get_static_publish_capabilities: a saved credential the provider REJECTED is reported as configured but NOT ready, with the rejection reason", async () => {
  const records: VendorCredentialSetRecord[] = [
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", vendorId: "github", label: "work", isDefault: true }),
  ];
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must never be called from this read tool"); }, async isConfigured() { return { configured: true }; } },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.vendorCredentialSetRepo = fakeCredentialRepo(records);
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  deps.publishCredentialVerificationCache.set(
    { workspaceId: WORKSPACE_ID_FALLBACK, target: "github-pages" },
    { status: "invalid", message: "GitHub rejected this credential (HTTP 401) — it is invalid, expired, or missing the required permissions.", checkedAt: NOW }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as {
    providers: { providerId: string; ready: boolean; credentialConfigured: boolean; verified: "valid" | "invalid" | "unreachable" | null; guidance?: string }[];
  };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.credentialConfigured, true);
  assert.equal(github.verified, "invalid");
  assert.equal(github.ready, false, "this is the exact live-reported bug: a 401-rejected credential must never read as ready");
  assert.match(github.guidance!, /rejected by github-pages/);
  assert.match(github.guidance!, /401/);
  assert.doesNotMatch(github.guidance!, /does not mean the credential is bad/, "an INVALID credential must not get the unreachable-flavored reassurance");
});

test("deployment_get_static_publish_capabilities: a saved credential whose last check could not reach the provider is NOT ready, but the guidance must NOT read as 'your credential is bad'", async () => {
  const records: VendorCredentialSetRecord[] = [
    vendorRow({ workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", vendorId: "github", label: "work", isDefault: true }),
  ];
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must never be called from this read tool"); }, async isConfigured() { return { configured: true }; } },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.vendorCredentialSetRepo = fakeCredentialRepo(records);
  deps.publishCredentialVerificationCache = new InMemoryPublishCredentialVerificationCache();
  deps.publishCredentialVerificationCache.set(
    { workspaceId: WORKSPACE_ID_FALLBACK, target: "github-pages" },
    { status: "unreachable", message: "Could not reach GitHub to verify this credential — this does not necessarily mean the credential is bad.", checkedAt: NOW }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as {
    providers: { providerId: string; ready: boolean; credentialConfigured: boolean; verified: "valid" | "invalid" | "unreachable" | null; guidance?: string }[];
  };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.credentialConfigured, true);
  assert.equal(github.verified, "unreachable");
  assert.equal(github.ready, false, "unreachable is still not a confirmed 'this works' — but for a different reason than invalid");
  assert.match(github.guidance!, /could not reach/i);
  assert.match(github.guidance!, /does not mean the credential is bad/);
  assert.doesNotMatch(github.guidance!, /was rejected by/, "an UNREACHABLE result must never be worded as a provider rejection");
});

test("deployment_get_static_publish_capabilities requires deployments.read and rejects extra input", async () => {
  const { deps, authorizeCalls, setAllow } = fakeDeps({ allow: false, credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: false, reason: "n/a" }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");

  await assert.rejects(() => call(capabilities), /is not authorized for 'deployments\.read'/);
  assert.equal(authorizeCalls[0]?.permission, "deployments.read");
  setAllow(true);
  await assert.rejects(
    () => call(capabilities, { input: { unexpected: "value" } }),
    (err: unknown) => err instanceof ToolInputError && /this tool accepts no input/.test(err.message)
  );
});

test("no credential configured for the requested provider: an actionable result naming the provider and the Static Site tab, WITHOUT ever raising a dialog", async () => {
  let resolveCallCount = 0;
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() {
        resolveCallCount += 1;
        return { ok: false, reason: "should not be reached" };
      },
      async isConfigured() { return { configured: false, reason: "no default 'vercel' credential is saved for this workspace yet — add one in the Static Site tab" }; },
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const result = (await call(executeTool, { input: { target: "vercel", projectName: "demo" }, emitSurface: async () => undefined })) as {
    published: boolean;
    reason: string;
    message: string;
  };

  assert.equal(result.published, false);
  assert.equal(result.reason, "no-credential");
  assert.match(result.message, /vercel/);
  assert.match(result.message, /Static Site tab/);
  assert.equal(surfaceExchanges.size(), 0, "a guaranteed-fail call must never raise a dialog");
  assert.equal(resolveCallCount, 0, "an unconfigured provider must be caught by isConfigured(), never by attempting resolve()");
});

test("Cloudflare Pages configured with a token but no account id: the REAL composed env-fallback credential source names the missing field, before any dialog", async (t) => {
  const previousToken = process.env.CLOUDFLARE_TOKEN;
  const previousAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_TOKEN = "fake-cloudflare-token-never-real";
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  t.after(() => {
    if (previousToken === undefined) delete process.env.CLOUDFLARE_TOKEN;
    else process.env.CLOUDFLARE_TOKEN = previousToken;
    if (previousAccountId !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = previousAccountId;
  });

  // No `credentialSource` override — this exercises the REAL `composePublishCredentialSource` this
  // file's own production wiring builds from `RouteDeps` (DB miss, self-hosted-cli env fallback).
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const result = (await call(executeTool, { input: { target: "cloudflare-pages", projectName: "demo" }, emitSurface: async () => undefined })) as {
    published: boolean;
    reason: string;
    message: string;
  };

  assert.equal(result.published, false);
  assert.equal(result.reason, "no-credential");
  assert.match(result.message, /CLOUDFLARE_ACCOUNT_ID/, "the missing field must be named, not a generic 'not configured'");
  assert.doesNotMatch(result.message, /fake-cloudflare-token-never-real/, "the configured token must never be echoed");
  assert.equal(surfaceExchanges.size(), 0);
});

test("requires deployments.publish, checked before any dialog is raised", async () => {
  const { deps, authorizeCalls } = fakeDeps({
    allow: false,
    credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { throw new Error("must not be called before authorization"); } },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  await assert.rejects(() => call(executeTool, { input: { target: "vercel", projectName: "demo" } }), /is not authorized for 'deployments\.publish'/);
  assert.equal(authorizeCalls[0]?.permission, "deployments.publish");
  assert.equal(surfaceExchanges.size(), 0);
});

test("execute: exported bytes reach publishStaticSite and the same call reports the provider outcome", { skip: process.env.TOVU_G3_REAL_EXPORT !== "1" ? "port test: real site export binds loopback" : false }, async () => {
  let resolveCallCount = 0;
  const resolveInputs: unknown[] = [];
  const targetInputs: unknown[] = [];
  const credential = { ok: true as const, token: "fake-token-never-real" };
  const captured: { value: DeployFile[] | null } = { value: null };
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve(input) { resolveCallCount += 1; resolveInputs.push(input); return credential; },
      async isConfigured() { return { configured: true }; },
    },
    buildTarget: (config, resolved) => { targetInputs.push({ config, credential: resolved }); return fakeDeployTarget(captured); },
  });
  deps.workspaceId = "ws-confirm-export";
  const exportSite = createRouteDeps().exportSiteBound;
  const exportInputs: unknown[] = [];
  deps.exportSiteBound = async (input) => { exportInputs.push(input); return exportSite(input); };
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "github-pages", owner: "octo", repo: "demo-repo", branch: "release", projectName: "demo-site" });


  const result = (await pending) as { published: boolean; target: string; url: string; status: string };
  assert.equal(result.published, true);
  assert.equal(result.target, "github-pages");
  assert.equal(result.url, "https://example.test/published");
  assert.equal(result.status, "ready");
  assert.equal(resolveCallCount, 1, "the credential is resolved exactly once");
  assert.ok(captured.value && captured.value.length > 0, "the export adapter bytes must reach the provider");
  assert.deepEqual(resolveInputs, [{ workspaceId: deps.workspaceId, target: "github-pages" }]);
  assert.deepEqual(targetInputs, [{ config: { target: "github-pages", owner: "octo", repo: "demo-repo", branch: "release" }, credential: { token: credential.token } }]);
  assert.equal(exportInputs.length, 1);
  assert.equal((exportInputs[0] as { basePath?: string }).basePath, "/demo-repo");
  const index = captured.value.find((file) => file.file === "index.html");
  assert.ok(index, "the site's home route must reach the provider");
  const html = typeof index.data === "string" ? index.data : Buffer.from(index.data).toString("utf8");
  assert.match(html, /<html\b/i);
  assert.match(html, /<body\b/i);
  assert.match(html, /(?:href|src)="\/demo-repo\//, "exported links must use the host's base path");
  assert.ok(captured.value.every((file) => !file.file.startsWith("/") && !file.file.includes(publishOutputDir)));
});

test("provider rejection: an actionable message is returned, never a raw response body or the credential", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { return { ok: true, token: "fake-token-never-real" }; },
      async isConfigured() { return { configured: true }; },
    },
    buildTarget: () => failingDeployTarget("Vercel API responded 403: insufficient scope for this token"),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "vercel", projectName: "demo-site" });

  const result = (await pending) as { published: boolean; code: string; message: string };
  assert.equal(result.published, false);
  assert.equal(result.code, "PROVIDER_ERROR");
  assert.match(result.message, /403/);
  assert.doesNotMatch(result.message, /fake-token-never-real/, "the credential must never appear in a provider-error message");
});

test("confirm: a target that reports a non-'ready' terminal status returns a genuine partial outcome — published:true but reachable:false, never a plain success", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() {
        return { ok: true, token: "s3cr3t", accessKeyId: "AKIA", bucket: "b", region: "us-east-1", publicUrl: "https://example.test/site" };
      },
      async isConfigured() {
        return { configured: true };
      },
    },
    buildTarget: () => ({
      id: "fake",
      async publish() {
        return { targetId: "fake", url: "https://example.test/site", status: "link-delayed" as const, statusMessage: "not reachable yet" };
      },
      async checkReachability() {
        return { reachable: false };
      },
    }),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "s3-compatible", projectName: "demo-site" });

  const result = (await pending) as { published: boolean; reachable: boolean; target: string; url: string; status: string; message: string };
  assert.equal(result.published, true, "the upload itself DID succeed — this must not read as a hard failure");
  assert.equal(result.reachable, false, "the site is NOT confirmed reachable — this must not read as a plain success either");
  assert.equal(result.status, "link-delayed");
  assert.match(result.message, /not reachable yet/);
});

test("confirm: a full 'ready' success explicitly reports reachable:true, not merely the absence of reachable:false", async () => {
  const captured: { value: DeployFile[] | null } = { value: null };
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => fakeDeployTarget(captured),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "vercel", projectName: "demo-site" });

  const result = (await pending) as { published: boolean; reachable: boolean };
  assert.equal(result.published, true);
  assert.equal(result.reachable, true);
});

/**
 * The outcome-surface regression suite (2026-08-16): before `askThenReport`, this tool's confirmation
 * dialog only ever showed "Done." the instant the confirming `tools/call` resolved — for a held-open
 * MCP-UI exchange, that is the instant the click is DELIVERED (`mcp-ui-tool-calls-route.ts`'s
 * `202 {delivered:true}`), not when the publish this handler goes on to run actually finishes. A 404,
 * a rejected credential, and a genuine success all rendered the identical "Done.". These four tests
 * assert the SECOND emission — the real outcome — reaches `emitSurface` on the SAME `ui://` URI the
 * confirmation used (what makes `McpUiSurfaceCard` replace the dialog in place rather than opening a
 * second card), with the correct `data-state`, for every branch that can actually settle a publish
 * attempt. Written against `raiseDialog`'s live `emitted` array before any of this existed — with only
 * `askOnce`, there was structurally no second emission to assert on, so these tests fail to compile/
 * pass against that prior shape (`emitted.length` never reaches 2).
 */

test("confirm: a full success ALSO emits a succeeded outcome surface, same uri as the confirmation, with the live URL as an open-link action", async () => {
  const captured: { value: DeployFile[] | null } = { value: null };
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => fakeDeployTarget(captured),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending, emitted } = await beginCall(executeTool, { target: "vercel", projectName: "demo-site" });

  const result = (await pending) as { published: boolean; url: string };
  assert.equal(result.published, true);

  assert.equal(emitted.length, 1, "only the publish outcome is emitted");
  const outcome = surfaceHtmlAndUri(emitted[0]);
  assert.match(outcome.uri, /static-publish/);
  assert.equal(outcomeStatusState(outcome.html), "done", "success maps onto the outcome surface's 'done' status state");
  assert.ok(outcome.html.includes(result.url), "the real published URL must appear in the outcome, not just the model result");
  const action = outcome.html.match(/<button[^>]*data-mcpui-action="open-link"[^>]*>([^<]*)<\/button>/);
  assert.ok(action, "the outcome must offer an open-link button");
  assert.equal(action[1], "Open site");
  const destination = outcome.html.match(/var OPEN_URL = ("[^"\n]*");/);
  assert.ok(destination, "the action must be wired to a destination");
  assert.equal(JSON.parse(destination[1]!), result.url);
  assert.match(outcome.html, /api\.openLink\(OPEN_URL\)/);
});

test("confirm: a partial (uploaded, not yet reachable) outcome ALSO emits its OWN partial-state surface — never rendered as success or failure", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "s3cr3t", accessKeyId: "AKIA", bucket: "b", region: "us-east-1", publicUrl: "https://example.test/site" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => ({
      id: "fake",
      async publish() { return { targetId: "fake", url: "https://example.test/site", status: "link-delayed" as const, statusMessage: "not reachable yet" }; },
      async checkReachability() { return { reachable: false }; },
    }),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending, emitted } = await beginCall(executeTool, { target: "s3-compatible", projectName: "demo-site" });
  await pending;

  assert.equal(emitted.length, 1, "the call emits its outcome without an approval card");
  const outcome = surfaceHtmlAndUri(emitted[0]);
  assert.equal(outcomeStatusState(outcome.html), "partial", "never collapsed into either 'done' or 'failed'");
});

test("provider rejection ALSO emits a failed-state outcome surface carrying the SAME actionable message the model got, never the credential", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => failingDeployTarget("Vercel API responded 403: insufficient scope for this token"),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending, emitted } = await beginCall(executeTool, { target: "vercel", projectName: "demo-site" });
  const result = (await pending) as { published: boolean; message: string };
  assert.equal(result.published, false);

  assert.equal(emitted.length, 1, "the call emits its outcome without an approval card");
  const outcome = surfaceHtmlAndUri(emitted[0]);
  assert.equal(outcomeStatusState(outcome.html), "failed");
  assert.match(outcome.html, /insufficient scope/);
  assert.doesNotMatch(outcome.html, /fake-token-never-real/, "the credential must never reach the human-visible outcome surface either");
});

// ---------------------------------------------------------------------------
// 5. deployment_propose_custom_provider_credential — MCP-UI form-gated write (spec §6)
// ---------------------------------------------------------------------------

/** Raises the propose-credential FORM and returns everything a test needs to answer it — same shape
 *  as `raiseDialog`, distinct name because it's a form, not a confirmation. */
async function raiseCredentialForm(proposeTool: ToolRegistration, input: Record<string, unknown> = { target: "s3-compatible" }) {
  const emitted: unknown[] = [];
  const ready = Promise.withResolvers<void>();
  const pending = call(proposeTool, { input, emitSurface: async (s) => { emitted.push(s); ready.resolve(); } });
  await Promise.race([ready.promise, pending]);
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, html, exchangeId };
}

const VALID_FORM_SUBMISSION = {
  region: "us-east-1",
  bucket: "my-bucket",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "s3cr3t",
  publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com",
};

test("deployment_propose_custom_provider_credential's schema carries no credential field: only target, plus string pre-fill hints the handler checks against the host", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_propose_custom_provider_credential")!;
  const schema = entry.inputSchema as { properties: Record<string, unknown>; additionalProperties?: unknown; required: string[] };
  assert.deepEqual(schema.additionalProperties, { type: "string" });
  assert.deepEqual(Object.keys(schema.properties), ["target"]);
  assert.deepEqual(schema.required, ["target"]);
});

test("propose-credential: a secret field is refused as a pre-fill hint, so a secret can never come from the chat", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");
  await assert.rejects(
    () => call(proposeTool, { input: { target: "s3-compatible", secretAccessKey: "leaked" }, emitSurface: async () => {} }),
    (err: unknown) => err instanceof ToolInputError && err.message === "'secretAccessKey' is secret: the person types it into the form, never into the chat."
  );
  await assert.rejects(
    () => call(proposeTool, { input: { target: "s3-compatible", owner: "octo" }, emitSurface: async () => {} }),
    (err: unknown) => err instanceof ToolInputError && err.message === "'owner' is not a credential field of s3-compatible. It takes: endpoint, region, bucket, accessKeyId, secretAccessKey, publicUrl."
  );
  assert.equal(surfaceExchanges.size(), 0, "nothing is raised for a refused call");
});

test("propose-credential works for any host with a credential spec: a netlify form masks the token and saves a netlify row", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { html, exchangeId, pending } = await raiseCredentialForm(proposeTool, { target: "netlify" });
  assert.match(html, /Netlify/);
  const tokenInput = html.match(/<input[^>]*id="mcpui-field-token"[^>]*>/);
  assert.ok(tokenInput, "the token <input> must be present");
  assert.match(tokenInput![0], /type="password"/);
  assert.doesNotMatch(html, /id="mcpui-field-siteId"/, "the netlify module never reads a site id, so the form does not ask for one");

  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: { token: "nfp_realtoken9876" } });
  assert.deepEqual(await pending, { saved: true, providerId: "netlify", connected: true });
  const rows = (await deps.vendorCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId })).filter((r) => r.vendorId === "netlify");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.tokenTail, "9876");
});

test("with no emitSurface, the credential form is refused outright — no exchange is ever opened, nothing saved", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");
  await assert.rejects(() => call(proposeTool, { input: { target: "s3-compatible" } }));
  assert.equal(surfaceExchanges.size(), 0);
});

test("requires deployments.credentials.write, checked before any form is raised", async () => {
  const { deps, authorizeCalls, setAllow } = fakeDeps();
  setAllow(false);
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  await assert.rejects(() => call(proposeTool, { input: { target: "s3-compatible" }, emitSurface: async () => {} }));
  assert.equal(surfaceExchanges.size(), 0, "no form may be raised before the permission check passes");
  assert.ok(authorizeCalls.some((c) => c.permission === "deployments.credentials.write"));
});

test("the rendered form pre-fills non-secret hints and marks ONLY secretAccessKey as masked", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { html, exchangeId, pending } = await raiseCredentialForm(proposeTool, { target: "s3-compatible", bucket: "hinted-bucket", region: "us-east-1" });
  assert.match(html, /value="hinted-bucket"/, "a model-supplied bucket hint must pre-fill the form");

  // Each field renders as `<input class="mcpui-input" type="..." id="mcpui-field-<name>" name="<name>" ...>`
  // (real output captured while diagnosing this test — field order within the tag is fixed by
  // `text-input.ts`'s own template, so a simple id-anchored regex reads the real `type` attribute).
  const secretInput = html.match(/<input[^>]*id="mcpui-field-secretAccessKey"[^>]*>/);
  assert.ok(secretInput, "secretAccessKey's <input> must be present");
  assert.match(secretInput![0], /type="password"/, "secretAccessKey must render masked");

  const accessKeyInput = html.match(/<input[^>]*id="mcpui-field-accessKeyId"[^>]*>/);
  assert.ok(accessKeyInput, "accessKeyId's <input> must be present");
  assert.match(accessKeyInput![0], /type="text"/, "accessKeyId must NOT render masked — it is explicitly non-secret");

  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  await pending;
});

test("submit: a first-time save creates exactly one s3-compatible row, auto-defaulted, and NEVER echoes any field value back", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { exchangeId, pending } = await raiseCredentialForm(proposeTool);
  const delivered = surfaceExchanges.deliver({
    exchangeId,
    toolId: "deployment_propose_custom_provider_credential",
    principalId: PRINCIPAL_ID,
    params: VALID_FORM_SUBMISSION,
  });
  assert.deepEqual(delivered, { ok: true });

  const result = await pending;
  assert.deepEqual(result, { saved: true, providerId: "s3-compatible", connected: true });
  assert.doesNotMatch(JSON.stringify(result), /s3cr3t|AKIAEXAMPLE/, "the secret/access key must never appear in the tool's own return value");

  const rows = await deps.vendorCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  const s3Rows = rows.filter((r) => r.vendorId === "s3-compatible");
  assert.equal(s3Rows.length, 1);
  assert.equal(s3Rows[0]!.isDefault, true, "a vendor's first-ever saved connection auto-defaults");
  assert.equal(s3Rows[0]!.label, "default");
  // `VALID_FORM_SUBMISSION.secretAccessKey` is "s3cr3t" — s3-compatible's primary secret is
  // `secretAccessKey`, not `accessKeyId` (`vendor-credentials/store.ts`'s `deriveTokenTail`).
  assert.equal(s3Rows[0]!.tokenTail, "s3cr3t".slice(-4), "tokenTail must be the last 4 characters of the SECRET access key, not the access key id");
});

test("submit: a SECOND save updates the existing row rather than creating a duplicate — one row per provider, matching the admin's own flat-row UX", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();

  const first = await raiseCredentialForm(tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential"));
  surfaceExchanges.deliver({ exchangeId: first.exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: VALID_FORM_SUBMISSION });
  await first.pending;
  const originalRows = (await deps.vendorCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId })).filter((r) => r.vendorId === "s3-compatible");
  assert.equal(originalRows.length, 1);
  const originalId = originalRows[0]!.id;

  const second = await raiseCredentialForm(tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential"));
  surfaceExchanges.deliver({
    exchangeId: second.exchangeId,
    toolId: "deployment_propose_custom_provider_credential",
    principalId: PRINCIPAL_ID,
    params: { ...VALID_FORM_SUBMISSION, bucket: "renamed-bucket", secretAccessKey: "rotated-secret" },
  });
  const result = await second.pending;
  assert.deepEqual(result, { saved: true, providerId: "s3-compatible", connected: true });

  const rows = (await deps.vendorCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId })).filter((r) => r.vendorId === "s3-compatible");
  assert.equal(rows.length, 1, "a second save must UPDATE the existing row, never create a second one");
  assert.equal(rows[0]!.id, originalId, "an update must preserve the row identifier");
  const resolved = await resolveForPublish({
    repo: deps.vendorCredentialSetRepo,
    loadDeployTargets: deps.loadDeployTargets!,
    sealer: deps.siteAssistantSecretSealer,
  }, { workspaceId: deps.workspaceId, id: originalId });
  assert.deepEqual(resolved?.connection, {
    providerId: "s3-compatible", ...VALID_FORM_SUBMISSION,
    bucket: "renamed-bucket", secretAccessKey: "rotated-secret",
  });
});

test("submit: a blank required field is rejected server-side with an actionable message, never a saved row — form.ts's own novalidate makes this the real enforcement point", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { exchangeId, pending } = await raiseCredentialForm(proposeTool);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: "deployment_propose_custom_provider_credential",
    principalId: PRINCIPAL_ID,
    params: { ...VALID_FORM_SUBMISSION, bucket: "" },
  });

  const result = (await pending) as { saved: boolean; reason: string; message: string };
  assert.equal(result.saved, false);
  assert.equal(result.reason, "invalid");
  assert.match(result.message, /bucket/);

  const rows = await deps.vendorCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  assert.equal(rows.filter((r) => r.vendorId === "s3-compatible").length, 0, "an invalid submission must not save anything");
});

test("cancel: nothing is saved, and the SAME call reports the cancellation", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { exchangeId, pending } = await raiseCredentialForm(proposeTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  const result = await pending;
  assert.deepEqual(result, { saved: false, cancelled: true });

  const rows = await deps.vendorCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  assert.equal(rows.filter((r) => r.vendorId === "s3-compatible").length, 0);
});

test("re-calling the tool while a form is pending opens a SEPARATE form — it does not answer the first one", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const first = await raiseCredentialForm(proposeTool);
  const second = await raiseCredentialForm(proposeTool);
  assert.notEqual(first.exchangeId, second.exchangeId);
  assert.equal(surfaceExchanges.size(), 2);

  surfaceExchanges.deliver({ exchangeId: first.exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  surfaceExchanges.deliver({ exchangeId: second.exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  await Promise.all([first.pending, second.pending]);
});

// ---------------------------------------------------------------------------
// 6. deployment_generate_bucket_hosting_setup — plain read, no MCP-UI gate (spec §3a)
// ---------------------------------------------------------------------------

test("deployment_generate_bucket_hosting_setup requires deployments.read, checked before any content is composed", async () => {
  const { deps, authorizeCalls, setAllow } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  setAllow(false);
  await assert.rejects(() => call(hostingSetupTool, { input: { target: "s3-compatible", bucket: "b", region: "us-east-1" } }), /is not authorized for 'deployments\.read'/);
  assert.ok(authorizeCalls.some((c) => c.permission === "deployments.read"));
});

test("deployment_generate_bucket_hosting_setup rejects an unrecognized target rather than silently returning generic guidance", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  await assert.rejects(() => call(hostingSetupTool, { input: { target: "webhook", bucket: "b", region: "us-east-1" } }), /webhook/);
});

// 500-redact defect (RED->GREEN): `requireS3CompatibleProtocol` (shared by this tool and
// `deployment_propose_custom_provider_credential`) used to reject with a bare `Error`, which
// `@jini-ai/daemon`'s `ToolExecutor` tags `errorKind: 'internal'` — the classification
// `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts into a message-stripped 500. It
// now throws `ToolInputError`, mirroring `features/post/tool-registrations.ts`'s fix shape.
test("deployment_generate_bucket_hosting_setup: an unrecognized target is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  await assert.rejects(
    () => call(hostingSetupTool, { input: { target: "webhook", bucket: "b", region: "us-east-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    },
  );
});

test("deployment_propose_custom_provider_credential: an unrecognized target is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  await assert.rejects(
    () => call(proposeTool, { input: { target: "webhook" } }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    },
  );
});

test("deployment_generate_bucket_hosting_setup: a host whose plugin module has no hosting-setup steps is refused with the reason", async () => {
  const { deps } = fakeDeps();
  const hostingSetupTool = tool(buildRegistrations(deps, createSurfaceExchangeStore()), "deployment_generate_bucket_hosting_setup");
  await assert.rejects(
    () => call(hostingSetupTool, { input: { target: "netlify" } }),
    (err: unknown) => err instanceof ToolInputError && err.message === "netlify has no hosting-setup steps: publishing to it serves the site."
  );
});

test("blank/omitted endpoint infers plain AWS S3 and returns a bucket-substituted public-read policy JSON, no warning", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  const result = (await call(hostingSetupTool, { input: { target: "s3-compatible", bucket: "my-bucket", region: "us-east-1" } })) as {
    provider: string;
    steps: { title: string; description: string; consoleJson?: string }[];
    warning: string;
  };
  assert.equal(result.provider, "aws");
  assert.equal(result.warning, "");
  const policyStep = result.steps.find((s) => s.consoleJson);
  assert.ok(policyStep, "AWS steps must include a real policy JSON block");
  const parsed = JSON.parse(policyStep!.consoleJson!) as { Statement: { Resource: string }[] };
  assert.equal(parsed.Statement[0]!.Resource, "arn:aws:s3:::my-bucket/*", "the bucket name must be substituted into the real policy, not a placeholder");
  assert.ok(result.steps.some((s) => /Block Public Access/i.test(s.title)), "AWS's Block Public Access guardrail must be named explicitly (spec §3a's D-14 finding)");
});

test("a Cloudflare R2 endpoint infers cloudflare-r2 and warns about the different credential system", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  const result = (await call(hostingSetupTool, {
    input: { target: "s3-compatible", bucket: "my-bucket", region: "auto", endpoint: "https://abc123.r2.cloudflarestorage.com" },
  })) as { provider: string; warning: string };
  assert.equal(result.provider, "cloudflare-r2");
  assert.match(result.warning, /different/i);
  assert.match(result.warning, /Cloudflare/);
});

test("a DigitalOcean Spaces endpoint infers digitalocean-spaces and warns about the different credential system", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  const result = (await call(hostingSetupTool, {
    input: { target: "s3-compatible", bucket: "my-bucket", region: "nyc3", endpoint: "https://nyc3.digitaloceanspaces.com" },
  })) as { provider: string; warning: string };
  assert.equal(result.provider, "digitalocean-spaces");
  assert.match(result.warning, /different/i);
  assert.match(result.warning, /DigitalOcean/);
});

// ---------------------------------------------------------------------------
// Characterization tests, added ahead of the 2026-08-20 complexity-reduction refactor of
// buildPreviewConfig/requireStaticPublishTarget/deployment_get_static_publish_capabilities/
// deployment_execute_static_publish's confirmation handling/deployment_propose_custom_provider_credential
// — pinning branches the existing suite above never exercised (confirmed via `c8` branch coverage,
// combined with `server/__tests__/routes/publish-site-route.test.ts` which also drives this file).
// ---------------------------------------------------------------------------

test("deployment_preview_static_publish: a github-pages preview with an explicit branch is accepted and does not throw", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { return { ok: true, token: "x" }; }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  const result = (await call(preview, { input: { target: "github-pages", owner: "octo", repo: "demo", branch: "release" } })) as Record<string, unknown>;
  assert.equal(result.valid, true);
});

test("deployment_preview_static_publish: a vercel preview with a teamId is accepted and does not throw", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { return { ok: true, token: "x" }; }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  const result = (await call(preview, { input: { target: "vercel", teamId: "team_1" } })) as Record<string, unknown>;
  assert.equal(result.valid, true);
  assert.equal(result.basePath, null);
});

test("deployment_preview_static_publish: a github-pages preview with owner/repo omitted reports the missing required field as invalid, never throws", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: false, reason: "n/a" }; }, async isConfigured() { return { configured: false, reason: "n/a" }; } },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  const result = (await call(preview, { input: { target: "github-pages" } })) as Record<string, unknown>;
  assert.equal(result.valid, false);
  assert.equal(result.validationError, "'owner' (non-empty string) is required for target 'github-pages'");
});

test("deployment_preview_static_publish: an unrecognized target throws before any permission check or credential read", async () => {
  const { deps, authorizeCalls } = fakeDeps({
    allow: false,
    credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { throw new Error("must not be called"); } },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  await assert.rejects(() => call(preview, { input: { target: "bogus-provider" } }), {
    message: "publish target 'bogus-provider' is not available; choose one of: github-pages, vercel, netlify, cloudflare-pages, s3-compatible",
  });
  assert.deepEqual(authorizeCalls, [], "unknown targets must fail before authorization");
});

// 500-redact defect (RED->GREEN): `requireStaticPublishTarget` (shared by this tool and
// `deployment_execute_static_publish`) used to reject with a bare `Error`, which
// `@jini-ai/daemon`'s `ToolExecutor` tags `errorKind: 'internal'` — the classification
// `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts into a message-stripped 500. It
// now throws `ToolInputError`, mirroring `features/post/tool-registrations.ts`'s fix shape.
test("deployment_preview_static_publish: an unrecognized target is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { throw new Error("must not be called"); } },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  await assert.rejects(
    () => call(preview, { input: { target: "bogus-provider" } }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    },
  );
});

test("deployment_execute_static_publish: an unrecognized target is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { throw new Error("must not be called"); } },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  await assert.rejects(
    () => call(executeTool, { input: { target: "bogus-provider", projectName: "demo" } }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    },
  );
});

test("deployment_execute_static_publish: an invalid config is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  // github-pages requires `owner`/`repo` — omitted here on purpose to trip validateStaticPublishConfig.
  await assert.rejects(
    () => call(executeTool, { input: { target: "github-pages", projectName: "demo" } }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    },
  );
});

test("confirm: a partial outcome's deploymentId and basePath are both forwarded through to the tool result when the target reports them", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => ({
      id: "fake",
      async publish() {
        return { targetId: "fake", url: "https://example.test/site", status: "link-delayed" as const, statusMessage: "not reachable yet", deploymentId: "dpl_123" };
      },
      async checkReachability() {
        return { reachable: false };
      },
    }),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "github-pages", owner: "octo", repo: "demo-repo", projectName: "demo-site" });

  const result = (await pending) as { deploymentId?: string; basePath?: string };
  assert.equal(result.deploymentId, "dpl_123");
  assert.equal(result.basePath, "/demo-repo");
});

test("confirm: a full success's deploymentId is forwarded through to the tool result when the target reports one", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => ({
      id: "fake",
      async publish() {
        return { targetId: "fake", url: "https://example.test/published", status: "ready" as const, deploymentId: "dpl_456" };
      },
      async checkReachability() {
        return { reachable: true, status: "ready" as const };
      },
    }),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "vercel", projectName: "demo-site" });

  const result = (await pending) as { deploymentId?: string };
  assert.equal(result.deploymentId, "dpl_456");
});

test("confirm: with no buildTarget override injected, the REAL default buildJiniTarget dispatch runs and a credential missing a required s3-compatible field is still refused cleanly — no real network ever touched", async () => {
  const { deps } = fakeDeps({
    // No `buildTarget` — deliberately, to exercise `handlePublishConfirmationAnswer`'s own
    // `ctx.deps.buildTarget !== undefined` branch on its FALSE side (every other confirm test in
    // this file injects one). `buildS3CompatibleTargetConfig` throws before `S3CompatibleDeployTarget`'s
    // constructor (which never touches the network in its own constructor either) is even reached, so
    // this stays hermetic despite going through the real `buildJiniTarget` dispatch.
    credentialSource: {
      async resolve() {
        return { ok: true, token: "s3cr3t", accessKeyId: "AKIAEXAMPLE", region: "us-east-1" };
      },
      async isConfigured() {
        return { configured: true };
      },
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { pending } = await beginCall(executeTool, { target: "s3-compatible", projectName: "demo-site" });

  const result = (await pending) as { published: boolean; code: string; message: string };
  assert.equal(result.published, false);
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.match(result.message, /bucket/);
  assert.doesNotMatch(result.message, /s3cr3t/);
});

test("propose-credential form: an unanswered form expires and reports 'expired', not a hang or a throw", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const result = (await call(proposeTool, { input: { target: "s3-compatible" }, emitSurface: async () => undefined })) as {
    saved: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.saved, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

test("propose-credential form: a cancelled run abandons the form and reports 'abandoned', not a hang or a throw", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");
  const controller = new AbortController();

  const ready = Promise.withResolvers<void>();
  const pending = call(proposeTool, { input: { target: "s3-compatible" }, emitSurface: async () => ready.resolve(), signal: controller.signal });
  await Promise.race([ready.promise, pending]);
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();

  const result = (await pending) as { saved: boolean; cancelled: boolean; reason: string; note: string };
  assert.equal(result.saved, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "abandoned");
  assert.match(result.note, /closed because the run ended/);
});

test("submit: a non-Error thrown by the credential write step still returns a safe string message, never the raw thrown value", async () => {
  const { deps } = fakeDeps();
  const realRepo = deps.vendorCredentialSetRepo;
  deps.vendorCredentialSetRepo = new Proxy(realRepo, {
    get(target, prop) {
      if (prop === "insert") return async () => { throw "boom — not an Error instance"; };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { exchangeId, pending } = await raiseCredentialForm(proposeTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: VALID_FORM_SUBMISSION });

  const result = (await pending) as { saved: boolean; reason: string; message: string };
  assert.equal(result.saved, false);
  assert.equal(result.reason, "invalid");
  assert.equal(result.message, "boom — not an Error instance");
});

 test("n06: repository write runs without a confirmation channel", async (t) => {
  const captured: {value: DeployFile[] | null} = {value: null};
  const {deps} = fakeDeps({credentialSource: {async resolve() {return {ok: true, token: "fake"};}, async isConfigured() {return {configured: true};}}, buildTarget: () => fakeDeployTarget(captured)});
  const store = createSurfaceExchangeStore();
  const result = await call(tool(buildRegistrations(deps, store), "deployment_execute_static_publish"), {input: {target: "github-pages", owner: "octo", repo: "demo", projectName: "release"}}) as {published: boolean; reachable: boolean; url: string};
  assert.equal(result.published, true, JSON.stringify(result));
  assert.equal(result.reachable, true);
  assert.equal(result.url, "https://example.test/published");
  assert.notEqual(captured.value, null);
  assert.equal(store.size(), 0);
});

/** Supplies the fixture emitter through the canonical handler options, including headless calls. */
function invokeFixtureHandler(
  registration: import("@jini-ai/core").ToolRegistration,
  context: import("@jini-ai/core").ToolExecutionContext & { emitSurface?: import("@jini-ai/core").SurfaceEmitter },
) {
  const { emitSurface, ...required } = context;
  return registration.handler(required, emitSurface ? { emitSurface } : {});
}
