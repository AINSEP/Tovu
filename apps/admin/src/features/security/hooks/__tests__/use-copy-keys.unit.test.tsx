import { act, renderHook, waitFor } from '@/__tests__/fetch-query-render';
import type { ChangeEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCopyKeys } from '../use-copy-keys.hooks';
import { fakeCopyKeysPort, t } from '../../__tests__/copy-keys.fixture';

const check = (id: string) => ({ currentTarget: { value: id, checked: true } }) as ChangeEvent<HTMLInputElement>;
async function open(port = fakeCopyKeysPort()) {
  const view = renderHook(() => useCopyKeys({ t }, { port }));
  await act(async () => { view.result.current.show({ currentTarget: document.createElement('button') }); });
  return { ...view, port };
}

describe('saved-key grant controller', () => {
  it('selects one reference and never submits a site identity or a copy overwrite', async () => {
    const { result, port } = await open();
    act(() => { result.current.changeKey(check('one')); result.current.changeKey(check('two')); });
    expect(result.current.keys.filter(key => key.checked).map(key => key.id)).toEqual(['two']);
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(port.copyCredentials).toHaveBeenCalledExactlyOnceWith({ sourceSiteId: 'shared-keys', ids: ['two'], overwrite: false });
    expect(result.current.results[0]?.text).toBe('Granted to this site');
  });

  it('ignores a forged selection not offered by Shared Keys', async () => {
    const { result, port } = await open();
    act(() => result.current.changeKey(check('unoffered')));
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(port.copyCredentials).not.toHaveBeenCalled();
  });

  it('locks cancellation and duplicate submission while approval is pending', async () => {
    const port = fakeCopyKeysPort();
    let finish!: () => void;
    vi.mocked(port.copyCredentials).mockImplementation(() => new Promise(resolve => { finish = () => resolve({ results: [] }); }));
    const { result } = await open(port);
    act(() => result.current.changeKey(check('one')));
    const submit = result.current.submit;
    let calls!: Promise<void>[];
    act(() => { calls = [submit({ preventDefault() {} }), submit({ preventDefault() {} })]; result.current.cancel(); });
    expect(result.current.open).toBe(true);
    expect(port.copyCredentials).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await Promise.all(calls); });
    act(() => result.current.cancel());
    expect(result.current.open).toBe(false);
  });

  it('shows an actionable redacted failure and clears it on reopen', async () => {
    const port = fakeCopyKeysPort();
    vi.mocked(port.listCredentialCopySources).mockRejectedValueOnce(new Error('secret-canary'));
    const { result } = await open(port);
    expect(result.current.error).toContain('P25_KEY_PICKER_LOAD_FAILED');
    expect(result.current.error).not.toContain('secret-canary');
    act(() => result.current.cancel());
    await act(async () => { result.current.show({ currentTarget: document.createElement('button') }); });
    expect(result.current.error).toBe('');
    expect(port.listCredentialCopySources).toHaveBeenCalledTimes(2);
  });

  it('does not render another site inventory returned by an older host', async () => {
    const { result } = await open(fakeCopyKeysPort([{ siteId: 'other-site', name: 'Private', keys: [{ id: 'private-id', kind: 'vendor', label: 'Private key', provider: null }] }]));
    expect(result.current.keys).toEqual([]);
    expect(result.current.disabled).toBe(true);
  });

  it("a locked site key shows why and cannot be approved; a usable site key reads as just its name", async () => {
    const port = { listCredentialCopySources: vi.fn().mockResolvedValue({ sources: [{ siteId: "shared-keys", name: "Shared Keys", keys: [
      { kind: "vendor", id: "saved-on-site:a:1", label: "Vercel, thetayway", provider: null, siteName: "thetayway" },
      { kind: "vendor", id: "saved-on-site:b:2", label: "Vercel, old-site", provider: null, siteName: "old-site", locked: "Open old-site in Tovu and recover its key, then try again." },
    ] }] }), copyCredentials: vi.fn() };
    const { result } = renderHook(() => useCopyKeys({ t }, { port }));
    act(() => result.current.show({ currentTarget: { focus: vi.fn() } } as never));
    await waitFor(() => expect(result.current.keys).toHaveLength(2));
    expect(result.current.keys[0]).toMatchObject({ text: "Vercel, thetayway", locked: "" });
    expect(result.current.keys[1]?.locked).toContain("recover its key");
    act(() => result.current.changeKey({ currentTarget: { checked: true, value: "saved-on-site:b:2" } } as never));
    expect(result.current.disabled).toBe(true);
  });
});
