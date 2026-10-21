import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('labels native tool use as such instead of showing a gap line', async () => {
    render(<FetchQueryProvider><ToolGapsPanel t={key => key} read={async () => ({ entries: [{
      id: 'native', at: '2026-10-17T00:00:00Z', site: 'site-a', chatId: 'chat-b', runId: 'run-b',
      provider: 'claude', toolUsed: 'Edit', summary: 'edited README.md', type: 'native_tool_used', gapLine: 'ignored line',
    }] })} /></FetchQueryProvider>);
    expect(await screen.findByText('edited README.md')).toBeInTheDocument();
    expect(screen.getAllByText(/Native tool used/)).toHaveLength(2);
    expect(screen.queryByText('ignored line')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tool gap$/)).not.toBeInTheDocument();
  });

  it('shows a recorded gap line verbatim', async () => {
    render(<FetchQueryProvider><ToolGapsPanel t={key => key} read={async () => ({ entries: [{
      id: 'gap', at: '2026-10-17T00:00:00Z', site: 'site-a', chatId: 'chat-c', runId: 'run-c',
      provider: 'codex', toolUsed: 'Bash', summary: 'ran ls', type: 'tool_gap', gapLine: 'No list_files tool exists.',
    }] })} /></FetchQueryProvider>);
    expect(await screen.findByText('No list_files tool exists.')).toBeInTheDocument();
  });

  it('shows the empty state, a loading status while fetching, and re-reads on Refresh', async () => {
    let calls = 0;
    let release!: () => void;
    const read = async () => {
      calls += 1;
      if (calls > 1) await new Promise<void>((resolve) => { release = resolve; });
      return { entries: [] };
    };
    render(<FetchQueryProvider><ToolGapsPanel t={key => key} read={read} /></FetchQueryProvider>);
    expect(await screen.findByText('No tool gaps recorded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it('shows a failed read as an alert', async () => {
    render(<FetchQueryProvider><ToolGapsPanel t={key => key} read={async () => { throw new Error('owner only'); }} /></FetchQueryProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('owner only');
  });
});
