import type { ExtEventRenderProps } from "@jini-ai/chat/react";
import { useAgentFailureCard } from "./AgentFailureCard.hooks";

export function AgentFailureCard(props: ExtEventRenderProps) {
  const failure = useAgentFailureCard(props, {});
  if (!failure) return null;
  return (
    <div className="admin-agent-failure jini-message-error" role="status">
      <p>{failure.reason}</p>
      {failure.hint ? <p>{failure.hint}</p> : null}
      {failure.switchAgent ? <button type="button" onClick={failure.switchAgent}>{failure.switchLabel}</button> : null}
      <details>
        <summary>Show details</summary>
        <pre>{failure.details}</pre>
      </details>
    </div>
  );
}
