import type { ServerReconnect } from "@/lib/server-reconnect";

import { useServerConnectionBanner } from "./hooks/use-server-connection-status.hooks";
import "./server-restarting-banner.css";

/** A thin top banner while the API is restarting (2026-10-05, S3). Logic: `useServerConnectionBanner`. */
export function ServerRestartingBanner({ useServerConnectionBanner: useServerConnectionBannerHook = useServerConnectionBanner, ...props }: { useServerConnectionBanner?: typeof useServerConnectionBanner; reconnect?: ServerReconnect }) {
  const { status, text } = useServerConnectionBannerHook({ reconnect: props.reconnect });
  if (!text) return null;
  return (
    <div className={`server-restarting-banner server-restarting-banner--${status}`} role="status" aria-live="polite">
      {text}
    </div>
  );
}
