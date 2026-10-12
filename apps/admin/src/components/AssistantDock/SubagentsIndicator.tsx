import { useWiredAssistantSubagentsSettings } from "@/features/ai-assistant/hooks/use-admin-subagents.hooks";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { RemixIcon } from "@jini-ai/ui";

/**
 * Runtime/grant visibility comes from the hook. The tip is the shared white `InfoTip` bubble, opening
 * BELOW the icon (owner, 2026-10-10: the native `title` tooltip was dark, slow and came with a
 * question-mark cursor). The icon sits beside the conversation switcher in the dock header.
 */
export function SubagentsIndicator({ mode, agentId, t = (key: string) => key, useSettings = useWiredAssistantSubagentsSettings }: {
  mode: string; agentId: string | null;
  t?: (key: string) => string; useSettings?: typeof useWiredAssistantSubagentsSettings;
}) {
  const { tooltipKey } = useSettings({ mode, agentId });
  return tooltipKey
    ? <span className="jini-chat-pane__subagents" role="status">
        <InfoTip label={t(tooltipKey)} placement="bottom" agentHandle="assistant-subagents-indicator"
          icon={<RemixIcon name="group-line" size={16} />} />
      </span>
    : null;
}
