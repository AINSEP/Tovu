import type { NavigateAction, PageAction } from './client-directives';

/** Tovu's public assistant accepts only server-resolved local paths. O(path length), no effects. */
export function allowsSitePageAction({ action }: { action: PageAction }, _options = {}): boolean {
  // Reject protocol-relative URLs, backslashes and URL-trimmed control characters at the boundary.
  const path = action.target.path;
  return path.startsWith('/') && !path.startsWith('//') && !/[\\\u0000-\u0020]/.test(path);
}

/** Authorize before persistence/queueing or navigation; the same boundary serves both React paths. */
export function navigateSitePageAction({ action, beforeNavigate }: {
  action: NavigateAction; beforeNavigate: () => void;
}, { assign = ({ path }: { path: string }) => window.location.assign(path) }: { assign?: (args: { path: string }) => void } = {}): boolean {
  if (!allowsSitePageAction({ action })) return false;
  beforeNavigate();
  assign({ path: action.target.path });
  return true;
}
