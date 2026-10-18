import { buildDomainRegistrations, indexCatalogById, ToolInputError, type DerivedRiskByToolId, type ToolRegistration } from '@jini-ai/core';
import { toolMetadata } from '../contracts/core/tool-metadata/assistant.js';
import type { ToolGapReadPort } from '../features/tool-audit/tool-gaps.js';

export interface ToolGapsToolDeps {
  ownerPrincipalId: Promise<string>; workspaceId: string; toolGaps?: ToolGapReadPort;
}
export const toolGapsDerivedRisk: DerivedRiskByToolId = new Map([['tool_gaps_list', 'none']]);

/** Owner-only read of native fallback audit metadata, using the same reader as Observability.
 * O(n) in the bounded audit read. Never executes a command or returns raw CLI inputs/outputs. */
export function buildToolGapsRegistrations(required: ToolGapsToolDeps, _optional = {}): ToolRegistration[] {
  const catalog = [{ name: 'tool_gaps_list', sideEffects: 'none' as const,
    description: 'List recent tool gaps: owner chat Bash or direct file edit/write gaps and other native CLI tool use (type tool_gap or native_tool_used), with time, site, chat id, provider, tool, redacted command/path summary and the model Tool gap line when present. Read-only; owner only.',
    authorization: { permission: 'system.read' },
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  }];
  return buildDomainRegistrations({ metadata: toolMetadata, domain: 'tool-gaps',
    catalogModule: 'assistant/tool-gaps-tool.ts', catalog: indexCatalogById({ catalog }),
    derivedRisk: toolGapsDerivedRisk, handlers: {
    tool_gaps_list: async ({ principal }) => {
      if (principal.id !== await required.ownerPrincipalId) throw new ToolInputError({ message: 'Only the owner can read tool gaps.' });
      if (!required.toolGaps) throw new ToolInputError({ message: 'Tool gap audit storage is unavailable.' });
      return { entries: await required.toolGaps.list({ workspaceId: required.workspaceId, principalId: principal.id }, {}) };
    },
  } }).map(registration => ({ ...registration,
    policy: { authorize: async ({ principal }) => principal.id === await required.ownerPrincipalId ? 'allow' : 'deny' },
  }));
}
