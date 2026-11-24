import { resolveWidgetPreviewIr } from '@jini-ai/cms/widgets/site/preview-render';
import type { resolveWidgetType } from '@jini-ai/cms/widgets/resolvers';
import { resolveActiveThemeId } from '@jini-ai/cms/presentation/site/active-theme-id';
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme } from '#src/features/theme/index';
import { renderStaticFragment } from '#src/features/theme/rendering';
import { renderWidgetIr } from '../../../public-http/http/site/render/content-html.js';
import { pageShell } from '../../../public-http/http/site/render/document-shell.js';
import type { RouteDeps } from '#src/server/routes/types';
import type { WidgetPreviewInput } from '@jini-ai/cms/admin-http/routes/widgets/preview';

export type WidgetPreviewDeps = Pick<RouteDeps, 'workspaceId' | 'presentationRepo' | 'themes'>;

/** The host binding over Jini's `resolveWidgetPreviewIr`: registry lookup, validation, resolution
 * and the fallback IR are Jini's; this supplies the workspace, the public HTML renderer, the active
 * theme and the preview document.
 * @throws The existing widget validation/type errors for invalid configs.
 * @complexity One bounded widget resolution plus the existing theme document render.
 */
export async function renderWidgetPreview(
  { deps, input }: { deps: WidgetPreviewDeps; input: WidgetPreviewInput },
  { resolve }: { resolve?: typeof resolveWidgetType } = {},
): Promise<{ html: string; document: string }> {
  const html = renderWidgetIr(await resolveWidgetPreviewIr({ input, workspaceId: deps.workspaceId }, { resolve }));
  const activeThemeId = await resolveActiveThemeId(deps);
  const active = resolveActiveTheme({ deps, activeThemeId });
  const theme = active === NO_THEME_ID ? null : active;
  const document = theme?.manifest.tier === 'static'
    ? renderStaticFragment({ theme, html, label: 'widget-preview' })
    : pageShell({ theme, title: 'Widget preview', body: html });
  return { html, document };
}
