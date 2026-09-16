import { ToolInputError } from "@jini-ai/core";

import {
  externalMcpAdmissionRevision,
  readExternalMcpToolGrants,
  resolveExternalMcpAuthMode,
  resolveExternalMcpOAuthStatus,
  type ExternalMcpServerRecord,
} from "./external-mcp-store.js";
import type { FederatedCallTarget } from "./mcp-federation/ports.js";
import { refusalForAdmittedToolUnderCurrentGrants } from "./mcp-federation/trust.js";

/**
 * @file Per-call operator-revocation checks for an already-admitted federated tool — the roster half
 * of `mcp-federation/registrations.ts`'s `FederationDeps.assertConnectionUsable`, consumed by
 * `external-mcp-oauth.ts`'s `createExternalMcpConnectionGate`.
 *
 * Why this exists at all: `mcp-federation/`'s registry is append-only (see
 * `registrations.ts`'s `FederationDeps.assertConnectionUsable` doc), so a connection deleted,
 * disabled, narrowed, or edited after admission cannot be un-registered — its tools stay both
 * listed and, absent this gate, callable. This file is what turns that stale admission into a
 * refusal at the next call, by re-reading the connection's CURRENT row against what the tool was
 * admitted under.
 *
 * Deliberately does NOT import `external-mcp-oauth.ts` — that file imports FROM this one (its gate
 * calls `rosterRefusalFor`), so the reverse import would be a cycle. `resolveExternalMcpAuthMode`/
 * `resolveExternalMcpOAuthStatus` are read straight from `external-mcp-store.ts` instead.
 *
 * `ExternalMcpConnectionRevokedError` extends `ToolInputError` rather than being reported through a
 * `ToolPolicy` deny — the same D1 argument `registrations.ts`'s own gate doc and
 * `federated-refusal-diagnosis.ts` both make: every consumer maps a policy `denied` to a fixed
 * "denied by policy"-shaped string, which sends an operator who DOES have the permission looking in
 * the wrong place. A handler-side `ToolInputError` reaches the model as `errorKind: 'validation'`
 * with this file's own text instead.
 */

/** Why an admitted federated tool is refused on THIS call. Every value pairs with one D3 message in
 *  {@link revocationMessage} — see that lookup for the exact, test-pinned wording. */
export type ExternalMcpRevocationReason =
  | "removed"
  | "turned-off"
  | "disconnected"
  | "changed"
  | "tool-not-allowed"
  | "write-not-allowed"
  | "unverifiable";

interface RevocationMessageInput {
  readonly serverId: string;
  readonly label: string | null;
  readonly remoteName: string;
  readonly reason: ExternalMcpRevocationReason;
}

/**
 * The exact, model-facing text for each {@link ExternalMcpRevocationReason} — copied verbatim from
 * the design doc (D3) and pinned byte-for-byte by `__tests__/external-mcp-connection-revocation
 * .test.ts`. Every sentence ends "Do not retry this tool." for the same reason
 * `ExternalMcpReauthRequiredError`'s message does: a model that is not told to stop will search,
 * select the same tool, fail, and search again.
 */
const REVOCATION_MESSAGES: Record<ExternalMcpRevocationReason, (input: RevocationMessageInput) => string> = {
  removed: (input) => `"${input.serverId}" was removed from Integrations → External MCP, so its tools no longer work. Do not retry this tool.`,
  "turned-off": (input) =>
    `"${input.label ?? input.serverId}" is turned off in Integrations → External MCP. Ask the operator to turn it back on. Do not retry this tool.`,
  disconnected: (input) =>
    `"${input.label ?? input.serverId}" is disconnected in Integrations → External MCP. Ask the operator to reconnect it. Do not retry this tool.`,
  changed: (input) =>
    `"${input.label ?? input.serverId}" was changed in Integrations → External MCP after the assistant started. Ask the operator to restart the assistant so the change takes effect. Do not retry this tool.`,
  "tool-not-allowed": (input) =>
    `"${input.remoteName}" on "${input.label ?? input.serverId}" is no longer allowed in Integrations → External MCP. Do not retry this tool.`,
  "write-not-allowed": (input) =>
    `"${input.remoteName}" on "${input.label ?? input.serverId}" is no longer allowed to make changes in Integrations → External MCP. Do not retry this tool.`,
  unverifiable: (input) => `The assistant could not confirm that "${input.serverId}" is still allowed, so this call was refused. Try again later.`,
};

/** @complexity O(1). */
function revocationMessage(input: RevocationMessageInput): string {
  return REVOCATION_MESSAGES[input.reason](input);
}

/**
 * The terminal, non-retryable failure a federated tool returns once its connection has been revoked
 * since admission — deleted, disabled, narrowed, edited, or OAuth-disconnected. Sibling of
 * `external-mcp-oauth.ts`'s `ExternalMcpReauthRequiredError`, with the same "always false, present
 * as a field" `retryable` convention.
 */
export class ExternalMcpConnectionRevokedError extends ToolInputError {
  readonly code = "EXTERNAL_MCP_CONNECTION_REVOKED";
  readonly retryable = false;
  readonly serverId: string;
  readonly reason: ExternalMcpRevocationReason;

  constructor(input: RevocationMessageInput) {
    super(revocationMessage(input));
    this.name = "ExternalMcpConnectionRevokedError";
    this.serverId = input.serverId;
    this.reason = input.reason;
  }
}

/** {@link rosterRefusalFor}'s OAuth check: `disconnected` refuses, `pending`/`connected`/`needs_reauth`
 *  do not — `needs_reauth` is the legacy check the gate still runs afterwards, unchanged, so it must
 *  not also be caught here. @complexity O(1). */
function isOAuthDisconnected(record: ExternalMcpServerRecord): boolean {
  return resolveExternalMcpAuthMode(record) === "oauth" && resolveExternalMcpOAuthStatus(record) === "disconnected";
}

/** {@link rosterRefusalFor}'s grant check: reapplies R2+R3 to the connection's CURRENT allowlist and
 *  write list — narrowing only, never granting, exactly as {@link refusalForAdmittedToolUnderCurrentGrants}
 *  documents. Maps the one grant-refusal reason that means "the remote itself declares a write" onto
 *  the write-specific D3 message; every other reason (today, only `not-in-operator-allowlist`) maps
 *  to the generic one. @complexity O(1). */
function grantRefusalFor(record: ExternalMcpServerRecord, call: FederatedCallTarget): ExternalMcpRevocationReason | null {
  const grants = readExternalMcpToolGrants(record);
  const refusal = refusalForAdmittedToolUnderCurrentGrants({ remoteName: call.remoteName, declaredAnnotations: call.declaredAnnotations }, grants);
  if (refusal === null) return null;
  return refusal === "remote-declares-not-read-only" ? "write-not-allowed" : "tool-not-allowed";
}

/**
 * Re-checks one already-admitted roster tool against its connection's CURRENT row — steps 3-8 of the
 * design doc's D2. Pure: takes the row (already read by the caller) and the call's identity, and
 * returns why it should now be refused, or `null` when it still clears every check.
 *
 * The caller (`external-mcp-oauth.ts`'s gate) invokes this ONLY for a non-preset origin — a preset
 * has no row to compare against and gets only the legacy `needs_reauth` check. The `call.origin.kind
 * === "preset"` branch below exists purely as a bug-guard for a roster-shaped call built outside
 * `toResolvedFederatedConnections`, mirroring the `undefined` branch immediately before it: both fail
 * closed to `unverifiable` rather than assume a shape this function was never handed at admission.
 *
 * @complexity O(1).
 */
export function rosterRefusalFor(record: ExternalMcpServerRecord | null, call: FederatedCallTarget): ExternalMcpRevocationReason | null {
  if (call.origin === undefined || call.origin.kind === "preset") return "unverifiable";
  if (record === null) return "removed";
  if (externalMcpAdmissionRevision(record) !== call.origin.admissionRevision) return "changed";
  if (!record.enabled) return "turned-off";
  if (isOAuthDisconnected(record)) return "disconnected";
  return grantRefusalFor(record, call);
}
