import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/app";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/assistant/surface-exchanges";
import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort } from "../publish-credentials/index";
import type { PublishCredentialSource } from "../static-publish/index";

import { buildStaticPublishRegistrations, staticPublishAgentToolCatalog, staticPublishDerivedRisk, type StaticPublishToolDeps } from "../publish-agent-tools";

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
process.env.TOVU_PUBLISH_DIR = publishOutputDir;
test.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

/** Real hermetic `RouteDeps` (`createRouteDeps()`, the same fixture `adapter.unit.test.ts` and the
 *  sibling `deployments` integration test use — real, in-process, no external network), with
 *  `authorize` overridden and this file's own test-only `credentialSource`/`buildTarget` seams
 *  optionally set. Mirrors `agent-tools.delete-confirmation.test.ts`'s `fakeRouteDeps` shape. */
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
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
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

/** Raises the publish confirmation dialog and returns everything a test needs to answer it. */
async function raiseDialog(executeTool: ToolRegistration, input: Record<string, unknown>) {
  const emitted: unknown[] = [];
  const pending = call(executeTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, html, exchangeId };
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
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-1", providerId: "github-pages", label: "work", sealed: {} as never, isDefault: true, createdAt: NOW, updatedAt: NOW },
    { workspaceId: WORKSPACE_ID_FALLBACK, id: "cred-2", providerId: "github-pages", label: "personal", sealed: {} as never, isDefault: false, createdAt: NOW, updatedAt: NOW },
    { workspaceId: "some-other-workspace", id: "cred-x", providerId: "vercel", label: "not-mine", sealed: {} as never, isDefault: true, createdAt: NOW, updatedAt: NOW },
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

  const surfaceExchanges = createSurfaceExchangeStore();
  const capabilities = tool(buildRegistrations(deps, surfaceExchanges), "deployment_get_static_publish_capabilities");

  const result = (await call(capabilities)) as {
    executionMode: string;
    providers: { providerId: string; ready: boolean; savedCredentials: { id: string; label: string; isDefault: boolean }[]; guidance?: string }[];
  };

  assert.equal(result.executionMode, deps.publishExecutionMode);
  // 5 providers as of the s3-compatible ("Custom" tab) addition — spec
  // `custom-publish-provider-contract.md` §10.7 — not 4.
  assert.equal(result.providers.length, 5);

  const github = result.providers.find((p) => p.providerId === "github-pages")!;
  assert.equal(github.ready, true);
  assert.equal(github.guidance, undefined);
  assert.deepEqual(github.savedCredentials.map((c) => c.label).sort(), ["personal", "work"]);
  assert.ok(github.savedCredentials.every((c) => !("token" in c) && !("sealed" in c)), "must never surface a token or ciphertext");

  const vercel = result.providers.find((p) => p.providerId === "vercel")!;
  assert.equal(vercel.ready, false);
  assert.deepEqual(vercel.savedCredentials, [], "a credential saved for a DIFFERENT workspace must never leak into this one's readiness");
  assert.match(vercel.guidance!, /Static Site tab/);

  assert.equal(resolveCallCount, 0, "deployment_get_static_publish_capabilities must never call PublishCredentialSource.resolve()");
  assert.doesNotMatch(JSON.stringify(result), /should-never-appear/);
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

  const rows = await deps.publishCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  const s3Rows = rows.filter((r) => r.providerId === "s3-compatible");
  assert.equal(s3Rows.length, 1);
  assert.equal(s3Rows[0]!.isDefault, true, "a provider's first-ever saved connection auto-defaults");
  assert.equal(s3Rows[0]!.label, "default");
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

  const rows = (await deps.publishCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId })).filter((r) => r.providerId === "s3-compatible");
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

  const rows = await deps.publishCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  assert.equal(rows.filter((r) => r.providerId === "s3-compatible").length, 0, "an invalid submission must not save anything");
});

test("cancel: nothing is saved, and the SAME call reports the cancellation", async () => {
  const { deps } = fakeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const proposeTool = tool(buildRegistrations(deps, surfaceExchanges), "deployment_propose_custom_provider_credential");

  const { exchangeId, pending } = await raiseCredentialForm(proposeTool);
  surfaceExchanges.deliver({ exchangeId, toolId: "deployment_propose_custom_provider_credential", principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  const result = await pending;
  assert.deepEqual(result, { saved: false, cancelled: true });

  const rows = await deps.publishCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  assert.equal(rows.filter((r) => r.providerId === "s3-compatible").length, 0);
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
