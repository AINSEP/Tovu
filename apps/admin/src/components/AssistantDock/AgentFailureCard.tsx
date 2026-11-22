import { useMemo } from "react";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { useT, type ExtEventRenderProps } from "@jini-ai/chat/react";
import { formatUserFacingError } from "@jini-ai/core";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import { useAgentFailureCard } from "./AgentFailureCard.hooks";

export function AgentFailureCard({
  useTHook = useT,
  useAgentFailureCardHook = useAgentFailureCard, ...props }: (ExtEventRenderProps) & {
  useTHook?: typeof useT;
  useAgentFailureCardHook?: typeof useAgentFailureCard; }) {
  const t = useTHook();
  const failure = useAgentFailureCardHook(props, {});
  const formatted = useMemo(() => failure ? formatUserFacingError({ message: failure.reason,
    action: failure.hint ?? t("Review the saved work above before sending another message. Copy details and report this problem."),
    step: failure.agentId ? `assistant answer (${failure.agentId})` : "assistant answer", cause: failure.details }, TOVU_ERROR_REDACTION_OPTIONS) : null, [failure?.reason, failure?.hint, failure?.agentId, failure?.details, t]);
  if (!failure || !formatted) return null;
  return (
    <div className="admin-agent-failure jini-message-error">
      <ErrorNotice failure={formatted} t={t} className="notice error" role="status" />
      <AgentFailureAction failure={failure} />
    </div>
  );
}

function AgentFailureAction({ failure }: { failure: NonNullable<ReturnType<typeof useAgentFailureCard>> }) {
  return failure.switchAgent ? <button type="button" onClick={failure.switchAgent}>{failure.switchLabel}</button> : null;
}
