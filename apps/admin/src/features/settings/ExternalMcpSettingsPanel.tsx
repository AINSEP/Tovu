import { useState } from "react";
import {
  Icon,
  SourceConfigAddForm,
  SourceConfigItemCard,
  sourceDisplayLabel,
  useT,
  useWiredSourceConfigAddForm,
  useWiredSourceConfigList,
  type SourceConfigDependencies,
  type SourceConfigItem,
} from "@jini-ai/ui";
import { agentHandle } from "@jini-ai/agentic";

import type { Translate } from "@/lib/dictionary-translator";

import { ExternalMcpAdmissionsBanner } from "./ExternalMcpAdmissionsBanner";
import { ExternalMcpRemoveConfirmDialog } from "./ExternalMcpRemoveConfirmDialog";
import { ExternalMcpToolsModal } from "./ExternalMcpToolsModal";
import { parseSavedToolNames } from "./external-mcp-admissions-rules";
import {
  buildAllowWritePatch,
  resolveExternalMcpCardHandles,
  useExternalMcpAddForm,
  useExternalMcpDriftCopy,
  useSavedAllowedToolNamesById,
} from "./ExternalMcpSettingsPanel.hooks";
import { useWiredExternalMcpAdmissions } from "./hooks/use-external-mcp-admissions.hooks";
import { buildExternalMcpFieldSpecs, EXTERNAL_MCP_ADD_FORM_HANDLE, resolveExternalMcpEffectiveAuthMode } from "./rules";

/**
 * Mirrors `@jini-ai/ui`'s own `source-config-list/constants.ts`'s `DRAFT_TEST_SCOPE` — the pseudo-id
 * that feature's `useSourceConfigList().test`/`.isPending`/`.testResults` key a "test before save"
 * call on, for the add-form's still-unsaved draft. Not part of that package's public barrel (only
 * `MASK_CHAR` and its two siblings are re-exported from `constants.ts`), so it is restated here
 * rather than imported — same restatement `use-external-mcp.hooks.ts`'s own header describes for
 * `SourceUpdateInput`. Must keep matching the private constant it mirrors; `ExternalMcpTab.tsx` in
 * Jini is the source of truth for the literal value.
 */
const DRAFT_TEST_SCOPE = "__draft__";

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

/** The "Add server" form, split out from `ExternalMcpSettingsPanel` purely to keep that
 *  component's own cognitive complexity under the gate — same conditional rendering, same two
 *  presence-only prop spreads (`submitError`, the draft's own `testResult`), just out of the
 *  parent's nesting scope. `null` while the form is closed, same as the inline ternary it replaces. */
function ExternalMcpAddFormSection(props: {
  open: boolean;
  fieldSpecs: ReturnType<typeof buildExternalMcpFieldSpecs>;
  addForm: ReturnType<typeof useWiredSourceConfigAddForm<SourceConfigItem>>;
  canTest: boolean;
  testing: boolean;
  testResult: ReturnType<typeof useWiredSourceConfigList<SourceConfigItem>>["testResults"][string];
  onTest: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  const { fieldSpecs, addForm, canTest, testing, testResult, onTest, onCancel } = props;
  return (
    <SourceConfigAddForm
      fieldSpecs={fieldSpecs}
      values={addForm.values}
      validation={addForm.validation}
      submitAttempted={addForm.submitAttempted}
      submitting={addForm.submitting}
      {...(addForm.submitError ? { submitError: addForm.submitError } : {})}
      onFieldChange={addForm.setField}
      onTrustChange={() => {}}
      onSubmit={() => void addForm.submit()}
      canTest={canTest}
      testing={testing}
      {...(testResult ? { testResult } : {})}
      onTest={onTest}
      addLabel="Add server"
      agentHandle={EXTERNAL_MCP_ADD_FORM_HANDLE}
      onCancel={onCancel}
    />
  );
}

/** The unmodified `SourceConfigItemCard`, exactly as it rendered before the Connection/Tools tab
 *  split ever existed (and still does — see this file's "Per-server Tools modal" header, the modal
 *  replaced the TABS, not this card). Split into its own component so its `testResult`
 *  presence-spread is not a conditional expression NESTED inside {@link ExternalMcpSourceRow}'s own
 *  JSX — `sonarjs/no-nested-conditional`'s complaint about the shape, not about anything the values
 *  do. */
function ExternalMcpConnectionCard(props: {
  source: SourceConfigItem;
  cardHandle: string;
  fieldSpecs: ReturnType<typeof buildExternalMcpFieldSpecs>;
  list: ReturnType<typeof useWiredSourceConfigList<SourceConfigItem>>;
  onRequestRemove: (sourceId: string) => void;
}) {
  const { source, cardHandle, fieldSpecs, list, onRequestRemove } = props;
  const testResult = list.testResults[source.id];
  return (
    <SourceConfigItemCard
      source={source}
      agentHandle={cardHandle}
      fieldSpecs={fieldSpecs}
      capabilities={list.capabilities}
      removing={list.isPending(source.id, "remove")}
      refreshing={list.isPending(source.id, "refresh")}
      settingTrust={list.isPending(source.id, "trust")}
      testing={list.isPending(source.id, "test")}
      updating={list.isPending(source.id, "update")}
      onRefresh={() => void list.refresh(source.id)}
      onRemove={() => onRequestRemove(source.id)}
      onTrustChange={() => {}}
      onTest={() => void list.test(source.id)}
      onUpdate={(patch) => void list.update(source.id, patch)}
      {...(testResult ? { testResult } : {})}
    />
  );
}

/** One server's row: the (unmodified) card plus a Tovu-owned "Tools" button that opens
 *  {@link ExternalMcpToolsModal} — see this file's own "Per-server Tools modal" header. Split out of
 *  {@link ExternalMcpSourcesSection}'s own `.map()` for the same complexity-budget reason as
 *  {@link ExternalMcpAddFormSection} above. Owns its own modal-open state: whether an operator has
 *  THIS server's tools open has no bearing on any other server or on the rest of the panel. `tDrift`
 *  is still threaded through despite this row no longer rendering a `TabBar` itself — kept as a
 *  parameter (rather than dropped and re-added) because {@link ExternalMcpToolsModal} needs the same
 *  translator for its own "Tools" kicker and calls it itself; this row has no copy of its own left
 *  to translate. */
function ExternalMcpSourceRow(props: {
  source: SourceConfigItem;
  cardHandle: string;
  list: ReturnType<typeof useWiredSourceConfigList<SourceConfigItem>>;
  tDrift: Translate;
  /** Opens the remove-confirmation dialog for this source id, instead of deleting immediately —
   *  see this file's own "Remove asks first" header note. */
  onRequestRemove: (sourceId: string) => void;
}) {
  const { source, cardHandle, list, tDrift, onRequestRemove } = props;
  const [toolsOpen, setToolsOpen] = useState(false);
  const fieldSpecs = buildExternalMcpFieldSpecs(source.fields, tDrift);
  // The SAVED count, not the picker's own draft — see this file's header on why.
  const enabledToolCount = parseSavedToolNames(source.fields["allowedToolNames"]).length;
  const rowLabel = sourceDisplayLabel(source, fieldSpecs);

  return (
    <div className="external-mcp-source">
      <div className="external-mcp-source-row">
        <div className="external-mcp-source-card">
          <ExternalMcpConnectionCard
            source={source}
            cardHandle={cardHandle}
            fieldSpecs={fieldSpecs}
            list={list}
            onRequestRemove={onRequestRemove}
          />
        </div>
        <button
          type="button"
          className="external-mcp-source-tools-open"
          onClick={() => setToolsOpen(true)}
          // A real `aria-label`, not just `agentHandle`'s own `label` (which only emits
          // `data-agent-label` — agent-facing metadata, invisible to `getByRole`/screen readers, per
          // `ToolPickerRowItem`'s own header note on the identical gap). This button's own visible
          // text is just "Tools" plus the bare count badge, which names neither the server nor what
          // the number means on its own — mirrors `SourceConfigItemCard`'s own enable-toggle
          // (`enabledLabel` set as BOTH `aria-label` and the agentHandle `label`, from `@jini-ai/ui`'s
          // own source) rather than inventing a new convention.
          aria-label={`Open tool permissions for ${rowLabel} — ${enabledToolCount} enabled`}
          {...agentHandle(`${cardHandle}-tools-open`, {
            role: "button",
            label: `Open tool permissions for ${rowLabel} — ${enabledToolCount} enabled`,
          })}
        >
          <span>{tDrift("Tools")}</span>
          <span className="external-mcp-source-tools-count">{enabledToolCount}</span>
        </button>
      </div>

      {toolsOpen ? (
        <ExternalMcpToolsModal
          name={rowLabel}
          cardHandle={cardHandle}
          onClose={() => setToolsOpen(false)}
          serverId={source.id}
          connectionEnabled={source.enabled ?? true}
          allowedToolNames={source.fields["allowedToolNames"]}
          writeAllowedToolNames={source.fields["writeAllowedToolNames"]}
          saving={list.isPending(source.id, "update")}
          onSave={(fields) => void list.update(source.id, { fields })}
        />
      ) : null}
    </div>
  );
}

/** The loading / empty-state / configured-server-list body, split out for the same
 *  complexity-budget reason as {@link ExternalMcpAddFormSection} above — the triple-branch
 *  loading/empty/list ternary was the parent's deepest nesting. Each configured server is now one
 *  {@link ExternalMcpSourceRow}, which owns the per-card `testResult` presence-spread and its own
 *  Tools-modal-open state. */
function ExternalMcpSourcesSection(props: {
  list: ReturnType<typeof useWiredSourceConfigList<SourceConfigItem>>;
  cardHandles: string[];
  t: Translate;
  tDrift: Translate;
  /** Opens the remove-confirmation dialog for this source id, instead of deleting immediately —
   *  see this file's own "Remove asks first" header note. */
  onRequestRemove: (sourceId: string) => void;
}) {
  const { list, cardHandles, t, tDrift, onRequestRemove } = props;

  if (list.loading) {
    return (
      <div className="source-config-list-loading" role="status">
        {t("Loading…")}
      </div>
    );
  }

  if (list.sources.length === 0) {
    return (
      <div className="external-mcp-empty">
        <p className="external-mcp-empty-title">{t("No MCP servers configured.")}</p>
        <p className="external-mcp-empty-hint">
          {t('Click "Add server" to get started — pick a local command or a hosted server.')}
        </p>
      </div>
    );
  }

  return (
    <div className="source-config-list-items">
      {list.sources.map((source, index) => (
        <ExternalMcpSourceRow
          key={source.id}
          source={source}
          cardHandle={cardHandles[index]!}
          list={list}
          tDrift={tDrift}
          onRequestRemove={onRequestRemove}
        />
      ))}
    </div>
  );
}

/** The remove-confirmation dialog, split out for the same complexity-budget reason as
 *  {@link ExternalMcpAddFormSection}/{@link ExternalMcpSourcesSection} above. Renders nothing until
 *  `confirmRemoveId` names a still-configured source — cleared (by the panel) the instant Confirm
 *  or Cancel resolves, so a stale id from a source removed some other way (e.g. a second tab)
 *  degrades to "no dialog" rather than throwing on a missing source. */
function ExternalMcpRemoveConfirmSection(props: {
  confirmRemoveId: string | null;
  sources: readonly SourceConfigItem[];
  cardHandles: string[];
  t: ReturnType<typeof useT>;
  tDrift: Translate;
  onConfirm: (sourceId: string) => void;
  onCancel: () => void;
}) {
  const { confirmRemoveId, sources, cardHandles, tDrift, onConfirm, onCancel } = props;
  if (confirmRemoveId === null) return null;
  const index = sources.findIndex((source) => source.id === confirmRemoveId);
  if (index === -1) return null;
  const source = sources[index]!;

  return (
    <ExternalMcpRemoveConfirmDialog
      name={sourceDisplayLabel(source, buildExternalMcpFieldSpecs(source.fields, tDrift))}
      isOAuth={resolveExternalMcpEffectiveAuthMode(source.fields) === "oauth"}
      cardHandle={cardHandles[index]!}
      onConfirm={() => onConfirm(source.id)}
      onCancel={onCancel}
      t={tDrift}
    />
  );
}

export interface ExternalMcpSettingsPanelProps {
  dependencies: SourceConfigDependencies<SourceConfigItem>;
  /** Footer save-status pill text (e.g. the restart notice). Omit to render no footer at all. */
  saveStatusLabel?: string;
  /** Whether to render the "External MCP servers" heading. Defaults to `true` (this panel's
   *  original, standalone-tab rendering). `Providers.tsx` passes `false`: on that screen this panel
   *  already mounts under a `TabBar` tab labelled "External MCP", so the heading directly under it
   *  was a duplicate of the tab an operator just clicked, not new information. The subtitle
   *  ("Third-party tools for your coding agent.") renders regardless of this prop — it is the only
   *  place that explains what this specific tab configures; `Providers.tsx`'s own page-level
   *  description covers all four of its tabs, not this one alone. */
  showTitle?: boolean;
}

export function ExternalMcpSettingsPanel({ dependencies, saveStatusLabel, showTitle = true }: ExternalMcpSettingsPanelProps) {
  const t = useT();
  // The id of the source Remove was pressed for, until Confirm or Cancel resolves it — see this
  // file's own "Remove asks first" header note. `null` means no confirmation dialog is open.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const list = useWiredSourceConfigList<SourceConfigItem>({ dependencies });
  // The "Add server" form: open state, draft, and the lagged field-spec sync this file's header
  // describes — all owned by the hook.
  const { formOpen, toggleForm, cancelForm, fieldSpecs: addFormFieldSpecs, addForm } = useExternalMcpAddForm({
    dependencies,
    list,
  });

  const banner = list.error;
  const cardHandles = resolveExternalMcpCardHandles(list.sources);

  // What the RUNNING assistant admitted, as opposed to what this tab saved — two different objects,
  // because `mcp-federation/trust.ts` R5 freezes the admitted set at connect. Until this banner
  // existed the gap was visible only in the daemon's boot terminal.
  const savedAllowedToolNamesById = useSavedAllowedToolNamesById(list.sources);
  const admissions = useWiredExternalMcpAdmissions(savedAllowedToolNamesById);
  const tDrift = useExternalMcpDriftCopy();

  return (
    <section className="external-mcp-tab">
      <div className="external-mcp-head">
        <div>
          {showTitle ? <h3>{t("External MCP servers")}</h3> : null}
          <p className="external-mcp-subtitle">{t("Third-party tools for your coding agent.")}</p>
        </div>
        <button
          type="button"
          className="external-mcp-add-button"
          onClick={toggleForm}
          aria-expanded={formOpen}
        >
          <Icon name="plus" size={14} />
          <span>{t("Add server")}</span>
        </button>
      </div>

      {banner ? (
        <div className="external-mcp-banner" role="alert">
          {t(banner)}
        </div>
      ) : null}

      <ExternalMcpAddFormSection
        open={formOpen}
        fieldSpecs={addFormFieldSpecs}
        addForm={addForm}
        canTest={list.capabilities.canTest}
        testing={list.isPending(DRAFT_TEST_SCOPE, "test")}
        testResult={list.testResults[DRAFT_TEST_SCOPE]}
        onTest={() => void list.test(undefined, addForm.values)}
        // Cancel discards the draft, not just hides it — see `useExternalMcpAddForm`'s `cancelForm`.
        onCancel={cancelForm}
      />

      <ExternalMcpAdmissionsBanner
        controller={admissions}
        t={tDrift}
        onAllowWrite={(connectionId, remoteName) => {
          const patch = buildAllowWritePatch(list.sources, connectionId, remoteName);
          if (patch) void list.update(connectionId, patch);
        }}
      />

      <ExternalMcpSourcesSection
        list={list}
        cardHandles={cardHandles}
        t={t}
        tDrift={tDrift}
        onRequestRemove={setConfirmRemoveId}
      />

      <ExternalMcpRemoveConfirmSection
        confirmRemoveId={confirmRemoveId}
        sources={list.sources}
        cardHandles={cardHandles}
        t={t}
        tDrift={tDrift}
        onConfirm={(sourceId) => {
          setConfirmRemoveId(null);
          void list.remove(sourceId);
        }}
        onCancel={() => setConfirmRemoveId(null)}
      />

      {saveStatusLabel ? (
        <div className="external-mcp-footer">
          <span className="external-mcp-save-pill">{t(saveStatusLabel)}</span>
        </div>
      ) : null}
    </section>
  );
}
