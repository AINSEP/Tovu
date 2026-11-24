import { reactModuleUi, type LazyTabView } from '@jini-ai/admin/core/react';
import type { HostModulePage } from './module-context';
import { createElement, useMemo, type ReactElement } from 'react';
import { seo, type SeoReactOptions, type SeoMediaPickerSlotProps } from '@jini-ai/admin/seo/react';
import { formDateDisplay } from '@jini-ai/admin/forms';
import type { UseAdminLocaleHook } from '@jini-ai/admin/react/kit';
import { MediaPickerDialog } from '../../components/MediaPickerDialog/MediaPickerDialog';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { siteUrl } from '../../lib/site-url';
import { createSeoTranslator, describeSeoHostError } from './seo-ports';
// The entry picker is the shared searchable Select; its sheet otherwise loads only with the
// widget picker, which this route may never have imported.
import '../../styles/select.css';

/** Keep CMS slug hydration and the existing caller-specific handles with the host picker owner. */
export function SeoMediaPickerSlot({ agentHandle, ...props }: SeoMediaPickerSlotProps, _optional: Record<string, never> = {}): ReactElement {
  return createElement(MediaPickerDialog, { ...props, ...(agentHandle === undefined ? {} : { agentHandle }) });
}

/** Compose live SEO localization and host slots without rebuilding the module or controllers.
 * @returns Stable Provider/page bindings; locale changes retain drafts and open dialog state.
 * @example createHostSeoModule({});
 */
export function createHostSeoModule({ useAdminLocaleHook }: { useAdminLocaleHook: UseAdminLocaleHook }, _optional: Record<string, never> = {}): ReturnType<typeof seo<HostModulePage, LazyTabView>> & { react: { loadingContent: ReactElement } } {
  // One site-URL reader for the factory default and the live options the Provider always passes.
  const hostSiteUrl = () => siteUrl({ path: '' });
  const feature = seo({ ui: reactModuleUi, siteUrl: hostSiteUrl });
  const ScopeProvider = feature.react.Provider;
  // Keep this component's identity for the scope lifetime; changing locale must not remount
  // the uncontrolled defaults form or discard an unsaved entry override.
  function Provider({ admin, children }: Parameters<typeof ScopeProvider>[0]) {
    const locale = useAdminLocaleHook({}, {});
    const options = useMemo<SeoReactOptions>(() => ({
      siteUrl: hostSiteUrl,
      t: createSeoTranslator({ locale }),
      describeError: describeSeoHostError,
      // Reuse the admin's compact locale date/time owner; the legacy modal locale prop is 'en'.
      formatDate: ({ iso }) => formDateDisplay({ iso, locale }).text,
      // SEO defaults publish through the existing site-settings section.
      headerActions: createElement(PublishSectionButton, { section: 'settings' }),
      slots: { MediaPickerDialog: SeoMediaPickerSlot },
    }), [locale]);
    return createElement(ScopeProvider, { admin, options, children });
  }
  return { ...feature, react: { ...feature.react, Provider, loadingContent: createElement(SeoModuleLoading, { useAdminLocaleHook }) } };
}

/** Preserve the original translated notice before the host scope or lazy page is available. */
export function SeoModuleLoading({ useAdminLocaleHook }: { useAdminLocaleHook: UseAdminLocaleHook }): ReactElement {
  const locale = useAdminLocaleHook({}, {});
  return createElement('div', { className: 'notice' }, createSeoTranslator({ locale })('Loading SEO settings…'));
}
