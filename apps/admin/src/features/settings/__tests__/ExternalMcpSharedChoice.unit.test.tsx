import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ExternalMcpSharedChoice } from '../ExternalMcpSharedChoice';
import { t as translate } from '../external-mcp-i18n';

const language = vi.hoisted(() => ({ locale: 'en' }));
const t = (key: string) => translate({ locale: language.locale, key });

afterEach(() => { vi.restoreAllMocks(); language.locale = 'en'; });

describe('explicit saved MCP choices', () => {
  it('translates the saved choices, accessible selector and stopped state in Spanish', async () => {
    language.locale = 'es';
    const list = vi.spyOn(api, 'listSharedMcpConnections').mockResolvedValue({ available: true, connections: [{ credentialId: 'saved', label: 'Owner label' }], current: { credentialId: 'saved', status: 'connected', granted: true } });
    vi.spyOn(api, 'stopSharedMcpConnection').mockImplementation(async () => {
      list.mockResolvedValue({ available: true, connections: [], current: { credentialId: 'saved', status: 'connected', granted: false } });
    });
    render(<ExternalMcpSharedChoice t={t} serverId="server-a" busy={false} signIn={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar una conexión guardada en este Mac' }));
    expect(await screen.findByRole('option', { name: 'Owner label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión y guardar en este Mac' })).toBeInTheDocument();
    expect(screen.getByLabelText('Conexión MCP guardada')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Elige una conexión guardada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar la conexión local de este sitio' })).toBeInTheDocument();
    expect(screen.getByText('Conexión compartida: connected.')).toBeInTheDocument();
    expect(screen.getByText('Guardar aquí te permite conceder esta conexión a otros sitios de este Mac. Las conexiones locales existentes permanecen separadas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dejar de usar aquí' }));
    expect(await screen.findByText('Esta conexión compartida está detenida en este sitio.')).toBeInTheDocument();
  });

  it('translates the unavailable explanation in Spanish', async () => {
    language.locale = 'es';
    vi.spyOn(api, 'listSharedMcpConnections').mockResolvedValue({ available: false, connections: [], current: null });
    render(<ExternalMcpSharedChoice t={t} serverId="server-a" busy={false} signIn={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar una conexión guardada en este Mac' }));
    expect(await screen.findByText('Las conexiones guardadas están disponibles en el perfil del propietario de la aplicación de escritorio.')).toBeInTheDocument();
  });

  it('loads metadata on demand, then offers saved selection, shared sign-in and explicit local selection', async () => {
    const list = vi.spyOn(api, 'listSharedMcpConnections').mockResolvedValue({ available: true, connections: [{ credentialId: 'owner-record', label: 'Saved MCP' }],
      current: { credentialId: 'owner-record', status: 'connected', granted: true } });
    const useSaved = vi.spyOn(api, 'useSharedMcpConnection').mockResolvedValue({ connected: true });
    const useLocal = vi.spyOn(api, 'useLocalMcpConnection').mockResolvedValue(undefined);
    const stopHere = vi.spyOn(api, 'stopSharedMcpConnection').mockResolvedValue(undefined);
    const signIn = vi.fn();
    const onChanged = vi.fn();
    render(<ExternalMcpSharedChoice t={t} serverId="server-a" busy={false} signIn={signIn} onChanged={onChanged} />);
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
    render(<ExternalMcpSharedChoice t={t} serverId="server-a" busy={false} signIn={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a saved connection on this Mac' }));
    expect(await screen.findByText('Saved connections are available in the desktop owner profile.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in and save on this Mac' })).toBeNull();
  });
});
