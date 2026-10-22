import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, PREFER_SUBAGENTS_KEY,
  loadAssistantRuntimePreferences, readAssistantRuntimePreferences, saveAssistantRuntimePreferences,
} from '../assistant-runtime-preferences';

describe('person-scoped assistant runtime preferences', () => {
  it('mirrors the server key and default', () => {
    expect(PREFER_SUBAGENTS_KEY).toBe('preferSubagents');
    expect(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES).toEqual({ preferSubagents: true });
  });
  it('reads booleans and falls back to the default for missing or invalid values', () => {
    expect(readAssistantRuntimePreferences({ values: new Map() })).toEqual({ preferSubagents: true });
    expect(readAssistantRuntimePreferences({ values: new Map([['preferSubagents', 'no']]) })).toEqual({ preferSubagents: true });
    expect(readAssistantRuntimePreferences({ values: new Map([['preferSubagents', false]]) })).toEqual({ preferSubagents: false });
  });
  it('loads through the shared ledger namespace', async () => {
    const port = { load: vi.fn(async () => new Map<string, unknown>([['preferSubagents', false]])), save: vi.fn(async () => {}) };
    expect(await loadAssistantRuntimePreferences({ port }, {})).toEqual({ preferSubagents: false });
    expect(port.load).toHaveBeenCalledWith({ namespace: 'core.interface' }, {});
  });
  it('saves at user scope, marking only the changed keys', async () => {
    const port = { load: vi.fn(), save: vi.fn(async () => {}) };
    await saveAssistantRuntimePreferences({ port, next: { preferSubagents: false }, previous: { preferSubagents: true } }, {});
    expect(port.save).toHaveBeenCalledWith({ namespace: 'core.interface', scope: 'user', candidates: [{ key: 'preferSubagents', valueJson: false, changed: true }] }, {});
    await saveAssistantRuntimePreferences({ port, next: { preferSubagents: true }, previous: { preferSubagents: true } }, {});
    expect(port.save).toHaveBeenLastCalledWith({ namespace: 'core.interface', scope: 'user', candidates: [{ key: 'preferSubagents', valueJson: true, changed: false }] }, {});
  });
});
