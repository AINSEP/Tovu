import { createElement, useMemo, type ReactElement } from 'react';
import { seo, type SeoReactOptions, type SeoMediaPickerSlotProps } from '@jini-ai/admin/seo/react';
import { useWiredAdminLocale } from '../../hooks/use-admin-locale.hooks';
import { MediaPickerDialog } from '../../components/MediaPickerDialog/MediaPickerDialog';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { siteUrl } from '../../lib/site-url';
import { createSeoTranslator, describeSeoHostError } from './seo-ports';

/** Keep CMS slug hydration and the existing caller-specific handles with the host picker owner. */
export function SeoMediaPickerSlot({ agentHandle, ...props }: SeoMediaPickerSlotProps, _optional: Record<string, never> = {}): ReactElement {
  return createElement(MediaPickerDialog, { ...props, ...(agentHandle === undefined ? {} : { agentHandle }) });
}

/** Compose live SEO localization and host slots without rebuilding the module or controllers.
 * @returns Stable Provider/page bindings; locale changes retain drafts and open dialog state.
 * @example createHostSeoModule({});
 */
export function createHostSeoModule(_required: Record<string, never>, { useAdminLocaleHook = useWiredAdminLocale }: { useAdminLocaleHook?: () => string } = {}): ReturnType<typeof seo> & { react: { loadingContent: ReactElement } } {
  const feature = seo({ siteUrl: () => siteUrl('') });
  const ScopeProvider = feature.react.Provider;
  // Keep this component's identity for the scope lifetime; changing locale must not remount
  // the uncontrolled defaults form or discard an unsaved entry override.
  function Provider({ admin, children }: Parameters<typeof ScopeProvider>[0]) {
    const locale = useAdminLocaleHook();
    const options = useMemo<SeoReactOptions>(() => ({
      siteUrl: () => siteUrl(''),
      t: createSeoTranslator({ locale }),
      describeError: describeSeoHostError,
      // SEO defaults publish through the existing site-settings section.
      headerActions: createElement(PublishSectionButton, { section: 'settings' }),
      slots: { MediaPickerDialog: SeoMediaPickerSlot },
    }), [locale]);
    return createElement(ScopeProvider, { admin, options, children });
  }
  return { ...feature, react: { ...feature.react, Provider, loadingContent: createElement(SeoModuleLoading, { useAdminLocaleHook }) } };
}

/** Preserve the original translated notice before the host scope or lazy page is available. */
export function SeoModuleLoading({ useAdminLocaleHook = useWiredAdminLocale }: { useAdminLocaleHook?: () => string }): ReactElement {
  const locale = useAdminLocaleHook();
  return createElement('div', { className: 'notice' }, createSeoTranslator({ locale })('Loading SEO settings…'));
}
