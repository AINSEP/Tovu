import { createElement, useMemo, type ReactElement } from 'react';
import { forms, type FormsReactOptions } from '@jini-ai/admin/forms/react';
import { useWiredAdminLocale } from '../../hooks/use-admin-locale.hooks';
import { RecipientLabel } from '../../components/status-labels';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { createFormsTranslator } from './forms-ports';

/** Compose live localization and host slots without remounting the package editor draft. */
export function createHostFormsModule(_required: Record<string, never>, { useAdminLocaleHook = useWiredAdminLocale }: { useAdminLocaleHook?: () => string } = {}): ReturnType<typeof forms> {
  const feature = forms({});
  const ScopeProvider = feature.react.Provider;
  // Component identity belongs to the scope lifetime; locale changes update options in place.
  function Provider({ admin, children }: Parameters<typeof ScopeProvider>[0]) {
    const locale = useAdminLocaleHook();
    const options = useMemo<FormsReactOptions>(() => ({ locale, t: createFormsTranslator({ locale }),
      headerActions: createElement(PublishSectionButton, { section: 'forms' }), slots: { RecipientLabel } }), [locale]);
    return createElement(ScopeProvider, { admin, options, children });
  }
  return { ...feature, react: { ...feature.react, Provider } };
}

/** Keep the original list/editor notice while the host scope or lazy page loads. */
export function FormsModuleLoading({ editor = false, useAdminLocaleHook = useWiredAdminLocale }: { editor?: boolean; useAdminLocaleHook?: () => string }): ReactElement {
  const locale = useAdminLocaleHook();
  return createElement('div', { className: 'notice' }, createFormsTranslator({ locale })(editor ? 'Loading form…' : 'Loading forms…'));
}
