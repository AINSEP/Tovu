import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential, CustomCredentialNotFoundError, type CustomCredentialWriteDeps } from "../store.js";
import { CredentialedRequestValidationError, InMemoryCredentialedRequestAuditLog } from "../credentialed-request.js";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";

/**
 * @file Certification of `custom_credential_make_request`'s DELETE confirmation gate
 * (`tool-registrations.ts`, 2026-08-31 owner decision), previously uncovered. Mirrors
 * `features/post/__tests__/agent-tools.delete-confirmation.test.ts`'s own mechanism — a real
 * `SurfaceExchangeStore` plus `surfaceExchanges.deliver(...)` to simulate the human's click, never a
 * hand-rolled fake — adapted to this domain's `CredentialedRequestDeclinedResult` shape and its own
 * distinct property: GET/POST/PUT/PATCH run with NO ceremony at all, and only DELETE is gated.
 *
 * The property this file is responsible for: **a declined, expired, or abandoned DELETE must never
 * decrypt the credential or reach the guarded HTTP client.** `resolveRequestTarget`
 * (`credentialed-request.ts`) validates the label and url — non-decrypting — before the dialog is
 * ever raised; only a CONFIRMED delete goes on to decrypt and send. {@link TrackingSecretSealer}
 * wraps the real `AesGcmSecretSealer` (never a plaintext-passthrough double — the point is proving
 * the REAL decrypt path is or is not reached) and counts `open()` calls so a test can assert zero
 * decrypts for every non-confirmed outcome, exactly as the task's own priority names.
 */

const WORKSPACE_ID = "ws-cred-delete";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-31T00:00:00.000Z";
const TOOL_ID = "custom_credential_make_request";

/** Wraps a real `SecretSealerPort` and counts calls — lets a test assert "never decrypted" against
 *  the REAL AES-GCM path rather than a fake that could hide a wiring bug. See this file's header. */
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

/** Scripted `HttpClientPort` double — same shape `credentialed-request.unit.test.ts`'s own
 *  `FakeHttpClient` uses; kept local rather than shared because that file's double is not exported
 *  (each test file owns its own fixtures, per this codebase's own convention). */
class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly responses: (HttpResponse | Error)[];
  private cursor = 0;
  constructor(responses: (HttpResponse | Error)[] = [{ status: 204, headers: {}, bodyText: "" }]) {
    this.responses = responses;
  }
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const next = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (next instanceof Error) throw next;
    return next;
  }
}

function fakeRouteDeps(options: { allow?: boolean; httpResponses?: (HttpResponse | Error)[] } = {}) {
  let allow = options.allow ?? true;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new TrackingSecretSealer(new AesGcmSecretSealer(keyring));
  const httpClient = new FakeHttpClient(options.httpResponses);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    customCredentialsHttpClient: httpClient,
    customCredentialsAudit: audit,
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

  return { deps, repo, sealer, httpClient, audit, authorizeCalls, writeDeps, setAllow: (value: boolean) => { allow = value; } };
}

/** Seeds one real, decryptable `fly.io` credential — the multi-host motivating case — so the
 *  confirmed-DELETE test can prove a real Authorization header actually reaches the guarded client. */
async function seedFlyIo(writeDeps: CustomCredentialWriteDeps) {
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    additionalHosts: ["https://api.machines.dev"],
    connection: { token: "flyio-secret-token" },
  });
}

function buildRegistrations(deps: CustomCredentialsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildCustomCredentialsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

/** Checked registry lookup — mirrors `agent-tools.delete-confirmation.test.ts`'s own `tool()`. */
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
    input: options.input ?? { label: "fly.io", method: "DELETE", url: "https://api.fly.io/v1/apps/my-app" },
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — mirrors
 *  `agent-tools.delete-confirmation.test.ts`'s own `exchangeIdFromSurface`. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Raises the DELETE dialog and returns everything a test needs to answer it. */
async function raiseDialog(deleteTool: ToolRegistration, input: Record<string, unknown> = { label: "fly.io", method: "DELETE", url: "https://api.fly.io/v1/apps/my-app" }) {
  const emitted: unknown[] = [];
  const pending = call(deleteTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId };
}

// ---------------------------------------------------------------------------
// 1. The call parks, the dialog names exactly what is about to be sent, and nothing is sent yet
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is decrypted or sent while it is pending", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildRegistrations(deps, surfaceExchanges);
  const deleteTool = tool(registrations, TOOL_ID);

  const { pending, ui, exchangeId } = await raiseDialog(deleteTool);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers"
  );
  assert.equal(sealer.openCalls, 0, "the credential must not be decrypted while the dialog is only pending");
  assert.equal(httpClient.calls.length, 0);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names exactly what is about to be sent — label, resolved host, method, and path", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(deleteTool, { label: "fly.io", method: "DELETE", url: "https://api.fly.io/v1/apps/my-app" });

  assert.match(ui.resource.text, /fly\.io/);
  assert.match(ui.resource.text, /api\.fly\.io/);
  assert.match(ui.resource.text, /DELETE/);
  assert.match(ui.resource.text, /\/v1\/apps\/my-app/);
  assert.match(ui.resource.text, /irreversible/i);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names a url resolved through additionalHosts exactly the same way as its base host", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(deleteTool, { label: "fly.io", method: "DELETE", url: "https://api.machines.dev/v1/apps/my-app/machines/m1" });

  assert.match(ui.resource.text, /api\.machines\.dev/);
  assert.match(ui.resource.text, /\/v1\/apps\/my-app\/machines\/m1/);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 2. The model's own schema cannot complete the delete on its own
// ---------------------------------------------------------------------------

test("the model's own schema publishes only label/method/url/headers/body — no decision or exchange-id field", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const schema = deleteTool.descriptor.inputSchema as { properties: object; additionalProperties?: boolean };
  assert.deepEqual(Object.keys(schema.properties).sort(), ["body", "headers", "label", "method", "url"]);
  assert.equal(schema.additionalProperties, false);
});

// ---------------------------------------------------------------------------
// 3. Confirm, cancel, and the two no-answer outcomes — and, critically, decrypt-avoidance
// ---------------------------------------------------------------------------

test("confirm: the human's click performs the real DELETE (decrypting exactly once) and the SAME call reports it to the agent", async () => {
  const { deps, sealer, httpClient, audit, writeDeps } = fakeRouteDeps({ httpResponses: [{ status: 204, headers: {}, bodyText: "" }] });
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { executed: true; status: number; headers: Record<string, string>; bodyText: string };
  assert.equal(result.executed, true);
  assert.equal(result.status, 204);

  assert.equal(httpClient.calls.length, 1);
  const sent = httpClient.calls[0]!;
  assert.equal(sent.method, "DELETE");
  assert.equal(sent.url, "https://api.fly.io/v1/apps/my-app");
  assert.equal(sent.headers.Authorization, "Bearer flyio-secret-token");
  assert.equal(sealer.openCalls, 1, "a confirmed DELETE decrypts exactly once");

  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]!.method, "DELETE");
  assert.ok(!JSON.stringify(audit.entries).includes("flyio-secret-token"));
});

test("cancel: a declined DELETE NEVER decrypts and NEVER touches the guarded HTTP client — the SAME call reports the cancellation", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(deleteTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = await pending;
  assert.deepEqual(result, { executed: false, cancelled: true });
  assert.equal(sealer.openCalls, 0, "a cancelled DELETE must never decrypt the credential");
  assert.equal(sealer.sealCalls, 1, "the only seal() call is from seedFlyIo's own setup, not from the cancelled DELETE");
  assert.equal(httpClient.calls.length, 0, "a cancelled DELETE must never reach the guarded HTTP client");
});

test("an unanswered dialog expires and reports {executed:false, cancelled:false, reason:'expired'} — never decrypts, never sends", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const result = await call(deleteTool, { emitSurface: async () => undefined });

  assert.deepEqual(result, { executed: false, cancelled: false, reason: "expired" });
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
});

test("a cancelled run abandons the dialog and reports {executed:false, cancelled:false, reason:'abandoned'} — never decrypts, never sends", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);
  const controller = new AbortController();

  const pending = call(deleteTool, { emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();

  const result = await pending;
  assert.deepEqual(result, { executed: false, cancelled: false, reason: "abandoned" });
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 4. No emit seam: fail closed rather than degrade — no dialog, no decrypt, no send
// ---------------------------------------------------------------------------

test("with no emitSurface, a DELETE is refused outright with the exact fail-closed message — no exchange, no decrypt, no send", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(
    () => call(deleteTool),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(
        err.message,
        "custom_credential_make_request: this execution context has no interactive confirmation channel " +
          "(no emitSurface), so a DELETE cannot be gated here. Nothing was sent."
      );
      return true;
    }
  );
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 5. Authorization and target validation — both checked before any dialog is raised
// ---------------------------------------------------------------------------

test("a denied principal never even sees a dialog, and the credential is never decrypted", async () => {
  const { deps, sealer, httpClient, authorizeCalls, writeDeps } = fakeRouteDeps({ allow: false });
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(deleteTool), /is not authorized for 'custom-credentials\.write'/);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
  assert.equal(authorizeCalls[0]?.permission, "custom-credentials.write");
});

test("an unknown label is refused with CustomCredentialNotFoundError before any dialog is raised", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(
    () => call(deleteTool, { input: { label: "does-not-exist", method: "DELETE", url: "https://api.fly.io/v1/apps" } }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialNotFoundError);
      assert.equal((err as Error).message, "no custom credential labeled 'does-not-exist' in this workspace");
      return true;
    }
  );
  assert.equal(surfaceExchanges.size(), 0, "an unresolvable target must never raise a dialog");
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
});

test("an off-allowlist url is refused with the exact validation message before any dialog is raised, and never decrypts", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(
    () => call(deleteTool, { input: { label: "fly.io", method: "DELETE", url: "https://evil.example.com/steal" } }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "url 'https://evil.example.com/steal' resolves to origin 'https://evil.example.com', which is not one of this credential's saved hosts (https://api.fly.io, https://api.machines.dev) — add it to this credential in the Access Tokens form first"
      );
      return true;
    }
  );
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 6. GET/POST/PUT/PATCH run with NO ceremony at all — this domain's own distinction from `post`'s
// gate, which applies to every mutation. Proven by NOT supplying emitSurface at all: a gated verb
// would fail-closed exactly like the test above; these must not.
// ---------------------------------------------------------------------------

test("GET runs immediately with no confirmation, no emitSurface required, and the credential decrypts exactly once", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps({ httpResponses: [{ status: 200, headers: {}, bodyText: "{}" }] });
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const getTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const result = await call(getTool, { input: { label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" } });

  assert.deepEqual((result as { executed: boolean }).executed, true);
  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0]!.method, "GET");
  assert.equal(sealer.openCalls, 1);
  assert.equal(surfaceExchanges.size(), 0, "GET must never open a confirmation exchange");
});

test("POST runs immediately with no confirmation and sends the given body", async () => {
  const { deps, httpClient, writeDeps } = fakeRouteDeps({ httpResponses: [{ status: 201, headers: {}, bodyText: '{"id":"m1"}' }] });
  await seedFlyIo(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const postTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const result = await call(postTool, { input: { label: "fly.io", method: "POST", url: "https://api.fly.io/v1/apps/my-app/machines", body: '{"config":{}}' } });

  assert.deepEqual((result as { executed: boolean; status: number }).executed, true);
  assert.equal((result as { status: number }).status, 201);
  assert.equal(httpClient.calls[0]!.body, '{"config":{}}');
  assert.equal(surfaceExchanges.size(), 0);
});

test("PUT and PATCH also run immediately with no confirmation", async () => {
  for (const method of ["PUT", "PATCH"] as const) {
    const { deps, httpClient, writeDeps } = fakeRouteDeps({ httpResponses: [{ status: 200, headers: {}, bodyText: "{}" }] });
    await seedFlyIo(writeDeps);
    const surfaceExchanges = createSurfaceExchangeStore();
    const reqTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

    const result = await call(reqTool, { input: { label: "fly.io", method, url: "https://api.fly.io/v1/apps/my-app", body: "{}" } });

    assert.equal((result as { executed: boolean }).executed, true, `${method} must run immediately`);
    assert.equal(httpClient.calls[0]!.method, method);
    assert.equal(surfaceExchanges.size(), 0, `${method} must never open a confirmation exchange`);
  }
});
