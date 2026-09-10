import { useEffect } from "react";

import { buildPluginRemoveConfirmCopy, type PluginRemoveConfirmCopy } from "../rules";

/**
 * @file `PluginRemoveConfirmDialog`'s only two behaviours — Escape-to-cancel and the name-derived
 * copy — so the dialog component itself is only markup. Mirrors
 * `use-agent-plugin-disable-confirm.hooks.ts` (same split, same reason: `copy` is a derived value,
 * not something the component should compute inline) and
 * `features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts` (the precedent both dialogs
 * follow for a genuinely destructive remove).
 *
 * Not sharing either of those hooks directly: each is feature-local by its own header's stated
 * convention, and duplicating an 8-line Escape effect here is cheaper than a cross-file import for
 * a third single-consumer hook — same call this directory's own sibling hook already made.
 */

export interface PluginRemoveConfirmController {
  copy: PluginRemoveConfirmCopy;
}

export function usePluginRemoveConfirm(props: { name: string; onCancel: () => void }): PluginRemoveConfirmController {
  const { onCancel } = props;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  return { copy: buildPluginRemoveConfirmCopy({ name: props.name }) };
}
