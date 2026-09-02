import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { describeInput } from "#src/assistant/tool-executor-audit";
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
 * @file Certification of `custom_credential_set_token` (2026-09-01) — the MCP-UI surface that lets an
 * agent trigger setting/rotating a saved custom credential's TOKEN without the token ever passing
 * through the model's context. Mirrors `make-request-delete-confirmation.test.ts`'s own mechanism (a
 * real `SurfaceExchangeStore` plus `surfaceExchanges.deliver(...)` to simulate the human's submission,
 * never a hand-rolled fake) and `set-username-agent-tool.unit.test.ts`'s catalog/wiring/security-line
 * checks, adapted to this tool's `askThenReport`-driven form-then-outcome shape.
 *
 * The property this file is responsible for, above all others: **the token never reaches the model's
 * own call, the tool's own result, or the durable audit trail — only the sealed ciphertext.**
 * {@link TrackingSecretSealer} wraps the real `AesGcmSecretSealer` (never a plaintext-passthrough
 * double) so a test can assert the credential was genuinely re-sealed, and
 * `resolveCustomCredentialByLabel` (a real decrypt) is used to prove the NEW token actually landed —
 * proving the write happened is exactly as important as proving the token never leaked elsewhere.
 */

const WORKSPACE_ID = "ws-cred-set-token";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-01T00:00:00.000Z";
const TOOL_ID = "custom_credential_set_token";

/** Same call-counting wrapper every sibling test file in this directory uses. */
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

/** `custom_credential_set_token` must never reach this — a call proves a real wiring bug: this tool
 *  seals a plaintext column pair, it has no legitimate reason to ever touch the network. */
class ExplodingHttpClient implements HttpClientPort {
  async send(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error("custom_credential_set_token must never call the HTTP client");
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

  return { deps, repo, sealer, writeDeps, authorizeCalls, setAllow: (value: boolean) => { allow = value; } };
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

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? { label: "name.com" },
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

/** Pulls the exchange id out of an emitted mcp-ui surface's HTML — mirrors
 *  `make-request-delete-confirmation.test.ts`'s own `exchangeIdFromSurface`. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Raises the token form and returns everything a test needs to answer it. */
async function raiseForm(setTokenTool: ToolRegistration, input: Record<string, unknown> = { label: "name.com" }) {
  const emitted: unknown[] = [];
  const pending = call(setTokenTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId, emitted };
}

async function seedNameCom(writeDeps: CustomCredentialWriteDeps, connection: { token: string; username?: string } = { token: "old-secret-token" }) {
  return createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection,
  });
}

// ---------------------------------------------------------------------------
// 1. Catalog + wiring + risk classification — no token field anywhere on the model-facing schema
// ---------------------------------------------------------------------------

test("custom_credential_set_token has a catalog entry gated on the WRITE permission, with a schema that has no token field at all", () => {
  const entry = customCredentialsAgentToolCatalog.find((t) => t.name === TOOL_ID);
  assert.ok(entry, `expected '${TOOL_ID}' in customCredentialsAgentToolCatalog`);
  assert.equal(entry!.authorization.permission, "custom-credentials.write");
  const schema = entry!.inputSchema as { required: unknown[]; additionalProperties: boolean; properties: Record<string, unknown> };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required], ["label"]);
  assert.deepEqual(Object.keys(schema.properties), ["label"]);
  assert.ok(!("token" in schema.properties));
});

test("custom_credential_set_token is classified as mutates-durable-state in this domain's own derived-risk map", () => {
  assert.equal(customCredentialsDerivedRisk.get(TOOL_ID), "mutates-durable-state");
});

test("custom_credential_set_token is wired to a real handler", () => {
  const { deps } = fakeRouteDeps();
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  tool(registrations, TOOL_ID); // throws if missing
});

// ---------------------------------------------------------------------------
// 2. The model-issued call cannot smuggle a token in, and never receives one back
// ---------------------------------------------------------------------------

test("rejects a model-issued call carrying a token-ish field alongside label — no dialog is ever raised, and nothing decrypts", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  sealer.openCalls = 0;
  sealer.sealCalls = 0; // ignore the seed's own seal call

  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(setTokenTool, { input: { label: "name.com", token: "sneaky-attempt-to-set-it-directly" } }));
  assert.equal(surfaceExchanges.size(), 0, "a malformed call must never raise a form");
  assert.equal(sealer.openCalls, 0);
  assert.equal(sealer.sealCalls, 0);
});

test("the tool's own result never echoes the submitted token, on success or failure", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId } = await raiseForm(setTokenTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { token: "brand-new-secret-token" } });
  const result = await pending;

  assert.deepEqual(result, { saved: true });
  assert.ok(!JSON.stringify(result).includes("brand-new-secret-token"), "the result must never contain the submitted token");
});

test("the durable audit trail records only the model-issued call's key NAMES, never any value — describeInput never carries the label's own value, let alone a token", () => {
  // The exchange DELIVERY (the browser POST carrying the actual token) never reaches
  // `toolExecutor.execute`/`describeInput` at all — `mcp-ui-tool-calls-route.ts`'s own header: "Shape 1
  // never calls `toolExecutor.execute`". The only call `describeInput` ever sees for this tool is the
  // ORIGINAL model-issued one, whose own schema (asserted above) has no token field to begin with.
  assert.equal(describeInput({ label: "name.com" }), "keys: label");
});

// ---------------------------------------------------------------------------
// 3. Fail-closed with no emitSurface — NO fallback second-call path exists for this tool
// ---------------------------------------------------------------------------

test("with no emitSurface, the call is refused outright with the exact fail-closed message — no exchange, no decrypt, no seal", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(
    () => call(setTokenTool),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(
        err.message,
        "custom_credential_set_token: this execution context has no interactive confirmation channel " +
          "(no emitSurface), so a token cannot be collected here. Nothing was changed."
      );
      return true;
    }
  );
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
  assert.equal(sealer.openCalls, 0);
});

// ---------------------------------------------------------------------------
// 4. Authorization and target validation — both checked before any form is raised
// ---------------------------------------------------------------------------

test("a denied principal never even sees the form, and nothing decrypts", async () => {
  const { deps, sealer, authorizeCalls, writeDeps } = fakeRouteDeps({ allow: false });
  await seedNameCom(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(setTokenTool), /is not authorized for 'custom-credentials\.write'/);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a form opened for them");
  assert.equal(sealer.openCalls, 0);
  assert.equal(authorizeCalls[0]?.permission, "custom-credentials.write");
});

test("an unknown label is refused with CustomCredentialNotFoundError-shaped message, before any form is raised", async () => {
  const { deps, sealer } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(setTokenTool, { input: { label: "does-not-exist" } }), /no custom credential labeled 'does-not-exist'/);
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(sealer.openCalls, 0);
});

// ---------------------------------------------------------------------------
// 5. The form parks, and a submitted token is genuinely sealed — proving the write, not just the leak
// ---------------------------------------------------------------------------

test("the call stays open after the form is shown, and nothing is sealed while it is pending", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  sealer.sealCalls = 0; // ignore the seed's own seal call
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, ui, exchangeId } = await raiseForm(setTokenTool);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers"
  );
  assert.equal(sealer.sealCalls, 0, "the credential must not be re-sealed while the form is only pending");

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });
  await pending;
});

test("submit: a real token is sealed exactly once, the NEW token decrypts correctly, and the SAME call reports {saved:true}", async () => {
  const { deps, sealer, repo, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps, { token: "old-secret-token" });
  sealer.sealCalls = 0; // ignore the seed's own seal call
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId, emitted } = await raiseForm(setTokenTool);
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { token: "brand-new-secret-token" } });
  assert.deepEqual(delivered, { ok: true });

  const result = await pending;
  assert.deepEqual(result, { saved: true });
  assert.equal(sealer.sealCalls, 1, "a confirmed submission re-seals exactly once");

  // The SECOND emission is the corrected outcome — see `askThenReport`'s own doc for why a bare
  // "Done." from the form's own script would otherwise be the human's only signal.
  assert.equal(emitted.length, 2, "a successful submission must send a correcting outcome emission");
  const outcome = (emitted[1] as { payload: { resource: UIResource } }).payload.resource;
  assert.match(outcome.resource.text, /saved/i);
  assert.ok(!outcome.resource.text.includes("brand-new-secret-token"), "the outcome surface must never render the token itself");

  const resolved = await resolveCustomCredentialByLabel({ repo, sealer }, { workspaceId: WORKSPACE_ID, label: "name.com" });
  assert.ok(resolved);
  assert.equal(resolved!.connection.token, "brand-new-secret-token", "the NEW token must actually be the one now stored");
});

test("submit: the credential's existing username is preserved across a token-only submission", async () => {
  const { deps, repo, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps, { token: "old-secret-token", username: "leonaburime@gmail.com" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId } = await raiseForm(setTokenTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { token: "brand-new-secret-token" } });
  await pending;

  const resolved = await resolveCustomCredentialByLabel({ repo, sealer }, { workspaceId: WORKSPACE_ID, label: "name.com" });
  assert.ok(resolved);
  assert.equal(resolved!.connection.token, "brand-new-secret-token");
  assert.equal(resolved!.connection.username, "leonaburime@gmail.com", "a token-only submission must never clear the existing username");
});

test("submit: a blank token is refused as invalid, and nothing is written or re-sealed", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  sealer.sealCalls = 0;
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId, emitted } = await raiseForm(setTokenTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { token: "   " } });

  const result = await pending;
  assert.deepEqual(result, { saved: false, reason: "invalid", message: "Token cannot be blank. Nothing was saved." });
  assert.equal(sealer.sealCalls, 0, "a blank submission must never re-seal anything");
  assert.equal(emitted.length, 2, "an invalid submission still sends a correcting outcome emission");
});

test("cancel: a dismissed form saves nothing, never seals, and sends no outcome emission", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  sealer.sealCalls = 0;
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId, emitted } = await raiseForm(setTokenTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { [SURFACE_DISMISSED_PARAM]: true } });

  const result = await pending;
  assert.deepEqual(result, { saved: false, reason: "cancelled" });
  assert.equal(sealer.sealCalls, 0);
  assert.equal(emitted.length, 1, "a cancel must not send a second, corrected outcome — the form's own script already reports the dismissal");
});

test("an unanswered form expires and reports {saved:false, reason:'expired'} — never seals", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  sealer.sealCalls = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const result = await call(setTokenTool, { emitSurface: async () => undefined });

  assert.deepEqual(result, { saved: false, reason: "expired" });
  assert.equal(sealer.sealCalls, 0);
});

test("a cancelled run abandons the form and reports {saved:false, reason:'abandoned'} — never seals", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await seedNameCom(writeDeps);
  sealer.sealCalls = 0;
  const surfaceExchanges = createSurfaceExchangeStore();
  const setTokenTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);
  const controller = new AbortController();

  const pending = call(setTokenTool, { emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();

  const result = await pending;
  assert.deepEqual(result, { saved: false, reason: "abandoned" });
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(sealer.sealCalls, 0);
});
