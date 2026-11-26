import { bindExternalMcpSettingsPanel, type ExternalMcpSettingsPanelProps } from "@jini-ai/mcp/react/external-mcp/ExternalMcpSettingsPanel";
import { useSavedAllowedToolNamesById } from "@jini-ai/mcp/react/external-mcp/ExternalMcpSettingsPanel.hooks";
import { grantWriteFieldValue, describeDriftHeadline, parseSavedToolNames } from "@jini-ai/admin/screens/settings/external-mcp-tool-drift";
import { EXTERNAL_MCP_DRIFT_COPY } from "@jini-ai/admin/screens/settings/external-mcp-drift-copy";
import { ExternalMcpSharedChoice } from "@jini-ai/admin/screens/settings/ExternalMcpSharedChoice";
import { useHostExternalMcpSharedChoice } from "../../integrations/jini-admin/settings-external-mcp-shared-choice.hooks";
import { Icon, SourceConfigAddForm, SourceConfigItemCard, sourceDisplayLabel, useT, useWiredSourceConfigList } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { ExternalMcpRemoveConfirmDialog } from "@jini-ai/admin/screens/settings/ExternalMcpRemoveConfirmDialog";
import { useExternalMcpRemoveConfirm } from "@jini-ai/admin/screens/settings/hooks/use-external-mcp-remove-confirm.hooks";
import { useFocusTrap } from "@jini-ai/ui/panel-kit";
import { ConfirmActionDialog } from "@jini-ai/admin/shell/components/ConfirmActionDialog";
import { ExternalMcpToolsModal } from "@jini-ai/admin/screens/settings/ExternalMcpToolsModal";
import { useExternalMcpToolsModalEscape } from "@jini-ai/admin/screens/settings/ExternalMcpToolsModal.hooks";
import { useT as useKitT } from "@jini-ai/admin/react/kit";
import { EXTERNAL_MCP_PICKER_COLLABORATORS } from "./hooks/use-external-mcp-tool-picker.hooks";
import { useExternalMcpAddForm, useExternalMcpDriftCopy } from "./ExternalMcpSettingsPanel.hooks";
import { useWiredExternalMcpAdmissions } from "./hooks/use-external-mcp-admissions.hooks";
import { EXTERNAL_MCP_PRODUCT_VARS } from "../../integrations/jini-admin/settings-external-mcp-copy";
import { useHostExternalMcpOAuthConnect } from "../../integrations/jini-admin/settings-external-mcp-oauth-connect.hooks";
import { buildExternalMcpRemoveConfirmCopy, isBuiltInExternalMcpSource, buildExternalMcpFieldSpecs, EXTERNAL_MCP_ADD_FORM_HANDLE, externalMcpNeedsSignIn, resolveExternalMcpEffectiveAuthMode, buildExternalMcpCardHandles, resolveExternalMcpEffectiveTransport } from "@jini-ai/admin/screens/settings/rules";

/**
 * @file Tovu's own replacement for `@jini-ai/ui`'s assembled `ExternalMcpTab`, mounted by
 * `SettingsUi.tsx` in its place.
 *
 * `ExternalMcpTab` bundles the header/banner/empty-state/footer chrome AND the two feature hooks
 * (`useWiredSourceConfigList`/`useWiredSourceConfigAddForm`) behind one component that takes a single
 * static `fieldSpecs` prop. That was fine while every server was `stdio`-only; it stopped being
 * enough once a server's real shape depends on the operator's OWN in-progress choices — `stdio` vs
 * `streamable_http`, and `none`/`static_env`/`oauth` credentials. `ExternalMcpTab` has no way to make
 * its `fieldSpecs` prop reactive to a draft it holds privately, so this file recomposes the SAME
 * lower-level pieces (`useWiredSourceConfigList`, `useWiredSourceConfigAddForm`,
 * `SourceConfigAddForm`, `SourceConfigItemCard` — all public exports, no Jini edit involved) itself,
 * owning the add-form's field-spec computation directly. The chrome below is deliberately identical
 * to `ExternalMcpTab.tsx`'s (same class names, same copy for unchanged strings) so it inherits that
 * component's CSS for free from the already-imported `@jini-ai/ui/settings-dialog.css` and so an
 * operator sees no visual change beyond the new fields.
 *
 * ## The two-pass reactive field-spec sync
 *
 * `useWiredSourceConfigAddForm` takes `fieldSpecs` as an ordinary parameter — it is what seeds and
 * validates `values`, not something derived FROM `values`. So `fieldSpecs` cannot be a pure function
 * of the hook's own live draft in the same render that draft changed; the sync effect in
 * `useExternalMcpAddForm` (`ExternalMcpSettingsPanel.hooks.tsx`, which owns this form's state) is
 * exactly that one render of lag, made explicit rather than left to arise by accident. `transportGuess`/
 * `authModeGuess` track the LAST-KNOWN effective transport/auth-mode, and every render recomputes
 * `addFormFieldSpecs` from them; the moment the operator picks a different transport or auth mode,
 * the effect notices the mismatch against `addForm.values` and updates the guess, which — on the very
 * next render — re-derives `addFormFieldSpecs` and therefore what `useSourceConfigAddForm`'s own
 * `validateSourceDraft(fieldSpecs, values)` call requires and what `SourceConfigAddForm` renders.
 * React batches the state updates from the same event, so in practice this resolves within one commit
 * and reads as instant.
 *
 * ## Existing items don't get the same live reactivity while mid-edit
 *
 * Each `SourceConfigItemCard` is handed `fieldSpecs` computed from that ROW's last-SAVED
 * `transport`/`authMode` (`source.fields`), which is exactly right the moment "Edit" is clicked. But
 * `SourceConfigItemCard` owns its `editFields` draft internally (`@jini-ai/ui` does not expose it), so
 * if an operator changes an existing row's transport or auth mode mid-edit, the visible field set
 * does not re-derive until after saving and re-rendering. Disclosed rather than worked around: the
 * common path (setting the transport/auth mode once, when a connection is first created) gets full
 * reactivity via the add form above; changing an existing connection's transport is rare enough, and
 * remains fully correct at load and at save, that duplicating `SourceConfigItemCard`'s internal state
 * to close this gap was not judged worth the added surface for this pass.
 *
 * ## Agent handles
 *
 * The add form is published as `mcp-add` and each configured server as `mcp-server-<slug of its
 * id>`; the `@jini-ai/ui` components derive every control's own handle from those two bases (see
 * that package's `agent-handles.ts` for the scheme, and `rules.ts`'s `buildExternalMcpCardHandles`
 * for how the per-card bases are kept distinct). That is what lets the assistant fill this form on
 * the operator's behalf through `page.find_elements`/`page.fill`/`page.select_option` while the
 * operator watches — the whole point of the reactive form above: a novice asks for a connection
 * instead of learning which of fourteen fields apply to it.
 *
 * The agent does NOT get to finish the job alone, by design. `page.fill` refuses credential
 * fields, so `mcp-add-field-oauth-client-secret` is discoverable and correctly labelled but only a
 * human can type into it. That split is `@jini-ai/agentic`'s guard, not this file's, and is
 * deliberately not routed around.
 *
 * ## Remove asks first (2026-09-08)
 *
 * `SourceConfigItemCard`'s own "Remove" fires `onRemove` on click — no confirm step, and an
 * operator pressing it on a live OAuth connection loses its sealed secret for good (the read API
 * never returns it, so removal means reconnecting from scratch). Rather than editing that card in
 * Jini (this surface is Tovu-only per the outline's "Zero Jini change" rule), `onRemove` here opens
 * `ExternalMcpRemoveConfirmDialog` (`confirmRemoveId` below) and `list.remove` is only ever called
 * from that dialog's own Confirm — see `ExternalMcpRemoveConfirmSection`.
 *
 * ## Per-server Tools modal (2026-09-10, supersedes the 2026-09-08 Connection/Tools `TabBar`)
 *
 * Each configured server renders the unmodified `SourceConfigItemCard` plus a Tovu-owned "Tools"
 * button beside it (`ExternalMcpSourceRow` below), opening `ExternalMcpToolsModal` — a dialog
 * wrapping the unmodified `ExternalMcpToolPicker` — rather than switching to a second tab. This
 * replaces the per-row Connection/Tools `TabBar` this file used from 2026-09-08: with more than one
 * configured server, a flat tab strip left it ambiguous which server's Tools tab an operator was
 * looking at (owner call, 2026-09-10) — a per-row button names its own server unambiguously and
 * scales past two.
 *
 * `SourceConfigItemCard` still exposes no actions/children slot (`@jini-ai/ui`'s own
 * `SourceConfigItemCardProps` has neither), and the outline's "Zero Jini change" rule for this
 * surface still applies, so the button cannot render inside the card's own
 * `.source-config-item-card-actions` cluster next to Remove — the clean fix would be an optional
 * `actions?: ReactNode` prop on that card, rendered inside that same cluster; absent that, the
 * button renders as a Tovu-owned sibling instead (`.external-mcp-source-row` in
 * `styles/external-mcp-tool-picker.css`), `align-items: flex-start` so it stays pinned to the
 * card's own head band rather than drifting down when the card expands to show its fields — the
 * same "content left, action right, same row" idiom this screen's own `.external-mcp-head`
 * (h3/subtitle + "Add server") already uses one level up, applied per-row. This also increases the
 * visual distance between Tools and Remove versus the old tab strip, where both lived in the same
 * per-tab action cluster — deliberate, given Remove is unrecoverable (see "Remove asks first"
 * above).
 *
 * The button still carries the SAVED tool count (`enabledToolCount`, from `parseSavedToolNames`),
 * unchanged from the old tab's own `count`: it must be correct before any probe has run, and
 * deriving it from the picker would mean hoisting that component's state out of itself for a number
 * the roster row already carries. Unlike the old tab, the modal only ever MOUNTS
 * `ExternalMcpToolPicker` while open (`toolsOpen` below) — same as the tab's own conditional render
 * did — so the outbound probe still never fires until an operator actually asks to see this
 * server's tools.
 */

export const hooks: ExternalMcpSettingsPanelProps["hooks"] = {
  useTHook: useT,
  useExternalMcpDriftCopyHook: useExternalMcpDriftCopy,
  useWiredSourceConfigListHook: useWiredSourceConfigList,
  useExternalMcpAddFormHook: useExternalMcpAddForm,
  useSavedAllowedToolNamesByIdHook: useSavedAllowedToolNamesById,
  useExternalMcpAdmissionsHook: useWiredExternalMcpAdmissions,
  useConnect: useHostExternalMcpOAuthConnect,
  useKitT, useFocusTrap, useExternalMcpToolsModalEscape,
  useExternalMcpRemoveConfirm, useHostExternalMcpSharedChoice,
};

export const kit: ExternalMcpSettingsPanelProps["kit"] = {
  Icon, InfoTip, SourceConfigAddForm, SourceConfigItemCard,
  ExternalMcpSharedChoice, ExternalMcpToolsModal, ExternalMcpRemoveConfirmDialog,
  ConfirmActionDialog,
};

export const deps: ExternalMcpSettingsPanelProps["deps"] = {
  buildExternalMcpCardHandles, buildExternalMcpFieldSpecs, sourceDisplayLabel,
  isBuiltInExternalMcpSource, externalMcpNeedsSignIn,
  resolveExternalMcpEffectiveTransport, resolveExternalMcpEffectiveAuthMode,
  parseSavedToolNames, grantWriteFieldValue, describeDriftHeadline,
  buildExternalMcpRemoveConfirmCopy, EXTERNAL_MCP_DRIFT_COPY,
  EXTERNAL_MCP_PICKER_COLLABORATORS, EXTERNAL_MCP_PRODUCT_VARS,
  EXTERNAL_MCP_ADD_FORM_HANDLE,
};

export const ExternalMcpSettingsPanel = bindExternalMcpSettingsPanel({ hooks, kit, deps });
