import { reactModuleUi } from '@jini-ai/admin/core/react';
import { createElement, useContext, useEffect, useState, Suspense, type ReactNode } from 'react';
import { createAdmin } from '@jini-ai/admin/core/module';
import { defineAdminModule } from '@jini-ai/core/contracts/admin-module';
import { media } from '@jini-ai/admin/media/react';
import { mediaPickerToken } from '@jini-ai/admin/contracts/media-picker';
import { createOverlayController, OverlayHost } from '@jini-ai/admin/react/overlays';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { embedPolicy } from './embed-policy-ports';
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
import { securityHostPorts, securitySessionGrants, type SecurityHostPorts } from './security-ports';
import { createHostSecurityModule, type SecurityOwnerPorts } from './security-module.hooks';
import { navigate } from '@jini-ai/admin/shell/lib/router';
import type { PanelRouteContext } from '../../panel-contracts';
import { AdminModulesContext, type Runtime } from './module-context';
export { AdminModulesContext, useHostMediaPicker } from './module-context';

const pickerConsumer = defineAdminModule({ id: 'host-editors', requires: { mediaPicker: mediaPickerToken }, pages: {} });
/** Compose the host modules and their ports; optional domain ports/locale hooks are DI seams.
 * @returns A grant-keyed scope and bindings; callers dispose its admin and overlays on retirement.
 * @throws AdminConfigError if module/port composition is invalid.
 * `grantsReady: false` means the session's permissions are not known yet (D6), as opposed to known and empty.
 * @example createHostAdminScope({ permissions: ['*'] })
 */
export function createHostAdminScope({ permissions }: { permissions: readonly string[] }, { commentsPorts = commentsHostPorts, useCommentsLocaleHook, redirectsPorts = redirectsHostPorts, useRedirectsLocaleHook, seoPorts = seoHostPorts, useSeoLocaleHook, widgetsPorts = widgetsHostPorts, useWidgetsLocaleHook, formsPorts = formsHostPorts, useFormsLocaleHook, securityPorts = securityHostPorts, useSecurityLocaleHook, securityOwnerPorts, grantsReady = true }: { commentsPorts?: CommentsHostPorts; useCommentsLocaleHook?: () => string; redirectsPorts?: RedirectsHostPorts; useRedirectsLocaleHook?: () => string; seoPorts?: SeoHostPorts; useSeoLocaleHook?: () => string; widgetsPorts?: WidgetsHostPorts; useWidgetsLocaleHook?: () => string; formsPorts?: FormsHostPorts; useFormsLocaleHook?: () => string; securityPorts?: SecurityHostPorts; useSecurityLocaleHook?: () => string; securityOwnerPorts?: SecurityOwnerPorts; grantsReady?: boolean } = {}): Runtime {
  const overlays = createOverlayController({});
  const feature = media({ ui: reactModuleUi, overlays }, { headerActions: mediaPublishContribution });
  const commentsFeature = createHostCommentsModule({}, { useAdminLocaleHook: useCommentsLocaleHook });
  const redirectsFeature = createHostRedirectsModule({}, { useAdminLocaleHook: useRedirectsLocaleHook });
  const seoFeature = createHostSeoModule({}, { useAdminLocaleHook: useSeoLocaleHook });
  const widgetsFeature = createHostWidgetsModule({}, { useAdminLocaleHook: useWidgetsLocaleHook });
  const formsFeature = createHostFormsModule({}, { useAdminLocaleHook: useFormsLocaleHook });
  const securityFeature = createHostSecurityModule({}, { useAdminLocaleHook: useSecurityLocaleHook, ownerPorts: securityOwnerPorts });
  // Scope membership uses object identity: host Provider wrappers are copies of the bound modules.
  const admin = createAdmin({ modules: [feature.react.module, commentsFeature.react.module, redirectsFeature.react.module, seoFeature.react.module, widgetsFeature.react.module, formsFeature.react.module, securityFeature.react.module, pickerConsumer], ports: { mediaApi, embedPolicy, mediaEvents, mediaProviders: createMediaProvidersPort({}), ...commentsPorts, ...redirectsPorts, ...seoPorts, ...widgetsPorts, ...formsPorts, ...securityPorts } }, { permissions: [...mediaSessionGrants({ permissions }), ...commentsSessionGrants({ permissions }), ...redirectsSessionGrants({ permissions }), ...seoSessionGrants({ permissions }), ...formsSessionGrants({ permissions }), ...securitySessionGrants({ permissions }, { grantsReady })] });
  return { permissionKey: scopeKey({ permissions, grantsReady }), admin, overlays, picker: admin.scope({ module: pickerConsumer }).mediaPicker, bindings: { media: feature.react, comments: commentsFeature.react, redirects: redirectsFeature.react, seo: seoFeature.react, widgets: widgetsFeature.react, forms: formsFeature.react, security: securityFeature.react } };
}
/** Unresolved and resolved-to-nothing grants are different scopes (D6). A ready scope keeps its
 * plain grant-list key, so only the loading state gets a distinct one. */
function scopeKey({ permissions, grantsReady }: { permissions: readonly string[]; grantsReady: boolean }) {
  return grantsReady ? JSON.stringify(permissions) : JSON.stringify({ permissions, grantsReady });
}
export function useAdminModules({ permissions, grantsReady = true }: { permissions: readonly string[]; grantsReady?: boolean }, _optional: Record<string, never> = {}) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const key = scopeKey({ permissions, grantsReady });
  useEffect(() => {
    const current = createHostAdminScope({ permissions }, { grantsReady });
    setRuntime(current);
    return () => { current.admin.dispose(); current.overlays.dispose(); };
  }, [key]);
  // During grant changes the old scope must not render with stale affordances.
  return runtime?.permissionKey === key ? runtime : null;
}
export interface ModulePanelProps { moduleId: string; pageId: string; route: PanelRouteContext; contributions?: ReactNode; params?: Readonly<Record<string, unknown>> }
// Tovu mounts Jini Media beside the legacy page until parity sign-off. The package still
// describes `/media`, so tab changes must use the host mount or they switch renderers.
const MODULE_PAGE_PATHS: Readonly<Record<string, string>> = { 'media.library': '/media/new', 'security.secrets': '/access-tokens' };
// Host tab ids that differ from the package's: links and bookmarks keep `?tab=site-key`.
const MODULE_TAB_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = { 'security.secrets': { 'site-key': 'root-key' } };
/** Host tab id → package tab id (inward), or package → host (outward). */
function aliasTab({ pageId, tab, outward }: { pageId: string; tab: string; outward: boolean }) {
  const aliases = Object.entries(MODULE_TAB_ALIASES[pageId] ?? {});
  return aliases.find(([host, pkg]) => (outward ? pkg : host) === tab)?.[outward ? 0 : 1] ?? tab;
}
/** A page needs both its React binding and the scope's description (path, tabs). */
function resolveModulePage({ runtime, moduleId, pageId }: { runtime: Runtime; moduleId: string; pageId: string }) {
  const binding = runtime.bindings[moduleId];
  const description = runtime.admin.describe().pages.find(page => page.id === `${moduleId}.${pageId}`);
  const view = binding?.pages[pageId];
  if (!view || !description) throw new Error(`Admin module page unavailable: ${moduleId}.${pageId} has no bound page or is not described by the host admin scope; check the module and page ids`);
  return { binding, view, description };
}
/** One bridge absorbs the legacy route context and the new module/page/tab shape.
 * Future modules supply bindings in the root scope and reuse this adapter. */
export function useModulePanel(props: ModulePanelProps, { loadingContent }: { loadingContent?: ReactNode } = {}) {
  const runtime = useContext(AdminModulesContext);
  if (!runtime) return { content: loadingContent ?? createElement('p', { role: 'status' }, 'Loading admin modules…') };
  const { binding, view, description } = resolveModulePage({ runtime, moduleId: props.moduleId, pageId: props.pageId });
  const onTabChange = ({ tab }: { tab: string }) => {
    const query = new URLSearchParams(props.route.query); query.set('tab', aliasTab({ pageId: description.id, tab, outward: true }));
    navigate({ routePath: `${MODULE_PAGE_PATHS[description.id] ?? description.path}?${query}` }, { replace: true });
  };
  return { content: createElement(binding.Provider, { admin: runtime.admin, children:
    createElement(Suspense, { fallback: loadingContent ?? createElement('p', { role: 'status' }, 'Loading media…') },
      props.contributions, createElement(view.Page, { tabs: view.tabs, description, requestedTab: requestedTab({ pageId: description.id, query: props.route.query }), onTabChange, ...(props.params === undefined ? {} : { params: props.params }) })) }) };
}
function requestedTab({ pageId, query }: { pageId: string; query: URLSearchParams }) {
  const tab = query.get('tab');
  return tab === null ? undefined : aliasTab({ pageId, tab, outward: false });
}
// Host-owned contribution keeps publish behavior out of the reusable media module.
export const mediaPublishContribution = createElement(PublishSectionButton, { section: 'media' });
export function useModuleProviderContent({ runtime, children }: { runtime: Runtime | null; children: ReactNode }, _optional: Record<string, never> = {}) {
  return createElement(AdminModulesContext.Provider, { value: runtime }, children,
    runtime ? createElement(OverlayHost, { controller: runtime.overlays }) : null);
}
