/** Reload only this tab's public guest; Electron can throw from calls on detached webviews. */
import type { SiteThemePreviewRefresh } from '../contracts/project.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import type { SiteWorkspaceAction } from './use-site-workspace.hooks.js';

function publicPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020]/.test(path)) return false;
  try {
    const decoded = decodeURIComponent(path.split(/[?#]/, 1)[0]!);
    const normalized = new URL(path, 'http://preview.invalid').pathname;
    return !/[\\\u0000-\u0020]|^\/\/|(?:^|\/)\.\.(?:\/|$)|^\/(?:admin|api)(?:\/|$)/i.test(decoded)
      && !/^\/(?:admin|api)(?:\/|$)/i.test(normalized);
  } catch { return false; }
}

export function subscribeWorkspaceThemePreview(
  { bridge, siteDir, port, running, url, guest, dispatch }: {
    bridge: Pick<RunnerInventoryBridge, 'watchSitePreview'> | undefined;
    siteDir: string; port: number; running: boolean; url: string;
    guest: (Pick<HTMLWebViewElement, 'reloadIgnoringCache' | 'loadURL'> & Partial<Pick<HTMLWebViewElement, 'getURL'>>) | null;
    dispatch: (action: SiteWorkspaceAction) => void;
  }, _optional = {},
): (() => void) | undefined {
  if (!running || !guest || !bridge?.watchSitePreview) return undefined;
  const origin = `http://127.0.0.1:${port}`;
  const ownPublicUrl = (raw: string) => {
    try {
      const live = new URL(raw);
      return live.origin === origin && !/^\/(?:admin|api)(?:\/|$)/i.test(live.pathname);
    } catch { return false; }
  };
  if (!ownPublicUrl(url)) return undefined;
  let closed = false, previous: string | undefined;
  const dispose = bridge.watchSitePreview({ siteDir, listener: (frame: SiteThemePreviewRefresh) => {
    if (closed || frame.siteDir !== siteDir || frame.revision === previous || !/^[\w-]{1,100}$/.test(frame.revision)) return;
    if (frame.path !== undefined && !publicPath(frame.path)) return;
    previous = frame.revision;
    try {
      // Navigation may precede React's next render; check the actual guest before touching it.
      if (!ownPublicUrl(guest.getURL?.() ?? url)) return;
      if (frame.path === undefined) guest.reloadIgnoringCache();
      else void guest.loadURL(new URL(frame.path, origin).href, { extraHeaders: 'pragma: no-cache\n' }).catch(() => undefined);
      dispatch({ type: 'soft-load' });
    } catch { /* An unattached guest must never blank the host window; its normal load will recover. */ }
  } });
  return () => { closed = true; dispose(); };
}
