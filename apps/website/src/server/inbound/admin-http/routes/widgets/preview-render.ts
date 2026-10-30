import type { JsonObject } from '@jini-ai/core/primitives';
import { findWidgetTypeRegistration, validateWidgetConfig, WidgetConfigValidationError, WidgetTypeUnregisteredError } from '@jini-ai/cms/widgets';
import { resolveWidgetType } from '@jini-ai/cms/widgets/resolvers';
import { resolveActiveThemeId } from '#src/features/presentation/index';
import { resolveActiveTheme, NO_THEME_ID } from '#src/features/theme/index';
import { renderStaticFragment } from '#src/features/theme/rendering';
import { pageShell, renderWidgetIr } from '../../../public-http/http/site/render.js';
import type { RouteDeps } from '#src/server/routes/types';

export interface WidgetPreviewInput { widgetType: string; content: JsonObject }
export type WidgetPreviewDeps = Pick<RouteDeps, 'workspaceId' | 'presentationRepo' | 'themes'>;

/** Never persists a widget. The registry dispatcher, sanitizer and public HTML renderer own
 * every widget treatment; this adapter only supplies the unsaved instance and theme document.
 * @throws The existing widget validation/type errors for invalid configs.
 * @complexity One bounded widget resolution plus the existing theme document render.
 */
export async function renderWidgetPreview(
  { deps, input }: { deps: WidgetPreviewDeps; input: WidgetPreviewInput },
  { resolve = resolveWidgetType }: { resolve?: typeof resolveWidgetType } = {},
): Promise<{ html: string; document: string }> {
  const registration = findWidgetTypeRegistration({ raw: input.widgetType });
  if (!registration) throw new WidgetTypeUnregisteredError({ message: 'widget type is unregistered', widgetType: input.widgetType });
  const validation = validateWidgetConfig({ schema: registration.configSchema, config: input.content });
  if (!validation.valid) throw new WidgetConfigValidationError({ message: 'widget config is invalid', fieldErrors: validation.fieldErrors });
  const id = 'unsaved-widget-preview';
  const resolved = await resolve({
    typeKey: registration.typeKey,
    instances: [{ id, widgetType: registration.typeKey, config: input.content }],
    // Match public resolver semantics. Authentication lives at the HTTP boundary.
    context: { workspaceId: deps.workspaceId, preview: false },
  });
  const result = resolved.get(id);
  const html = renderWidgetIr(result?.ok ? result.ir : { componentId: 'widget-placeholder', props: {} });
  const activeThemeId = await resolveActiveThemeId(deps);
  const active = resolveActiveTheme(deps, activeThemeId);
  const theme = active === NO_THEME_ID ? null : active;
  const document = theme?.manifest.tier === 'static'
    ? renderStaticFragment({ theme, html, label: 'widget-preview' })
    : pageShell({ theme, title: 'Widget preview', body: html });
  return { html, document };
}
