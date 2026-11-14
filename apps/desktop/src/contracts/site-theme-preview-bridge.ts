import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
/** Preload's narrow DI adapter: Electron events and credentials never reach the listener. */
import { SITE_THEME_PREVIEW_CHANNELS as channels, type SiteThemePreviewRefresh } from './project.js';

export function createSiteThemePreviewBridge(
  { invoke, subscribe }: {
    invoke: (required: { channel: string; input: { subscriptionId: string; siteDir?: string } }, options?: {}) => Promise<unknown>;
    subscribe: (required: { channel: string; listener: (frame: SiteThemePreviewRefresh) => void }, options?: {}) => () => void;
  }, _optional = {},
) {
  let sequence = 0;
  return ({ siteDir, listener }: { siteDir: string; listener: (frame: SiteThemePreviewRefresh) => void }, _optional = {}) => {
    sequence++;
    const subscriptionId = `theme-preview-${sequence}`;
    let closed = false;
    const detach = subscribe({ channel: channels.event, listener: (frame) => { if (!closed) listener(frame); } });
    void invoke({ channel: channels.watch, input: { siteDir, subscriptionId } }).catch((error: unknown) => console.error("[theme-preview] Could not watch the site", describeErrorForLog({ err: error })));
    return () => {
      if (closed) return;
      closed = true; detach();
      void invoke({ channel: channels.unwatch, input: { subscriptionId } }).catch((error: unknown) => console.error("[theme-preview] Could not stop watching the site", describeErrorForLog({ err: error })));
    };
  };
}
