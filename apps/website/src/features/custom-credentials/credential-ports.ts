/**
 * @file Tovu's bindings of the core credential ports over the EXISTING host functions: the guarded
 * request adapter in `credentialed-request.ts` and the source-control provider registry. Nothing
 * here reimplements a request, a provider build or a commit; each method forwards to the same
 * function the tool handlers call today, with the same dependencies, so audit, egress, diagnostic,
 * not-found and remedy-wording policy stay exactly where they are.
 */
import type {
  CredentialedRequestErrorClass,
  CredentialedRequestPort,
  SourceControlWritePort,
} from "@jini-ai/core/contracts/credentials";
import { EgressRefusedError, type HttpClientPort } from "../../platform/http/index.js";
import type { ObservabilityPort } from "../../platform/observability/index.js";
import { buildSourceControlProviderForApi, type LoadSourceControlProviders } from "../source-control/provider-registry.js";
import {
  CredentialedRequestTransportError,
  CredentialedRequestValidationError,
  makeCredentialedRequest,
  probeCredentialConnection,
  resolveRequestTarget,
  verifyCustomCredential,
  type CredentialedRequestDeps,
} from "./credentialed-request.js";
import { CustomCredentialNotFoundError } from "./store.js";
import { validateRepositoryTarget } from "./write-files-validation.js";

/** Classify by the classes the request adapter actually throws; the thrown object is returned as is.
 * The egress rebuild is the one `tool-registrations.ts` performs before schema decoration.
 * @complexity O(1) — at most four `instanceof` checks.
 */
export function classifyCredentialedRequestError(error: unknown): CredentialedRequestErrorClass {
  if (error instanceof EgressRefusedError) {
    const callerSafeMessage = error.callerSafeMessage;
    return { category: "egress-refused", error, callerSafeMessage, callerSafeError: new EgressRefusedError({ message: callerSafeMessage }, { callerSafeMessage }) };
  }
  if (error instanceof CredentialedRequestValidationError) return { category: "validation", error, callerSafeMessage: error.message };
  if (error instanceof CustomCredentialNotFoundError) return { category: "not-found", error, callerSafeMessage: error.message };
  if (error instanceof CredentialedRequestTransportError) return { category: "transport", error };
  return { category: "unknown", error };
}

/** Bind the request port over the existing adapter and its composition-built dependencies.
 * @param required The SAME `CredentialedRequestDeps` the tool handlers build (repo, sealer, guarded
 *   client, clock, audit, auth-scheme loader).
 * @returns A port whose every call is one call of the existing adapter function.
 * @complexity O(1) to build; each method costs exactly what the forwarded function costs.
 * @example const port = bindCredentialedRequestPort({ deps }); await port.verify({ workspaceId, label });
 */
export function bindCredentialedRequestPort(required: { deps: CredentialedRequestDeps }, _optional = {}): CredentialedRequestPort {
  const { deps } = required;
  return {
    request: (input, optional = {}) => makeCredentialedRequest(deps, { ...input, headers: optional.headers, body: optional.body }),
    resolveTarget: (input) => resolveRequestTarget({ repo: deps.repo }, input),
    verify: (input) => verifyCustomCredential(deps, input),
    probe: (input) => probeCredentialConnection(input, { httpClient: deps.httpClient }),
    classifyError: ({ error }) => classifyCredentialedRequestError(error),
  };
}

/** Bind the source-control write port over the installed provider registry.
 * @param required Provider loader, guarded HTTP client and observability exactly as the
 *   `custom_credential_write_files` handler passes them to `buildSourceControlProviderForApi`.
 * @returns A port whose plan/commit run on the provider object `build` returned.
 * @complexity O(1) to build; `build` is one registry load.
 * @example const built = await port.build({ workspaceId, baseUrl }); if (built.ok) port.validateTarget({ provider: built.provider, target });
 */
export function bindSourceControlWritePort(required: {
  load: LoadSourceControlProviders;
  httpClient: HttpClientPort;
  observability?: ObservabilityPort;
}, _optional = {}): SourceControlWritePort {
  return {
    build: ({ workspaceId, baseUrl }) => buildSourceControlProviderForApi({ load: required.load, workspaceId, baseUrl, httpClient: required.httpClient, observability: required.observability }),
    validateTarget: ({ provider, target }) => validateRepositoryTarget(target, provider.validateTarget),
    planFileWrite: ({ provider, input }) => provider.planFileWrite(input),
    commitFiles: ({ provider, input, plan }) => provider.commitFiles(input, plan),
  };
}
