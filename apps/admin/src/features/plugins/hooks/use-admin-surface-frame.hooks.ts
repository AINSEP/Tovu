import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  adminSurfaceActionResponse,
  adminSurfaceInitMessage,
  createAdminSurfaceMount,
  validateAdminSurfaceMessage,
  type AdminSurfaceActionOutcome,
} from "@jini-ai/agent-plugins/admin-surfaces";
import type { AgentPluginSurfaceActionAnswer, AgentPluginSurfacesPort, AgentPluginSurfaceSummary, HostSignInLink } from "./agent-plugin-surfaces-port.hooks";

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
 *
 * Sign-in links: the frame is sandboxed without `allow-popups`, so the host page opens a sign-in for
 * it. The only links it ever offers are the ones the server says IT issued while answering this
 * mount's actions (`hostSignIns`), kept per mount, https only, until opened or expired; a URL in the
 * plugin's own result is never opened. The page opens them as a new tab with no opener, which the
 * desktop shell's window policy hands to the system browser (as for every external link).
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
  /** Host-issued sign-in links for this mount, not yet opened or expired. */
  readonly signIns: readonly HostSignInLink[];
  /** Forgets a link once the person opened it (each attempt is single use). */
  readonly onSignInOpened: (link: HostSignInLink) => void;
}

/** The server's https links only. @complexity O(l). */
function hostLinks(answer: AgentPluginSurfaceActionAnswer): readonly HostSignInLink[] {
  return (answer.hostSignIns ?? []).filter((link) => URL.parse(link.authorizationUrl)?.protocol === "https:");
}

/** What the frame receives: the plugin's outcome alone, never the host's links. */
function frameOutcome(answer: AgentPluginSurfaceActionAnswer): AdminSurfaceActionOutcome {
  return answer.ok ? { ok: true, result: answer.result } : { ok: false, error: answer.error };
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
  const [issued, setIssued] = useState<readonly HostSignInLink[]>([]);
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
        .catch((): AgentPluginSurfaceActionAnswer => HOST_UNAVAILABLE)
        .then((answer) => {
          const links = hostLinks(answer);
          if (links.length > 0) setIssued((current) => [...current, ...links]);
          liveFrame()?.postMessage(adminSurfaceActionResponse({ request, outcome: frameOutcome(answer) }), "*");
        });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [status, port, pluginId, surface.id, surface.actions, mount.mountId, liveFrame]);

  const onSignInOpened = useCallback((link: HostSignInLink) => setIssued((current) => current.filter((entry) => entry !== link)), []);
  const signIns = issued.filter((link) => Date.parse(link.expiresAt) > Date.now());
  return { frameRef, status, onLoad, signIns, onSignInOpened };
}
