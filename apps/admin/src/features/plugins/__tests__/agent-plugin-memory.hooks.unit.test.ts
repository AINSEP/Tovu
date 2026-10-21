// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
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
  for (const locale of locales) for (const key of ['Memory','Project notes','Learned knowledge','Save note','Uninstall · keep memory','Uninstall and delete memory',
    'Note files', 'No note files yet. Save a project note to get started.',
    'Nothing learned yet. The assistant saves what it verifies here.']) {
    expect(PLUGIN_MEMORY_DICT[locale]?.[key]).toBeTruthy();
    expect(PLUGIN_MEMORY_DICT[locale]?.[key]).not.toBe(key);
  }
});

test('empty-state messages wait for a successful read and update after saving the first note', async () => {
  let settle!: (value: PluginMemoryListing) => void;
  const pending = new Promise<PluginMemoryListing>(resolve => { settle = resolve; });
  let saved: PluginMemoryListing | null = null;
  const port: AgentPluginMemoryPort = { read: () => saved ? Promise.resolve(saved) : pending,
    saveNote: async input => (saved = { ...listing(input.pluginId, input.text), learned: [] }) };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: 'example', port, t }));
  expect(result.current.editorDisabled).toBe(true);
  expect(result.current.notesEmptyMessage).toBeNull();
  expect(result.current.learnedEmptyMessage).toBeNull();
  await act(async () => { settle({ ...listing('example', ''), notes: [], learned: [] }); await pending; });
  expect(result.current.editorDisabled).toBe(false);
  expect(result.current.notesEmptyMessage).toBe('No note files yet. Save a project note to get started.');
  expect(result.current.learnedEmptyMessage).toBe('Nothing learned yet. The assistant saves what it verifies here.');
  act(() => result.current.setText('First note'));
  await act(async () => { await result.current.save(); });
  expect(result.current.notesEmptyMessage).toBeNull();
  expect(result.current.learnedEmptyMessage).toBe('Nothing learned yet. The assistant saves what it verifies here.');
});

test('a failed memory read does not claim there are no notes or learned facts', async () => {
  const port: AgentPluginMemoryPort = { read: async () => { throw new Error('offline'); }, saveNote: async () => listing('example', '') };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: 'example', port, t }));
  await waitFor(() => expect(result.current.status).toBe('Could not load memory.'));
  expect(result.current.editorDisabled).toBe(true);
  expect(result.current.notesEmptyMessage).toBeNull();
  expect(result.current.learnedEmptyMessage).toBeNull();
});

test('the editor stays disabled while a save is in flight and becomes editable again when it settles', async () => {
  let finishSave!: (value: PluginMemoryListing) => void;
  const pendingSave = new Promise<PluginMemoryListing>(resolve => { finishSave = resolve; });
  const port: AgentPluginMemoryPort = { read: async () => listing('example', 'Original'), saveNote: () => pendingSave };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: 'example', port, t }));
  await waitFor(() => expect(result.current.editorDisabled).toBe(false));
  let request!: Promise<void>;
  act(() => { request = result.current.save(); });
  expect(result.current.editorDisabled).toBe(true);
  await act(async () => { finishSave(listing('example', 'Saved')); await request; });
  expect(result.current.editorDisabled).toBe(false);
});

test('status moves from loading to idle and reports a failed save with the bound translator', async () => {
  const port: AgentPluginMemoryPort = {
    read: async () => listing('example', 'Original'),
    saveNote: async () => { throw new Error('write refused'); },
  };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: 'example', port, t: key => `T:${key}` }));
  expect(result.current.status).toBe('T:Loading memory…');
  await waitFor(() => expect(result.current.editorDisabled).toBe(false));
  expect(result.current.status).toBeNull();
  await act(async () => { await result.current.save(); });
  expect(result.current.status).toBe('T:Could not save note.');
});

test('a save status from a previous plugin is hidden while the next plugin loads', async () => {
  let finish!: (value: PluginMemoryListing) => void;
  const pending = new Promise<PluginMemoryListing>(resolve => { finish = resolve; });
  const port: AgentPluginMemoryPort = {
    read: ({ pluginId }) => pluginId === 'second' ? pending : Promise.resolve(listing(pluginId, 'Original')),
    saveNote: async input => listing(input.pluginId, input.text),
  };
  const { result, rerender } = renderHook(({ pluginId }) => useAgentPluginMemory({ pluginId, port, t }), { initialProps: { pluginId: 'first' } });
  await waitFor(() => expect(result.current.editorDisabled).toBe(false));
  await act(async () => { await result.current.save(); });
  expect(result.current.status).toBe('Note saved.');
  rerender({ pluginId: 'second' });
  expect(result.current.status).toBe('Loading memory…');
  await act(async () => { finish(listing('second', 'Second')); await pending; });
  await waitFor(() => expect(result.current.status).toBeNull());
});

test('choosing a note file loads that file into the editor, and a new path starts empty', async () => {
  const state: PluginMemoryListing = { ...listing('example', 'Project text'), notes: [
    { relativePath: 'project.md', text: 'Project text' }, { relativePath: 'brand.md', text: 'Brand text' }] };
  const port: AgentPluginMemoryPort = { read: async () => state, saveNote: async () => state };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: 'example', port, t }));
  await waitFor(() => expect(result.current.text).toBe('Project text'));
  act(() => result.current.setPath('brand.md'));
  expect(result.current).toMatchObject({ entryPath: 'brand.md', text: 'Brand text' });
  act(() => result.current.setPath('new-file.md'));
  expect(result.current).toMatchObject({ entryPath: 'new-file.md', text: '' });
});

test('save does nothing before the first read has filled the editor', async () => {
  const calls: unknown[] = [];
  const port: AgentPluginMemoryPort = { read: () => new Promise(() => {}), saveNote: async (input) => { calls.push(input); return listing('example', ''); } };
  const { result } = renderHook(() => useAgentPluginMemory({ pluginId: 'example', port, t }));
  await act(async () => { await result.current.save(); });
  expect(calls).toEqual([]);
  expect(result.current.editorDisabled).toBe(true);
});

test.each(['resolves', 'rejects'] as const)('a save that %s after switching plugins reports nothing on the new plugin', async (outcome) => {
  let settle!: () => void;
  const port: AgentPluginMemoryPort = {
    read: async ({ pluginId }) => listing(pluginId, `${pluginId} note`),
    saveNote: ({ pluginId }) => new Promise((resolve, reject) => {
      settle = () => (outcome === 'resolves' ? resolve(listing(pluginId, 'saved')) : reject(new Error('disk full')));
    }),
  };
  const { result, rerender } = renderHook(({ pluginId }) => useAgentPluginMemory({ pluginId, port, t }), { initialProps: { pluginId: 'first' } });
  await waitFor(() => expect(result.current.text).toBe('first note'));
  let saving!: Promise<void>;
  act(() => { saving = result.current.save(); });
  rerender({ pluginId: 'second' });
  await waitFor(() => expect(result.current.text).toBe('second note'));
  await act(async () => { settle(); await saving; });
  expect(result.current.status).not.toBe('Note saved.');
  expect(result.current.status).not.toBe('Could not save note.');
  expect(result.current.text).toBe('second note');
});
