import { act, cleanup, renderHook } from '@/__tests__/fetch-query-render';
import { afterEach, expect, it, vi } from 'vitest';
import { publishAssistantDockState, resetAssistantDockBus } from '@/lib/assistant-dock-bus';
import { useLocalCliDaemonPrewarm } from '../hooks/AssistantDock.hooks';

afterEach(() => { cleanup(); resetAssistantDockBus(); });

it('exposes a failed page activation and clears it after a successful explicit reopen', async () => {
  const reason = 'The assistant could not attach this page. Retry your message. Details: HTTP 503; DAEMON_TOKEN_MISSING';
  const activate = vi.fn().mockRejectedValueOnce(new Error(reason)).mockResolvedValue(undefined);
  publishAssistantDockState(true);
  const { result } = renderHook(() => useLocalCliDaemonPrewarm({ mode: 'local-cli', configLoaded: true }, { activate }));
  await act(async () => { await Promise.resolve(); });
  expect(result.current).toBe(reason);
  act(() => publishAssistantDockState(false));
  act(() => publishAssistantDockState(true));
  await act(async () => { await Promise.resolve(); });
  expect(result.current).toBeNull();
  expect(activate).toHaveBeenCalledTimes(2);
});

it('keeps a cancelled pre-warm silent when the dock closes', async () => {
  let reject!: (error: unknown) => void;
  const activate = vi.fn(() => new Promise<void>((_resolve, no) => { reject = no; }));
  publishAssistantDockState(true);
  const { result } = renderHook(() => useLocalCliDaemonPrewarm({ mode: 'local-cli', configLoaded: true }, { activate }));
  act(() => publishAssistantDockState(false));
  await act(async () => { reject(new Error('cancelled')); });
  expect(result.current).toBeNull();
});
