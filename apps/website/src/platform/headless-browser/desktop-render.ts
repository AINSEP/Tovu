/** Launcher environment binding. Keep the optional native transport lazy: standalone servers
 * must boot with an older desktop-host package and without any desktop capture capability.
 */
import type { UrlCapturePort } from '@jini-ai/desktop-host';

/** Resolve the inherited private channel; Jini validates/authenticates it when first used.
 * @throws The transport's RenderServiceError on an invalid or unavailable native channel.
 * @complexity O(1), plus the lazy module import on first capture.
 */
export function desktopRenderForHost({ env }: { env: NodeJS.ProcessEnv }, _options = {}): UrlCapturePort | null {
  if (env.JINI_DESKTOP_RENDER_URL === undefined && env.JINI_DESKTOP_RENDER_TOKEN === undefined) return null;
  return { async captureUrl(request, options) {
    const { renderBridgeFromEnv } = await import('@jini-ai/desktop-host/render-bridge');
    return renderBridgeFromEnv({ env })!.captureUrl(request, options);
  } };
}
