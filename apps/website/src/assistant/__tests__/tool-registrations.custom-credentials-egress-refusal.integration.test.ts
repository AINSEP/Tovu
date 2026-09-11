import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryCustomCredentialSetRepo } from "../../features/custom-credentials/repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../../features/custom-credentials/store.js";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "../../features/custom-credentials/tool-registrations.js";
import { createSurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import { EgressRefusedError, type HttpClientPort, type HttpRequest, type HttpResponse } from "../../platform/http/index.js";

/**
 * @file Regression test for the `custom_credential_make_request` half of the 2026-09-10
 * GitHub-Actions-log-diagnosis incident: an egress-policy refusal raised while sending an
 * authenticated request through a saved custom credential reached the operator and the model as a
 * bare, redacted `INTERNAL_ERROR` — indistinguishable from the site having fallen over, and the
 * reason the assistant guessed "the redirect host isn't on the allowlist" instead of the real cause
 * (`maxRedirects: 0`).
 *
 * Same premise as `tool-registrations.media-import-egress-refusal.integration.test.ts` (SEC-05,
 * 2026-09-07), which this file otherwise mirrors: the classification only matters if it survives all
 * three layers, so this drives the REAL chain — real `buildCustomCredentialsRegistrations`, a real
 * `ToolRegistry`/`ToolExecutor` (`@jini-ai/daemon`, whose `failureResult` reads
 * `instanceof ToolInputError` to set `errorKind`), and the real `delegatedToolExecuteRoute`
 * (`@jini-ai/http-kit`, whose `toolExecutionResultToApiResult` SEC-005-redacts anything not tagged
 * `'validation'`). Asserting at the handler boundary alone would pass under the bug for two of the
 * three layers.
 *
 * ONLY the network is faked. The `HttpClientPort` double throws the same `EgressRefusedError` the
 * real `platform/http/client.ts` throws (`__tests__/client.test.ts` in that module owns the other
 * half of this contract), and `credentialed-request.unit.test.ts` owns the unit-level proof that
 * `makeCredentialedRequest` rethrows it unchanged rather than wrapping it into
 * `CredentialedRequestTransportError` — this file's job is proving that preserved type actually
 * reaches the wire as a specific, actionable message instead of a generic 500.
 */

const WORKSPACE_ID = "ws-custom-credentials-egress";
const TOOL_ID = "custom_credential_make_request";

/** The verbatim message `client.ts`'s `assertNoPrivateAddress` produces when a redirect hop resolves
 *  to the cloud metadata address — the single most consequential target this guard blocks. */
const METADATA_REFUSAL = "egress to '169.254.169.254' (169.254.169.254) rejected: resolved address is link-local";

/** An `HttpClientPort` that refuses exactly as the guarded client does. */
class RefusingHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly error: Error) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    throw this.error;
  }
}

async function buildDelegatedToolDeps(clientError: Error) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => "2026-09-10T00:00:00.000Z" };

  const writeDeps: CustomCredentialWriteDeps = {
    repo,
    sealer,
    keyring,
    clock,
    idGen: { newId: () => "cred-1" },
  };
  // The credential the failing GET is sent through — same shape the live incident used (a saved
  // GitHub token calling GitHub's own already-allowlisted API host).
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "github",
    category: "ops",
    baseUrl: "https://api.github.com",
    connection: { token: "github-secret-token" },
  });

  const routeDeps: CustomCredentialsToolDeps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
    clock,
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen: { newId: () => "deps-cred-1" },
    customCredentialsHttpClient: new RefusingHttpClient(clientError),
  };

  const registry = createToolRegistry();
  for (const registration of buildCustomCredentialsRegistrations(routeDeps, { surfaceExchanges: createSurfaceExchangeStore() })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });

  return { toolExecutor, lifecycle };
}

async function executeMakeRequest(clientError: Error) {
  const { toolExecutor, lifecycle } = await buildDelegatedToolDeps(clientError);
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });

  return delegatedToolExecuteRoute.handle(
    {
      runId: run.id,
      toolUseId: "tu-1",
      toolId: TOOL_ID,
      input: { label: "github", method: "GET", url: "https://api.github.com/repos/o/r/actions/jobs/1/logs" },
    },
    { lifecycle, toolExecutor, resolvePrincipal: () => ({ id: "principal-1" }) }
  );
}

test("an SSRF refusal on a redirect hop reaches the caller as a BAD_REQUEST naming the blocked address, not a redacted INTERNAL_ERROR", async () => {
  const result = await executeMakeRequest(new EgressRefusedError(METADATA_REFUSAL));

  assert.equal(result.ok, false, "a refused request must not report success");
  assert.ok(!result.ok);
  assert.equal(
    result.error.code,
    "BAD_REQUEST",
    `an egress refusal is the caller's target being wrong, not this site crashing — got ${result.error.code}: ${result.error.message}`
  );
  assert.match(
    result.error.message,
    /egress to '169\.254\.169\.254' \(169\.254\.169\.254\) rejected: resolved address is link-local/,
    "the refusal REASON must reach the wire verbatim — a 400 with the message stripped is the same defect wearing a different status code"
  );
});

test("the refusal names the tool's own schema, not just a bare rejection", async () => {
  const result = await executeMakeRequest(new EgressRefusedError(METADATA_REFUSAL));

  assert.ok(!result.ok);
  assert.match(result.error.message, /will not resolve on retry without an input change/);
  assert.match(result.error.message, new RegExp(`Schema for '${TOOL_ID}'`));
});

test("an off-allowlist redirect target refuses the same way a bad scheme does — classified by TYPE, not by one message", async () => {
  const result = await executeMakeRequest(new EgressRefusedError("scheme 'http:' is not in the allowed egress schemes"));

  assert.ok(!result.ok);
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.match(result.error.message, /scheme 'http:' is not in the allowed egress schemes/);
});

test("a genuine transport failure is STILL a redacted INTERNAL_ERROR — the fix must not reclassify every failure as the caller's fault", async () => {
  // The negative control this trio needs. Widening `isCredentialedRequestShapeRejection` to
  // "anything the http client threw" would make the tests above pass while telling a model that a
  // DNS outage is something a different URL fixes, and would put arbitrary transport error text on
  // the wire — the exact thing the SEC-005 redaction exists to prevent.
  const result = await executeMakeRequest(new Error("getaddrinfo EAI_AGAIN api.github.com"));

  assert.ok(!result.ok);
  assert.equal(result.error.code, "INTERNAL_ERROR", "a transport failure is not a caller-input problem");
  assert.doesNotMatch(result.error.message, /EAI_AGAIN/, "internal transport detail must never reach the wire");
});
