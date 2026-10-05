import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { lazy, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdmin, defineAdminModule } from '@jini-ai/admin/core/module';
import type { ModulePageProps } from '@jini-ai/admin/react/bind-react';
import { createOverlayController } from '@jini-ai/admin/react/overlays';
import { AdminModulesContext, createHostAdminScope, mediaPublishContribution, useAdminModules, useHostMediaPicker, useModulePanel, useModuleProviderContent } from '../modules.hooks';
import { PublishSectionButton } from '../../../features/publish-content/PublishSectionButton';

/**
 * The host bridge between Tovu's panel routes and Jini admin modules. `media-swap.unit.test.tsx`
 * drives the real media page through it end to end; this file pins the bridge's own branches:
 * the grant-change guard, scope disposal, the unavailable-page error, the loading states, and the
 * tab-path fallback a future module (one without a host mount override) takes.
 */

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

type Runtime = NonNullable<ReturnType<typeof useAdminModules>>;

/** A second, real module the media-only host does not ship: proves the generic path. */
function reportsRuntime(): Runtime {
  const reports = defineAdminModule({ id: 'reports', pages: { overview: { path: '/reports', label: 'Reports', tabs: { daily: { label: 'Daily' }, weekly: { label: 'Weekly' } } } } });
  const admin = createAdmin({ modules: [reports], ports: {} });
  function Page({ requestedTab, onTabChange, description }: ModulePageProps) {
    return <div><p>{`${description.id} tab=${requestedTab ?? 'none'}`}</p><button type="button" onClick={() => onTabChange?.({ tab: 'weekly' })}>Weekly</button></div>;
  }
  const binding = {
    Provider: ({ children }: { children: ReactNode }) => <section aria-label="reports provider">{children}</section>,
    pages: { overview: { Page: lazy(async () => ({ default: Page })), tabs: {} } },
  };
  return { permissionKey: '[]', admin, bindings: { reports: binding } as unknown as Runtime['bindings'], picker: null as unknown as Runtime['picker'], overlays: createOverlayController({}) };
}

function withRuntime(runtime: Runtime | null) {
  return ({ children }: { children: ReactNode }) => <AdminModulesContext.Provider value={runtime}>{children}</AdminModulesContext.Provider>;
}

describe('createHostAdminScope', () => {
  it('describes the media library page, exposes the picker and keys the scope by its grants', () => {
    const scope = createHostAdminScope({ permissions: ['media.read'] });
    expect(scope.permissionKey).toBe('["media.read"]');
    expect(scope.admin.describe().pages.map((page) => [page.id, page.path])).toEqual([['media.library', '/media']]);
    expect(typeof scope.picker.pick).toBe('function');
    expect(Object.keys(scope.bindings)).toEqual(['media']);
    expect(Object.keys(scope.bindings.media!.pages)).toEqual(['library']);
    scope.admin.dispose(); scope.overlays.dispose();
  });
});

describe('useAdminModules', () => {
  it('builds a scope after mount, hides it while grants change, and disposes the replaced scope', async () => {
    let permissions: readonly string[] = ['media.read'];
    const { result, rerender, unmount } = renderHook(() => useAdminModules({ permissions }));
    const first = result.current!;
    expect(first.permissionKey).toBe('["media.read"]');
    const firstAdminDispose = vi.spyOn(first.admin, 'dispose');
    const firstOverlaysDispose = vi.spyOn(first.overlays, 'dispose');

    // Same grants in a new array: same key, same scope, nothing disposed.
    permissions = ['media.read'];
    rerender();
    expect(result.current).toBe(first);
    expect(firstAdminDispose).not.toHaveBeenCalled();

    permissions = ['media.read', 'media.providers'];
    rerender();
    const second = result.current!;
    expect(second).not.toBe(first);
    expect(second.permissionKey).toBe('["media.read","media.providers"]');
    expect(firstAdminDispose).toHaveBeenCalledOnce();
    expect(firstOverlaysDispose).toHaveBeenCalledOnce();

    const secondDispose = vi.spyOn(second.admin, 'dispose');
    unmount();
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it('never returns a scope built for different grants than the current render', () => {
    let permissions: readonly string[] = [];
    const seen: (string | null)[] = [];
    const { rerender } = renderHook(() => { const runtime = useAdminModules({ permissions }); seen.push(runtime?.permissionKey ?? null); });
    permissions = ['*'];
    rerender();
    // Each non-null scope seen matches the grants of the render that returned it.
    expect(seen[0]).toBeNull();
    expect(seen).toContain('[]');
    const firstStar = seen.indexOf('["*"]');
    expect(firstStar).toBeGreaterThan(seen.indexOf('[]'));
    const between = seen.slice(seen.lastIndexOf('[]') + 1, firstStar);
    expect(between.length).toBeGreaterThan(0);
    expect(between.every((key) => key === null)).toBe(true);
  });
});

describe('useHostMediaPicker', () => {
  it('is null outside an admin scope and the scope picker inside one', () => {
    expect(renderHook(() => useHostMediaPicker()).result.current).toBeNull();
    const scope = createHostAdminScope({ permissions: ['*'] });
    const { result } = renderHook(() => useHostMediaPicker(), { wrapper: withRuntime(scope) });
    expect(result.current).toBe(scope.picker);
    scope.admin.dispose(); scope.overlays.dispose();
  });
});

describe('useModulePanel', () => {
  const route = (query = '') => ({ view: null, params: {}, query: new URLSearchParams(query) });

  it('renders a loading status before the scope exists', () => {
    const { result } = renderHook(() => useModulePanel({ moduleId: 'media', pageId: 'library', route: route() }));
    render(<>{result.current.content}</>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading admin modules…');
  });

  it.each([
    ['an unknown module', 'billing', 'overview'],
    ['an unknown page of a bound module', 'reports', 'missing'],
  ])('throws for %s', (_label, moduleId, pageId) => {
    expect(() => renderHook(() => useModulePanel({ moduleId, pageId, route: route() }), { wrapper: withRuntime(reportsRuntime()) }))
      .toThrow(`Admin module page unavailable: ${moduleId}.${pageId}`);
  });

  it('throws when a binding exists but the scope does not describe the page', () => {
    const runtime = reportsRuntime();
    const hidden = { ...runtime, admin: createAdmin({ modules: [], ports: {} }) };
    expect(() => renderHook(() => useModulePanel({ moduleId: 'reports', pageId: 'overview', route: route() }), { wrapper: withRuntime(hidden) }))
      .toThrow('Admin module page unavailable: reports.overview');
  });

  it('mounts the page inside its provider and contributions, passing the requested tab', async () => {
    const runtime = reportsRuntime();
    const { result } = renderHook(() => useModulePanel({ moduleId: 'reports', pageId: 'overview', route: route('tab=daily'), contributions: <button type="button">Extra</button> }), { wrapper: withRuntime(runtime) });
    render(<>{result.current.content}</>);
    const page = await screen.findByText('reports.overview tab=daily');
    const provider = screen.getByRole('region', { name: 'reports provider' });
    expect(provider).toContainElement(page);
    expect(provider).toContainElement(screen.getByRole('button', { name: 'Extra' }));
  });

  it('shows the media loading fallback while the page module loads, and no requested tab when absent', async () => {
    const runtime = reportsRuntime();
    const { result } = renderHook(() => useModulePanel({ moduleId: 'reports', pageId: 'overview', route: route() }), { wrapper: withRuntime(runtime) });
    render(<>{result.current.content}</>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading media…');
    expect(await screen.findByText('reports.overview tab=none')).toBeInTheDocument();
  });

  it('navigates a tab change to the module page path, keeping other query values and history length', async () => {
    window.history.replaceState(null, '', '/admin/reports?tab=daily&from=nav');
    const runtime = reportsRuntime();
    const { result } = renderHook(() => useModulePanel({ moduleId: 'reports', pageId: 'overview', route: route('tab=daily&from=nav') }), { wrapper: withRuntime(runtime) });
    render(<>{result.current.content}</>);
    const weekly = await screen.findByRole('button', { name: 'Weekly' });
    const length = window.history.length;
    act(() => weekly.click());
    expect(window.location.pathname).toBe('/admin/reports');
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('weekly');
    expect(new URLSearchParams(window.location.search).get('from')).toBe('nav');
    expect(window.history.length).toBe(length);
  });
});

describe('useModuleProviderContent', () => {
  it('provides the scope and mounts its overlay host only when a scope exists', async () => {
    const scope = createHostAdminScope({ permissions: ['*'] });
    function Probe() { return <p>{useHostMediaPicker() === scope.picker ? 'picker from scope' : 'no picker'}</p>; }
    const withScope = renderHook(() => useModuleProviderContent({ runtime: scope, children: <Probe /> }));
    const { container, unmount } = render(<>{withScope.result.current}</>);
    expect(screen.getByText('picker from scope')).toBeInTheDocument();
    act(() => { void scope.overlays.open({ render: () => <p>overlay body</p> }); });
    const host = container.querySelector('[data-jini-part="admin.overlays"]');
    expect(host).not.toBeNull();
    expect(host).toContainElement(await screen.findByText('overlay body'));
    unmount();
    scope.admin.dispose(); scope.overlays.dispose();

    const without = renderHook(() => useModuleProviderContent({ runtime: null, children: <Probe /> }));
    const bare = render(<>{without.result.current}</>);
    expect(screen.getByText('no picker')).toBeInTheDocument();
    expect(bare.container.querySelector('[data-jini-part="admin.overlays"]')).toBeNull();
  });
});

describe('mediaPublishContribution', () => {
  it('is the host publish button for the media section', () => {
    expect(mediaPublishContribution.type).toBe(PublishSectionButton);
    expect(mediaPublishContribution.props).toEqual({ section: 'media' });
  });
});
