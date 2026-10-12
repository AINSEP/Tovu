import { useDebouncedHtmlPreview, type HtmlPreviewPort } from '@jini-ai/ui/admin-widgets';
import { usePreviewPaneWidth } from '../DevicePreview/DevicePreview.hooks';
import { renderWidgetPreviewDocument } from './widget-config-fields-dependencies.hooks';

/** The shared frame measures its pane; the shared Jini hook owns debounce and cancellation.
 * @complexity O(n) source serialization, plus one debounced server render.
 */
export function useWidgetPreview(
  { widgetType, config }: { widgetType: string; config: Record<string, unknown> },
  { render = renderWidgetPreviewDocument }: { render?: HtmlPreviewPort } = {},
) {
  const preview = useDebouncedHtmlPreview({ source: JSON.stringify({ widgetType, content: config }), render });
  const frame = usePreviewPaneWidth();
  return { ...preview, ...frame };
}
