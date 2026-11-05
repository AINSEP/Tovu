import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ExternalMcpSharedChoice } from '../ExternalMcpSharedChoice';

afterEach(() => vi.restoreAllMocks());

describe('explicit saved MCP choices', () => {
  it('loads metadata on demand, then offers saved selection, shared sign-in and explicit local selection', async () => {
    const list = vi.spyOn(api, 'listSharedMcpConnections').mockResolvedValue({ available: true, connections: [{ credentialId: 'owner-record', label: 'Saved MCP' }],
      current: { credentialId: 'owner-record', status: 'connected', granted: true } });
    const useSaved = vi.spyOn(api, 'useSharedMcpConnection').mockResolvedValue({ connected: true });
    const useLocal = vi.spyOn(api, 'useLocalMcpConnection').mockResolvedValue(undefined);
    const stopHere = vi.spyOn(api, 'stopSharedMcpConnection').mockResolvedValue(undefined);
    const signIn = vi.fn();
    const onChanged = vi.fn();
    render(<ExternalMcpSharedChoice serverId="server-a" busy={false} signIn={signIn} onChanged={onChanged} />);
    expect(list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use a saved connection on this Mac' }));
    await screen.findByRole('option', { name: 'Saved MCP' });
    fireEvent.change(screen.getByLabelText('Saved MCP connection'), { target: { value: 'owner-record' } });
    await waitFor(() => expect(useSaved).toHaveBeenCalledWith({ serverId: 'server-a', credentialId: 'owner-record' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in and save on this Mac' }));
    expect(signIn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop using here' }));
    await waitFor(() => expect(stopHere).toHaveBeenCalledWith('server-a'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: "Use this site's local connection" }));
    await waitFor(() => expect(useLocal).toHaveBeenCalledWith('server-a'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(3));
  });

  it('gives a concrete unavailable state without offering saving on an unbound host', async () => {
    vi.spyOn(api, 'listSharedMcpConnections').mockResolvedValue({ available: false, connections: [], current: null });
    render(<ExternalMcpSharedChoice serverId="server-a" busy={false} signIn={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a saved connection on this Mac' }));
    expect(await screen.findByText('Saved connections are available in the desktop owner profile.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in and save on this Mac' })).toBeNull();
  });
});
