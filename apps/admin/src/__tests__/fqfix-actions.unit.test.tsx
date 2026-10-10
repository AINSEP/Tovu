import { act, renderHook, waitFor } from './fetch-query-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecovery } from '@/features/recovery/hooks/use-recovery.hooks';
import { createFakeRecoveryPort } from '@/features/recovery/hooks/recovery-dependencies.hooks';
import { usePlugins } from '@/features/plugins/hooks/use-plugins.hooks';
import { createFakePluginsPort } from '@/features/plugins/hooks/plugins-dependencies.hooks';
import { useSkills } from '@/features/skills/use-skills.hooks';
import { useInvalidate } from '@jini-ai/ui/fetch-query';
import type { InstalledSkill } from '@/features/skills/api';

beforeEach(() => vi.stubGlobal('fetch', async () => Response.json({ data: [] })));
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('fq action completion', () => {
  it('clears a failed recovery action on retry and remains creating until the refreshed list settles', async () => {
    const port = createFakeRecoveryPort({ status: { costClass: 'cheap', banner: null }, points: [] });
    const { result } = renderHook(() => useRecovery({ port }));
    await waitFor(() => expect(result.current.points).toEqual([]));
    port.createRestorePoint = async () => { throw new Error('Capture refused'); };
    await act(async () => { await result.current.createRestorePoint(); });
    expect(result.current.error).toBe('Capture refused');
    port.createRestorePoint = async () => ({ restorePoint: { id: 'rp-new', costClass: 'cheap', kind: 'full' } });
    const refresh = deferred<Awaited<ReturnType<typeof port.listRecoveryRestorePoints>>>();
    port.listRecoveryRestorePoints = () => refresh.promise;
    let completed = false;
    let action!: Promise<void>;
    act(() => { action = result.current.createRestorePoint().then(() => { completed = true; }); });
    expect(result.current.error).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(result.current.creating).toBe(true);
    expect(completed).toBe(false);
    const point = { id: 'rp-new', costClass: 'cheap' as const, kind: 'full' as const, trigger: 'manual', watermarkAtCapture: 8, createdAt: '2026-10-09T00:00:00Z' };
    await act(async () => { refresh.resolve({ items: [point] }); await action; });
    await waitFor(() => expect(result.current.points).toEqual([point]));
    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it.each(['toggle', 'remove'] as const)('keeps a plugin row locked through its %s refetch', async kind => {
    const plugin = { id: 'p1', name: 'Example', version: '1.0.0', source: 'site' as const, tier: 'tier-1' as const,
      status: 'valid' as const, enabled: false, quarantine: null, errors: [] };
    const port = createFakePluginsPort({ plugins: [plugin] });
    const { result } = renderHook(() => usePlugins({ port, locale: 'en', t: key => key }));
    await waitFor(() => expect(result.current.plugins).toEqual([plugin]));
    const refresh = deferred<Awaited<ReturnType<typeof port.listPlugins>>>();
    let refreshStarted = false;
    port.listPlugins = () => { refreshStarted = true; return refresh.promise; };
    let completed = false;
    let action!: Promise<void>;
    act(() => { action = (kind === 'toggle' ? result.current.onToggleEnabled(plugin) : result.current.onRemovePlugin(plugin))
      .then(() => { completed = true; }); });
    await waitFor(() => expect(refreshStarted).toBe(true));
    expect(completed).toBe(false);
    expect(result.current.rowSavingId).toBe('p1');
    const plugins = kind === 'toggle' ? [{ ...plugin, enabled: true }] : [];
    await act(async () => { refresh.resolve({ plugins }); await action; });
    await waitFor(() => expect(result.current.plugins).toEqual(plugins));
    expect(result.current.rowSavingId).toBeNull();
  });

  it('clears a failed skill action on retry and holds busy until the authoritative list arrives', async () => {
    const skill: InstalledSkill = { toolId: 'skill_example', name: 'example', description: 'Example', enabled: true, source: 'uploaded' };
    let fail = true;
    const refresh = deferred<InstalledSkill[]>();
    let refreshStarted = false;
    const port = { listSkills: async () => [skill], removeSkill: async () => {}, enableSkill: async () => {
      if (fail) throw new Error('Skill refused');
    } };
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    act(() => result.current.rows[0]!.onToggleEnabled());
    await waitFor(() => expect(result.current.error).toBe('Skill refused'));
    fail = false;
    port.listSkills = () => { refreshStarted = true; return refresh.promise; };
    act(() => result.current.rows[0]!.onToggleEnabled());
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(refreshStarted).toBe(true));
    expect(result.current.busy).toBe(true);
    await act(async () => refresh.resolve([{ ...skill, enabled: false }]));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.skills).toEqual([{ ...skill, enabled: false }]);
    expect(result.current.error).toBeNull();
  });

  it('awaits the plugin install refetch before announcing installation', async () => {
    const port = createFakePluginsPort({ plugins: [], installSources: ['folder'] });
    const plugin = { id: 'example', name: 'Example', version: '1.0.0', tier: 'tier-1', capabilities: [], hooks: [],
      hasCode: false, digest: 'reviewed-digest', contentTypes: [], conflicts: [] };
    const installPort = { preview: async () => ({ plugin }), install: async () => ({ plugin }) };
    const { result } = renderHook(() => usePlugins({ port, installPort, locale: 'en', t: key => key }));
    await waitFor(() => expect(result.current.plugins).toEqual([]));
    act(() => result.current.install!.setFolder('/example'));
    await act(async () => { await result.current.install!.review(); });
    const refresh = deferred<Awaited<ReturnType<typeof port.listPlugins>>>();
    let refreshStarted = false;
    port.listPlugins = () => { refreshStarted = true; return refresh.promise; };
    let action!: Promise<void>;
    act(() => { action = result.current.install!.install(); });
    await waitFor(() => expect(refreshStarted).toBe(true));
    expect(result.current.install!.busy).toBe(true);
    expect(result.current.install!.installedMessage).toBeNull();
    await act(async () => { refresh.resolve({ plugins: [] }); await action; });
    expect(result.current.install!.busy).toBe(false);
    expect(result.current.install!.installedMessage).toBe('Example is installed and switched off. Turn it on in Downloaded.');
  });

  it('keeps skill installation on Add until the refreshed skills arrive', async () => {
    const port = { listSkills: async (): Promise<InstalledSkill[]> => [], removeSkill: async () => {}, enableSkill: async () => {} };
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.skills).toEqual([]));
    act(() => result.current.onShowAdd());
    await waitFor(() => expect(result.current.activeTabId).toBe('add'));
    const refresh = deferred<InstalledSkill[]>();
    let refreshStarted = false;
    port.listSkills = () => { refreshStarted = true; return refresh.promise; };
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(url).toBe('/api/admin/v1/workspaces/workspace-local/skills');
      expect(init.method).toBe('POST');
      return Response.json({ installed: true });
    });
    act(() => result.current.install.propose({ githubUrl: 'https://example.com/skill' }));
    let action!: Promise<void>;
    act(() => { action = result.current.install.confirm(); });
    await waitFor(() => expect(refreshStarted).toBe(true));
    expect(result.current.install.busy).toBe(true);
    expect(result.current.activeTabId).toBe('add');
    const skill: InstalledSkill = { toolId: 'skill_example', name: 'example', description: 'Example', enabled: true, source: 'uploaded' };
    await act(async () => { refresh.resolve([skill]); await action; });
    await waitFor(() => expect(result.current.activeTabId).toBe('skills'));
    expect(result.current.install.busy).toBe(false);
    expect(result.current.skills).toEqual([skill]);
  });
});


describe('accepted writes with failed refreshes', () => {
  it('keeps recovery read errors in the query and clears them without duplicating the restore point', async () => {
    const port = createFakeRecoveryPort({ points: [] });
    const { result } = renderHook(() => ({ recovery: useRecovery({ port }), invalidate: useInvalidate() }));
    await waitFor(() => expect(result.current.recovery.points).toEqual([]));
    const read = port.listRecoveryRestorePoints;
    let writes = 0;
    const create = port.createRestorePoint;
    port.createRestorePoint = async options => { writes++; return create(options); };
    port.listRecoveryRestorePoints = async () => { throw new Error('Recovery refresh failed'); };
    await act(async () => { await result.current.recovery.createRestorePoint(); });
    await waitFor(() => expect(result.current.recovery.error).toBe('Recovery refresh failed'));
    expect(result.current.recovery.creating).toBe(false);
    expect(port.points).toHaveLength(1);
    expect(writes).toBe(1);
    expect(result.current.recovery.error).not.toBe('Failed to create restore point');
    port.listRecoveryRestorePoints = read;
    act(() => result.current.invalidate({ key: ['recovery'] }));
    await waitFor(() => expect(result.current.recovery.error).toBeNull());
    expect(result.current.recovery.points).toEqual(port.points);
    expect(writes).toBe(1);
  });

  it.each(['toggle', 'remove'] as const)('reports a failed plugin %s refresh separately from the accepted write', async kind => {
    const plugin = { id: 'p-refresh', name: 'Example', version: '1.0.0', source: 'site' as const, tier: 'tier-1' as const,
      status: 'valid' as const, enabled: false, quarantine: null, errors: [] };
    const port = createFakePluginsPort({ plugins: [plugin] });
    const { result } = renderHook(() => usePlugins({ port, locale: 'en', t: key => key }));
    await waitFor(() => expect(result.current.plugins).toEqual([plugin]));
    port.listPlugins = async () => { throw new Error('Plugin roster refresh failed'); };
    await act(async () => { await (kind === 'toggle' ? result.current.onToggleEnabled(plugin) : result.current.onRemovePlugin(plugin)); });
    await waitFor(() => expect(result.current.error).toBe('Plugin roster refresh failed'));
    expect(result.current.rowError).toBeNull();
    expect(result.current.rowSavingId).toBeNull();
    expect(port.plugins).toEqual(kind === 'toggle' ? [{ ...plugin, enabled: true }] : []);
  });

  it.each(['toggle', 'remove'] as const)('preserves a successful skill %s and lets the query recover independently', async kind => {
    const skill: InstalledSkill = { toolId: 'skill_refresh', name: 'refresh', description: 'Example', enabled: true, source: 'uploaded' };
    let writes = 0;
    const port = { listSkills: async () => [skill], removeSkill: async () => { writes++; }, enableSkill: async () => { writes++; } };
    const { result } = renderHook(() => ({ skills: useSkills({ port }), invalidate: useInvalidate() }));
    await waitFor(() => expect(result.current.skills.rows).toHaveLength(1));
    port.listSkills = async () => { throw new Error('Skill roster refresh failed'); };
    if (kind === 'remove') {
      act(() => result.current.skills.rows[0]!.onRemove());
      act(() => result.current.skills.onConfirmRemove());
    } else act(() => result.current.skills.rows[0]!.onToggleEnabled());
    await waitFor(() => expect(result.current.skills.error).toBe('Skill roster refresh failed'));
    await waitFor(() => expect(result.current.skills.busy).toBe(false));
    expect(result.current.skills.removing).toBeNull();
    expect(writes).toBe(1);
    port.listSkills = async () => kind === 'remove' ? [] : [{ ...skill, enabled: false }];
    act(() => result.current.invalidate({ key: ['skills'] }));
    await waitFor(() => expect(result.current.skills.error).toBeNull());
    expect(result.current.skills.skills).toEqual(kind === 'remove' ? [] : [{ ...skill, enabled: false }]);
    expect(writes).toBe(1);
  });

  it('announces an accepted plugin install even when refreshing the roster fails', async () => {
    const port = createFakePluginsPort({ plugins: [], installSources: ['folder'] });
    const plugin = { id: 'example', name: 'Example', version: '1.0.0', tier: 'tier-1', capabilities: [], hooks: [],
      hasCode: false, digest: 'reviewed-digest', contentTypes: [], conflicts: [] };
    let writes = 0;
    const installPort = { preview: async () => ({ plugin }), install: async () => { writes++; return { plugin }; } };
    const { result } = renderHook(() => usePlugins({ port, installPort, locale: 'en', t: key => key }));
    await waitFor(() => expect(result.current.plugins).toEqual([]));
    act(() => result.current.install!.setFolder('/example'));
    await act(async () => { await result.current.install!.review(); });
    port.listPlugins = async () => { throw new Error('Installed plugin roster refresh failed'); };
    await act(async () => { await result.current.install!.install(); });
    expect(result.current.install!.installedMessage).toBe('Example is installed and switched off. Turn it on in Downloaded.');
    expect(result.current.install!.error).toBeNull();
    expect(result.current.error).toBe('Installed plugin roster refresh failed');
    expect(writes).toBe(1);
  });

  it('settles an accepted skill install on Skills even when its roster refresh fails', async () => {
    const port = { listSkills: async (): Promise<InstalledSkill[]> => [], removeSkill: async () => {}, enableSkill: async () => {} };
    const { result } = renderHook(() => useSkills({ port }));
    await waitFor(() => expect(result.current.skills).toEqual([]));
    act(() => result.current.onShowAdd());
    await waitFor(() => expect(result.current.activeTabId).toBe('add'));
    port.listSkills = async () => { throw new Error('Installed skill roster refresh failed'); };
    let writes = 0;
    vi.stubGlobal('fetch', async () => { writes++; return Response.json({ installed: true }); });
    act(() => result.current.install.propose({ githubUrl: 'https://example.com/skill' }));
    await act(async () => { await result.current.install.confirm(); });
    await waitFor(() => expect(result.current.activeTabId).toBe('skills'));
    expect(result.current.install.error).toBeNull();
    expect(result.current.error).toBe('Installed skill roster refresh failed');
    expect(writes).toBe(1);
  });
});
