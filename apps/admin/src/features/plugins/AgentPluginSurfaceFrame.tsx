import { adminSurfaceFrameAttributes } from "@jini-ai/agent-plugins/admin-surfaces";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "./hooks/agent-plugin-surfaces-port.hooks";
import { useAdminSurfaceFrame } from "./hooks/use-admin-surface-frame.hooks";

/**
 * @file One plugin-owned admin surface (for example a plugin's "Manage connection" screen) in
 * Jini's sandboxed frame: `sandbox="allow-scripts"` only (never `allow-same-origin`, which with
 * scripts would let the frame lift its own sandbox) and `referrerpolicy="no-referrer"`. Everything
 * the surface does goes through {@link useAdminSurfaceFrame}'s message gate.
 */

export interface AgentPluginSurfaceFrameProps {
  readonly pluginId: string;
  readonly surface: AgentPluginSurfaceSummary;
  readonly port: AgentPluginSurfacesPort;
  readonly t: Translate;
}

export function AgentPluginSurfaceFrame({ pluginId, surface, port, t }: AgentPluginSurfaceFrameProps) {
  const frame = useAdminSurfaceFrame({ pluginId, surface, port });
  if (frame.status === "navigated") return <p className="field-hint" role="status">{t("This view left its page and was closed. Close and reopen the plugin to use it again.")}</p>;
  if (frame.status === "failed") return <p className="field-hint" role="alert">{t("Could not open this view. Close and reopen the plugin to try again.")}</p>;
  const attributes = adminSurfaceFrameAttributes({ src: surface.src, title: surface.title });
  return (
    <div className="card">
      <iframe
        ref={frame.frameRef}
        src={attributes.src}
        title={attributes.title}
        sandbox={attributes.sandbox}
        referrerPolicy={attributes.referrerPolicy}
        onLoad={frame.onLoad}
        style={{ width: "100%", minHeight: "28rem", border: 0 }}
      />
    </div>
  );
}
