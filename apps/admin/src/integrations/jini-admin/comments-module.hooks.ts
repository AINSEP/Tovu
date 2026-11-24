import { reactModuleUi, type LazyTabView } from '@jini-ai/admin/core/react';
import type { HostModulePage } from './module-context';
import { createElement, useMemo, type ReactElement, type ComponentType } from 'react';
import { comments } from '@jini-ai/admin/comments/react';
import type { UseAdminLocaleHook } from '@jini-ai/admin/react/kit';
import { createCommentsTranslator } from './comments-ports';

// The host Provider wraps the package Provider, so its element type is host-owned.
type HostCommentsModule = Omit<ReturnType<typeof comments<HostModulePage, LazyTabView>>, 'react'> & {
  react: Omit<ReturnType<typeof comments<HostModulePage, LazyTabView>>['react'], 'Provider'> & {
    Provider: ComponentType<Parameters<ReturnType<typeof comments<HostModulePage, LazyTabView>>['react']['Provider']>[0]>;
    loadingContent: ReactElement;
  };
};

/** Compose the package module with the host's live locale without rebuilding its scope.
 * @param optional Injectable locale hook; production uses the existing settings-refresh owner.
 * @returns The comments module with a stable host Provider and unchanged page bindings.
 * @example createHostCommentsModule({})
 */
export function createHostCommentsModule({ useAdminLocaleHook }: { useAdminLocaleHook: UseAdminLocaleHook }, _optional: Record<string, never> = {}): HostCommentsModule {
  const feature = comments({ ui: reactModuleUi });
  const ScopeProvider = feature.react.Provider;
  // Keep this component's identity for the scope lifetime; a locale refresh must not remount it.
  function Provider({ admin, children }: Parameters<typeof ScopeProvider>[0]) {
    const locale = useAdminLocaleHook({}, {});
    const t = useMemo(() => createCommentsTranslator({ locale }), [locale]);
    return createElement(ScopeProvider, { admin, t, children });
  }
  return { ...feature, react: { ...feature.react, Provider, loadingContent: createElement(CommentsModuleLoading, { useAdminLocaleHook }) } };
}

/** Preserve the original translated notice while the host scope or lazy page is loading. */
export function CommentsModuleLoading({ useAdminLocaleHook }: { useAdminLocaleHook: UseAdminLocaleHook }): ReactElement {
  const locale = useAdminLocaleHook({}, {});
  return createElement('div', { className: 'notice' }, createCommentsTranslator({ locale })('Loading Comments…'));
}
