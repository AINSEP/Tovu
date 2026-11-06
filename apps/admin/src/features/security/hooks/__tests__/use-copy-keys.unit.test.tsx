import { act, renderHook } from '@/__tests__/fetch-query-render';
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
});
