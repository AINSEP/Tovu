import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useAssistantTransport } from '@/components/AssistantDock/hooks/AssistantDock.hooks';
import type { UseExecutionConfig } from '@/components/AssistantDock/hooks/AssistantDock.hooks';
import { DEFAULT_EXECUTION_CONFIG } from '@/lib/execution-settings';
import { useTovuDockExecution, useTovuSettingsExecution } from '../use-tovu-execution-adapters.hooks';
import { useTovuExecutionPolicy } from '../use-tovu-execution-policy.hooks';

const saved = { ...DEFAULT_EXECUTION_CONFIG, localCli: { agentId: 'codex' } };
const controller = (): UseExecutionConfig => ({
  executionConfig: saved, executionConfigRef: { current: saved },
  setExecutionConfig: vi.fn(), handleExecutionModeChange: vi.fn(),
  hasStoredAdminKey: true, configLoaded: true,
  readExecutionConfigForSend: vi.fn(async () => saved),
});
const useDeployedPolicy: typeof useTovuExecutionPolicy = (input) => useTovuExecutionPolicy(input, {
  desktop: false, loadRuntime: async () => ({ mode: 'production' }),
});

it('projects fresh saved reads for a deployed send and keeps its source ref untouched', async () => {
  const source = controller();
  const { result } = renderHook(() => useTovuDockExecution({ controller: source, locale: 'en' }, { usePolicy: useDeployedPolicy }));
  await waitFor(() => expect(result.current.note).not.toBeNull());
  const config = await result.current.readExecutionConfigForSend();
  expect(config.mode).toBe('byok');
  expect(result.current.executionConfigRef.current).toBe(config);
  expect(source.executionConfigRef.current).toBe(saved);
  expect(source.setExecutionConfig).not.toHaveBeenCalled();
  result.current.handleExecutionModeChange('local');
  result.current.handleExecutionModeChange('api');
  expect(source.handleExecutionModeChange).not.toHaveBeenCalled();
});

it('awaits runtime discovery before a local send rather than using the pending BYOK projection', async () => {
  let finish!: (value: { mode: 'local' }) => void;
  const loadRuntime = () => new Promise<{ mode: 'local' }>((resolve) => { finish = resolve; });
  const { result } = renderHook(() => useTovuDockExecution({ controller: controller(), locale: 'en' }, {
    usePolicy: (input) => useTovuExecutionPolicy(input, { desktop: false, loadRuntime }),
  }));
  const sent = vi.fn();
  const pending = result.current.readExecutionConfigForSend().then(sent);
  await act(async () => { await Promise.resolve(); });
  expect(sent).not.toHaveBeenCalled();
  await act(async () => finish({ mode: 'local' }));
  await pending;
  expect(sent.mock.calls[0][0]).toBe(saved);
});

it('prevents deployed picker inventory IO and normalization writes', async () => {
  const source = controller();
  const { result } = renderHook(() => useTovuDockExecution({ controller: source, locale: 'en' }, { usePolicy: useDeployedPolicy }));
  const port = { listAgents: vi.fn(), rescanAgents: vi.fn(), daemonOnline: vi.fn() };
  const hidden = result.current.runtimeAccess(port);
  expect(await hidden.listAgents()).toEqual([]);
  expect(await hidden.rescanAgents()).toEqual([]);
  expect(await hidden.daemonOnline()).toBe(false);
  expect(port.listAgents).not.toHaveBeenCalled();
  const changed = vi.fn();
  result.current.selectionChange(changed)({ agentId: 'claude' });
  expect(changed).not.toHaveBeenCalled();
  expect(result.current.agents([{ id: 'codex', name: 'Codex' }])).toEqual([]);
});

it('preserves mode through deployed BYOK settings edits without a mount-time write', async () => {
  const onChange = vi.fn();
  const { result } = renderHook(() => useTovuSettingsExecution({ config: saved, onChange, locale: 'en' }, { usePolicy: useDeployedPolicy }));
  await waitFor(() => expect(result.current.note).not.toBeNull());
  expect(onChange).not.toHaveBeenCalled();
  act(() => result.current.onConfigChange({ ...result.current.config, byok: { ...saved.byok, model: 'gpt-5' } }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...saved, byok: { ...saved.byok, model: 'gpt-5' } });
});

it('passes desktop mode changes, inventory and settings edits through unchanged', () => {
  const source = controller();
  const usePolicy: typeof useTovuExecutionPolicy = (input) => useTovuExecutionPolicy(input, { desktop: true });
  const { result } = renderHook(() => useTovuDockExecution({ controller: source, locale: 'en' }, { usePolicy }));
  result.current.handleExecutionModeChange('api');
  expect(source.handleExecutionModeChange).toHaveBeenCalledExactlyOnceWith('api');
  const port = { listAgents: vi.fn(), rescanAgents: vi.fn(), daemonOnline: vi.fn() };
  expect(result.current.runtimeAccess(port)).toBe(port);
  expect(result.current.executionConfigRef.current).toBe(saved);
});

it('the real transport hook reads the effective BYOK ref before dispatching a deployed turn', async () => {
  const source = controller();
  const modes: string[] = [];
  const { result } = renderHook(() => {
    const execution = useTovuDockExecution({ controller: source, locale: 'en' }, { usePolicy: useDeployedPolicy });
    return useAssistantTransport({ executionConfigRef: execution.executionConfigRef, readExecutionConfigForSend: execution.readExecutionConfigForSend }, {
      createTransport: (options) => ({
        startRun: async () => { modes.push(options?.getExecutionConfig?.()?.mode ?? 'missing'); return { runId: 'byok-test' }; },
        reattachRun: async () => {}, fetchRunStatus: async () => null, stopRun: async () => {},
      }),
    });
  });
  await act(async () => { await result.current.startRun({ signal: new AbortController().signal, history: [] }, { onEvent: vi.fn(), onDone: vi.fn(), onError: vi.fn() }); });
  expect(modes).toEqual(['byok']);
  expect(source.executionConfigRef.current.mode).toBe('local-cli');
  expect(source.setExecutionConfig).not.toHaveBeenCalled();
});
