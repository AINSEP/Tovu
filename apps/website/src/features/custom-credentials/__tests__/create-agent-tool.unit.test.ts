import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { customCredentialsAgentToolCatalog } from "../agent-tools.js";
import { createCustomCredential, resolveCustomCredentialByLabel, type CustomCredentialWriteDeps } from "../store.js";
import { buildCustomCredentialsRegistrations, customCredentialsDerivedRisk, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";

/**
 * @file Certification of `custom_credential_create` (2026-09-03) — the MCP-UI surface that lets an
 * agent CREATE a brand-new saved custom credential end-to-end (label, base URL, category, optional
 * username, and the token) without the token ever passing through the model's context, and without
 * dead-ending the human at the Admin -> Access Tokens page.
 *
 * Mirrors `set-token-agent-tool.unit.test.ts`'s own mechanism (a real `SurfaceExchangeStore` plus
 * `surfaceExchanges.deliver(...)` to simulate the human's submission, never a hand-rolled fake) and its
 * governing property: **the token never reaches the model's own call, the tool's own result, or the
 * durable audit trail — only the sealed ciphertext.**
 */

const WORKSPACE_ID = "ws-cred-create";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-03T00:00:00.000Z";
const TOOL_ID = "custom_credential_create";

class TrackingSecretSealer implements SecretSealerPort {
  sealCalls = 0;
  openCalls = 0;
  constructor(private readonly inner: SecretSealerPort) {}
  seal(input: Parameters<SecretSealerPort["seal"]>[0]): ReturnType<SecretSealerPort["seal"]> {
    this.sealCalls += 1;
    return this.inner.seal(input);
  }
  open(input: Parameters<SecretSealerPort["open"]>[0]): ReturnType<SecretSealerPort["open"]> {
    this.openCalls += 1;
    return this.inner.open(input);
  }
}

/** `custom_credential_create` must never reach this — a call proves a real wiring bug: this tool
 *  seals a plaintext row, it has no legitimate reason to ever touch the network. */
class ExplodingHttpClient implements HttpClientPort {
  async send(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error("custom_credential_create must never call the HTTP client");
  }
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  let allow = options.allow ?? true;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new TrackingSecretSealer(new AesGcmSecretSealer(keyring));
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
    customCredentialsHttpClient: new ExplodingHttpClient(),
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  const writeDeps: CustomCredentialWriteDeps = {
    repo,
    sealer,
    keyring,
    clock: { nowIso: () => NOW },
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };

  return { deps, repo, sealer, writeDeps, authorizeCalls };
}

function buildRegistrations(deps: CustomCredentialsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildCustomCredentialsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
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

/** Unlike `set-token-agent-tool.unit.test.ts`'s own `call`, this tool's schema has NO required field —
 *  defaults to `{}`, not a fixture label, so a test that omits `input` still exercises the real
 *  all-optional shape rather than accidentally asserting against a borrowed default. */
function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

async function raiseForm(createTool: ToolRegistration, input: Record<string, unknown> = {}) {
  const emitted: unknown[] = [];
  const pending = call(createTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId, emitted };
}

async function seedGithub(writeDeps: CustomCredentialWriteDeps, connection: { token: string; username?: string } = { token: "old-secret-token" }) {
  return createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "github",
    category: "source-control",
    baseUrl: "https://api.github.com",
    connection,
  });
}

// ---------------------------------------------------------------------------
// 1. Catalog + wiring + risk classification — no token field anywhere on the model-facing schema
// ---------------------------------------------------------------------------

test("custom_credential_create has a catalog entry gated on the WRITE permission, with a schema carrying no token or username field at all", () => {
  const entry = customCredentialsAgentToolCatalog.find((t) => t.name === TOOL_ID);
  assert.ok(entry, `expected '${TOOL_ID}' in customCredentialsAgentToolCatalog`);
  assert.equal(entry!.authorization.permission, "custom-credentials.write");
  const schema = entry!.inputSchema as { required: unknown[]; additionalProperties: boolean; properties: Record<string, unknown> };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required], []);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["baseUrl", "category", "label"]);
  assert.ok(!("token" in schema.properties));
  assert.ok(!("username" in schema.properties));
  assert.ok(!("connection" in schema.properties));
});

test("custom_credential_create is classified as mutates-durable-state in this domain's own derived-risk map", () => {
  assert.equal(customCredentialsDerivedRisk.get(TOOL_ID), "mutates-durable-state");
});

test("custom_credential_create is wired to a real handler", () => {
  const { deps } = fakeRouteDeps();
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  tool(registrations, TOOL_ID); // throws if missing
});

// ---------------------------------------------------------------------------
// 2. Fail-closed with no emitSurface, and a denied principal — both before any form is raised
// ---------------------------------------------------------------------------

test("with no emitSurface, the call is refused outright with the exact fail-closed message — no exchange, no seal", async () => {
  const { deps, sealer } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(
    () => call(createTool),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(
        err.message,
        "custom_credential_create: this execution context has no interactive confirmation channel " +
          "(no emitSurface), so a credential cannot be created here. Nothing was changed."
      );
      return true;
    }
  );
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
  assert.equal(sealer.sealCalls, 0);
});

test("a denied principal never even sees the form, and nothing is sealed", async () => {
  const { deps, sealer, authorizeCalls } = fakeRouteDeps({ allow: false });
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(createTool), /is not authorized for 'custom-credentials\.write'/);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a form opened for them");
  assert.equal(sealer.sealCalls, 0);
  assert.equal(authorizeCalls[0]?.permission, "custom-credentials.write");
});

// ---------------------------------------------------------------------------
// 3. The form parks, and a submitted credential is genuinely created — proving the write, not just
//    the leak
// ---------------------------------------------------------------------------

test("the call stays open after the form is shown, and nothing is sealed while it is pending", async () => {
  const { deps, sealer } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, ui, exchangeId } = await raiseForm(createTool);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers"
  );
  assert.equal(sealer.sealCalls, 0);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  await pending;
});

test("submit: a new credential is created, sealed exactly once, the token decrypts correctly, and the SAME call reports the safe summary — never the token", async () => {
  const { deps, sealer, repo } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId, emitted } = await raiseForm(createTool);
  const delivered = surfaceExchanges.deliver({
    exchangeId,
    toolId: TOOL_ID,
    principalId: PRINCIPAL_ID,
    params: { label: "github", baseUrl: "https://api.github.com", category: "source-control", token: "brand-new-secret-token" },
  });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { created: true; credential: { id: string; label: string; category: string; baseUrl: string } };
  assert.equal(result.created, true);
  assert.equal(result.credential.label, "github");
  assert.equal(result.credential.category, "source-control");
  assert.equal(result.credential.baseUrl, "https://api.github.com");
  assert.ok(!JSON.stringify(result).includes("brand-new-secret-token"), "the result must never contain the submitted token");
  assert.equal(sealer.sealCalls, 1, "a confirmed submission seals exactly once");

  assert.equal(emitted.length, 2, "a successful submission must send a correcting outcome emission");
  const formUri = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.uri;
  const outcome = (emitted[1] as { payload: { resource: UIResource } }).payload.resource;
  assert.equal(outcome.resource.uri, formUri, "the outcome must reuse the form's own URI so it REPLACES the form in the transcript");
  assert.match(outcome.resource.text, /saved/i);
  assert.ok(!outcome.resource.text.includes("brand-new-secret-token"), "the outcome surface must never render the token itself");

  const resolved = await resolveCustomCredentialByLabel({ repo, sealer }, { workspaceId: WORKSPACE_ID, label: "github" });
  assert.ok(resolved);
  assert.equal(resolved!.connection.token, "brand-new-secret-token");
  assert.equal(resolved!.baseUrl, "https://api.github.com");
  assert.equal(resolved!.category, "source-control");
});

test("submit: an optional username is saved alongside the token", async () => {
  const { deps, repo, sealer } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId } = await raiseForm(createTool);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: TOOL_ID,
    principalId: PRINCIPAL_ID,
    params: { label: "name.com", baseUrl: "https://api.name.com", category: "hosting", username: "leonaburime@gmail.com", token: "a-token" },
  });
  await pending;

  const resolved = await resolveCustomCredentialByLabel({ repo, sealer }, { workspaceId: WORKSPACE_ID, label: "name.com" });
  assert.ok(resolved);
  assert.equal(resolved!.connection.username, "leonaburime@gmail.com");
});

// ---------------------------------------------------------------------------
// 4. Rejections: blank token, duplicate label, invalid category — nothing written or re-sealed
// ---------------------------------------------------------------------------

test("submit: a blank token is refused as invalid, and nothing is written or sealed", async () => {
  const { deps, sealer, repo } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId, emitted } = await raiseForm(createTool);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: TOOL_ID,
    principalId: PRINCIPAL_ID,
    params: { label: "github", baseUrl: "https://api.github.com", category: "source-control", token: "   " },
  });

  const result = await pending;
  assert.deepEqual(result, { created: false, reason: "invalid", message: "Token cannot be blank. Nothing was saved." });
  assert.equal(sealer.sealCalls, 0);
  assert.equal(emitted.length, 2, "an invalid submission still sends a correcting outcome emission");
  assert.equal((await repo.listByWorkspace({ workspaceId: WORKSPACE_ID })).length, 0);
});

test("submit: a duplicate label is refused with the exact message pointing at custom_credential_set_token for rotation, and the existing credential is untouched", async () => {
  const { deps, sealer, repo, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps, { token: "original-token" });
  sealer.sealCalls = 0; // ignore the seed's own seal call
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId } = await raiseForm(createTool);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: TOOL_ID,
    principalId: PRINCIPAL_ID,
    params: { label: "github", baseUrl: "https://api.github.com/v2", category: "source-control", token: "attempted-overwrite-token" },
  });

  const result = await pending;
  assert.deepEqual(result, {
    created: false,
    reason: "duplicate-label",
    message:
      "A custom credential labeled 'github' already exists in this workspace. To rotate its token, use custom_credential_set_token — this tool only creates NEW credentials and never overwrites an existing one.",
  });
  // `store.ts`'s own `createCustomCredential` seals the CANDIDATE connection before it ever attempts
  // the insert whose UNIQUE constraint actually catches the collision (see that function's own body) —
  // pre-existing behavior of the function this handler calls, not something introduced here. The one
  // seal is wasted (the resulting ciphertext is discarded, never written to any row), but it does
  // happen; the property this test actually needs to prove is the one asserted below instead — the
  // EXISTING row's own ciphertext is never touched.
  assert.equal(sealer.sealCalls, 1, "createCustomCredential seals the candidate connection before its own uniqueness check runs — the seal is wasted, not skipped");

  const resolved = await resolveCustomCredentialByLabel({ repo, sealer }, { workspaceId: WORKSPACE_ID, label: "github" });
  assert.ok(resolved);
  assert.equal(resolved!.connection.token, "original-token", "the existing credential's token must be untouched by a rejected duplicate create");
  assert.equal(resolved!.baseUrl, "https://api.github.com", "the existing credential's baseUrl must be untouched");
});

test("submit: an invalid category is refused with the store's own exact validation message, and nothing is written", async () => {
  const { deps, sealer, repo } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId } = await raiseForm(createTool);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: TOOL_ID,
    principalId: PRINCIPAL_ID,
    params: { label: "widgetco", baseUrl: "https://api.widgetco.example", category: "not-a-real-category", token: "a-token" },
  });

  const result = await pending;
  assert.deepEqual(result, {
    created: false,
    reason: "invalid",
    message: "category must be one of: source-control, hosting, media, ai, ops, general",
  });
  assert.equal(sealer.sealCalls, 0);
  assert.equal((await repo.listByWorkspace({ workspaceId: WORKSPACE_ID })).length, 0);
});

// ---------------------------------------------------------------------------
// 5. Cancel / expiry — no write, and cancel sends no second emission
// ---------------------------------------------------------------------------

test("cancel: a dismissed form saves nothing, never seals, and sends no outcome emission", async () => {
  const { deps, sealer } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId, emitted } = await raiseForm(createTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });

  const result = await pending;
  assert.deepEqual(result, { created: false, reason: "cancelled" });
  assert.equal(sealer.sealCalls, 0);
  assert.equal(emitted.length, 1, "a cancel must not send a second, corrected outcome");
});

test("an unanswered form expires and reports {created:false, reason:'expired'} — never seals", async () => {
  const { deps, sealer } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const result = await call(createTool, { emitSurface: async () => undefined });

  assert.deepEqual(result, { created: false, reason: "expired" });
  assert.equal(sealer.sealCalls, 0);
});

// ---------------------------------------------------------------------------
// 6. Optional non-secret prefill hints reach the form
// ---------------------------------------------------------------------------

test("optional label/baseUrl/category prefill hints on the model-issued call pre-fill the form", async () => {
  const { deps } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const createTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { ui, pending, exchangeId } = await raiseForm(createTool, { label: "github", baseUrl: "https://api.github.com", category: "source-control" });
  assert.match(ui.resource.text, /github/);
  assert.match(ui.resource.text, /api\.github\.com/);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  await pending;
});
