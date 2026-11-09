import type { ExternalMcpRevocationReason } from "./contracts.js";
import { ExternalMcpConnectionRevokedError as HostedExternalMcpConnectionRevokedError, type ExternalMcpRevocationMessageInput } from "@jini-ai/mcp/federation/hosted";
export { rosterRefusalFor } from "@jini-ai/mcp/federation/hosted";

// The revocation decision and error class moved to `@jini-ai/mcp/federation/hosted` (EXTRACT-S5 H1b, source
// blob 8b806a7b). The model-facing text below is Tovu's host input and stays here, bound once.
type RevocationMessageInput = ExternalMcpRevocationMessageInput;

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

/** Keeps `new ExternalMcpConnectionRevokedError(input)` and binds {@link REVOCATION_MESSAGES} and the error code once. */
export class ExternalMcpConnectionRevokedError extends HostedExternalMcpConnectionRevokedError {
  declare readonly code: "EXTERNAL_MCP_CONNECTION_REVOKED";

  constructor(input: RevocationMessageInput) {
    super({ ...input, messages: REVOCATION_MESSAGES, code: "EXTERNAL_MCP_CONNECTION_REVOKED" });
  }
}
