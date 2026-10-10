import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchQueryProvider } from './fetch-query-provider.test-helper';
import { FetchQueryProvider as BuiltinProvider } from '@jini-ai/ui/fetch-query';
import type { ReactNode } from 'react';
import type { AdminMenu, AdminPost, AdminWorkspace } from '@/lib/api';
import { usePageEditor } from '@/features/pages/hooks/use-page-editor.hooks';
import { createFakePageEditorPort } from '@/features/pages/hooks/page-editor-dependencies.hooks';
import { createFakeThemeCanvasPort } from '@/features/pages/hooks/theme-canvas-dependencies.hooks';
import { useMenuEditor } from '@/features/menus/hooks/use-menu-editor.hooks';
import { createFakeMenusPort } from '@/features/menus/hooks/menus-dependencies.hooks';
import { useWorkspace } from '@/features/workspace/hooks/use-workspace.hooks';
import { createFakeWorkspacePort } from '@/features/workspace/hooks/workspace-dependencies.hooks';
import { useAgentPluginMemory } from '@/features/plugins/hooks/use-agent-plugin-memory.hooks';
import type { AgentPluginMemoryPort, PluginMemoryListing } from '@/features/plugins/hooks/agent-plugin-memory-port.hooks';

// fq: reopen in the SAME provider, with a controlled read pending. Cold-cache tests miss this bug.
beforeEach(() => vi.stubGlobal('fetch', async () => Response.json({ data: [] })));
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const t = (key: string) => key;

describe.each(['tanstack', 'builtin'] as const)('fresh form hydration with %s', adapter => {
  function Scope({ children }: { children?: ReactNode }) {
    return adapter === 'builtin' ? <BuiltinProvider>{children}</BuiltinProvider> : <FetchQueryProvider>{children}</FetchQueryProvider>;
  }
  it('reopens a page at the fresh version and preserves subsequent local edits', async () => {
    const page: AdminPost = { id: 'p1', workspaceId: 'ws1', kind: 'page', slug: 'landing', title: 'Cached page',
      status: 'draft', bodyFormat: 'html', bodyHtml: '<p>Cached</p>', bodyJson: {}, version: 1, updatedAt: '2026-10-01T00:00:00Z' };
    const port = createFakePageEditorPort({ page });
    const deps = { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: () => {}, t: (_locale: string, key: string) => key, locale: 'en' };
    let current!: ReturnType<typeof usePageEditor>;
    function Probe() { current = usePageEditor('landing', deps); return null; }
    const view = render(<Scope><Probe /></Scope>);
    await waitFor(() => expect(current.title).toBe('Cached page'));
    view.rerender(<Scope />);
    port.simulateExternalWrite({ title: 'Fresh page', bodyHtml: '<p>Fresh</p>' });
    const fresh = deferred<{ post: AdminPost }>();
    port.getPage = () => fresh.promise;
    view.rerender(<Scope><Probe /></Scope>);
    expect(current.page).toBeNull();
    await act(async () => fresh.resolve({ post: port.current }));
    await waitFor(() => expect(current.title).toBe('Fresh page'));
    expect(current.page?.version).toBe(2);
    expect(current.html).toBe('<p>Fresh</p>');
    act(() => current.setTitle('My draft'));
    view.rerender(<Scope><Probe /></Scope>);
    expect(current.title).toBe('My draft');
    await act(async () => { await current.save(); });
    expect(port.updatePostCalls.at(-1)?.expectedVersion).toBe(2);
  });
  it('reopens a menu at the fresh version before saving', async () => {
    const menu: AdminMenu = { id: 'm1', workspaceId: 'ws1', slug: 'main', title: 'Cached menu', status: 'draft',
      items: [], locations: [], updatedAt: '2026-10-01T00:00:00Z', version: 1 };
    const port = createFakeMenusPort({ menus: [menu] });
    const deps = { port, navigate: () => {}, t };
    let current!: ReturnType<typeof useMenuEditor>;
    function Probe() { current = useMenuEditor('main', deps); return null; }
    const view = render(<Scope><Probe /></Scope>);
    await waitFor(() => expect(current.title).toBe('Cached menu'));
    view.rerender(<Scope />);
    const fresh = deferred<{ menu: AdminMenu }>();
    port.getMenu = () => fresh.promise;
    view.rerender(<Scope><Probe /></Scope>);
    expect(current.loading).toBe(true);
    expect(current.title).toBe('');
    await act(async () => fresh.resolve({ menu: { ...menu, title: 'Fresh menu', version: 4 } }));
    await waitFor(() => expect(current.title).toBe('Fresh menu'));
    expect(current.menu?.version).toBe(4);
    let savedBasis: number | undefined;
    port.updateMenuTree = async input => { savedBasis = input.expectedVersion; return { menu: { ...menu, version: 5 } }; };
    await act(async () => { await current.save(); });
    expect(savedBasis).toBe(4);
  });
  it('reopens workspace fields from the fresh read and retains an edited draft', async () => {
    const workspace: AdminWorkspace = { id: 'ws1', name: 'Cached workspace', slug: 'cached', createdAt: '2026-10-01T00:00:00Z' };
    const port = createFakeWorkspacePort({ workspace });
    let current!: ReturnType<typeof useWorkspace>;
    function Probe() { current = useWorkspace({ port }); return null; }
    const view = render(<Scope><Probe /></Scope>);
    await waitFor(() => expect(current.name).toBe('Cached workspace'));
    view.rerender(<Scope />);
    const fresh = deferred<{ workspace: AdminWorkspace }>();
    port.getWorkspace = () => fresh.promise;
    view.rerender(<Scope><Probe /></Scope>);
    expect(current.name).toBe('');
    await act(async () => fresh.resolve({ workspace: { ...workspace, name: 'Fresh workspace', slug: 'fresh' } }));
    await waitFor(() => expect(current.name).toBe('Fresh workspace'));
    expect(current.slug).toBe('fresh');
    act(() => current.setName('My rename'));
    view.rerender(<Scope><Probe /></Scope>);
    expect(current.name).toBe('My rename');
  });
  it('reopens unversioned plugin notes from the fresh read before enabling save', async () => {
    const listing = (text: string): PluginMemoryListing => ({ pluginId: 'example', notes: [{ relativePath: 'project.md', text }],
      learned: [], limits: { learned: 1048576, notes: 16384, files: 128 } });
    let state = listing('Cached note');
    const saved: string[] = [];
    const port: AgentPluginMemoryPort = { read: async () => state, saveNote: async input => { saved.push(input.text); return listing(input.text); } };
    let current!: ReturnType<typeof useAgentPluginMemory>;
    function Probe() { current = useAgentPluginMemory({ pluginId: 'example', port, t }); return null; }
    const view = render(<Scope><Probe /></Scope>);
    await waitFor(() => expect(current.text).toBe('Cached note'));
    view.rerender(<Scope />);
    const fresh = deferred<PluginMemoryListing>();
    port.read = () => fresh.promise;
    view.rerender(<Scope><Probe /></Scope>);
    expect(current.editorDisabled).toBe(true);
    expect(current.text).toBe('');
    await act(async () => { state = listing('Fresh note'); fresh.resolve(state); });
    await waitFor(() => expect(current.text).toBe('Fresh note'));
    act(() => current.setText('Fresh note plus my edit'));
    await act(async () => { await current.save(); });
    expect(saved).toEqual(['Fresh note plus my edit']);
  });
});
