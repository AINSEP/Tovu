import { useEffect } from "react";

import { buildAgentPluginDisableConfirmCopy, type AgentPluginDisableConfirmCopy } from "../rules";

/**
 * @file `AgentPluginDisableConfirmDialog`'s only two behaviours — Escape-to-cancel and the
 * name-derived copy — so the dialog component itself is only markup. Mirrors
 * `features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts` (same split, same reason:
 * `copy` is a derived value, not something the component should compute inline).
 *
 * Not sharing that settings hook directly: it is feature-local by its own header's stated
 * convention (one consumer, `features/settings`), and duplicating an 8-line Escape effect here is
 * cheaper than a cross-feature import for a second single-consumer hook. If a third confirm dialog
 * needs the same listener, that is the point to extract a shared one, not before.
 */

export interface AgentPluginDisableConfirmController {
  copy: AgentPluginDisableConfirmCopy;
}

export function useAgentPluginDisableConfirm(props: {
  name: string;
  variant: "disable" | "remove";
  onCancel: () => void;
}): AgentPluginDisableConfirmController {
  const { onCancel } = props;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  return { copy: buildAgentPluginDisableConfirmCopy({ name: props.name, variant: props.variant }) };
}
