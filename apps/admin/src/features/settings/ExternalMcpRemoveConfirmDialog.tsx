import { agentHandle } from "@jini-ai/agentic";
import type { useT } from "@jini-ai/ui";

import { useExternalMcpRemoveConfirm } from "./hooks/use-external-mcp-remove-confirm.hooks";

/**
 * @file Confirmation gate in front of `SourceConfigItemCard`'s "Remove" — added after an operator
 * pressed it on a live, fully-configured OAuth connection and lost it immediately, with no way
 * back (the sealed OAuth secret is never returned by the read API, so removal meant reconnecting
 * from scratch). `@jini-ai/ui`'s card cannot own this itself (`onRemove` fires on click, no
 * confirm step) and stays unmodified per the outline's "Zero Jini change" rule for this surface —
 * `ExternalMcpSettingsPanel.tsx` intercepts the callback instead and only calls the port's
 * `remove` once this dialog's own Confirm is pressed.
 *
 * Markup, classes (`settings-dialog`/`settings-dialog-backdrop`, `btn-secondary`/`btn-danger`),
 * and behaviour (Escape-to-cancel via the paired hook, Cancel default-focused so the destructive
 * action is never the default) all mirror `features/collections/Collections.tsx`'s
 * `LifecycleConfirmDialog` — the most recent precedent for exactly this shape of dialog in this
 * app, reused rather than re-invented. `.btn-secondary`/`.btn-danger` already declare `color`
 * explicitly in `styles.css` (verified: lines 1084/1088), so this does not trip the global
 * `button { color: var(--primary-ink) }` reset that made the sibling card's own pills briefly ship
 * invisible — no new CSS is added here.
 */

export interface ExternalMcpRemoveConfirmDialogProps {
  /** The server's own display name, e.g. `sourceDisplayLabel(source, fieldSpecs)` — must name
   *  the exact connection being removed, not a generic "this connection". */
  name: string;
  /** Whether this connection's credential is an OAuth-sealed secret — changes the body copy
   *  (see `buildExternalMcpRemoveConfirmCopy`). */
  isOAuth: boolean;
  /** This card's own agent-handle base (e.g. `mcp-server-higgsfield`) — Cancel publishes as
   *  `<cardHandle>-remove-cancel` (Confirm has no handle: a permanent remove is a human-only
   *  step), nesting under the card's
   *  already-published `<cardHandle>-remove` the same way `-field-<key>-reveal` nests under
   *  `-field-<key>` in `@jini-ai/ui`'s own `agent-handles.ts` scheme. */
  cardHandle: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** The panel's own translator (`useT()` from `@jini-ai/ui`) — threaded down rather than called
   *  again here, same convention `Collections.tsx` uses to hand `t` to `LifecycleConfirmDialog`. */
  t: ReturnType<typeof useT>;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useExternalMcpRemoveConfirmHook?: typeof useExternalMcpRemoveConfirm;
}

export function ExternalMcpRemoveConfirmDialog({
  name,
  isOAuth,
  cardHandle,
  onConfirm,
  onCancel,
  t,
  useExternalMcpRemoveConfirmHook = useExternalMcpRemoveConfirm,
}: ExternalMcpRemoveConfirmDialogProps) {
  const { copy, dialogRef } = useExternalMcpRemoveConfirmHook({ name, isOAuth, onCancel, t });
  const titleId = `${cardHandle}-remove-confirm-title`;

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{copy.title}</h2>
        <p>{copy.body}</p>
        <span className="editor-actions">
          {/* Cancel is the default-focused control — this action is not reversible from this
              screen (an OAuth secret cannot be recovered), matching `LifecycleConfirmDialog`'s
              own "Tombstone" precedent for the same reason. */}
          <button
            type="button"
            className="btn-secondary"
            autoFocus
            onClick={onCancel}
            {...agentHandle(`${cardHandle}-remove-cancel`, {
              role: "button",
              label: `Close this dialog without removing ${name}`,
            })}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
          >
            {t("Remove")}
          </button>
        </span>
      </div>
    </div>
  );
}
