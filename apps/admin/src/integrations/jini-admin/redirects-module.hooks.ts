import { createElement, useMemo, type ReactElement, type ComponentType } from 'react';
import { redirects, type RedirectsReactOptions } from '@jini-ai/admin/redirects/react';
import { useWiredAdminLocale } from '../../hooks/use-admin-locale.hooks';
import { deleteRedirectBody, importRulesLabel } from '../../features/redirects/redirects-i18n';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { createRedirectsTranslator } from './redirects-ports';

// The host Provider wraps the package Provider, so its element type is host-owned.
type HostRedirectsModule = Omit<ReturnType<typeof redirects>, 'react'> & {
  react: Omit<ReturnType<typeof redirects>['react'], 'Provider'> & {
    Provider: ComponentType<Parameters<ReturnType<typeof redirects>['react']['Provider']>[0]>;
    loadingContent: ReactElement;
  };
};

/** Compose live host localization and markup slots without rebuilding the module scope.
 * @returns Stable Provider/page bindings; locale refreshes preserve drafts and lazy-hit state.
 * @example createHostRedirectsModule({});
 */
export function createHostRedirectsModule(_required: Record<string, never>, { useAdminLocaleHook = useWiredAdminLocale }: { useAdminLocaleHook?: () => string } = {}): HostRedirectsModule {
  const feature = redirects({});
  const ScopeProvider = feature.react.Provider;
  // Resolve locale once for this screen, not independently for each row's hit-count cell.
  function Provider({ admin, children }: Parameters<typeof ScopeProvider>[0]) {
    const locale = useAdminLocaleHook();
    const options = useMemo<RedirectsReactOptions>(() => ({
      locale,
      t: createRedirectsTranslator({ locale }),
      headerActions: createElement(PublishSectionButton, { section: 'redirects' }),
      slots: { renderMessage: ({ key, vars, shapeCode }) => key === 'importRulesLabel'
        ? importRulesLabel(locale, shapeCode)
        : deleteRedirectBody(locale, String(vars?.fromPattern)) },
    }), [locale]);
    return createElement(ScopeProvider, { admin, options, children });
  }
  return { ...feature, react: { ...feature.react, Provider, loadingContent: createElement(RedirectsModuleLoading, { useAdminLocaleHook }) } };
}

/** Keep the original translated notice during host-scope and lazy-page loading. */
export function RedirectsModuleLoading({ useAdminLocaleHook = useWiredAdminLocale }: { useAdminLocaleHook?: () => string }): ReactElement {
  const locale = useAdminLocaleHook();
  return createElement('div', { className: 'notice' }, createRedirectsTranslator({ locale })('Loading redirects…'));
}
