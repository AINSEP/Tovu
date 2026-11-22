import { createAnnotatedActionsScript } from '@jini-ai/agentic/core';
import { PUBLISHED_WEBMCP_CONFIRMATION } from './webmcp-i18n.js';
import { SCRIPT_MARKER, withoutNativeFormTools } from "#src/platform/html/published-webmcp-strip";

/** Server-side switch controls script delivery AND native declarative discovery. */
export function injectPublishedWebMcp(
  { html, enabled }: { html: string; enabled: boolean },
  _optional: Record<string, never> = {},
): string {
  if (!enabled) return withoutNativeFormTools({ html });
  if (html.includes(`<script ${SCRIPT_MARKER}`)) return html;
  // The host’s own browser tools are necessary: this script only reads a preference,
  // registers local actions, and writes no storage or cookies.
  const script = `<script ${SCRIPT_MARKER}>${createAnnotatedActionsScript({ preferenceKey: 'tovu.admin.webmcp.enabled', confirmationMessage: PUBLISHED_WEBMCP_CONFIRMATION.en, confirmationMessages: PUBLISHED_WEBMCP_CONFIRMATION })}</script>`;
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  return bodyEnd < 0 ? html + script : html.slice(0, bodyEnd) + script + html.slice(bodyEnd);
}
