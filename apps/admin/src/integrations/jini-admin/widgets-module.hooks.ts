import { createElement, useMemo, type ReactElement, type ComponentProps } from 'react';
import { widgets, useWidgetsOptions, type WidgetsReactOptions, type WidgetsSlots } from '@jini-ai/admin/widgets/react';
import type { AdminWidgetType as HostWidgetType } from '../../lib/api';
import { useWiredAdminLocale } from '../../hooks/use-admin-locale.hooks';
import { WidgetConfigFields, WIDGET_TYPE_OPTIONS, defaultWidgetConfig } from '../../components/WidgetConfigFields/WidgetConfigFields';
import { WidgetAddControl } from '../../components/WidgetPickerDialog/WidgetPickerDialog';
import { t as sharedComponentsT } from '../../components/shared-components-i18n';
import { serverLabel } from '../../components/status-labels';
import { PublishSectionButton } from '../../features/publish-content/PublishSectionButton';
import { slugRedirectPath } from '../../lib/slug-redirect-path';
import { createWidgetsTranslator } from './widgets-ports';

/** ConfigFields owns a DIFFERENT dictionary from screen copy. Resolve the current module locale
 * and replace the supplied screen translator with the shared-components translator.
 */
export function WidgetsConfigFieldsSlot(props: ComponentProps<WidgetsSlots['ConfigFields']>, _optional: Record<string, never> = {}): ReactElement {
  const { locale } = useWidgetsOptions();
  return createElement(WidgetConfigFields, { ...props, widgetType: props.widgetType as HostWidgetType,
    t: key => sharedComponentsT({ locale, key }) });
}

const widgetsHostDefaults: Pick<WidgetsReactOptions, 'slots' | 'widgetTypes' | 'defaultConfig'> = {
  slots: { ConfigFields: WidgetsConfigFieldsSlot, AddControl: WidgetAddControl },
  widgetTypes: WIDGET_TYPE_OPTIONS,
  // Jini's type vocabulary is open; the host owns the closed v1 config dispatcher/catalog.
  defaultConfig: type => defaultWidgetConfig(type as HostWidgetType),
};

/** Compose live locale and retained host slots with stable lazy pages and controller identity.
 * @returns Widgets bindings; disposing the enclosing admin scope retires its API scope. O(1).
 */
export function createHostWidgetsModule(_required: Record<string, never>, { useAdminLocaleHook = useWiredAdminLocale }: { useAdminLocaleHook?: () => string } = {}): ReturnType<typeof widgets> {
  const feature = widgets(widgetsHostDefaults);
  const ScopeProvider = feature.react.Provider;
  // Locale refresh must not replace the factory/pages and discard an unsaved config or placement.
  function Provider({ admin, children }: Parameters<typeof ScopeProvider>[0]) {
    const locale = useAdminLocaleHook();
    const options = useMemo<WidgetsReactOptions>(() => ({ ...widgetsHostDefaults, locale,
      t: createWidgetsTranslator({ locale }), statusLabel: value => serverLabel(value, locale),
      slugRedirectPath, headerActions: createElement(PublishSectionButton, { section: 'widgets' }),
    }), [locale]);
    return createElement(ScopeProvider, { admin, options, children });
  }
  return { ...feature, react: { ...feature.react, Provider } };
}

/** Retain each screen's own translated notice while the scope or lazy page is loading. */
export function WidgetsModuleLoading({ pageId, useAdminLocaleHook = useWiredAdminLocale }: { pageId: 'library' | 'editor' | 'regions' | 'region'; useAdminLocaleHook?: () => string }, _optional: Record<string, never> = {}): ReactElement {
  const locale = useAdminLocaleHook();
  const keys = { library: 'Loading widgets…', editor: 'Loading widget…', regions: 'Loading regions…', region: 'Loading region…' };
  return createElement('div', { className: 'notice' }, createWidgetsTranslator({ locale })(keys[pageId]));
}
