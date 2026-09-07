import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobStore,
  InMemoryMediaContentTypeStore,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
} from "../../features/media/index.js";
import { buildMediaImportRegistrations, type MediaImportToolDeps } from "../../features/media-import/tool-registrations.js";
import { EgressRefusedError, type HttpClientPort, type HttpRequest, type HttpResponse } from "../../platform/http/index.js";

/**
 * @file Regression test for SEC-05 (2026-09-07): an SSRF / egress-policy refusal raised while
 * `media_import_from_url` fetched an agent-supplied URL reached the operator and the model as a
 * bare, redacted `INTERNAL_ERROR` — indistinguishable from the site having fallen over.
 *
 * Built on the same premise as `theme-list-files-malformed-input-status.integration.test.ts`: the
 * classification only matters if it survives all three layers, so this drives the REAL chain —
 * real `buildMediaImportRegistrations`, a real `ToolRegistry`/`ToolExecutor`
 * (`@jini-ai/daemon`, whose `failureResult` reads `instanceof ToolInputError` to set
 * `errorKind`), and the real `delegatedToolExecuteRoute` (`@jini-ai/http-kit`, the actual
 * `/api/delegated-tool-calls` transport a spawned agent CLI calls this site's tools through, whose
 * `toolExecutionResultToApiResult` SEC-005-redacts anything not tagged `'validation'`). Asserting
 * at the handler boundary alone would pass under the bug for two of the three layers.
 *
 * ONLY the network is faked. The `HttpClientPort` double throws the same `EgressRefusedError` the
 * real `platform/http/client.ts` throws — `__tests__/client.test.ts` in that module owns the other
 * half of this contract (that the real client's refusals ARE that class, and that a DNS failure is
 * not), so the two halves cannot silently disagree about the type without one of them going red.
 */

const WORKSPACE_ID = "ws-media-import-egress";

/** The verbatim message `client.ts`'s `assertNoPrivateAddress` produces for the cloud metadata
 *  endpoint — the single most consequential target this guard blocks. */
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

function buildDelegatedToolDeps(clientError: Error) {
  const routeDeps: MediaImportToolDeps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-09-07T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    mediaRepo: new InMemoryMediaRepo(),
    assetBlobRepo: new InMemoryAssetBlobRepo(),
    assetRenditionRepo: new InMemoryAssetRenditionRepo(),
    blobStore: new InMemoryBlobStore(),
    mediaContentTypeStore: new InMemoryMediaContentTypeStore(),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo(),
    mediaImportHttpClient: new RefusingHttpClient(clientError),
  };

  const registry = createToolRegistry();
  for (const registration of buildMediaImportRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });

  return { routeDeps, registry, toolExecutor, lifecycle };
}

async function executeImport(clientError: Error, url: string) {
  const { toolExecutor, lifecycle } = buildDelegatedToolDeps(clientError);
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });

  return delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "media_import_from_url", input: { url } },
    { lifecycle, toolExecutor, resolvePrincipal: () => ({ id: "principal-1" }) }
  );
}

test("an SSRF refusal reaches the caller as a BAD_REQUEST naming the blocked address, not a redacted INTERNAL_ERROR", async () => {
  const result = await executeImport(
    new EgressRefusedError(METADATA_REFUSAL),
    "https://metadata.internal.example/latest/meta-data/"
  );

  assert.equal(result.ok, false, "a refused import must not report success");
  assert.ok(!result.ok);
  assert.equal(
    result.error.code,
    "BAD_REQUEST",
    `an egress refusal is the caller's URL being wrong, not this site crashing — got ${result.error.code}: ${result.error.message}`
  );
  assert.match(
    result.error.message,
    /egress to '169\.254\.169\.254' \(169\.254\.169\.254\) rejected: resolved address is link-local/,
    "the refusal REASON must reach the wire verbatim — a 400 with the message stripped is the same defect wearing a different status code"
  );
});

test("the refusal is a refusal, not an invitation to retry the identical call", async () => {
  const result = await executeImport(new EgressRefusedError(METADATA_REFUSAL), "https://metadata.internal.example/");

  assert.ok(!result.ok);
  // `withSchemaOnRejection`'s decoration. Load-bearing here specifically because a model that reads
  // "bad request" with no further instruction retries the same URL: the tool's own catalog schema
  // plus the "will not resolve on retry without an input change" sentence are what turn a blocked
  // fetch into "use a different, publicly reachable URL" rather than a retry loop against the
  // metadata endpoint.
  assert.match(result.error.message, /will not resolve on retry without an input change/);
  assert.match(result.error.message, /Schema for 'media_import_from_url'/);
});

test("a scheme refusal from the policy layer surfaces the same way — the classification is by TYPE, not by one message", async () => {
  const result = await executeImport(
    new EgressRefusedError("scheme 'http:' is not in the allowed egress schemes"),
    "https://cdn.example.com/redirects-to-http.png"
  );

  assert.ok(!result.ok);
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.match(result.error.message, /scheme 'http:' is not in the allowed egress schemes/);
});

test("a genuine transport failure is STILL a redacted INTERNAL_ERROR — the fix must not reclassify every failure as the caller's fault", async () => {
  // The negative control this pair needs. Widening `isShapeRejection` to "anything the http client
  // threw" would make the two tests above pass while telling a model that a DNS outage is something
  // a different URL fixes, and would put arbitrary transport error text on the wire — the exact
  // thing the SEC-005 redaction exists to prevent.
  const result = await executeImport(new Error("getaddrinfo EAI_AGAIN cdn.example.com"), "https://cdn.example.com/fox.png");

  assert.ok(!result.ok);
  assert.equal(result.error.code, "INTERNAL_ERROR", "a transport failure is not a caller-input problem");
  assert.doesNotMatch(result.error.message, /EAI_AGAIN/, "internal transport detail must never reach the wire");
});
