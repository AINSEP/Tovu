/**
 * @file CMS permission-error binding and positional adapters for existing callers.
 * Domains own safe-message allowlists; unlisted errors remain redacted, including returned
 * failure results. Generic rules and the security rationale live in
 * `@jini-ai/core/model-facing-tool-errors`.
 */
import { ForbiddenError } from "@jini-ai/cms/core";
import {
  forbiddenRule as createForbiddenRule,
  describeErrorForLog as describeSharedErrorForLog,
  type ModelFacingErrorRule,
} from "@jini-ai/core/model-facing-tool-errors";

export * from "@jini-ai/core/model-facing-tool-errors";

/**
 * The code every domain publishes an authorization refusal under, parameterized by domain prefix.
 *
 * Exists because `ForbiddenError` is the ONE class in this ladder that no domain declares: the kit's
 * `requireToolPermission` throws it on every domain's behalf. Deriving the rule here rather than
 * retyping `{ error: ForbiddenError, code: "X_FORBIDDEN" }` in six files means a later decision to
 * reconcile this code with the HTTP arm's own `FORBIDDEN` is a one-line change here, not a sweep.
 *
 * HTTP mappers return `FORBIDDEN`; model-facing refusals use `<DOMAIN>_FORBIDDEN`.
 * This helper preserves the model-facing public convention.
 *
 * The refusal message `requireToolPermission` builds names the principal, the permission, and the
 * `authorize()` reason — no data, no internals. Surfacing it tells a model whether to stop asking
 * or to ask a human for access; redacting it tells it only that something broke.
 *
 * @param domainPrefix - The domain's SCREAMING_SNAKE prefix, e.g. `MEMBERS`.
 * @returns The rule to place in that domain's allowlist.
 * @complexity O(1).
 */
export function forbiddenRule(domainPrefix: string): ModelFacingErrorRule {
  return createForbiddenRule({ domainPrefix, error: ForbiddenError });
}

/**
 * What a server-side log line may say about an error whose message is NOT known to be safe: its class
 * name, a constant-token `code`, and the same for its direct `cause`. Never the message, which can
 * quote a secret — `JSON.parse` quotes its input, and a sealer is handed plaintext.
 *
 * Use it wherever the raw message could carry a credential. Where a class's message is designed for
 * logs (`EgressRefusedError.message`), log that instead.
 *
 * @param err - The caught value.
 * @returns e.g. `SqliteError(SQLITE_BUSY)`, or `TypeError cause=Error(ECONNREFUSED)`.
 * @complexity O(1).
 */
export function describeErrorForLog(err: unknown): string {
  return describeSharedErrorForLog({ err });
}
