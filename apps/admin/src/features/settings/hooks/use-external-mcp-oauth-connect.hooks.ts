import { useCallback, useEffect, useRef, useState } from "react";

import { api, describeApiError } from "@/lib/api";

/**
 * @file The row-level "Connect" button behind Settings → External MCP (2026-10-23): starts the
 * OAuth sign-in for one saved server and tells the panel when to re-read the roster.
 *
 * `POST .../oauth/connect` answers one of two ways. `redirect_required`: the provider URL opens in
 * a popup, and the public callback page posts `tovu:external-mcp-connected` back to this tab
 * (`routes/oauth/callback-page.ts`). That message can be lost (no opener, a system browser), so
 * regaining focus also counts as "go look" — the same fallback that page's header asks every
 * bridge for. `device_code`: the operator types `userCode` at the provider; this hook polls
 * `.../oauth/device/poll` on the server's own interval until it says `connected`.
 *
 * The popup is opened BEFORE the connect request resolves (as `about:blank`, then pointed at the
 * provider), because a window opened after an `await` has lost the click's user activation and a
 * popup blocker may eat it. A device-code grant never needs it, so the panel says which grant the
 * row uses and the blank window is skipped for that one.
 */

/** Must match `EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE` in the website's `routes/oauth/callback-page.ts`. */
export const EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE = "tovu:external-mcp-connected";

export type ExternalMcpOAuthConnectPort = Pick<typeof api, "connectExternalMcpOAuth" | "pollExternalMcpOAuthDevice">;

export type ExternalMcpOAuthConnectState =
  | { phase: "idle"; error?: string }
  | { phase: "starting" }
  | { phase: "waiting" }
  | { phase: "device"; userCode: string; verificationUri: string };

/** Browser seams, so a test drives the flow without a real window. */
export interface ExternalMcpOAuthConnectWindow {
  open: (url: string) => { location: { href: string }; close: () => void } | null;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
  origin: string;
}

const browserWindow = (): ExternalMcpOAuthConnectWindow => ({
  open: (url) => window.open(url, "_blank", "popup,width=520,height=720"),
  addEventListener: window.addEventListener.bind(window),
  removeEventListener: window.removeEventListener.bind(window),
  origin: window.location.origin,
});

/**
 * Drives one server's sign-in.
 *
 * @param input.serverId - The saved row to sign in.
 * @param input.grant - The row's saved grant; `device_code` skips the up-front popup.
 * @param input.onConnected - Re-reads the roster; called once sign-in lands, and on focus/close.
 * @returns The current state plus `connect()` and `cancel()`.
 * @complexity O(1) per call; device polling is one request per server-given interval.
 */
export function useExternalMcpOAuthConnect(
  { serverId, grant, onConnected }: { serverId: string; grant: string; onConnected: () => void },
  { port = api, win = browserWindow, fallbackError = "Sign-in could not start." }: { port?: ExternalMcpOAuthConnectPort; win?: () => ExternalMcpOAuthConnectWindow; fallbackError?: string } = {},
) {
  const [state, setState] = useState<ExternalMcpOAuthConnectState>({ phase: "idle" });
  // Everything that must stop on cancel/unmount: a poll timer, the message/focus listeners.
  const cleanup = useRef<(() => void) | null>(null);
  const onConnectedRef = useRef(onConnected);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const stop = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const finish = useCallback((error?: string) => {
    stop();
    setState(error ? { phase: "idle", error } : { phase: "idle" });
    onConnectedRef.current();
  }, [stop]);

  const awaitRedirect = useCallback((w: ExternalMcpOAuthConnectWindow) => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== w.origin || event.data?.type !== EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE) return;
      finish(event.data.reason ? fallbackError : undefined);
    };
    const onFocus = () => finish();
    w.addEventListener("message", onMessage as EventListener);
    w.addEventListener("focus", onFocus);
    cleanup.current = () => {
      w.removeEventListener("message", onMessage as EventListener);
      w.removeEventListener("focus", onFocus);
    };
    setState({ phase: "waiting" });
  }, [finish, fallbackError]);

  const pollDevice = useCallback((intervalSeconds: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const result = await port.pollExternalMcpOAuthDevice(serverId);
        if (stopped) return;
        if (result.status === "connected") return finish();
        timer = setTimeout(() => void tick(), result.retryAfterSeconds * 1000);
      } catch (error) {
        if (!stopped) finish(describeApiError(error, fallbackError));
      }
    };
    timer = setTimeout(() => void tick(), intervalSeconds * 1000);
    cleanup.current = () => { stopped = true; clearTimeout(timer); };
  }, [port, serverId, finish, fallbackError]);

  const connect = useCallback(async () => {
    stop();
    const w = win();
    const popup = grant === "device_code" ? null : w.open("about:blank");
    setState({ phase: "starting" });
    try {
      const { auth } = await port.connectExternalMcpOAuth(serverId);
      if (auth.kind === "redirect_required") {
        if (popup) popup.location.href = auth.authorizationUrl;
        else w.open(auth.authorizationUrl);
        awaitRedirect(w);
        return;
      }
      popup?.close();
      const verificationUri = auth.verificationUriComplete ?? auth.verificationUri;
      w.open(verificationUri);
      setState({ phase: "device", userCode: auth.userCode, verificationUri });
      pollDevice(auth.intervalSeconds);
    } catch (error) {
      popup?.close();
      setState({ phase: "idle", error: describeApiError(error, fallbackError) });
    }
  }, [stop, win, grant, port, serverId, awaitRedirect, pollDevice, fallbackError]);

  const cancel = useCallback(() => {
    stop();
    setState({ phase: "idle" });
  }, [stop]);

  return { state, connect, cancel };
}
