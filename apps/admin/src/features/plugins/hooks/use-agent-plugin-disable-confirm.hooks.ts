import { useEffect, useRef, type RefObject } from "react";

import { useFocusTrap } from "@/hooks/use-focus-trap.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { buildAgentPluginDisableConfirmCopy, type AgentPluginDisableConfirmCopy } from "../rules";

/**
 * @file `AgentPluginDisableConfirmDialog`'s three behaviours — Escape-to-cancel, the name-derived
 * copy, and (2026-09-20 platform review, Finding 4) the Tab focus trap — so the dialog component
 * itself is only markup. Mirrors `features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts`
 * (same split, same reason: `copy` is a derived value, not something the component should compute
 * inline).
 *
 * Not sharing that settings hook directly: it is feature-local by its own header's stated
 * convention (one consumer, `features/settings`), and duplicating an 8-line Escape effect here is
 * cheaper than a cross-feature import for a second single-consumer hook. If a third confirm dialog
 * needs the same listener, that is the point to extract a shared one, not before.
 *
 * Focus trap (Finding 4): same gap and same fix as `use-plugin-remove-confirm.hooks.ts`'s sibling
 * hook — see that file's header for the full rationale. Wired through the shared `useFocusTrap`
 * primitive (`ebcda9aae`) here, not in the component body.
 */

export interface AgentPluginDisableConfirmController {
  copy: AgentPluginDisableConfirmCopy;
  /** Attach to the `role="dialog"` div — see this file's header. */
  dialogRef: RefObject<HTMLDivElement | null>;
}

export function useAgentPluginDisableConfirm(props: {
  name: string;
  variant: "disable" | "remove";
  onCancel: () => void;
  t?: Translate;
}): AgentPluginDisableConfirmController {
  const { onCancel } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  return { copy: buildAgentPluginDisableConfirmCopy({ name: props.name, variant: props.variant }, props.t), dialogRef };
}
