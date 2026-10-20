import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  adminSurfaceActionResponse,
  adminSurfaceInitMessage,
  createAdminSurfaceMount,
  validateAdminSurfaceMessage,
  type AdminSurfaceActionOutcome,
} from "@jini-ai/agent-plugins/admin-surfaces";
import type { AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "./agent-plugin-surfaces-port.hooks";

/**
 * @file The host page's half of one mounted plugin admin surface (Jini's admin-surface protocol):
 * the per-mount nonce, the single `init` (with the server's bootstrap) after the frame's first
 * load, and the message gate that forwards valid action requests to the server and posts each
 * answer back.
 *
 * Why the "first load only" checks are repeated at post time: the bootstrap and every action
 * answer arrive asynchronously, and if the frame navigated in the meantime its window now holds a
 * different document. Posting there (target `'*'`, the only target an opaque origin allows) would
 * hand that document the bootstrap's short-lived token or an answer meant for the original surface.
 */

export type AdminSurfaceFrameStatus = "open" | "navigated" | "failed";

/** Returned to the surface when the host page could not reach the server; never server text. */
const HOST_UNAVAILABLE: AdminSurfaceActionOutcome = {
  ok: false,
  error: { code: "host-unavailable", message: "The admin page could not reach the server. Try again.", retryable: true },
};

export interface AdminSurfaceFrameController {
  readonly frameRef: RefObject<HTMLIFrameElement | null>;
  readonly status: AdminSurfaceFrameStatus;
  readonly onLoad: () => void;
}

/**
 * @param required.surface - The listing entry: its `actions` are the client-side early refusal.
 * @complexity O(p) per message in the payload size (Jini's validator), plus one request.
 */
export function useAdminSurfaceFrame(
  required: { readonly pluginId: string; readonly surface: AgentPluginSurfaceSummary; readonly port: AgentPluginSurfacesPort },
  _optional: Record<string, never> = {},
): AdminSurfaceFrameController {
  const { pluginId, surface, port } = required;
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const loads = useRef(0);
  const mount = useMemo(() => createAdminSurfaceMount({ surfaceId: surface.id }), [surface.id]);
  const [status, setStatus] = useState<AdminSurfaceFrameStatus>("open");
  /** The frame's window while it still shows the document this mount initialized, else null. */
  const liveFrame = useCallback(() => (loads.current === 1 ? frameRef.current?.contentWindow ?? null : null), []);

  const onLoad = useCallback(() => {
    loads.current += 1;
    // A second load means the frame navigated away from the surface: unmount, never re-init.
    if (loads.current > 1) return setStatus("navigated");
    void port.bootstrap({ pluginId, surfaceId: surface.id }).then(
      (bootstrap) => liveFrame()?.postMessage(adminSurfaceInitMessage({ mountId: mount.mountId }, { bootstrap }), "*"),
      () => setStatus("failed"),
    );
  }, [port, pluginId, surface.id, mount.mountId, liveFrame]);

  useEffect(() => {
    if (status !== "open") return undefined;
    const onMessage = (event: MessageEvent) => {
      const frame = liveFrame();
      // No live frame: nothing may match (a null `source` must never equal a missing frame).
      if (frame === null) return;
      const verdict = validateAdminSurfaceMessage({ event, mount: { mountId: mount.mountId, frame, descriptor: { actions: surface.actions } } });
      if (!verdict.ok) {
        if ("response" in verdict) frame.postMessage(verdict.response, "*");
        return;
      }
      const { request } = verdict;
      void port.action({ pluginId, surfaceId: surface.id, action: request.action, payload: request.payload })
        .catch(() => HOST_UNAVAILABLE)
        .then((outcome) => liveFrame()?.postMessage(adminSurfaceActionResponse({ request, outcome }), "*"));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [status, port, pluginId, surface.id, surface.actions, mount.mountId, liveFrame]);

  return { frameRef, status, onLoad };
}
