import { useEffect, useState } from "react";
import {
  Icon,
  SourceConfigAddForm,
  SourceConfigItemCard,
  useT,
  useWiredSourceConfigAddForm,
  useWiredSourceConfigList,
  type SourceConfigDependencies,
  type SourceConfigItem,
} from "@jini-ai/ui";

import {
  buildExternalMcpCardHandles,
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

/** The loading / empty-state / configured-server-list body, split out for the same
 *  complexity-budget reason as {@link ExternalMcpAddFormSection} above — the triple-branch
 *  loading/empty/list ternary plus the per-card `testResult` presence-spread inside `.map()` were
 *  the parent's deepest nesting. Same three branches, same props, same "no card update" wiring. */
function ExternalMcpSourcesSection(props: {
  list: ReturnType<typeof useWiredSourceConfigList<SourceConfigItem>>;
  cardHandles: string[];
  t: ReturnType<typeof useT>;
}) {
  const { list, cardHandles, t } = props;

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
        <SourceConfigItemCard
          key={source.id}
          source={source}
          agentHandle={cardHandles[index]}
          fieldSpecs={buildExternalMcpFieldSpecs(source.fields)}
          capabilities={list.capabilities}
          removing={list.isPending(source.id, "remove")}
          refreshing={list.isPending(source.id, "refresh")}
          settingTrust={list.isPending(source.id, "trust")}
          testing={list.isPending(source.id, "test")}
          updating={list.isPending(source.id, "update")}
          onRefresh={() => void list.refresh(source.id)}
          onRemove={() => void list.remove(source.id)}
          onTrustChange={() => {}}
          onTest={() => void list.test(source.id)}
          onUpdate={(patch) => void list.update(source.id, patch)}
          {...(list.testResults[source.id] ? { testResult: list.testResults[source.id] } : {})}
        />
      ))}
    </div>
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
  // Not `useMemo`d: an O(n) pass (see `buildAgentListHandles`'s own `@complexity` doc, which this
  // wraps) over one workspace's own configured external MCP servers — small and cheap enough next
  // to the render it feeds that memoizing it was not judged worth the added indirection.
  const cardHandles = buildExternalMcpCardHandles(list.sources.map((source) => source.id));

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

      <ExternalMcpSourcesSection list={list} cardHandles={cardHandles} t={t} />

      {saveStatusLabel ? (
        <div className="external-mcp-footer">
          <span className="external-mcp-save-pill">{t(saveStatusLabel)}</span>
        </div>
      ) : null}
    </section>
  );
}
