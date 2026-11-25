import { describe, expect, it } from 'vitest';
import type { ExecutionCardAgent } from '@jini-ai/core/contracts/execution';
import { createAgentPresentationPort } from '@jini-ai/chat/react/admin-execution/ai-agent-presentation';
import { selectedAgentWarning } from '../ai-agent-presentation';

describe('AI agent presentation host binding', () => {
  it('does not replace signed-in auth with an older missing-auth scan', async () => {
    const agent: ExecutionCardAgent = { id: 'claude', label: 'Claude Code', installed: true, authStatus: 'missing' };
    let complete: (agents: readonly ExecutionCardAgent[]) => void = () => {};
    const slow = new Promise<readonly ExecutionCardAgent[]>((resolve) => { complete = resolve; });
    const warnings: (string | null)[] = [];
    const port = createAgentPresentationPort({
      port: {
        detectLocalAgents: () => slow,
        rescanLocalAgents: async () => [{ ...agent, authStatus: 'ok' }],
        testConnection: async () => ({ ok: true }),
      },
      onAgents: ({ agents }) => warnings.push(selectedAgentWarning({ mode: 'local-cli', agentId: 'claude', agents, locale: 'en' })),
    });
    const initial = port.detectLocalAgents();
    await port.rescanLocalAgents?.();
    complete([agent]);
    await initial;
    expect(warnings).toEqual([null]);
  });

  it('keeps unknown auth silent and binds the existing translated warning', () => {
    const agent: ExecutionCardAgent = { id: 'claude', label: 'Claude Code', installed: true, authStatus: 'unknown' };
    const input = {
      mode: 'local-cli', agentId: 'claude', locale: 'es',
      agents: [agent],
    };
    expect(selectedAgentWarning(input)).toBeNull();
    expect(selectedAgentWarning({ ...input, agents: [{ ...agent, authStatus: 'missing' }] }))
      .toBe('Claude Code: Se requiere autenticación. Inicia sesión antes de enviar.');
  });
});
