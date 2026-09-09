import { useEffect, useState } from "react";
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

import { TabBar } from "@/components/TabBar";
import type { Translate } from "@/lib/dictionary-translator";

import { ExternalMcpAdmissionsBanner } from "./ExternalMcpAdmissionsBanner";
import { ExternalMcpRemoveConfirmDialog } from "./ExternalMcpRemoveConfirmDialog";
import { ExternalMcpToolPicker } from "./ExternalMcpToolPicker";
import { parseSavedToolNames } from "./external-mcp-admissions-rules";
import {
  buildAllowWritePatch,
  resolveExternalMcpCardHandles,
  useExternalMcpDriftCopy,
  useSavedAllowedToolNamesById,
} from "./ExternalMcpSettingsPanel.hooks";
import { useWiredExternalMcpAdmissions } from "./hooks/use-external-mcp-admissions.hooks";
import {
  buildExternalMcpFieldSpecs,
  EXTERNAL_MCP_ADD_FORM_HANDLE,
  resolveExternalMcpEffectiveAuthMode,
  resolveExternalMcpEffectiveTransport,
} from "./rules";

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
 * of the hook's own live draft in the same render that draft changed; the effect below is exactly
 * that one render of lag, made explicit rather than left to arise by accident. `transportGuess`/
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
 * ## Connection / Tools tabs (2026-09-08, Phase 4 of the write-tools outline)
 *
 * Each configured server now renders behind a Tovu-owned `TabBar` — Connection (the unmodified
 * `SourceConfigItemCard`, default-active) and Tools (`ExternalMcpToolPicker`) — rather than the
 * card alone. Outline §3.5 rules out a Jini field or a Jini prop for this: `SourceFieldKind` has no
 * checkbox/multi-select variant and `SourceConfigItemCard` exposes no children slot, so the split
 * is wrapper tabs around the card, entirely in this file. `ExternalMcpSourceRow` owns which tab is
 * active for exactly one server — that state has no bearing on any other server or on the rest of
 * this panel, so it is not lifted any higher than the row that needs it.
 *
 * Connection stays the DEFAULT tab deliberately: it is what every existing test in this suite (and
 * `external-mcp-agent-drive.unit.test.tsx`) expects to find without switching tabs first, and it is
 * also where the server-level controls (the enable toggle, on the card; Remove, via the dialog
 * above) live. The Tools tab does NOT duplicate either — see `ExternalMcpToolPicker`'s own header on
 * why a second live control for the same state would be worse than one control a tab away, and its
 * `connectionEnabled` prop for how a switched-off connection is still surfaced there.
 *
 * The Tools tab's `TabBar` `count` is read from the SAVED `allowedToolNames` field
 * (`parseSavedToolNames`), not from the picker's own draft state: it must be correct before any
 * probe has run, and deriving it from the picker would mean hoisting that component's state out of
 * itself for a number the roster row already carries.
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
}) {
  if (!props.open) return null;
  const { fieldSpecs, addForm, canTest, testing, testResult, onTest } = props;
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
    />
  );
}

type ExternalMcpTabId = "connection" | "tools";

/** The Connection tab's body — the unmodified `SourceConfigItemCard`, exactly as it rendered before
 *  the tab split existed. Split into its own component (rather than inlined in
 *  {@link ExternalMcpSourceRow}'s own tab ternary) purely so its `testResult` presence-spread is not
 *  a conditional expression NESTED inside that outer ternary — `sonarjs/no-nested-conditional`'s
 *  complaint about the shape, not about anything the values do. */
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

/** One server's row: the Connection/Tools `TabBar` wrapping the (unmodified) card and the
 *  write-tool picker — see this file's own "Connection / Tools tabs" header. Split out of
 *  {@link ExternalMcpSourcesSection}'s own `.map()` for the same complexity-budget reason as
 *  {@link ExternalMcpAddFormSection} above. Owns its own active-tab state: which tab an operator is
 *  looking at for ONE server has no bearing on any other server or on the rest of the panel. */
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
  const [tab, setTab] = useState<ExternalMcpTabId>("connection");
  const fieldSpecs = buildExternalMcpFieldSpecs(source.fields);
  // The SAVED count, not the picker's own draft — see this file's header on why.
  const enabledToolCount = parseSavedToolNames(source.fields["allowedToolNames"]).length;
  const rowLabel = sourceDisplayLabel(source, fieldSpecs);

  return (
    <div className="external-mcp-source">
      <TabBar
        tabs={[
          {
            id: "connection",
            label: tDrift("Connection"),
            handle: `${cardHandle}-tab-connection`,
            handleLabel: `Show the Connection settings for ${rowLabel}`,
          },
          {
            id: "tools",
            label: tDrift("Tools"),
            count: enabledToolCount,
            handle: `${cardHandle}-tab-tools`,
            handleLabel: `Show the Tools settings for ${rowLabel}`,
          },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as ExternalMcpTabId)}
        ariaLabel={`${rowLabel} settings`}
        containerHandle={`${cardHandle}-tabs`}
      />

      {tab === "connection" ? (
        <ExternalMcpConnectionCard
          source={source}
          cardHandle={cardHandle}
          fieldSpecs={fieldSpecs}
          list={list}
          onRequestRemove={onRequestRemove}
        />
      ) : (
        <ExternalMcpToolPicker
          serverId={source.id}
          active
          connectionEnabled={source.enabled ?? true}
          allowedToolNames={source.fields["allowedToolNames"]}
          writeAllowedToolNames={source.fields["writeAllowedToolNames"]}
          saving={list.isPending(source.id, "update")}
          onSave={(fields) => void list.update(source.id, { fields })}
          cardHandle={cardHandle}
        />
      )}
    </div>
  );
}

/** The loading / empty-state / configured-server-list body, split out for the same
 *  complexity-budget reason as {@link ExternalMcpAddFormSection} above — the triple-branch
 *  loading/empty/list ternary was the parent's deepest nesting. Each configured server is now one
 *  {@link ExternalMcpSourceRow}, which owns the per-card `testResult` presence-spread and the new
 *  tab state that used to sit inline here. */
function ExternalMcpSourcesSection(props: {
  list: ReturnType<typeof useWiredSourceConfigList<SourceConfigItem>>;
  cardHandles: string[];
  t: ReturnType<typeof useT>;
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
  onConfirm: (sourceId: string) => void;
  onCancel: () => void;
}) {
  const { confirmRemoveId, sources, cardHandles, t, onConfirm, onCancel } = props;
  if (confirmRemoveId === null) return null;
  const index = sources.findIndex((source) => source.id === confirmRemoveId);
  if (index === -1) return null;
  const source = sources[index]!;

  return (
    <ExternalMcpRemoveConfirmDialog
      name={sourceDisplayLabel(source, buildExternalMcpFieldSpecs(source.fields))}
      isOAuth={resolveExternalMcpEffectiveAuthMode(source.fields) === "oauth"}
      cardHandle={cardHandles[index]!}
      onConfirm={() => onConfirm(source.id)}
      onCancel={onCancel}
      t={t}
    />
  );
}

export interface ExternalMcpSettingsPanelProps {
  dependencies: SourceConfigDependencies<SourceConfigItem>;
  /** Footer save-status pill text (e.g. the restart notice). Omit to render no footer at all. */
  saveStatusLabel?: string;
}

export function ExternalMcpSettingsPanel({ dependencies, saveStatusLabel }: ExternalMcpSettingsPanelProps) {
  const t = useT();
  const [formOpen, setFormOpen] = useState(false);
  // The id of the source Remove was pressed for, until Confirm or Cancel resolves it — see this
  // file's own "Remove asks first" header note. `null` means no confirmation dialog is open.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const list = useWiredSourceConfigList<SourceConfigItem>({ dependencies });

  const [transportGuess, setTransportGuess] = useState<string>("stdio");
  const [authModeGuess, setAuthModeGuess] = useState<string>("static_env");
  const addFormFieldSpecs = buildExternalMcpFieldSpecs({ transport: transportGuess, authMode: authModeGuess });

  const addForm = useWiredSourceConfigAddForm<SourceConfigItem>({
    dependencies,
    fieldSpecs: addFormFieldSpecs,
    onAdded: (source) => {
      list.addSourceToList(source);
      setFormOpen(false);
    },
  });

  // Pre-select sensible defaults the instant the form opens, so the two `select` fields never show
  // Jini's placeholder "Select…" state for a choice Tovu already has a real default for (matching
  // the server's own default-to-stdio/static_env behavior — see `rules.ts`'s
  // `resolveExternalMcpEffective*`). Guarded on "still blank" so it only ever runs on a fresh draft.
  useEffect(() => {
    if (!formOpen) return;
    if (addForm.values.transport === "") addForm.setField("transport", "stdio");
    if (addForm.values.authMode === "") addForm.setField("authMode", "static_env");
  }, [formOpen, addForm.values.transport, addForm.values.authMode, addForm.setField]);

  // The lagged sync this file's header describes.
  useEffect(() => {
    const nextTransport = resolveExternalMcpEffectiveTransport(addForm.values);
    const nextAuthMode = resolveExternalMcpEffectiveAuthMode(addForm.values);
    if (nextTransport !== transportGuess) setTransportGuess(nextTransport);
    if (nextAuthMode !== authModeGuess) setAuthModeGuess(nextAuthMode);
  }, [addForm.values, transportGuess, authModeGuess]);

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
          <h3>{t("External MCP servers")}</h3>
          <p className="external-mcp-subtitle">{t("Third-party tools for your coding agent.")}</p>
        </div>
        <button
          type="button"
          className="external-mcp-add-button"
          onClick={() => setFormOpen((open) => !open)}
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
