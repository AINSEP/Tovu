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
  // Case-insensitive search on the original string (B237): an index taken from html.toLowerCase()
  // drifts after characters like "İ" whose lowercase form is longer, splitting the page's text.
  const bodyEnd = lastBodyCloseIndex({ html });
  return bodyEnd < 0 ? html + script : html.slice(0, bodyEnd) + script + html.slice(bodyEnd);
}

/** Index of the last `</body>` (any case) in `html` itself, or -1. O(n). */
function lastBodyCloseIndex({ html }: { html: string }, _optional = {}): number {
  let last = -1;
  for (const match of html.matchAll(/<\/body>/gi)) last = match.index;
  return last;
}
