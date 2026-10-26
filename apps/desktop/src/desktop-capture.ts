/** Bind the product-neutral RenderService to this shell's Electron instance. The private
 * endpoint is inherited by serve and its agent daemon; it never enters preload or site storage.
 */
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import { createElectronRenderService, type ElectronBrowserWindowFactory, type ElectronWebContentsLike } from '@jini-ai/desktop-host/electron';
import { RenderServiceError } from '@jini-ai/desktop-host';

/** Native bindings only; Jini owns rendering, bounds, request policy and destruction.
 * @complexity O(1), apart from Electron's page work.
 */
export function desktopCaptureWindowFactory({ createWindow }: { createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow }, _options = {}): ElectronBrowserWindowFactory {
  return (_required, options = {}) => {
    const window = createWindow({ ...options, webPreferences: { ...options.webPreferences } });
    const denyDownload = (event: Electron.Event) => event.preventDefault();
    let removeDownloadListener = () => {};
    try {
      const page = window.webContents;
      const captureSession = page.session;
      removeDownloadListener = () => captureSession.removeListener('will-download', denyDownload);
      page.setWindowOpenHandler(() => ({ action: 'deny' }));
      page.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
      page.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      page.session.setPermissionCheckHandler(() => false);
      // Dev sites use self-signed loopback certificates; other hosts retain Chromium verification.
      captureSession.setCertificateVerifyProc((request, callback) => {
        callback(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(request.hostname) ? 0 : -3);
      });
      captureSession.on('will-download', denyDownload);
      page.once('destroyed', removeDownloadListener);
      // No preload, Electron APIs, popups, saved credentials or the operator's cookie jar.
      page.on('will-attach-webview', event => event.preventDefault());
      return {
        webContents: {
          session: {
            clearStorageData: () => captureSession.clearStorageData(),
            clearCache: () => captureSession.clearCache(),
            clearAuthCache: () => captureSession.clearAuthCache(),
            closeAllConnections: () => captureSession.closeAllConnections(),
            webRequest: { onBeforeRequest: ({ listener }) => captureSession.webRequest.onBeforeRequest(
              listener === null ? null : (details, callback) => listener({ details, callback }),
            ) },
          },
          loadURL: ({ url }) => page.loadURL(url),
          once: (({ event, listener }: { event: string; listener: (args?: unknown) => void }) => {
            if (event === 'did-fail-load') page.once(event, (event, errorCode, errorDescription) => listener({ event, errorCode, errorDescription }));
            else page.once('did-finish-load', () => listener());
          }) as ElectronWebContentsLike['once'],
          on: ({ listener }) => { page.on('will-navigate', (event, url) => listener({ event, url })); },
          printToPDF: options => page.printToPDF(options),
          capturePage: (_required, { rect } = {}) => page.capturePage(rect),
          getURL: () => page.getURL(), getTitle: () => page.getTitle(),
          executeJavaScript: expression => page.executeJavaScript(expression),
          debugger: { attach: version => page.debugger.attach(version), sendCommand: (method, params) => page.debugger.sendCommand(method, params) },
        },
        loadURL: ({ url }) => window.loadURL(url),
        show: () => window.show(), hide: () => window.hide(), focus: () => window.focus(),
        close: () => window.close(), isDestroyed: () => window.isDestroyed(),
        destroy: () => {
          window.destroy();
          removeDownloadListener();
        },
        on: ({ listener }) => { window.on('closed', listener); },
      };
    } catch (error) {
      // The render lifetime cannot dispose a window until this factory returns it.
      removeDownloadListener();
      window.destroy();
      throw error;
    }
  };
}

/** One capability per spawned site; authenticated children may capture only loopback pages.
 * @returns Environment contract and disposer tied to the server's exit.
 * @complexity O(1) setup, plus bounded native capture work.
 */
export async function startDesktopCaptureBridge({ createWindow }: { createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow }, _options = {}) {
  const { startRenderBridge } = await import('@jini-ai/desktop-host/render-bridge');
  const service = createElectronRenderService({ createBrowserWindow: desktopCaptureWindowFactory({ createWindow }) });
  return startRenderBridge({ capture: { async captureUrl(request, options) {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new RenderServiceError({ code: 'navigation-blocked', message: 'desktop capture requires a site loopback URL' });
    }
    return service.captureUrl(request, { ...options, allowedOrigins: [url.origin] });
  } } });
}
