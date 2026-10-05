import { useSyncExternalStore } from "react";

import { serverReconnect, type ServerConnectionStatus, type ServerReconnect } from "@/lib/server-reconnect";

/** What the banner shows for each status; `null` = nothing (the server is answering). */
const BANNER_TEXT: Record<ServerConnectionStatus, string | null> = {
  online: null,
  reconnecting: "Server restarting… reconnecting. Nothing you typed is lost.",
  unreachable: "Can't reach the Tovu server. It will retry when you try again.",
};

/**
 * The live server-connection status (`lib/server-reconnect.ts`) and the banner line for it.
 * @param optional.reconnect - Injectable for tests; defaults to the app's one instance.
 */
export function useServerConnectionBanner(optional: { reconnect?: ServerReconnect } = {}): { status: ServerConnectionStatus; text: string | null } {
  const reconnect = optional.reconnect ?? serverReconnect;
  const status = useSyncExternalStore(reconnect.subscribe, reconnect.getStatus, reconnect.getStatus);
  return { status, text: BANNER_TEXT[status] };
}
