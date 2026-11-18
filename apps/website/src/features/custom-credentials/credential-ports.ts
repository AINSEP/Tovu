/**
 * @file Tovu's binding of the core credential request port over the EXISTING host function: the
 * guarded request adapter in `credentialed-request.ts` (the source-control write port is bound in
 * `source-control/write-port.ts`). Nothing here reimplements a request; each method forwards to the same
 * function the tool handlers call today, with the same dependencies, so audit, egress, diagnostic,
 * not-found and remedy-wording policy stay exactly where they are.
 */
import type {
  CredentialedRequestErrorClass,
  CredentialedRequestPort,
} from "@jini-ai/core/contracts/credentials";
import { EgressRefusedError } from "../../platform/http/index.js";
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

/** Classify by the classes the request adapter actually throws; the thrown object is returned as is.
 * The egress rebuild is the one `tool-registrations.ts` performs before schema decoration.
 * @complexity O(1) — at most four `instanceof` checks.
 */
export function classifyCredentialedRequestError({ error }: { error: unknown }, _optional = {}): CredentialedRequestErrorClass {
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
    classifyError: classifyCredentialedRequestError,
  };
}
