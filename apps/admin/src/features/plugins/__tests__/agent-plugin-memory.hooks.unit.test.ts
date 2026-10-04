// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useAgentPluginMemory } from '../hooks/use-agent-plugin-memory.hooks';
import type { AgentPluginMemoryPort, PluginMemoryListing } from '../hooks/agent-plugin-memory-port.hooks';
import { PLUGIN_MEMORY_DICT } from '../plugins-memory-i18n';

const listing = (pluginId: string, text: string): PluginMemoryListing => ({ pluginId,
  learned: [{ relativePath: 'account.json', text: 'Discovered account facts' }],
  notes: [{ relativePath: 'project.md', text }], limits: { learned: 1048576, notes: 16384, files: 128 } });
const t = (key: string) => key;

test('editor saves a user note through its port and keeps learned facts separate', async () => {
  let state = listing('example', 'Original note');
  const calls: unknown[] = [];
  const port: AgentPluginMemoryPort = {
    read: async () => state,
    saveNote: async input => { calls.push(input); state = listing(input.pluginId, input.text); return state; },
  };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: 'example', port, t }));
  await waitFor(() => expect(result.current.text).toBe('Original note'));
  act(() => result.current.setText('User brand rule'));
  await act(async () => { await result.current.save(); });
  expect(calls).toEqual([{ pluginId: 'example', entryPath: 'project.md', text: 'User brand rule' }]);
  expect(result.current.listing?.learned).toEqual(state.learned);
  expect(result.current.status).toBe('Note saved.');
});

test('a late response from a different plugin never fills this plugin’s editor', async () => {
  let settleFirst!: (value: PluginMemoryListing) => void;
  const first = new Promise<PluginMemoryListing>(resolve => { settleFirst = resolve; });
  const port: AgentPluginMemoryPort = { read: ({ pluginId }) => pluginId === 'first' ? first : Promise.resolve(listing(pluginId, 'Second note')),
    saveNote: async () => { throw new Error('unexpected write'); } };
  const { result, rerender } = renderHook(({ pluginId }) => useAgentPluginMemory({ pluginId, port, t }), { initialProps: { pluginId: 'first' } });
  rerender({ pluginId: 'second' });
  await waitFor(() => expect(result.current.text).toBe('Second note'));
  await act(async () => { settleFirst(listing('first', 'Stale first note')); await first; });
  expect(result.current.text).toBe('Second note');
  expect(result.current.listing?.pluginId).toBe('second');
});

test('every supported plugin locale includes the memory editor and uninstall choices', () => {
  const locales = ['es','id','de','zh-CN','zh-TW','pt-BR','ru','fa','ar','ja','ko','pl','hu','fr','uk','tr','th','it','hi','ur','bn'];
  for (const locale of locales) for (const key of ['Memory','Project notes','Learned knowledge','Save note','Uninstall · keep memory','Uninstall and delete memory']) {
    expect(PLUGIN_MEMORY_DICT[locale]?.[key]).toBeTruthy();
    expect(PLUGIN_MEMORY_DICT[locale]?.[key]).not.toBe(key);
  }
});
