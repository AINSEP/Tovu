import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolInputError } from '@jini-ai/core';
import { ExternalMcpValidationError, externalMcpAccessSnapshot, externalMcpAdmissionRevision, readExternalMcpToolGrants, validateExternalMcpToolNames } from '../../../../contracts/core/external-mcp-access.js';
import { resolveExternalMcpOAuthStatus, externalMcpRecordHasStaticAccessToken } from '../../../../contracts/core/external-mcp-auth.js';
import { validatedAgentPluginToolGrant } from '../../enable-access.js';

test('a passed tool-name validator and classifier retain canonical error identity through the compatibility entry', () => {
  const refusal = new ExternalMcpValidationError('owner validation refusal', 'allowedToolNames');
  const seen: unknown[] = [];
  const ports = {
    projections: { accessSnapshot: externalMcpAccessSnapshot, admissionRevision: externalMcpAdmissionRevision,
      readToolGrants: readExternalMcpToolGrants, validateToolNames: (_input: Parameters<typeof validateExternalMcpToolNames>[0]): string[] => { throw refusal; },
      oauthStatus: resolveExternalMcpOAuthStatus, hasStaticAccessToken: externalMcpRecordHasStaticAccessToken },
    classifyError: ({ error }: { error: unknown }) => { seen.push(error); return error === refusal ? 'validation' as const : 'other' as const; },
  };
  assert.throws(() => validatedAgentPluginToolGrant({ current: { enabled: false, allow: [], write: [] }, declared: { allow: ['read'], write: [] } }, { ports }), error => error instanceof ToolInputError && error.message === "The plugin's combined tool grant cannot be saved: owner validation refusal. Review its tool selection with external_mcp_save before enabling it.");
  assert.deepEqual(seen, [refusal]);
});
