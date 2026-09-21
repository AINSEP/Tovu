import { agentHandle } from "@jini-ai/agentic";
import { useT } from "@jini-ai/ui";

import { useExternalMcpDriftCopy } from "./ExternalMcpSettingsPanel.hooks";
import { useExternalMcpToolsModalEscape } from "./ExternalMcpToolsModal.hooks";
import { ExternalMcpToolPicker } from "./ExternalMcpToolPicker";

/**
 * @file Per-server Tools modal (2026-09-10) — opened by the "Tools" button `ExternalMcpSettingsPanel.tsx`
 * now renders beside each configured server's card, replacing that file's own per-row Connection/Tools
 * `TabBar` (see its header's "Per-server Tools modal" section for why: with more than one configured
 * server, a flat tab strip left it ambiguous which server's Tools tab an operator was looking at —
 * owner call). Wraps the UNMODIFIED `ExternalMcpToolPicker` — same two-list wiring (allowlist + write
 * grant), same restart-drift footnote, same probe/refresh/save/cancel controls — inside a dialog
 * instead of a tab body; this file owns no picker state of its own, only the dialog chrome around it.
 *
 * Markup (backdrop, `.settings-dialog`), classes, and behaviour (Escape-to-close, click-off-to-close)
 * mirror `ExternalMcpRemoveConfirmDialog.tsx`'s own precedent — reused rather than re-invented, per
 * the outline's "Zero Jini change" rule for this surface. `.external-mcp-tools-modal`
 * (`styles/external-mcp-tool-picker.css`) widens the shared `.settings-dialog` the same way
 * `styles.css`'s own `.sitemap-modal` widens it for its own wide content; see that rule's comment for
 * why `width` (not just `max-width`) is required against `.settings-dialog-backdrop`'s
 * `place-items: center` shrink-to-fit sizing — a tool list that can run to 100+ rows needs the room.
 *
 * Closing this modal (Close, backdrop click, or Escape) never warns about unsaved picker edits. That
 * matches this feature's own PRIOR behaviour, not a new gap: under the old TabBar, switching from the
 * Tools tab back to Connection already unmounted `ExternalMcpToolPicker` — whose draft state
 * (`useWiredExternalMcpToolPicker`) lives in that component alone, not lifted — so an unsaved
 * selection was already silently discarded on tab-away. This modal's Close does the same thing the
 * old tab-away always did.
 */

export interface ExternalMcpToolsModalProps {
  /** The server's own display name (e.g. `sourceDisplayLabel(source, fieldSpecs)`) — must name the
   *  exact connection whose tools this modal edits, not a generic "this server's tools". */
  name: string;
  onClose: () => void;
  /** This card's own agent-handle base (e.g. `mcp-server-higgsfield`) — this modal's own Close
   *  control publishes as `<cardHandle>-tools-modal-close`, and `cardHandle` is threaded straight
   *  through to `ExternalMcpToolPicker` below, which derives ITS OWN base as `<cardHandle>-tools`
   *  (`toolPickerHandle`) — distinct from this modal's own `-tools-modal*` namespace so the two
   *  never collide, and distinct from the trigger button's own `<cardHandle>-tools-open` in
   *  `ExternalMcpSettingsPanel.tsx`. */
  cardHandle: string;
  /** The probe route's path parameter — see `ExternalMcpToolPicker`'s own `serverId` doc. */
  serverId: string;
  /** Whether the CONNECTION itself is switched on — see `ExternalMcpToolPicker`'s own doc. */
  connectionEnabled: boolean;
  allowedToolNames: string | undefined;
  writeAllowedToolNames: string | undefined;
  saving: boolean;
  onSave: (fields: { allowedToolNames: string; writeAllowedToolNames: string }) => void;
}

export function ExternalMcpToolsModal({
  name,
  onClose,
  cardHandle,
  serverId,
  connectionEnabled,
  allowedToolNames,
  writeAllowedToolNames,
  saving,
  onSave,
}: ExternalMcpToolsModalProps) {
  const { dialogRef, closeRef } = useExternalMcpToolsModalEscape(onClose);
  const t = useT();
  const tDrift = useExternalMcpDriftCopy();
  const titleId = `${cardHandle}-tools-modal-title`;

  return (
    <div className="settings-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="settings-dialog external-mcp-tools-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="external-mcp-tools-modal-head">
          <div>
            <p className="external-mcp-tools-modal-kicker">{tDrift("Tools")}</p>
            <h2 id={titleId}>{name}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn-secondary"
            onClick={onClose}
            {...agentHandle(`${cardHandle}-tools-modal-close`, { role: "button", label: `Close ${name}'s tool permissions` })}
          >
            {t("Close")}
          </button>
        </div>
        <div className="external-mcp-tools-modal-body">
          <ExternalMcpToolPicker
            serverId={serverId}
            active
            connectionEnabled={connectionEnabled}
            allowedToolNames={allowedToolNames}
            writeAllowedToolNames={writeAllowedToolNames}
            saving={saving}
            onSave={onSave}
            cardHandle={cardHandle}
          />
        </div>
      </div>
    </div>
  );
}
