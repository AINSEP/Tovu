import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FetchQueryProvider } from '@/__tests__/fetch-query-provider.test-helper';
import { ToolGapsPanel } from '../tool-gaps-panel';

describe('Observability Tool gaps filter', () => {
  it('shows the persisted fallback metadata and an explicit absent explanation', async () => {
    render(<FetchQueryProvider><ToolGapsPanel t={key => key} read={async () => ({ entries: [{
      id: 'gap', at: '2026-10-17T00:00:00Z', site: 'site-a', chatId: 'chat-a', runId: 'run-a',
      provider: 'codex', toolUsed: 'Bash', summary: 'curl password=[REDACTED]', type: 'tool_gap', gapLine: null,
    }] })} /></FetchQueryProvider>);
    expect(await screen.findByText('curl password=[REDACTED]')).toBeInTheDocument();
    expect(screen.getByText('No Tool gap explanation was provided.')).toBeInTheDocument();
    expect(screen.getByText(/chat-a/)).toBeInTheDocument();
  });
});
