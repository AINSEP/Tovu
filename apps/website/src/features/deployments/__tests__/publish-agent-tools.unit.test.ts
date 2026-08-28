import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort } from "../publish-credentials/index.js";
import { InMemoryPublishCredentialVerificationCache, InMemoryPublishHistoryStore, type PublishCredentialSource } from "../static-publish/index.js";
// Real implementation of `StaticPublishToolDeps.vendorCredentials` — production wiring for this lives
// in `assistant/tool-registrations.ts`'s `buildAssistantToolRegistrations`, which this test file does
// NOT go through (it calls `buildStaticPublishRegistrations` directly, same as every other test here).
// Test files are excluded from `check:architecture`'s graph, so importing directly here carries none
// of the cross-feature-edge cost `publish-agent-tools.ts` itself now avoids.
import { createVendorCredential, listVendorCredentials, PUBLISH_PROVIDER_TO_VENDOR, updateVendorCredential } from "../../vendor-credentials/index.js";

import { buildStaticPublishRegistrations, staticPublishAgentToolCatalog, staticPublishDerivedRisk, type StaticPublishToolDeps } from "../publish-agent-tools.js";

/**
 * @file `publish-agent-tools.ts` wiring proof, rewritten for the 2026-08-15 change that wired
 * `deployment_execute_static_publish` and added `deployment_get_static_publish_capabilities` (both
 * were previously either unwired or nonexistent — see this file's previous revision in git history for
 * what it certified before).
 *
 * `deployment_execute_static_publish`'s tests are modelled closely on
 * `features/post/__tests__/agent-tools.delete-confirmation.test.ts` — the same MCP-UI held-open
 * exchange mechanism, so the same certification shape applies: the call parks until a human answers,
 * nothing is published while it is pending, and the model's own schema carries no token/decision field
 * a fabricated input could exploit.
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
 *  reads env vars at all), so overriding it here is what keeps this suite's real `exportSite`
 *  writes off the checked-out repo. */
function fakeDeps(
  options: {
    allow?: boolean;
    credentialSource?: PublishCredentialSource;
    buildTarget?: StaticPublishToolDeps["buildTarget"];
  } = {}
): { deps: StaticPublishToolDeps; authorizeCalls: Record<string, unknown>[]; setAllow: (value: boolean) => void } {
  let allow = options.allow ?? true;
  const authorizeCalls: Record<string, unknown>[] = [];
  const base = createRouteDeps();

  const deps: StaticPublishToolDeps = {
    ...base,
    publishOutputRootDir: publishOutputDir,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    // Real implementation by default — mirrors `assistant/tool-registrations.ts`'s own production
    // wiring, which this test file bypasses by calling `buildStaticPublishRegistrations` directly.
    // Every capabilities/propose-credential test relies on this being present; a test that wants to
    // exercise the "not injected" wiring-bug throw itself overrides it back to `undefined` explicitly.
    vendorCredentials: { list: listVendorCredentials, create: createVendorCredential, update: updateVendorCredential, providerToVendor: PUBLISH_PROVIDER_TO_VENDOR },
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
  return registration.handler(ctx);
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe would
 *  (same technique `agent-tools.delete-confirmation.test.ts`'s `exchangeIdFromSurface` uses). */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Raises the publish confirmation dialog and returns everything a test needs to answer it.
 *  `emitted` is the SAME live array `emitSurface` pushes onto — a test that also cares about a
 *  later, post-answer emission (the outcome surface, `askThenReport`'s whole reason for existing)
 *  reads `emitted[1]` off this after awaiting `pending`, rather than `raiseDialog` needing a second
 *  return shape for that one extra check. */
async function raiseDialog(executeTool: ToolRegistration, input: Record<string, unknown>) {
  const emitted: unknown[] = [];
  const pending = call(executeTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, html, exchangeId, emitted };
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
function fakeDeployTarget(captured: { value: DeployFile[] | null }): DeployTarget {
  return {
    id: "fake",
    async publish(input: DeployPublishInput): Promise<DeployPublishResult> {
      captured.value = input.files;
      return { targetId: "fake", url: "https://example.test/published", status: "ready" };
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

/** A `PublishCredentialSetRepoPort` whose only implemented method is `listByWorkspace` — every other
 *  method throws if ever called, so a test using it also proves the capabilities handler never reaches
 *  for anything beyond the read model (`describeCredential`/`listPublishCredentials`'s own contract). */
function fakeCredentialRepo(records: readonly PublishCredentialSetRecord[]): PublishCredentialSetRepoPort {
  return {
    async insert() { throw new Error("not used by this test"); },
    async update() { throw new Error("not used by this test"); },
    async findById() { throw new Error("not used by this test"); },
    async findDefaultByProvider() { throw new Error("not used by this test"); },
    async listByProvider() { throw new Error("not used by this test"); },
    async listByWorkspace(input) { return records.filter((r) => r.workspaceId === input.workspaceId); },
    async delete() { throw new Error("not used by this test"); },
  };
}

// ---------------------------------------------------------------------------
// 0. StaticPublishToolDeps.vendorCredentials — injected, not imported (this dispatch's architecture
// fix: publish-agent-tools.ts carries no import, type or value, from features/vendor-credentials;
// the real implementation is wired by assistant/tool-registrations.ts's
// buildAssistantToolRegistrations, which this test file's fakeDeps() mirrors above).
// ---------------------------------------------------------------------------

test("deployment_get_static_publish_capabilities: an unwired vendorCredentials port fails LOUDLY with a named wiring-bug error, never a silent legacy-only degrade", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: false, reason: "n/a" }; } },
  });
  deps.vendorCredentials = undefined;
  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  await assert.rejects(() => call(capabilities), /vendorCredentials was not injected — this is a wiring bug/);
});

test("deployment_propose_custom_provider_credential: an unwired vendorCredentials port fails LOUDLY at the write step, after the human already confirmed — the form having been shown is not itself proof anything was saved", async () => {
  const { deps } = fakeDeps();
  deps.vendorCredentials = undefined;
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { exchangeId, pending } = await raiseCredentialForm(proposeTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: VALID_FORM_SUBMISSION });
  await assert.rejects(() => pending, /vendorCredentials was not injected — this is a wiring bug/);
});

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
  const schema = entry.inputSchema as { properties: Record<string, unknown>; additionalProperties?: boolean; required: string[] };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["branch", "owner", "projectName", "repo", "target", "teamId"]);
  assert.deepEqual(schema.required.sort(), ["projectName", "target"]);
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
  assert.equal(result.willInjectNojekyll, true);
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
  assert.match(entry.description, /Static Site tab/);
});

test("deployment_get_static_publish_capabilities reports per-provider readiness and saved credentials by id/label only, scoped to this workspace, and NEVER calls resolve()", async () => {
  let resolveCallCount = 0;
  const records: PublishCredentialSetRecord[] = [
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-2", providerId: "github-pages", label: "personal", sealed: {} as never, isDefault: false, accountLabel: null, createdAt: NOW, updatedAt: NOW },
    { workspaceId: "some-other-workspace", id: "cred-x", providerId: "vercel", label: "not-mine", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
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
  deps.publishCredentialSetRepo = fakeCredentialRepo(records);
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

// Phase 3 cutover (vendor-credentials dual-read) — this dispatch. See `vendor-credentials/dual-read.ts`'s
// own header for the "new table first, legacy table only when the new group is empty" precedence this
// handler reimplements at the non-decrypting list level (it cannot call that module directly — that
// function DECRYPTS, and this handler's own "never decrypts" contract, proven above, must stay true).

test("deployment_get_static_publish_capabilities: a credential saved on the NEW vendor_credential_sets table surfaces a real tokenTail; a legacy-table-only credential reports tokenTail: null", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured() { return { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  // netlify: legacy-table-only, exactly today's pre-migration shape — no tokenTail column exists there.
  deps.publishCredentialSetRepo = fakeCredentialRepo([
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "legacy-1", providerId: "netlify", label: "legacy", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
  ]);
  // github-pages: saved through the NEW table (mirrors a real save via `deployment_propose_custom_
  // provider_credential`'s Phase 3 cutover, or a post-migration row) — real `createVendorCredential`,
  // not a hand-built record, so this exercises the exact same seal/tokenTail derivation production uses.
  await createVendorCredential(
    { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "work", connection: { vendorId: "github", token: "ghp_aVeryRealLookingToken1234" } }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as {
    providers: { providerId: string; credentialConfigured: boolean; savedCredentials: { label: string; tokenTail: string | null }[] }[];
  };

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.savedCredentials.length, 1);
  assert.equal(github.savedCredentials[0]!.tokenTail, "1234", "a vendor-table-sourced entry must carry the real last-4 tail");
  assert.doesNotMatch(JSON.stringify(result), /ghp_aVeryRealLookingToken/, "must NEVER surface anything beyond the last 4 characters");

  const netlify = result.providers.find((p) => p.providerId === "netlify")!;
  assert.equal(netlify.savedCredentials.length, 1);
  assert.equal(netlify.savedCredentials[0]!.tokenTail, null, "a legacy-table-only entry has no token_tail column and this tool never decrypts to derive one");
});

test("deployment_get_static_publish_capabilities: credentialConfigured/ready are TRUE for a provider saved ONLY on the new vendor table, even though the old-table-backed credentialSource reports not-configured", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      // Old-table/env mechanism sees nothing for ANY provider — proves `credentialConfigured` below
      // is genuinely driven by the new table, not merely echoing this fake.
      async isConfigured() { return { configured: false, reason: "no default credential is saved for this workspace yet" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo([]);
  await createVendorCredential(
    { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "custom bucket", connection: { vendorId: "s3-compatible", region: "us-east-1", bucket: "b", accessKeyId: "AKIA", secretAccessKey: "topsecret", publicUrl: "https://example.test" } }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; credentialConfigured: boolean; savedCredentials: unknown[]; guidance?: string }[] };

  const s3 = result.providers.find((p) => p.providerId === "s3-compatible")!;
  // Before this cutover this was the exact self-contradiction the handler's own header warns about:
  // `savedCredentials` non-empty while `credentialConfigured` still read `false` off the old-table-only
  // mechanism, because `deployment_propose_custom_provider_credential`'s Phase 3 write (this same
  // dispatch) now lands in a table this handler previously never looked at.
  assert.equal(s3.credentialConfigured, true, "a fresh vendor-table-only save must be reported as configured");
  assert.equal(s3.savedCredentials.length, 1);
  // Correctly "configured but not yet verified" — NOT the old-table-driven "nothing is saved" guidance
  // this provider would have shown before this cutover (there is no verify endpoint for the new table
  // yet — settled decision, see this dispatch's own report — so "never verified" is the honest,
  // permanent state for a vendor-table-only s3-compatible credential today, not a transient gap).
  assert.match(s3.guidance!, /has not been verified/);
  assert.doesNotMatch(s3.guidance!, /no credential|nothing is saved|is not configured/i);
});

test("deployment_get_static_publish_capabilities: when a provider has rows on BOTH tables, the new vendor table wins outright and the stale legacy row is not reported", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured() { return { configured: true }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo([
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "legacy-stale", providerId: "vercel", label: "stale", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
  ]);
  await createVendorCredential(
    { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "fresh", connection: { vendorId: "vercel", token: "vercel-token-9999" } }
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");
  const result = (await call(capabilities)) as { providers: { providerId: string; savedCredentials: { label: string }[] }[] };

  const vercel = result.providers.find((p) => p.providerId === "vercel")!;
  assert.deepEqual(vercel.savedCredentials.map((c) => c.label), ["fresh"], "the new table's row must win outright — the stale legacy row must not also appear");
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
  deps.publishCredentialSetRepo = fakeCredentialRepo([]);
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
  const records: PublishCredentialSetRecord[] = [
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, accountLabel: "leonaburime-ucla", createdAt: NOW, updatedAt: NOW },
  ];
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo(records);
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
  const records: PublishCredentialSetRecord[] = [
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
  ];
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo(records);
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
  const records: PublishCredentialSetRecord[] = [
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, accountLabel: "leonaburime-ucla", createdAt: NOW, updatedAt: NOW },
  ];
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo(records);
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
});

test("deployment_get_static_publish_capabilities's description forbids ever offering an example/placeholder account name when accountLabel is unknown", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_get_static_publish_capabilities")!;
  assert.match(entry.description, /never offer an example, placeholder/i);

  const preview = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_preview_static_publish")!;
  const ownerDescription = (preview.inputSchema as { properties: { owner: { description: string } } }).properties.owner.description;
  assert.match(ownerDescription, /never soften that question with an illustrative example/i);
});

test("deployment_get_static_publish_capabilities: a recorded lastPublish is surfaced per provider, and defaults to null when nothing has been published there yet", async () => {
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { throw new Error("must not be called by this handler"); },
      async isConfigured(input) { return input.target === "github-pages" ? { configured: true } : { configured: false, reason: "not configured" }; },
    },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo([]);
  const history = new InMemoryPublishHistoryStore();
  await history.recordSuccess({
    workspaceId: WORKSPACE_ID_FALLBACK,
    entry: { target: "github-pages", url: "https://leonaburime-ucla.github.io/tovu-demo/", reachable: true, status: "ready", projectName: "tovu-demo", publishedAt: NOW, owner: "leonaburime-ucla", repo: "tovu-demo", basePath: "/tovu-demo" },
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
    buildTarget: () => fakeDeployTarget(captured),
  });
  deps.historyStore = history;
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildRegistrations(deps, surfaceExchanges);
  const executeTool = tool(registrations, "deployment_execute_static_publish");

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "github-pages", owner: "octo", repo: "my-site", projectName: "my-site-release" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
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

test("deployment_get_static_publish_capabilities's description tells the model to default 'owner' from accountLabel and still confirm with the human", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_get_static_publish_capabilities")!;
  assert.match(entry.description, /accountLabel/);
  const preview = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_preview_static_publish")!;
  const ownerDescription = (preview.inputSchema as { properties: { owner: { description: string } } }).properties.owner.description;
  assert.match(ownerDescription, /accountLabel/);
  assert.match(ownerDescription, /confirm/i);
});

// 2026-08-16 — Defect fix: "ready" used to mean only "a credential row/env-var exists"
// (`isConfigured()`), never whether the provider actually accepts it. These three tests are the
// regression: a saved-but-unverified credential, a saved-but-INVALID one, and a saved credential
// whose last check could not reach the provider must all read as NOT ready, but distinctly from
// each other and from "nothing saved at all" — collapsing "unreachable" into "invalid" would risk
// sending a human to regenerate a perfectly good token over a transient network blip (code review's
// explicit constraint on this fix).

test("deployment_get_static_publish_capabilities: a saved credential that has NEVER been verified is reported as configured but NOT ready", async () => {
  const records: PublishCredentialSetRecord[] = [
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
  ];
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must never be called from this read tool"); }, async isConfigured() { return { configured: true }; } },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo(records);
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
  const records: PublishCredentialSetRecord[] = [
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
  ];
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must never be called from this read tool"); }, async isConfigured() { return { configured: true }; } },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo(records);
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
  const records: PublishCredentialSetRecord[] = [
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW },
  ];
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must never be called from this read tool"); }, async isConfigured() { return { configured: true }; } },
  });
  deps.workspaceId = WORKSPACE_ID_FALLBACK;
  deps.publishCredentialSetRepo = fakeCredentialRepo(records);
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
  const { deps, authorizeCalls } = fakeDeps({ allow: false, credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: false, reason: "n/a" }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");

  await assert.rejects(() => call(capabilities), /is not authorized for 'deployments\.read'/);
  assert.equal(authorizeCalls[0]?.permission, "deployments.read");
});

// ---------------------------------------------------------------------------
// 4. deployment_execute_static_publish — NEW, human-gated
// ---------------------------------------------------------------------------

test("with no emitSurface, the publish is refused outright — no exchange is ever opened", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  await assert.rejects(() => call(executeTool, { input: { target: "vercel", projectName: "demo" } }), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0);
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

test("cancel: nothing is published, and the SAME call reports the cancellation", async () => {
  let resolveCallCount = 0;
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { resolveCallCount += 1; return { ok: true, token: "fake-token-never-used" }; },
      async isConfigured() { return { configured: true }; },
    },
    buildTarget: () => { throw new Error("buildTarget must not be called — the human cancelled"); },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo" });
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { published: boolean; cancelled: boolean };
  assert.equal(result.published, false);
  assert.equal(result.cancelled, true);
  assert.equal(resolveCallCount, 0, "a cancelled publish must never resolve a real credential");
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const result = (await call(executeTool, { input: { target: "vercel", projectName: "demo" }, emitSurface: async () => undefined })) as {
    published: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.published, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

test("a cancelled run abandons the dialog and reports 'abandoned', not a hang or a throw", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");
  const controller = new AbortController();

  const pending = call(executeTool, { input: { target: "vercel", projectName: "demo" }, emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();

  const result = (await pending) as { published: boolean; cancelled: boolean; reason: string };
  assert.equal(result.published, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "abandoned");
  assert.equal(surfaceExchanges.size(), 0);
});

test("confirm: a real export runs, publishStaticSite is called, and the SAME call reports the real outcome — no real network/provider is ever touched", async () => {
  let resolveCallCount = 0;
  const captured: { value: DeployFile[] | null } = { value: null };
  const { deps } = fakeDeps({
    credentialSource: {
      async resolve() { resolveCallCount += 1; return { ok: true, token: "fake-token-never-real" }; },
      async isConfigured() { return { configured: true }; },
    },
    buildTarget: () => fakeDeployTarget(captured),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  assert.equal(resolveCallCount, 0, "the credential must not be resolved before the human confirms");

  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { published: boolean; target: string; url: string; status: string };
  assert.equal(result.published, true);
  assert.equal(result.target, "vercel");
  assert.equal(result.url, "https://example.test/published");
  assert.equal(result.status, "ready");
  assert.equal(resolveCallCount, 1, "the credential is resolved exactly once, only after confirmation");
  assert.ok(captured.value && captured.value.length > 0, "the real hermetic fixture's own routes must have actually exported real files");
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

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

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

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "s3-compatible", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

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

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

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

  const { exchangeId, pending, emitted } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  const confirmationUri = surfaceHtmlAndUri(emitted[0]).uri;
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  const result = (await pending) as { published: boolean; url: string };
  assert.equal(result.published, true);

  assert.equal(emitted.length, 2, "the confirmation AND its outcome must both have been emitted");
  const outcome = surfaceHtmlAndUri(emitted[1]);
  assert.equal(outcome.uri, confirmationUri, "the outcome must replace the SAME card, not open a second one");
  assert.equal(outcomeStatusState(outcome.html), "done", "success maps onto the outcome surface's 'done' status state");
  assert.ok(outcome.html.includes(result.url), "the real published URL must appear in the outcome, not just the model result");
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

  const { exchangeId, pending, emitted } = await raiseDialog(executeTool, { target: "s3-compatible", projectName: "demo-site" });
  const confirmationUri = surfaceHtmlAndUri(emitted[0]).uri;
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  await pending;

  assert.equal(emitted.length, 2);
  const outcome = surfaceHtmlAndUri(emitted[1]);
  assert.equal(outcome.uri, confirmationUri);
  assert.equal(outcomeStatusState(outcome.html), "partial", "never collapsed into either 'done' or 'failed'");
});

test("provider rejection ALSO emits a failed-state outcome surface carrying the SAME actionable message the model got, never the credential", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => failingDeployTarget("Vercel API responded 403: insufficient scope for this token"),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { exchangeId, pending, emitted } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  const confirmationUri = surfaceHtmlAndUri(emitted[0]).uri;
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  const result = (await pending) as { published: boolean; message: string };
  assert.equal(result.published, false);

  assert.equal(emitted.length, 2);
  const outcome = surfaceHtmlAndUri(emitted[1]);
  assert.equal(outcome.uri, confirmationUri);
  assert.equal(outcomeStatusState(outcome.html), "failed");
  assert.match(outcome.html, /insufficient scope/);
  assert.doesNotMatch(outcome.html, /fake-token-never-real/, "the credential must never reach the human-visible outcome surface either");
});

test("cancel: does NOT emit a second surface — the confirmation's own script already reports the dismissal truthfully, nothing async happens afterward that could still fail", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called on cancel"); }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { exchangeId, pending, emitted } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { published: boolean; cancelled: boolean };
  assert.equal(result.cancelled, true);
  assert.equal(emitted.length, 1, "cancel must not trigger a second, redundant human-visible emission");
});

test("re-calling the tool while a dialog is pending opens a SEPARATE dialog — it does not answer the first one", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called in this test"); }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const first = await raiseDialog(executeTool, { target: "vercel", projectName: "demo" });
  const second = await raiseDialog(executeTool, { target: "netlify", projectName: "demo-2" });

  assert.notEqual(first.exchangeId, second.exchangeId);
  assert.equal(surfaceExchanges.size(), 2);

  surfaceExchanges.deliver({ exchangeId: first.exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  surfaceExchanges.deliver({ exchangeId: second.exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await Promise.all([first.pending, second.pending]);
});

test("the dialog names the target and project name, so the consent is informed", async () => {
  const { deps } = fakeDeps({ credentialSource: { async resolve() { throw new Error("must not be called in this test"); }, async isConfigured() { return { configured: true }; } } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { html, exchangeId, pending } = await raiseDialog(executeTool, { target: "github-pages", owner: "octo", repo: "my-site", projectName: "my-site-release" });
  assert.match(html, /github-pages/);
  assert.match(html, /my-site-release/);
  assert.match(html, /octo\/my-site/);
  assert.match(html, /public internet/i, "the human must be told the consequence is immediate and public");

  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 5. deployment_propose_custom_provider_credential — MCP-UI form-gated write (spec §6)
// ---------------------------------------------------------------------------

/** Raises the propose-credential FORM and returns everything a test needs to answer it — same shape
 *  as `raiseDialog`, distinct name because it's a form, not a confirmation. */
async function raiseCredentialForm(proposeTool: ToolRegistration, input: Record<string, unknown> = { protocol: "s3-compatible" }) {
  const emitted: unknown[] = [];
  const pending = call(proposeTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
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

test("deployment_propose_custom_provider_credential's schema carries no accessKeyId/secretAccessKey field of any kind", () => {
  const entry = staticPublishAgentToolCatalog.find((t) => t.name === "deployment_propose_custom_provider_credential")!;
  const schema = entry.inputSchema as { properties: Record<string, unknown>; additionalProperties?: boolean; required: string[] };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["bucket", "endpoint", "protocol", "publicUrl", "region"]);
  assert.deepEqual(schema.required, ["protocol"]);
});

test("with no emitSurface, the credential form is refused outright — no exchange is ever opened, nothing saved", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");
  await assert.rejects(() => call(proposeTool, { input: { protocol: "s3-compatible" } }));
  assert.equal(surfaceExchanges.size(), 0);
});

test("requires deployments.credentials.write, checked before any form is raised", async () => {
  const { deps, authorizeCalls, setAllow } = fakeDeps();
  setAllow(false);
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  await assert.rejects(() => call(proposeTool, { input: { protocol: "s3-compatible" }, emitSurface: async () => {} }));
  assert.equal(surfaceExchanges.size(), 0, "no form may be raised before the permission check passes");
  assert.ok(authorizeCalls.some((c) => c.permission === "deployments.credentials.write"));
});

test("the rendered form pre-fills non-secret hints and marks ONLY secretAccessKey as masked", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { html, exchangeId, pending } = await raiseCredentialForm(proposeTool, { protocol: "s3-compatible", bucket: "hinted-bucket", region: "us-east-1" });
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

  // Phase 3 cutover: this write now lands in `vendor_credential_sets`
  // (`deps.vendorCredentialSetRepo`), not the legacy `publish_credential_sets` table — assert against
  // BOTH, so a regression that silently reverted to the old table (or wrote to neither) fails loudly
  // rather than passing on a row this handler no longer produces.
  const legacyRows = await deps.publishCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  assert.equal(legacyRows.filter((r) => r.providerId === "s3-compatible").length, 0, "must no longer write to the legacy publish_credential_sets table");

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

  const second = await raiseCredentialForm(tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential"));
  surfaceExchanges.deliver({
    exchangeId: second.exchangeId,
    toolId: "deployment_propose_custom_provider_credential",
    principalId: PRINCIPAL_ID,
    params: { ...VALID_FORM_SUBMISSION, bucket: "renamed-bucket" },
  });
  const result = await second.pending;
  assert.deepEqual(result, { saved: true, providerId: "s3-compatible", connected: true });

  const rows = (await deps.vendorCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId })).filter((r) => r.vendorId === "s3-compatible");
  assert.equal(rows.length, 1, "a second save must UPDATE the existing row, never create a second one");
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
  await assert.rejects(() => call(hostingSetupTool, { input: { protocol: "s3-compatible", bucket: "b", region: "us-east-1" } }), /is not authorized for 'deployments\.read'/);
  assert.ok(authorizeCalls.some((c) => c.permission === "deployments.read"));
});

test("deployment_generate_bucket_hosting_setup rejects an unrecognized protocol rather than silently returning generic guidance", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  await assert.rejects(() => call(hostingSetupTool, { input: { protocol: "webhook", bucket: "b", region: "us-east-1" } }), /protocol/);
});

test("blank/omitted endpoint infers plain AWS S3 and returns a bucket-substituted public-read policy JSON, no warning", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const hostingSetupTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_generate_bucket_hosting_setup");

  const result = (await call(hostingSetupTool, { input: { protocol: "s3-compatible", bucket: "my-bucket", region: "us-east-1" } })) as {
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
    input: { protocol: "s3-compatible", bucket: "my-bucket", region: "auto", endpoint: "https://abc123.r2.cloudflarestorage.com" },
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
    input: { protocol: "s3-compatible", bucket: "my-bucket", region: "nyc3", endpoint: "https://nyc3.digitaloceanspaces.com" },
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

test("deployment_preview_static_publish: a github-pages preview with owner/repo omitted falls back to empty strings and reports invalid, never throws", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: false, reason: "n/a" }; }, async isConfigured() { return { configured: false, reason: "n/a" }; } },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  const result = (await call(preview, { input: { target: "github-pages" } })) as Record<string, unknown>;
  assert.equal(result.valid, false);
  assert.match(result.validationError as string, /invalid GitHub owner/);
});

test("deployment_preview_static_publish: an unrecognized target throws before any permission check or credential read", async () => {
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { throw new Error("must not be called"); }, async isConfigured() { throw new Error("must not be called"); } },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const preview = tool(buildRegistrations(deps, surfaceExchanges), "deployment_preview_static_publish");

  await assert.rejects(() => call(preview, { input: { target: "bogus-provider" } }), /'target' must be one of/);
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

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "github-pages", owner: "octo", repo: "demo-repo", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

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

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  const result = (await pending) as { deploymentId?: string };
  assert.equal(result.deploymentId, "dpl_456");
});

test("confirm: an answer with no explicit decision field still defaults to confirm — the handler's own fallback, not merely what the real form always sends", async () => {
  const captured: { value: DeployFile[] | null } = { value: null };
  const { deps } = fakeDeps({
    credentialSource: { async resolve() { return { ok: true, token: "fake-token-never-real" }; }, async isConfigured() { return { configured: true }; } },
    buildTarget: () => fakeDeployTarget(captured),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_execute_static_publish");

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "vercel", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: {} });

  const result = (await pending) as { published: boolean; reachable: boolean };
  assert.equal(result.published, true);
  assert.equal(result.reachable, true);
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

  const { exchangeId, pending } = await raiseDialog(executeTool, { target: "s3-compatible", projectName: "demo-site" });
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

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

  const result = (await call(proposeTool, { input: { protocol: "s3-compatible" }, emitSurface: async () => undefined })) as {
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

  const pending = call(proposeTool, { input: { protocol: "s3-compatible" }, emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
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
  deps.vendorCredentials = {
    ...deps.vendorCredentials!,
    create: async () => {
      throw "boom — not an Error instance";
    },
  };
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { exchangeId, pending } = await raiseCredentialForm(proposeTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: VALID_FORM_SUBMISSION });

  const result = (await pending) as { saved: boolean; reason: string; message: string };
  assert.equal(result.saved, false);
  assert.equal(result.reason, "invalid");
  assert.equal(result.message, "boom — not an Error instance");
});
