import { createContext, createElement, useContext, useEffect, useState, Suspense, type ReactNode, type ComponentType, type LazyExoticComponent } from 'react';
import { createAdmin, defineAdminModule, type AdminInstance } from '@jini-ai/admin/core/module';
import type { ModulePageProps, TabViewProps } from '@jini-ai/admin/react/bind-react';
import { media } from '@jini-ai/admin/media/react';
import { mediaPickerToken, type MediaPickerPort } from '@jini-ai/admin/contracts/media-picker';
import { createOverlayController, OverlayHost } from '@jini-ai/admin/react/overlays';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { mediaApi, mediaEvents, createMediaProvidersPort, mediaSessionGrants } from './media-ports';
import { commentsHostPorts, commentsSessionGrants, type CommentsHostPorts } from './comments-ports';
import { createHostCommentsModule } from './comments-module.hooks';
import { redirectsHostPorts, redirectsSessionGrants, type RedirectsHostPorts } from './redirects-ports';
import { createHostRedirectsModule } from './redirects-module.hooks';
import { seoHostPorts, seoSessionGrants, type SeoHostPorts } from './seo-ports';
import { createHostSeoModule } from './seo-module.hooks';
import { widgetsHostPorts, type WidgetsHostPorts } from './widgets-ports';
import { createHostWidgetsModule } from './widgets-module.hooks';
import { formsHostPorts, formsSessionGrants, type FormsHostPorts } from './forms-ports';
import { createHostFormsModule } from './forms-module.hooks';
import { navigate } from '../../lib/router';
import type { PanelRouteContext } from '../../panels';

const pickerConsumer = defineAdminModule({ id: 'host-editors', requires: { mediaPicker: mediaPickerToken }, pages: {} });
type HostModulePageProps = ModulePageProps & { params?: Readonly<Record<string, unknown>> };
interface ModuleBinding { Provider: ComponentType<{ admin: AdminInstance; children: ReactNode }>; loadingContent?: ReactNode; pages: Readonly<Record<string, { Page: LazyExoticComponent<ComponentType<HostModulePageProps>>; tabs: Readonly<Record<string, LazyExoticComponent<ComponentType<TabViewProps>>>> }>> }
type Runtime = { permissionKey: string; admin: AdminInstance; bindings: Record<string, ModuleBinding>; picker: MediaPickerPort; overlays: ReturnType<typeof createOverlayController> };
export const AdminModulesContext = createContext<Runtime | null>(null);
/** Compose the host modules and their ports; optional domain ports/locale hooks are DI seams.
 * @returns A grant-keyed scope and bindings; callers dispose its admin and overlays on retirement.
 * @throws AdminConfigError if module/port composition is invalid.
 * @example createHostAdminScope({ permissions: ['*'] })
 */
export function createHostAdminScope({ permissions }: { permissions: readonly string[] }, { commentsPorts = commentsHostPorts, useCommentsLocaleHook, redirectsPorts = redirectsHostPorts, useRedirectsLocaleHook, seoPorts = seoHostPorts, useSeoLocaleHook, widgetsPorts = widgetsHostPorts, useWidgetsLocaleHook, formsPorts = formsHostPorts, useFormsLocaleHook }: { commentsPorts?: CommentsHostPorts; useCommentsLocaleHook?: () => string; redirectsPorts?: RedirectsHostPorts; useRedirectsLocaleHook?: () => string; seoPorts?: SeoHostPorts; useSeoLocaleHook?: () => string; widgetsPorts?: WidgetsHostPorts; useWidgetsLocaleHook?: () => string; formsPorts?: FormsHostPorts; useFormsLocaleHook?: () => string } = {}): Runtime {
  const overlays = createOverlayController({});
  const feature = media({ overlays }, { headerActions: mediaPublishContribution });
  const commentsFeature = createHostCommentsModule({}, { useAdminLocaleHook: useCommentsLocaleHook });
  const redirectsFeature = createHostRedirectsModule({}, { useAdminLocaleHook: useRedirectsLocaleHook });
  const seoFeature = createHostSeoModule({}, { useAdminLocaleHook: useSeoLocaleHook });
  const widgetsFeature = createHostWidgetsModule({}, { useAdminLocaleHook: useWidgetsLocaleHook });
  const formsFeature = createHostFormsModule({}, { useAdminLocaleHook: useFormsLocaleHook });
  // Scope membership uses object identity: host Provider wrappers are copies of the bound modules.
  const admin = createAdmin({ modules: [feature.react.module, commentsFeature.react.module, redirectsFeature.react.module, seoFeature.react.module, widgetsFeature.react.module, formsFeature.react.module, pickerConsumer], ports: { mediaApi, mediaEvents, mediaProviders: createMediaProvidersPort({}), ...commentsPorts, ...redirectsPorts, ...seoPorts, ...widgetsPorts, ...formsPorts } }, { permissions: [...mediaSessionGrants({ permissions }), ...commentsSessionGrants({ permissions }), ...redirectsSessionGrants({ permissions }), ...seoSessionGrants({ permissions }), ...formsSessionGrants({ permissions })] });
  return { permissionKey: JSON.stringify(permissions), admin, overlays, picker: admin.scope({ module: pickerConsumer }).mediaPicker, bindings: { media: feature.react, comments: commentsFeature.react, redirects: redirectsFeature.react, seo: seoFeature.react, widgets: widgetsFeature.react, forms: formsFeature.react } };
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
export interface ModulePanelProps { moduleId: string; pageId: string; route: PanelRouteContext; contributions?: ReactNode; params?: Readonly<Record<string, unknown>> }
// Tovu mounts Jini Media beside the legacy page until parity sign-off. The package still
// describes `/media`, so tab changes must use the host mount or they switch renderers.
const MODULE_PAGE_PATHS: Readonly<Record<string, string>> = { 'media.library': '/media/new' };
/** One bridge absorbs the legacy route context and the new module/page/tab shape.
 * Future modules supply bindings in the root scope and reuse this adapter. */
export function useModulePanel(props: ModulePanelProps, { loadingContent }: { loadingContent?: ReactNode } = {}) {
  const runtime = useContext(AdminModulesContext);
  if (!runtime) return { content: loadingContent ?? createElement('p', { role: 'status' }, 'Loading admin modules…') };
  const binding = runtime.bindings[props.moduleId];
  const description = runtime.admin.describe().pages.find(page => page.id === `${props.moduleId}.${props.pageId}`);
  const view = binding?.pages[props.pageId];
  if (!view || !description) throw new Error(`Admin module page unavailable: ${props.moduleId}.${props.pageId}`);
  const onTabChange = ({ tab }: { tab: string }) => {
    const query = new URLSearchParams(props.route.query); query.set('tab', tab);
    navigate(`${MODULE_PAGE_PATHS[description.id] ?? description.path}?${query}`, { replace: true });
  };
  return { content: createElement(binding.Provider, { admin: runtime.admin, children:
    createElement(Suspense, { fallback: binding.loadingContent ?? loadingContent ?? createElement('p', { role: 'status' }, 'Loading media…') },
      props.contributions, createElement(view.Page, { tabs: view.tabs, description, requestedTab: props.route.query.get('tab') ?? undefined, onTabChange, ...(props.params === undefined ? {} : { params: props.params }) })) }) };
}
// Host-owned contribution keeps publish behavior out of the reusable media module.
export const mediaPublishContribution = createElement(PublishSectionButton, { section: 'media' });
export function useModuleProviderContent({ runtime, children }: { runtime: Runtime | null; children: ReactNode }, _optional: Record<string, never> = {}) {
  return createElement(AdminModulesContext.Provider, { value: runtime }, children,
    runtime ? createElement(OverlayHost, { controller: runtime.overlays }) : null);
}
