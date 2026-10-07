import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXECUTION_CONFIG } from '@/lib/execution-settings';
import { localCliAllowed, effectiveExecutionConfig, preserveSavedExecutionMode } from '@/lib/tovu-execution-policy';
import { useTovuExecutionPolicy } from '../use-tovu-execution-policy.hooks';

const saved = { ...DEFAULT_EXECUTION_CONFIG, localCli: { agentId: 'codex' } };

describe('owner 2026-10-07 deployed Local CLI gate', () => {
  it('uses the server runtime mode and keeps desktop and local dev enabled', () => {
    expect(localCliAllowed({ mode: 'production', desktop: false })).toBe(false);
    expect(localCliAllowed({ mode: 'local', desktop: false })).toBe(true);
    expect(localCliAllowed({ mode: 'production', desktop: true })).toBe(true);
    expect(localCliAllowed({ mode: undefined, desktop: false })).toBe(false);
  });
  it('projects saved Local CLI to BYOK without changing either saved half', () => {
    const effective = effectiveExecutionConfig({ config: saved, allowed: false });
    expect(effective.mode).toBe('byok');
    expect(effective.localCli).toBe(saved.localCli);
    expect(effective.byok).toBe(saved.byok);
    expect(saved.mode).toBe('local-cli');
    expect(effectiveExecutionConfig({ config: saved, allowed: true })).toBe(saved);
  });
  it('preserves the saved choice when a deployed BYOK form is edited', () => {
    const next = { ...saved, mode: 'byok' as const, byok: { ...saved.byok, model: 'gpt-5' } };
    expect(preserveSavedExecutionMode({ saved, next, allowed: false })).toEqual({ ...next, mode: 'local-cli' });
    expect(preserveSavedExecutionMode({ saved, next, allowed: true })).toBe(next);
  });
  it('keeps the gate closed during discovery, then shows the localized fallback note', async () => {
    let finish!: (value: { mode: 'production' }) => void;
    const loadRuntime = vi.fn(() => new Promise<{ mode: 'production' }>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useTovuExecutionPolicy({ config: saved, locale: 'en' }, { desktop: false, loadRuntime }));
    expect(result.current.allowed).toBe(false);
    expect(result.current.config.mode).toBe('byok');
    expect(result.current.note).toBeNull();
    await act(async () => finish({ mode: 'production' }));
    expect(result.current.note).toBe('Local CLI is hidden on deployed sites for now. BYOK is used; your saved choice is unchanged.');
    expect(loadRuntime).toHaveBeenCalledTimes(1);
    expect(saved.mode).toBe('local-cli');
  });
  it('restores the existing local choice after discovery without a saved-value write', async () => {
    const { result } = renderHook(() => useTovuExecutionPolicy({ config: saved, locale: 'en' }, { desktop: false, loadRuntime: async () => ({ mode: 'local' }) }));
    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(result.current.config).toBe(saved);
    expect(result.current.note).toBeNull();
  });
  it('keeps desktop behavior and skips runtime discovery', () => {
    const loadRuntime = vi.fn(async () => ({ mode: 'production' as const }));
    const { result } = renderHook(() => useTovuExecutionPolicy({ config: saved, locale: 'en' }, { desktop: true, loadRuntime }));
    expect(result.current.config).toBe(saved);
    expect(result.current.allowed).toBe(true);
    expect(loadRuntime).not.toHaveBeenCalled();
  });
  it('keeps CLI hidden if discovery fails and does not claim a saved-choice fallback', async () => {
    const loadRuntime = vi.fn(async () => { throw new Error('offline'); });
    const { result } = renderHook(() => useTovuExecutionPolicy({ config: saved, locale: 'en' }, { desktop: false, loadRuntime }));
    await act(async () => {});
    expect(result.current.allowed).toBe(false);
    expect(result.current.note).toBeNull();
  });
});
