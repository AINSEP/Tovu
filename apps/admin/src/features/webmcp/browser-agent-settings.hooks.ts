import { useCallback, useSyncExternalStore } from "react";

/** Hook seam; the default adapter below owns browser storage and storage events. */
export interface BrowserAgentSettingsPort {
  getEnabled(required: Record<string, never>, optional?: Record<string, never>): boolean;
  setEnabled(required: { enabled: boolean }, optional?: Record<string, never>): void;
  subscribe(required: { listener: () => void }, optional?: Record<string, never>): () => void;
}

/** Admin browser preference, deliberately origin-local rather than an installation policy.
 * A blocked storage API still permits a session-only opt-out. No server or schema is needed. */
export const WEBMCP_PREFERENCE_KEY = "tovu.admin.webmcp.enabled";
const listeners = new Set<() => void>();
let sessionOverride: boolean | undefined;

export function getBrowserAgentEnabled(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): boolean {
  if (sessionOverride !== undefined) return sessionOverride;
  try { return window.localStorage.getItem(WEBMCP_PREFERENCE_KEY) !== "false"; }
  catch { return true; }
}

export function setBrowserAgentEnabled({ enabled }: { enabled: boolean }, _optional: Record<string, never> = {}): void {
  sessionOverride = enabled;
  try {
    window.localStorage.setItem(WEBMCP_PREFERENCE_KEY, String(enabled));
    sessionOverride = undefined;
  } catch { /* Keep the choice for this session when storage is blocked. */ }
  for (const listener of listeners) listener();
}

function subscribe({ listener }: { listener: () => void }, _optional: Record<string, never> = {}): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== WEBMCP_PREFERENCE_KEY) return;
    sessionOverride = undefined;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

const browserPort: BrowserAgentSettingsPort = {
  getEnabled: getBrowserAgentEnabled,
  setEnabled: setBrowserAgentEnabled,
  subscribe,
};
const serverSnapshot = () => true;

export function useBrowserAgentSettings(
  { port = browserPort }: { port?: BrowserAgentSettingsPort } = {},
  _optional: Record<string, never> = {},
) {
  const listen = useCallback((listener: () => void) => port.subscribe({ listener }), [port]);
  const snapshot = useCallback(() => port.getEnabled({}), [port]);
  const enabled = useSyncExternalStore(listen, snapshot, serverSnapshot);
  const setEnabled = useCallback((required: { enabled: boolean }, optional: Record<string, never> = {}) => port.setEnabled(required, optional), [port]);
  return { enabled, setEnabled };
}
