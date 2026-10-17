import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderHook, act } from '@testing-library/react';
import type { DetectedAgent, ExecutionPort } from '@jini-ai/ui';
import { DEFAULT_EXECUTION_CONFIG } from '@/lib/execution-settings';
import { createAgentPresentationPort, isDesktopAdmin, localCliScopeCopy, normalizeAgentDescription, selectedAgentWarning } from '../ai-agent-presentation';
import { useAiAgentPresentation } from '../hooks/use-ai-agent-presentation.hooks';

const claude: DetectedAgent = { id: 'claude', label: 'Claude Code', installed: true, authStatus: 'missing' };
const fakePort = (agents: readonly DetectedAgent[]): ExecutionPort => ({ detectLocalAgents: async () => agents, testConnection: async () => ({ ok: true }) });

describe('D-21 AI agent presentation', () => {
  it('uses browser scope by default and tolerates a configuration that has not loaded yet', async () => {
    const bridges = ['tovuFiles', 'tovuVoice'] as const;
    const originals = bridges.map(name => Object.getOwnPropertyDescriptor(window, name));
    try {
      for (const name of bridges) Object.defineProperty(window, name, { configurable: true, value: undefined });
      const port = fakePort([claude]);
      const { result } = renderHook(() => useAiAgentPresentation({ port, config: null, locale: 'en' }));
      await act(async () => { await result.current.port.detectLocalAgents(); });
      expect(result.current.scopeCopy).toBe('Detected on the Tovu server, not on your own computer.');
      expect(result.current.warning).toBeNull();
    } finally {
      bridges.forEach((name, index) => {
        const original = originals[index];
        if (original) Object.defineProperty(window, name, original);
        else Reflect.deleteProperty(window, name);
      });
    }
  });

  it('keeps the warning after an identical scan and clears it when authentication changes', async () => {
    let agents: readonly DetectedAgent[] = [claude];
    const port: ExecutionPort = { ...fakePort([]), detectLocalAgents: async () => agents };
    const { result } = renderHook(() => useAiAgentPresentation({ port, config: DEFAULT_EXECUTION_CONFIG, locale: 'en' }, { desktop: true }));
    await act(async () => { await result.current.port.detectLocalAgents(); });
    expect(result.current.warning).toBe('Claude Code: Authentication required. Sign in before sending.');
    agents = [{ ...claude }];
    await act(async () => { await result.current.port.detectLocalAgents(); });
    expect(result.current.warning).toBe('Claude Code: Authentication required. Sign in before sending.');
    agents = [{ ...claude, authStatus: 'ok' }];
    await act(async () => { await result.current.port.detectLocalAgents(); });
    expect(result.current.warning).toBeNull();
  });

  it('lets a pending detection finish after unmount without publishing another presentation', async () => {
    let complete!: (agents: readonly DetectedAgent[]) => void;
    const detected = new Promise<readonly DetectedAgent[]>(resolve => { complete = resolve; });
    const port = { ...fakePort([]), detectLocalAgents: vi.fn<ExecutionPort['detectLocalAgents']>().mockResolvedValueOnce([claude]).mockReturnValueOnce(detected) };
    const presentations: (string | null)[] = [];
    // React suppresses renders after unmount; observe the publication sink before React can discard it.
    const publish = vi.fn();
    const state = vi.spyOn(React, 'useState').mockReturnValueOnce([[], publish]);
    try {
      const { result, unmount } = renderHook(() => {
        const presentation = useAiAgentPresentation({ port, config: DEFAULT_EXECUTION_CONFIG, locale: 'en' }, { desktop: true });
        presentations.push(presentation.warning);
        return presentation;
      });
      await act(async () => { await result.current.port.detectLocalAgents(); });
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish.mock.calls[0][0]([])).toEqual([claude]);

      const pending = result.current.port.detectLocalAgents();
      unmount();
      const countAtUnmount = presentations.length;
      await act(async () => { complete([claude]); await expect(pending).resolves.toEqual([claude]); });
      expect(publish).toHaveBeenCalledTimes(1);
      expect(presentations).toHaveLength(countAtUnmount);
      expect(presentations).toEqual([null]);
    } finally {
      state.mockRestore();
    }
  });

  it('words desktop and server scope exactly, reusing host bridge presence', () => {
    expect(localCliScopeCopy({ desktop: true })).toBe('Detected on this computer.');
    expect(localCliScopeCopy({ desktop: false })).toBe('Detected on the Tovu server, not on your own computer.');
    expect(isDesktopAdmin({}, { targetWindow: {} as Window })).toBe(false);
    expect(isDesktopAdmin({}, { targetWindow: { tovuFiles: { getPathForFile: () => '' } } as unknown as Window })).toBe(true);
  });
  it('warns for the selected installed unauthenticated CLI only', () => {
    const input = { mode: 'local-cli', agentId: 'claude', agents: [claude], locale: 'en' };
    expect(selectedAgentWarning(input)).toBe('Claude Code: Authentication required. Sign in before sending.');
    expect(selectedAgentWarning({ ...input, mode: 'byok' })).toBeNull();
    expect(selectedAgentWarning({ ...input, agentId: 'codex' })).toBeNull();
    for (const authStatus of ['unknown', 'ok', undefined] as const) {
      expect(selectedAgentWarning({ ...input, agents: [{ ...claude, authStatus }] })).toBeNull();
    }
    expect(selectedAgentWarning({ ...input, agents: [{ ...claude, installed: false }] })).toBeNull();
  });
  it('suppresses the divider for empty descriptions while preserving fallback for absent descriptions', () => {
    const agent = { ...claude, id: 'reasonix', label: 'DeepSeek Reasonix' };
    expect(normalizeAgentDescription({ agent: { ...agent, description: '  \n ' } }).description).toBe('');
    expect(normalizeAgentDescription({ agent: { ...agent, description: '' } }).description).toBe('');
    expect(normalizeAgentDescription({ agent: { ...agent, description: ' Vendor CLI ' } }).description).toBe('Vendor CLI');
    expect(normalizeAgentDescription({ agent })).toBe(agent);
  });
  it('projects detection/rescan results and keeps scan failures visible', async () => {
    const snapshots: (readonly DetectedAgent[])[] = [];
    const port = createAgentPresentationPort({ port: {
      ...fakePort([claude]), rescanLocalAgents: async () => [{ ...claude, authStatus: 'ok' }],
    }, onAgents: (agents) => snapshots.push(agents) });
    await port.detectLocalAgents();
    await port.rescanLocalAgents!();
    expect(snapshots.map((agents) => agents[0]?.authStatus)).toEqual(['missing', 'ok']);
    const failed = createAgentPresentationPort({ port: { ...fakePort([]), detectLocalAgents: async () => { throw new Error('Detection unavailable'); } }, onAgents: (agents) => snapshots.push(agents) });
    await expect(failed.detectLocalAgents()).rejects.toThrow('Detection unavailable');
    expect(snapshots).toHaveLength(2);
  });
  it('updates the inline warning on selection, BYOK switches, and rescan', async () => {
    const config = { ...DEFAULT_EXECUTION_CONFIG, mode: 'local-cli' as const, localCli: { ...DEFAULT_EXECUTION_CONFIG.localCli, agentId: 'claude' } };
    const port = { ...fakePort([claude]), rescanLocalAgents: async () => [{ ...claude, authStatus: 'ok' as const }] };
    const { result, rerender } = renderHook(({ current }) => useAiAgentPresentation({ port, config: current, locale: 'en' }, { desktop: true }), { initialProps: { current: config as typeof DEFAULT_EXECUTION_CONFIG } });
    await act(async () => { await result.current.port.detectLocalAgents(); });
    expect(result.current.warning).toBe('Claude Code: Authentication required. Sign in before sending.');
    rerender({ current: { ...config, mode: 'byok' } });
    expect(result.current.warning).toBeNull();
    rerender({ current: { ...config, localCli: { ...config.localCli, agentId: 'codex' } } });
    expect(result.current.warning).toBeNull();
    rerender({ current: config });
    await act(async () => { await result.current.port.rescanLocalAgents!(); });
    expect(result.current.warning).toBeNull();
  });
});

it('warns for the dock default Claude when the ledger has no agent selection yet', async () => {
  const port = fakePort([claude]);
  const { result } = renderHook(() => useAiAgentPresentation({ port, config: DEFAULT_EXECUTION_CONFIG, locale: 'en' }, { desktop: true }));
  await act(async () => { await result.current.port.detectLocalAgents(); });
  expect(result.current.warning).toBe('Claude Code: Authentication required. Sign in before sending.');
});

it('ignores an older scan finishing after a successful sign-in rescan', async () => {
  let complete: (agents: readonly DetectedAgent[]) => void = () => {};
  const slow = new Promise<readonly DetectedAgent[]>((resolve) => { complete = resolve; });
  const snapshots: (readonly DetectedAgent[])[] = [];
  const port = createAgentPresentationPort({
    port: { ...fakePort([]), detectLocalAgents: () => slow, rescanLocalAgents: async () => [{ ...claude, authStatus: 'ok' }] },
    onAgents: (agents) => snapshots.push(agents),
  });
  const initial = port.detectLocalAgents();
  await port.rescanLocalAgents!();
  complete([claude]);
  await initial;
  expect(snapshots.map((agents) => agents[0]?.authStatus)).toEqual(['ok']);
});
