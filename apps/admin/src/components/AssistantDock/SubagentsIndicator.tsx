import { useWiredAssistantSubagentsSettings } from "@/features/ai-assistant/hooks/use-admin-subagents.hooks";

/** Shows the persisted grant even if the current runtime is another CLI or BYOK. */
export function SubagentsIndicator({ t = (key: string) => key, useSettings = useWiredAssistantSubagentsSettings }: {
  t?: (key: string) => string; useSettings?: typeof useWiredAssistantSubagentsSettings;
}) {
  const { indicatorKey } = useSettings({});
  return indicatorKey
    ? <span className="jini-chat-pane__subagents" role="status">{t(indicatorKey)}</span>
    : null;
}
