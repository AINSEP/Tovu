/**
 * @file RED regression suite for the custom-credentials half of the 2026-09-16 "always say the real
 * reason" sweep, modelled on `features/post/__tests__/tool-registrations.model-facing-errors.test.ts`:
 * it drives the REAL delegated-tool-call transport (`delegatedToolExecuteRoute` over a real
 * `ToolRegistry`/`ToolExecutor`/`RunLifecycle`) so what is asserted is literally the payload a
 * spawned agent CLI receives.
 *
 * That seam is the whole point. The redaction lives in the TRANSPORT, not in the handler: a
 * handler-level `assert.rejects` passes against this bug, because the handler does throw the right
 * class — it is `ToolExecutor` (anything not `instanceof ToolInputError` => `errorKind: 'internal'`)
 * and then `delegatedToolExecuteRoute`'s SEC-005 redaction that turn it into
 * `{ code: "INTERNAL_ERROR", message: "an internal error occurred" }`.
 *
 * RED before the fix, for every allowlisted case below:
 * `{ ok: false, error: { code: "INTERNAL_ERROR", message: "an internal error occurred", requestId }}`.
 * The kit's `ForbiddenError`, `CustomCredentialNotFoundError`, `CustomCredentialValidationError`, and
 * the DELETE pre-check's `CredentialedRequestValidationError` all reached the model as the same
 * opaque 500 a crash produces.
 *
 * This domain handles credentials, so the security half matters as much as the fix: the two
 * "stays redacted" cases pin that a secret-store failure (whose message can carry decrypted
 * plaintext) and a transport failure (whose message can carry an internal address) never reach the
 * wire, and the smuggling cases pin that a token VALUE a model tried to pass is not echoed back.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { customCredentialsAgentToolCatalog } from "../agent-tools.js";
import { InMemoryCredentialedRequestAuditLog } from "../credentialed-request.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential } from "../store.js";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-cred-model-facing";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-16T00:00:00.000Z";
const SEEDED_TOKEN = "flyio-secret-token-value";

/** Scripted `HttpClientPort` double: throws the scripted error, or answers 200. */
class ScriptedHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly error?: Error) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    if (this.error) throw this.error;
    return { status: 200, headers: {}, bodyText: "ok" };
  }
}

async function makeRouteDeps(options: { allow?: boolean; httpError?: Error; sealer?: (inner: SecretSealerPort) => SecretSealerPort } = {}) {
  const allow = options.allow ?? true;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const realSealer = new AesGcmSecretSealer(keyring);
  let counter = 0;
  const idGen = { newId: () => `cred-${++counter}` };
  const clock = { nowIso: () => NOW };

  await createCustomCredential(
    { repo, sealer: realSealer, keyring, clock, idGen },
    {
      workspaceId: WORKSPACE_ID,
      label: "fly.io",
      category: "ops",
      baseUrl: "https://api.fly.io",
      connection: { token: SEEDED_TOKEN },
    }
  );

  const httpClient = new ScriptedHttpClient(options.httpError);
  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock,
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: options.sealer ? options.sealer(realSealer) : realSealer,
    siteAssistantSecretKeyring: keyring,
    idGen,
    customCredentialsHttpClient: httpClient,
    customCredentialsAudit: new InMemoryCredentialedRequestAuditLog(),
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
  return { deps, httpClient };
}

async function buildHarness(deps: CustomCredentialsToolDeps) {
  const registry = createToolRegistry();
  for (const registration of buildCustomCredentialsRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

let toolUseCounter = 0;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ runId: harness.run.id, toolUseId: `tu-${++toolUseCounter}`, toolId, input }, harness as never);
}

/** The exact fixed text `CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS` publishes for a secret-store
 *  failure — pinned here rather than imported so a silent reword of the rule fails this suite. */
const SECRET_STORE_UNAVAILABLE_MESSAGE =
  "CUSTOM_CREDENTIALS_SECRET_STORE_UNAVAILABLE: this site's secret store could not open the saved credential: " +
  "its Site Token is missing or unusable, or the stored credential is unreadable. No request was sent. " +
  "An operator can check this site's token on the admin Secrets page.";

const VALID_WRITE_FILES_INPUT = { owner: "octo", repo: "demo", branch: "main", commitMessage: "deploy", files: [{ path: "fly.toml", content: "app = 'demo'" }] };

/* ------------------------------------------------------------------------------------------------
 * Authorization — the arm `requireToolPermission` shares with every other domain
 * ---------------------------------------------------------------------------------------------- */

test("a denied principal gets the real authorization reason, naming the permission", async () => {
  const { deps } = await makeRouteDeps({ allow: false });
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_list", {});

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `CUSTOM_CREDENTIALS_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for 'custom-credentials.read' (insufficient_permission)`,
  });
});

test("EVERY wired custom-credentials tool surfaces the denial, not just the first one — the sibling-arm check", async () => {
  // Every input below reaches `requireToolPermission` BEFORE any surface is opened, so none of these
  // parks on a confirmation the delegated bridge's always-present `emitSurface` would otherwise wait on.
  const inputs: Record<string, Record<string, unknown>> = {
    custom_credential_list: {},
    custom_credential_verify: { label: "fly.io" },
    custom_credential_set_username: { label: "fly.io", username: "someone" },
    custom_credential_set_token: { label: "fly.io" },
    custom_credential_create: {},
    custom_credential_make_request: { label: "fly.io", method: "DELETE", url: "https://api.fly.io/v1/apps/x" },
    // write_files validates its input BEFORE the permission check, so the input must be valid.
    custom_credential_write_files: { label: "fly.io", ...VALID_WRITE_FILES_INPUT },
  };

  // Driven off the CATALOG, not a hand-written list: an eighth tool added without a wrap fails here
  // rather than shipping a silently redacted denial.
  const toolIds = customCredentialsAgentToolCatalog.map((entry) => entry.name);
  assert.deepEqual([...toolIds].sort(), Object.keys(inputs).sort(), "every catalog tool needs a denial input above");

  for (const toolId of toolIds) {
    const { deps, httpClient } = await makeRouteDeps({ allow: false });
    const harness = await buildHarness(deps);

    const result = await call(harness, toolId, inputs[toolId]);

    assert.equal(result.ok, false, `${toolId}: expected a refusal`);
    if (result.ok) continue;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId}: still redacted — ${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /^CUSTOM_CREDENTIALS_FORBIDDEN: principal '.+' is not authorized for 'custom-credentials\.(read|write)'/, `${toolId}: ${result.error.message}`);
    assert.equal(httpClient.calls.length, 0, `${toolId}: a denied call must never reach the third party`);
  }
});

/* ------------------------------------------------------------------------------------------------
 * Not-found — a wrong label, on every tool that resolves one
 * ---------------------------------------------------------------------------------------------- */

test("an unknown label says not-found on every tool that resolves one, rather than 'an internal error occurred'", async () => {
  const inputs: Record<string, Record<string, unknown>> = {
    custom_credential_verify: { label: "nope" },
    custom_credential_set_username: { label: "nope", username: "someone" },
    custom_credential_set_token: { label: "nope" },
    custom_credential_make_request: { label: "nope", method: "GET", url: "https://api.fly.io/v1/apps" },
    // The DELETE pre-check (`resolveRequestTarget`) is a separate arm from GET's.
    "custom_credential_make_request (DELETE)": { label: "nope", method: "DELETE", url: "https://api.fly.io/v1/apps" },
    custom_credential_write_files: { label: "nope", ...VALID_WRITE_FILES_INPUT },
  };

  for (const [name, input] of Object.entries(inputs)) {
    const { deps, httpClient } = await makeRouteDeps();
    const harness = await buildHarness(deps);

    const result = await call(harness, name.split(" ")[0]!, input);

    assert.equal(result.ok, false, `${name}: expected a refusal`);
    if (result.ok) continue;
    assert.deepEqual(
      result.error,
      { code: "BAD_REQUEST", message: "CUSTOM_CREDENTIALS_NOT_FOUND: no custom credential labeled 'nope' in this workspace" },
      name
    );
    assert.equal(httpClient.calls.length, 0, `${name}: nothing may be sent for an unknown label`);
  }
});

/* ------------------------------------------------------------------------------------------------
 * Validation — including the two smuggling refusals, which must not echo the smuggled VALUE
 * ---------------------------------------------------------------------------------------------- */

test("custom_credential_set_username refuses a smuggled token field by NAME, and never echoes the token value", async () => {
  const { deps } = await makeRouteDeps();
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_set_username", { label: "fly.io", username: "someone", token: "smuggled-token-value-123" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message:
      "CUSTOM_CREDENTIALS_VALIDATION_FAILED: custom_credential_set_username accepts only 'label' and 'username' — refusing unexpected field(s): token. " +
      "This tool writes ONLY the plaintext username column; it can never accept, read, or change a token.",
  });
  assert.ok(!JSON.stringify(result).includes("smuggled-token-value-123"), "the smuggled VALUE must never be echoed");
});

test("custom_credential_set_token refuses a smuggled token field by NAME, and never echoes the token value or the saved one", async () => {
  const { deps } = await makeRouteDeps();
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_set_token", { label: "fly.io", token: "smuggled-token-value-456" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message:
      "CUSTOM_CREDENTIALS_VALIDATION_FAILED: custom_credential_set_token accepts only 'label' — refusing unexpected field(s): token. " +
      "The token itself can only be supplied by a human, through the form this tool renders — never by this call.",
  });
  const wire = JSON.stringify(result);
  assert.ok(!wire.includes("smuggled-token-value-456"), "the smuggled VALUE must never be echoed");
  assert.ok(!wire.includes(SEEDED_TOKEN), "the saved token must never be echoed");
});

test("custom_credential_set_username with a blank username says why", async () => {
  const { deps } = await makeRouteDeps();
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_set_username", { label: "fly.io", username: "   " });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "CUSTOM_CREDENTIALS_VALIDATION_FAILED: 'username' must be a non-empty string, or null to clear it",
  });
});

test("a DELETE to an off-allowlist url is refused by the pre-check with the real reason, and nothing is sent", async () => {
  const { deps, httpClient } = await makeRouteDeps();
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_make_request", { label: "fly.io", method: "DELETE", url: "https://evil.example.com/steal" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message:
      "CUSTOM_CREDENTIALS_REQUEST_REJECTED: url 'https://evil.example.com/steal' resolves to origin 'https://evil.example.com', " +
      "which is not one of this credential's saved hosts (https://api.fly.io) — add it to this credential in the Access Tokens form first",
  });
  assert.equal(httpClient.calls.length, 0);
});

/* ------------------------------------------------------------------------------------------------
 * Non-interference with the schema decoration that already shipped
 * ---------------------------------------------------------------------------------------------- */

test("a GET off-allowlist rejection keeps its schema decoration and gains no second code prefix", async () => {
  const { deps } = await makeRouteDeps();
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_make_request", { label: "fly.io", method: "GET", url: "https://evil.example.com/steal" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.ok(result.error.message.startsWith("url 'https://evil.example.com/steal' resolves to origin"), result.error.message);
  assert.match(result.error.message, /Schema for 'custom_credential_make_request'/);
  assert.ok(!result.error.message.startsWith("CUSTOM_CREDENTIALS_"), "the map wrap must pass an existing ToolInputError through untouched");
});

/* ------------------------------------------------------------------------------------------------
 * The security half: UNLISTED failures stay redacted — the allowlist is not a blanket unwrap
 * ---------------------------------------------------------------------------------------------- */

test("a secret-store failure names its KIND under a fixed message — its own text can carry decrypted plaintext, so that never reaches the wire", async () => {
  // Node's own JSON.parse error quotes the start of its input, so a decrypt that "succeeds" into
  // garbage produces exactly this shape inside `CustomCredentialSecretStoreUnconfiguredError`.
  const { deps, httpClient } = await makeRouteDeps({
    sealer: (inner) => ({
      seal: (input) => inner.seal(input),
      open: async () => {
        throw new Error(`Unexpected token 'f', "${SEEDED_TOKEN}" is not valid JSON`);
      },
    }),
  });
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_verify", { label: "fly.io" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.equal(result.error.message, SECRET_STORE_UNAVAILABLE_MESSAGE);
  assert.ok(!JSON.stringify(result).includes(SEEDED_TOKEN), "a token fragment must never reach the wire");
  assert.equal(httpClient.calls.length, 0);
});

test("a MISSING SITE TOKEN reaches the model as the actionable secret-store reason, not a redacted 500", async () => {
  // The live 2026-09-18 incident, verbatim: the desktop app booted its site server with no
  // `TOVU_INTEGRATIONS_ROOT_KEY` and no key file, so `EnvOrFileKeyring` threw this exact text,
  // `decryptRecord` wrapped it, and BOTH credential-using tools answered `500 INTERNAL_ERROR` —
  // the one operator-fixable condition in this domain, indistinguishable from a crash.
  const keyringMessage =
    "no Site Token: TOVU_INTEGRATIONS_ROOT_KEY is not set, no key file exists at " +
    "/Users/someone/.tovu/integrations-root-key.hex, and this instance does not auto-generate one";
  const { deps, httpClient } = await makeRouteDeps({
    sealer: (inner) => ({
      seal: (input) => inner.seal(input),
      open: async () => {
        throw new Error(keyringMessage);
      },
    }),
  });
  const harness = await buildHarness(deps);

  for (const [toolId, input] of [
    ["custom_credential_verify", { label: "fly.io" }],
    ["custom_credential_make_request", { label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps" }],
  ] as const) {
    const result = await call(harness, toolId, input);

    assert.equal(result.ok, false, `${toolId}: ${JSON.stringify(result)}`);
    if (result.ok) return;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId} must not redact the one reason an operator can act on`);
    assert.equal(result.error.message, SECRET_STORE_UNAVAILABLE_MESSAGE, toolId);
    // The KIND is safe to name; the keyring's own text is not — it publishes the env var name and
    // an absolute filesystem path, the same disclosure `FORM_SAVE_CALLER_SAFE_ERRORS` already refuses.
    const wire = JSON.stringify(result);
    assert.ok(!wire.includes("TOVU_INTEGRATIONS_ROOT_KEY"), `${toolId} leaked the env var name`);
    assert.ok(!wire.includes("integrations-root-key.hex"), `${toolId} leaked the key file path`);
  }
  assert.equal(httpClient.calls.length, 0, "no outbound call may be attempted once the credential cannot be opened");
});

test("a transport failure stays redacted — its message can carry an internal address", async () => {
  const { deps } = await makeRouteDeps({ httpError: new Error("connect ECONNREFUSED 10.0.4.7:443") });
  const harness = await buildHarness(deps);

  const result = await call(harness, "custom_credential_make_request", { label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.equal(result.error.message, "an internal error occurred");
  assert.ok(!JSON.stringify(result).includes("10.0.4.7"), "an internal address must never reach the wire");
});

/* ------------------------------------------------------------------------------------------------
 * The four no-channel guards that used to throw a bare `Error` — unreachable by any `instanceof` rule
 * ---------------------------------------------------------------------------------------------- */

test("every no-emitSurface guard carries the ToolInputError marker, so it cannot be redacted", async () => {
  // HANDLER level on purpose, and the exception to this file's transport rule. `@jini-ai/daemon`'s
  // `createDelegatedToolBridge` ALWAYS supplies an `emitSurface`, so the delegated transport cannot
  // express the context these guards exist for; driving them from there parks the handler on a form
  // or confirmation nobody will ever answer, and hangs the runner. What is asserted is therefore the
  // exact marker `ToolExecutor` keys on: anything NOT `instanceof ToolInputError` is
  // `errorKind: 'internal'`, and only that bucket is SEC-005-redacted.
  const guards: Record<string, { input: unknown; message: string }> = {
    custom_credential_set_token: {
      input: { label: "fly.io" },
      message:
        "custom_credential_set_token: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a token cannot be collected here. Nothing was changed.",
    },
    custom_credential_create: {
      input: {},
      message:
        "custom_credential_create: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a credential cannot be created here. Nothing was changed.",
    },
    custom_credential_make_request: {
      input: { label: "fly.io", method: "DELETE", url: "https://api.fly.io/v1/apps/x" },
      message:
        "custom_credential_make_request: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a DELETE cannot be gated here. Nothing was sent.",
    },
    custom_credential_write_files: {
      input: { label: "fly.io", ...VALID_WRITE_FILES_INPUT },
      message:
        "custom_credential_write_files: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a write cannot be confirmed here. Nothing was written.",
    },
  };

  for (const [toolId, guard] of Object.entries(guards)) {
    const { deps, httpClient } = await makeRouteDeps();
    const registration = buildCustomCredentialsRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).find((r) => r.descriptor.id === toolId);
    assert.ok(registration, `expected ${toolId} to be wired`);

    const ctx: ToolExecutionContext = {
      executionId: "exec-1",
      principal: { id: PRINCIPAL_ID },
      run: { id: "run-1" },
      input: guard.input,
      signal: new AbortController().signal,
    };
    const err = await registration.handler(ctx).then(
      () => null,
      (caught: unknown) => caught
    );

    assert.ok(err instanceof ToolInputError, `${toolId}: a bare Error here is redacted to a 500: ${String(err)}`);
    // Verbatim, with no code prefix: the existing per-tool suites pin these exact strings.
    assert.equal(err.message, guard.message, toolId);
    assert.equal(httpClient.calls.length, 0, `${toolId}: nothing may be sent without a confirmation channel`);
  }
});
