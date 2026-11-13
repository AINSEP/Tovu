/** Launcher environment binding. Standalone servers may have no desktop capture capability;
 * older desktop-host packages also lacked this transport, which is now a declared dependency.
 */
import type { UrlCapturePort } from '@jini-ai/desktop-host';
import { renderBridgeFromEnv } from '@jini-ai/desktop-host/render-bridge';
import { startupSecretEnvironment } from '../../server/runtime/boot/startup-secrets.js';

/** Resolve the inherited private channel; Jini validates/authenticates it when first used.
 * @throws The transport's RenderServiceError on an invalid or unavailable native channel.
 * @complexity O(1), plus the native capture work.
 */
export function desktopRenderForHost({ env }: { env: NodeJS.ProcessEnv }, _options = {}): UrlCapturePort | null {
  const privateEnv = startupSecretEnvironment({ env });
  if (privateEnv.JINI_DESKTOP_RENDER_URL === undefined && privateEnv.JINI_DESKTOP_RENDER_TOKEN === undefined) return null;
  return { async captureUrl(request, options) {
    return renderBridgeFromEnv({ env: privateEnv })!.captureUrl(request, options);
  } };
}
