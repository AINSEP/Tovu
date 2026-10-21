import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { ExternalMcpConnectionRevokedError, type ExternalMcpRevocationReason } from "../external-mcp-revocation.js";

/**
 * @file `ExternalMcpConnectionRevokedError`'s operator-facing wording, per revocation reason: each
 * names the connection by its label when it has one (falling back to its id), says what changed,
 * and tells the model not to retry — except `unverifiable`, the one transient reason.
 */

const EXPECTED: Record<ExternalMcpRevocationReason, { labelled: string; unlabelled: string }> = {
  removed: {
    labelled: '"srv" was removed from Integrations → External MCP, so its tools no longer work. Do not retry this tool.',
    unlabelled: '"srv" was removed from Integrations → External MCP, so its tools no longer work. Do not retry this tool.',
  },
  "turned-off": {
    labelled: '"Search" is turned off in Integrations → External MCP. Ask the operator to turn it back on. Do not retry this tool.',
    unlabelled: '"srv" is turned off in Integrations → External MCP. Ask the operator to turn it back on. Do not retry this tool.',
  },
  disconnected: {
    labelled: '"Search" is disconnected in Integrations → External MCP. Ask the operator to reconnect it. Do not retry this tool.',
    unlabelled: '"srv" is disconnected in Integrations → External MCP. Ask the operator to reconnect it. Do not retry this tool.',
  },
  changed: {
    labelled: '"Search" was changed in Integrations → External MCP after the assistant started. Ask the operator to restart the assistant so the change takes effect. Do not retry this tool.',
    unlabelled: '"srv" was changed in Integrations → External MCP after the assistant started. Ask the operator to restart the assistant so the change takes effect. Do not retry this tool.',
  },
  "tool-not-allowed": {
    labelled: '"query" on "Search" is no longer allowed in Integrations → External MCP. Do not retry this tool.',
    unlabelled: '"query" on "srv" is no longer allowed in Integrations → External MCP. Do not retry this tool.',
  },
  "write-not-allowed": {
    labelled: '"query" on "Search" is no longer allowed to make changes in Integrations → External MCP. Do not retry this tool.',
    unlabelled: '"query" on "srv" is no longer allowed to make changes in Integrations → External MCP. Do not retry this tool.',
  },
  unverifiable: {
    labelled: 'The assistant could not confirm that "srv" is still allowed, so this call was refused. Try again later.',
    unlabelled: 'The assistant could not confirm that "srv" is still allowed, so this call was refused. Try again later.',
  },
};

for (const [reason, messages] of Object.entries(EXPECTED) as [ExternalMcpRevocationReason, (typeof EXPECTED)[ExternalMcpRevocationReason]][]) {
  test(`a '${reason}' revocation is a non-retryable input error naming the connection`, () => {
    const labelled = new ExternalMcpConnectionRevokedError({ serverId: "srv", label: "Search", remoteName: "query", reason });
    const unlabelled = new ExternalMcpConnectionRevokedError({ serverId: "srv", label: null, remoteName: "query", reason });
    assert.equal(labelled.message, messages.labelled);
    assert.equal(unlabelled.message, messages.unlabelled);
    assert.ok(labelled instanceof ToolInputError);
    assert.equal(labelled.name, "ExternalMcpConnectionRevokedError");
    assert.equal(labelled.code, "EXTERNAL_MCP_CONNECTION_REVOKED");
    assert.equal(labelled.retryable, false);
    assert.equal(labelled.serverId, "srv");
    assert.equal(labelled.reason, reason);
  });
}
