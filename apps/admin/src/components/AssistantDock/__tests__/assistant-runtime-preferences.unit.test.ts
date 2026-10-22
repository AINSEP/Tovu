import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, PREFER_SUBAGENTS_KEY, USE_CLAUDE_IN_CHROME_KEY, visibleAssistantRuntimePreferences,
  loadAssistantRuntimePreferences, readAssistantRuntimePreferences, saveAssistantRuntimePreferences,
} from '../assistant-runtime-preferences';

describe('person-scoped assistant runtime preferences', () => {
  it('mirrors the server keys and defaults', () => {
    expect(PREFER_SUBAGENTS_KEY).toBe('preferSubagents');
    expect(USE_CLAUDE_IN_CHROME_KEY).toBe('useClaudeInChrome');
    expect(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES).toEqual({ preferSubagents: true, useClaudeInChrome: true });
  });
  it('reads booleans and falls back to the default for missing or invalid values', () => {
    expect(readAssistantRuntimePreferences({ values: new Map() })).toEqual({ preferSubagents: true, useClaudeInChrome: true });
    expect(readAssistantRuntimePreferences({ values: new Map<string, unknown>([['preferSubagents', 'no'], ['useClaudeInChrome', 'yes']]) })).toEqual({ preferSubagents: true, useClaudeInChrome: true });
    expect(readAssistantRuntimePreferences({ values: new Map([['preferSubagents', false], ['useClaudeInChrome', true]]) })).toEqual({ preferSubagents: false, useClaudeInChrome: true });
  });
  it('loads through the shared ledger namespace', async () => {
    const port = { load: vi.fn(async () => new Map<string, unknown>([['preferSubagents', false]])), save: vi.fn(async () => {}) };
    expect(await loadAssistantRuntimePreferences({ port }, {})).toEqual({ preferSubagents: false, useClaudeInChrome: true });
    expect(port.load).toHaveBeenCalledWith({ namespace: 'core.interface' }, {});
  });
  it('saves at user scope, marking only the changed keys', async () => {
    const port = { load: vi.fn(), save: vi.fn(async () => {}) };
    await saveAssistantRuntimePreferences({ port, next: { preferSubagents: false, useClaudeInChrome: false }, previous: { preferSubagents: true, useClaudeInChrome: false } }, {});
    expect(port.save).toHaveBeenCalledWith({ namespace: 'core.interface', scope: 'user', candidates: [
      { key: 'preferSubagents', valueJson: false, changed: true }, { key: 'useClaudeInChrome', valueJson: false, changed: false },
    ] }, {});
    await saveAssistantRuntimePreferences({ port, next: { preferSubagents: true, useClaudeInChrome: true }, previous: { preferSubagents: true, useClaudeInChrome: false } }, {});
    expect(port.save).toHaveBeenLastCalledWith({ namespace: 'core.interface', scope: 'user', candidates: [
      { key: 'preferSubagents', valueJson: true, changed: false }, { key: 'useClaudeInChrome', valueJson: true, changed: true },
    ] }, {});
  });
  it('shows a toggle only for a runtime that declares support for it', () => {
    expect(visibleAssistantRuntimePreferences({ agent: { supportsSubagents: true, supportsClaudeInChrome: true } })).toEqual({ preferSubagents: true, useClaudeInChrome: true });
    expect(visibleAssistantRuntimePreferences({ agent: { supportsSubagents: false } })).toEqual({ preferSubagents: false, useClaudeInChrome: false });
    expect(visibleAssistantRuntimePreferences({ agent: undefined })).toEqual({ preferSubagents: false, useClaudeInChrome: false });
  });
});
