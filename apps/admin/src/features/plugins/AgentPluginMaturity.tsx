import { InfoTip } from "@jini-ai/ui/admin-widgets";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { AdminAgentPlugin } from "@/lib/api";

/** Reuse the shared tap/keyboard tooltip; native titles leave touch users without the warning. */
export function AgentPluginMaturity({ maturity, t }: { maturity: AdminAgentPlugin["maturity"]; t: Translate }) {
  if (!maturity) return null;
  const label = maturity === "untested" ? t("Untested") : t("Soon");
  return (
    <span className="agent-plugin-maturity">
      <InfoTip
        triggerLabel={label}
        label={t("Not yet tested end to end. It may not work.")}
        icon={<span className="soon">{label}</span>}
      />
    </span>
  );
}
