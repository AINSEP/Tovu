import { createContext, createElement, useContext, useEffect, useState, Suspense, type ReactNode, type ComponentType, type LazyExoticComponent } from 'react';
import { createAdmin, defineAdminModule, type AdminInstance } from '@jini-ai/admin/core/module';
import type { ModulePageProps, TabViewProps } from '@jini-ai/admin/react/bind-react';
import { media } from '@jini-ai/admin/media/react';
import { mediaPickerToken, type MediaPickerPort } from '@jini-ai/admin/contracts/media-picker';
import { createOverlayController, OverlayHost } from '@jini-ai/admin/react/overlays';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { mediaApi, mediaEvents, createMediaProvidersPort, mediaSessionGrants } from './media-ports';
import { navigate } from '../../lib/router';
import type { PanelRouteContext } from '../../panels';

const pickerConsumer = defineAdminModule({ id: 'host-editors', requires: { mediaPicker: mediaPickerToken }, pages: {} });
interface ModuleBinding { Provider: ComponentType<{ admin: AdminInstance; children: ReactNode }>; pages: Readonly<Record<string, { Page: LazyExoticComponent<ComponentType<ModulePageProps>>; tabs: Readonly<Record<string, LazyExoticComponent<ComponentType<TabViewProps>>>> }>> }
type Runtime = { permissionKey: string; admin: AdminInstance; bindings: Record<string, ModuleBinding>; picker: MediaPickerPort; overlays: ReturnType<typeof createOverlayController> };
export const AdminModulesContext = createContext<Runtime | null>(null);
export function createHostAdminScope({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}): Runtime {
  const overlays = createOverlayController({});
  const feature = media({ overlays }, { headerActions: mediaPublishContribution });
  const admin = createAdmin({ modules: [feature, pickerConsumer], ports: { mediaApi, mediaEvents, mediaProviders: createMediaProvidersPort({}) } }, { permissions: mediaSessionGrants({ permissions }) });
  return { permissionKey: JSON.stringify(permissions), admin, overlays, picker: admin.scope({ module: pickerConsumer }).mediaPicker, bindings: { media: feature.react } };
}
export function useAdminModules({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const key = JSON.stringify(permissions);
  useEffect(() => {
    const current = createHostAdminScope({ permissions });
    setRuntime(current);
    return () => { current.admin.dispose(); current.overlays.dispose(); };
  }, [key]);
  // During grant changes the old scope must not render with stale affordances.
  return runtime?.permissionKey === key ? runtime : null;
}
export function useHostMediaPicker(_required: Record<string, never> = {}, _optional: Record<string, never> = {}) {
  return useContext(AdminModulesContext)?.picker ?? null;
}
export interface ModulePanelProps { moduleId: string; pageId: string; route: PanelRouteContext; contributions?: ReactNode }
// Tovu mounts Jini Media beside the legacy page until parity sign-off. The package still
// describes `/media`, so tab changes must use the host mount or they switch renderers.
const MODULE_PAGE_PATHS: Readonly<Record<string, string>> = { 'media.library': '/media/new' };
/** One bridge absorbs the legacy route context and the new module/page/tab shape.
 * Future modules supply bindings in the root scope and reuse this adapter. */
export function useModulePanel(props: ModulePanelProps, _optional: Record<string, never> = {}) {
  const runtime = useContext(AdminModulesContext);
  if (!runtime) return { content: createElement('p', { role: 'status' }, 'Loading admin modules…') };
  const binding = runtime.bindings[props.moduleId];
  const description = runtime.admin.describe().pages.find(page => page.id === `${props.moduleId}.${props.pageId}`);
  const view = binding?.pages[props.pageId];
  if (!view || !description) throw new Error(`Admin module page unavailable: ${props.moduleId}.${props.pageId}`);
  const onTabChange = ({ tab }: { tab: string }) => {
    const query = new URLSearchParams(props.route.query); query.set('tab', tab);
    navigate(`${MODULE_PAGE_PATHS[description.id] ?? description.path}?${query}`, { replace: true });
  };
  return { content: createElement(binding.Provider, { admin: runtime.admin, children:
    createElement(Suspense, { fallback: createElement('p', { role: 'status' }, 'Loading media…') },
      props.contributions, createElement(view.Page, { tabs: view.tabs, description, requestedTab: props.route.query.get('tab') ?? undefined, onTabChange })) }) };
}
// Host-owned contribution keeps publish behavior out of the reusable media module.
export const mediaPublishContribution = createElement(PublishSectionButton, { section: 'media' });
export function useModuleProviderContent({ runtime, children }: { runtime: Runtime | null; children: ReactNode }, _optional: Record<string, never> = {}) {
  return createElement(AdminModulesContext.Provider, { value: runtime }, children,
    runtime ? createElement(OverlayHost, { controller: runtime.overlays }) : null);
}
