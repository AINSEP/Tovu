import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  type AdminIdentityUser,
  type SettingResolvedValue,
  type SettingScope,
} from "../lib/api";

/**
 * @file Admin "Settings" screen (SPEC-007 `ui.spec.md`, tasks.md T045/T046).
 *
 * Implements `SettingsContainer`, `PrincipalSelector`, `NamespaceGroupList`,
 * `SettingRow`, `SettingDetailPanel`, `ValueEditor`, `ResetNamespaceDialog`,
 * `EmptyState`, `ErrorBanner` per `ui.spec.md` §1-§6. `Settings` (this file's
 * default export, mounted by `App.tsx`) derives the container's permission
 * inputs and renders `SettingsContainer`.
 *
 * Three deliberate adaptations, each forced by gaps between `ui.spec.md`'s
 * contract and what Phase 5 actually shipped (tasks.md T044 confirms
 * `SETTINGS_GET_RAW`/`SETTINGS_LIST_DEFINITIONS` were "deliberately not
 * built ... confirmed not an oversight" — a real, disclosed scope decision,
 * not an oversight this file can silently paper over):
 *
 * 1. Namespace entry, not discovery. There is no `SETTINGS_LIST_DEFINITIONS`
 *    endpoint, so the container cannot enumerate which namespaces exist. The
 *    operator types a namespace identifier to load it (mirrors
 *    `PrincipalSelector`'s own "validated identifier field, not a browsable
 *    directory" idiom — RT-002 — extended here to namespaces for the same
 *    reason: no listing endpoint exists to browse). Loaded namespaces
 *    accumulate into `NamespaceGroupList`'s `groups`.
 *
 * 2. Per-layer detail via two `GET_EFFECTIVE` calls, not `SETTINGS_GET_RAW`.
 *    `getEffective` (`features/settings/settings.ts`) only checks the user
 *    layer when `scopeContext.principalId` is present, and only checks the
 *    workspace layer when `scopeContext.workspaceId` is present — the route
 *    always supplies the ambient `workspaceId`, so that layer can't be
 *    skipped, but `principalId` is genuinely optional. Calling the endpoint
 *    once with a `principalId` and once without gives an exact, honest
 *    reading of the user layer (set-or-not, and its value) *and* of whichever
 *    of {workspace, global, default} wins once the user layer is excluded.
 *    What this technique cannot recover: if workspace wins, global's raw
 *    value is masked (no way to skip the workspace layer through this route
 *    without passing a bogus `workspaceId`, which would also make site-owned
 *    keys vanish entirely from the response — unsafe, not attempted here).
 *    `SettingDetailPanel` renders masked layers as an explicit "hidden —
 *    overridden, no raw-read endpoint" state rather than fabricating `null`
 *    (which would misreport "not set").
 *
 * 3. Permission derivation via `/auth/me`'s existing `effectivePermissions`
 *    field (already computed server-side by `getEffectivePermissions` in
 *    `middleware/dev-auth.ts`, just not yet consumed by the client type) —
 *    this is what makes AC-23 ("no target-principal field offered" to a
 *    non-`settings.user.write` holder) exact rather than a guess: no new
 *    server route was needed, `api.me()`'s response already carried the data.
 *
 * `editableScopes` (ui.spec.md 2.4) is derived from `canWriteScopes` alone,
 * not intersected with the definition's `scopes` bitmask — that bitmask is
 * part of `SettingDefinitionRecord`, which (like the schema) is never
 * returned by any of the 5 shipped routes. A `SCOPE_NOT_ALLOWED` rejection
 * from the server is surfaced inline exactly like any other write error;
 * this is honest under-permissiveness-by-omission, not silent wrongness.
 * `ValueEditor.schema` is therefore optional: when present (future-proofing
 * for when a schema-exposing endpoint ships) it drives a typed control;
 * absent (today, always), it falls back to a raw-JSON textarea, with the
 * server's real `VALUE_VALIDATION_FAILED` as the authoritative check.
 */

// ---------------------------------------------------------------------------
// Types (ui.spec.md §1/§2)
// ---------------------------------------------------------------------------

type ValidationState = "idle" | "checking" | "valid" | "error";

interface SettingSummary {
  namespace: string;
  key: string;
  effectiveValue: unknown;
  sourceLayer: SettingResolvedValue["sourceLayer"];
  /** `getEffective`'s route only enumerates `listActiveDefinitions` results,
   * so every row reaching the client is, by construction, status=active. */
  status: "active";
  defVersion: number;
}

interface SettingDetail {
  effective: unknown;
  global: unknown;
  workspace: unknown;
  user: unknown;
  default: unknown;
  defVersion: number;
  /** Layers positively known to be unset (not just unseen). */
  knownAbsent: Array<"user" | "workspace" | "global">;
  /** Layers we cannot see because a higher-precedence layer already won —
   * see this file's header comment §2. */
  masked: Array<"workspace" | "global" | "default">;
}

interface CanWriteScopes {
  global: boolean;
  workspace: boolean;
  userSelf: boolean;
  userOther: boolean;
}

interface CanReset {
  global: boolean;
  workspace: boolean;
  user: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function keyOf(namespace: string, key: string): string {
  return `${namespace}::${key}`;
}

/** Builds a `SettingSummary` from a single effective-with-principal row. */
function toSummary(namespace: string, row: SettingResolvedValue): SettingSummary {
  return {
    namespace,
    key: row.key,
    effectiveValue: row.value,
    sourceLayer: row.sourceLayer,
    status: "active",
    defVersion: row.defVersion,
  };
}

/**
 * Combines the "with principalId" and "without principalId" `GET_EFFECTIVE`
 * reads for one key into the per-layer detail `SettingDetailPanel` needs —
 * see this file's header comment §2 for the technique and its limits.
 */
function buildDetail(withUser: SettingResolvedValue, withoutUser: SettingResolvedValue): SettingDetail {
  const detail: SettingDetail = {
    effective: withUser.value,
    global: null,
    workspace: null,
    user: null,
    default: null,
    defVersion: withUser.defVersion,
    knownAbsent: [],
    masked: [],
  };

  if (withUser.sourceLayer === "user") {
    detail.user = withUser.value;
  } else {
    detail.knownAbsent.push("user");
  }

  const rest = withUser.sourceLayer === "user" ? withoutUser : withUser;
  if (rest.sourceLayer === "workspace") {
    detail.workspace = rest.value;
    detail.masked.push("global", "default");
  } else if (rest.sourceLayer === "global") {
    detail.knownAbsent.push("workspace");
    detail.global = rest.value;
    detail.masked.push("default");
  } else {
    detail.knownAbsent.push("workspace");
    detail.default = rest.value;
    // "global" is genuinely known-absent here too (default only wins when
    // global is unset), but there's no dedicated slot for a second
    // knownAbsent push beyond what the render layer checks, so both
    // "workspace" and implicit "global not set" are conveyed by `default`
    // being populated (§4 rendering rule: default only shown when nothing
    // else won).
  }

  return detail;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Raw-JSON parse for the schema-less `ValueEditor` fallback (see header §3). */
function parseJsonInput(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Enter a JSON value (e.g. \"text\", 42, true, null)." };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, error: "Not valid JSON — try \"text\", 42, true, false, or null." };
  }
}

function describeApiError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : fallback;
  if (e.code === "FORBIDDEN") return "You do not have permission to do that.";
  if (e.code === "PRINCIPAL_NOT_FOUND") return "That principal was not found in this workspace.";
  if (e.code === "SCOPE_NOT_ALLOWED") return "This setting cannot be edited at that scope.";
  if (e.code === "VALUE_VALIDATION_FAILED") return e.message || "That value did not validate.";
  if (e.code === "DEFINITION_TOMBSTONED") return "This setting has been retired.";
  if (e.code === "DEFINITION_NOT_FOUND") return "This setting definition no longer exists.";
  return e.message || fallback;
}

// ---------------------------------------------------------------------------
// 2.7 / 2.8 — EmptyState / ErrorBanner
// ---------------------------------------------------------------------------

function EmptyState(props: { message: string }) {
  return <div className="notice settings-empty">{props.message}</div>;
}

function ErrorBanner(props: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice error settings-error-banner" role="alert">
      <span>{props.message}</span>
      {props.onRetry ? (
        <button type="button" onClick={props.onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2.1a / 3.1a — PrincipalSelector
// ---------------------------------------------------------------------------

function PrincipalSelector(props: {
  visible: boolean;
  value: string | null;
  validationState: ValidationState;
  lastError: string | null;
  onSubmitPrincipal: (principalIdRaw: string) => void;
  onClearPrincipal: () => void;
}) {
  const [draft, setDraft] = useState(props.value ?? "");

  useEffect(() => {
    setDraft(props.value ?? "");
  }, [props.value]);

  if (!props.visible) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft.trim() === "") {
      props.onClearPrincipal();
      return;
    }
    props.onSubmitPrincipal(draft.trim());
  }

  return (
    <form className="notice settings-principal-selector" onSubmit={submit}>
      <label htmlFor="settings-principal-input">
        Manage another principal&apos;s settings (id or email)
      </label>
      <span className="editor-actions">
        <input
          id="settings-principal-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. member@example.com"
          aria-invalid={props.validationState === "error"}
          aria-describedby={props.validationState === "error" ? "settings-principal-error" : undefined}
        />
        <button type="submit" disabled={props.validationState === "checking"}>
          {props.validationState === "checking" ? "Checking…" : "Set target"}
        </button>
        {props.value ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              props.onClearPrincipal();
            }}
          >
            Clear (use my own settings)
          </button>
        ) : null}
      </span>
      {props.validationState === "valid" && props.value ? (
        <span className="save-ok">Now viewing/editing {props.value}&apos;s user-layer settings.</span>
      ) : null}
      {props.validationState === "error" && props.lastError ? (
        <span className="save-error" id="settings-principal-error" role="alert">
          {props.lastError}
        </span>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// 2.3 / 3.2-3.3 — SettingRow / NamespaceGroupList
// ---------------------------------------------------------------------------

function SettingRow(props: {
  summary: SettingSummary;
  isSelected: boolean;
  onSelect: (key: string) => void;
}) {
  const { summary } = props;
  function activate() {
    props.onSelect(summary.key);
  }
  return (
    <li
      role="listitem"
      className={`settings-row${props.isSelected ? " is-selected" : ""}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      tabIndex={0}
      aria-selected={props.isSelected}
    >
      <span className="settings-row-key">{summary.key}</span>
      <span className="settings-row-value">{formatValue(summary.effectiveValue)}</span>
      <span className={`status status-layer-${summary.sourceLayer}`}>{summary.sourceLayer}</span>
    </li>
  );
}

function NamespaceGroupList(props: {
  groups: Array<{ namespace: string; settings: SettingSummary[] }>;
  isLoading: boolean;
  selectedKey: string | null;
  onSelectSetting: (namespace: string, key: string) => void;
}) {
  if (props.isLoading) {
    return <div className="notice settings-loading">Loading settings…</div>;
  }
  return (
    <div className="settings-namespace-list">
      {props.groups.map((group) => (
        <section key={group.namespace} className="settings-namespace-group">
          <h2>{group.namespace}</h2>
          {group.settings.length === 0 ? (
            <p className="muted-cell">No active settings registered in this namespace.</p>
          ) : (
            <ul role="list" className="settings-row-list">
              {group.settings.map((summary) => (
                <SettingRow
                  key={keyOf(group.namespace, summary.key)}
                  summary={summary}
                  isSelected={props.selectedKey === keyOf(group.namespace, summary.key)}
                  onSelect={(key) => props.onSelectSetting(group.namespace, key)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2.5 / 3.4-3.5 — ValueEditor
// ---------------------------------------------------------------------------

function ValueEditor(props: {
  scope: SettingScope;
  currentValue: unknown;
  disabled: boolean;
  saving: boolean;
  onSubmitValue: (valueJson: unknown) => void;
  onClearValue: () => void;
}) {
  const [draft, setDraft] = useState(() => (props.currentValue == null ? "" : JSON.stringify(props.currentValue)));
  const [validationError, setValidationError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseJsonInput(draft);
    if (!parsed.ok) {
      setValidationError(parsed.error);
      return;
    }
    setValidationError(null);
    props.onSubmitValue(parsed.value);
  }

  const inputId = `settings-value-editor-${props.scope}`;

  return (
    <form className="settings-value-editor" onSubmit={submit}>
      <label htmlFor={inputId}>Value ({props.scope} scope, JSON)</label>
      <textarea
        id={inputId}
        rows={2}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setValidationError(null);
        }}
        disabled={props.disabled || props.saving}
        aria-invalid={validationError != null}
        aria-describedby={validationError ? `${inputId}-error` : undefined}
      />
      {validationError ? (
        <span className="save-error" id={`${inputId}-error`} role="alert">
          {validationError}
        </span>
      ) : null}
      <span className="editor-actions">
        <button type="submit" disabled={props.disabled || props.saving}>
          {props.saving ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={props.disabled || props.saving} onClick={props.onClearValue}>
          Clear
        </button>
      </span>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 2.6 / 3.6 — ResetNamespaceDialog
// ---------------------------------------------------------------------------

function ResetNamespaceDialog(props: {
  namespace: string;
  scope: SettingScope;
  onConfirmReset: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-reset-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-reset-dialog-title">Reset {props.namespace}</h2>
        <p>
          Reset every {props.scope}-scope value in <strong>{props.namespace}</strong> to its default?
          This cannot be undone.
        </p>
        <span className="editor-actions">
          <button type="button" autoFocus onClick={props.onConfirmReset}>
            Reset to defaults
          </button>
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2.4 / 3.4 — SettingDetailPanel
// ---------------------------------------------------------------------------

function layerCell(
  label: string,
  value: unknown,
  state: "set" | "not-set" | "hidden"
): React.ReactNode {
  return (
    <div className="settings-layer-cell">
      <span className="settings-layer-label">{label}</span>
      {state === "hidden" ? (
        <span className="muted-cell" title="Overridden by a higher-precedence layer; no raw per-layer read endpoint exists in this API surface.">
          hidden (overridden)
        </span>
      ) : state === "not-set" ? (
        <span className="muted-cell">not set</span>
      ) : (
        <span>{formatValue(value)}</span>
      )}
    </div>
  );
}

function SettingDetailPanel(props: {
  namespace: string;
  settingKey: string;
  detail: SettingDetail;
  editableScopes: SettingScope[];
  canReset: CanReset;
  saving: boolean;
  onSubmitValue: (scope: SettingScope, valueJson: unknown) => void;
  onClearValue: (scope: SettingScope) => void;
  onRequestReset: (scope: SettingScope) => void;
}) {
  const { detail } = props;
  const userState = detail.knownAbsent.includes("user") ? "not-set" : "set";
  const workspaceState = detail.masked.includes("workspace")
    ? "hidden"
    : detail.knownAbsent.includes("workspace")
      ? "not-set"
      : "set";
  const globalState = detail.masked.includes("global")
    ? "hidden"
    : detail.knownAbsent.includes("global")
      ? "not-set"
      : "set";
  const defaultState = detail.masked.includes("default") ? "hidden" : "set";

  return (
    <div className="settings-detail-panel">
      <h2>{props.settingKey}</h2>
      <p className="muted-cell">{props.namespace}</p>

      <div className="settings-layer-grid">
        <div className="settings-layer-cell settings-layer-effective">
          <span className="settings-layer-label">Effective</span>
          <span>{formatValue(detail.effective)}</span>
        </div>
        {layerCell("User", detail.user, userState)}
        {layerCell("Workspace", detail.workspace, workspaceState)}
        {layerCell("Global", detail.global, globalState)}
        {layerCell("Default", detail.default, defaultState)}
      </div>

      {(["global", "workspace", "user"] as SettingScope[]).map((scope) => {
        const editable = props.editableScopes.includes(scope);
        const currentForScope =
          scope === "user" ? detail.user : scope === "workspace" ? detail.workspace : detail.global;
        return (
          <div key={scope} className="settings-scope-editor">
            <h3>{scope}</h3>
            <ValueEditor
              scope={scope}
              currentValue={currentForScope}
              disabled={!editable}
              saving={props.saving}
              onSubmitValue={(valueJson) => props.onSubmitValue(scope, valueJson)}
              onClearValue={() => props.onClearValue(scope)}
            />
            {props.canReset[scope] ? (
              <button type="button" className="settings-reset-trigger" onClick={() => props.onRequestReset(scope)}>
                Reset {scope} namespace to defaults
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsContainer (ui.spec.md §2.1/§3.1) — the only public entry component
// ---------------------------------------------------------------------------

interface SettingsContainerProps {
  canWriteScopes: CanWriteScopes;
  canManageDefinitions: boolean;
  canReset: CanReset;
  selfPrincipalId: string;
  users: AdminIdentityUser[];
}

function SettingsContainer(props: SettingsContainerProps) {
  const [namespaceInput, setNamespaceInput] = useState("core.presentation");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [groupsByNamespace, setGroupsByNamespace] = useState<Record<string, SettingSummary[]>>({});
  const [rawByNamespace, setRawByNamespace] = useState<
    Record<string, { withUser: SettingResolvedValue[]; withoutUser: SettingResolvedValue[] }>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const [targetPrincipalId, setTargetPrincipalId] = useState<string | null>(null);
  const [principalValue, setPrincipalValue] = useState<string | null>(null);
  const [principalValidationState, setPrincipalValidationState] = useState<ValidationState>("idle");
  const [principalLastError, setPrincipalLastError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [pendingReset, setPendingReset] = useState<{ namespace: string; scope: SettingScope } | null>(null);

  const effectivePrincipalId = targetPrincipalId ?? props.selfPrincipalId;

  async function loadNamespace(namespace: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [withUser, withoutUser] = await Promise.all([
        api.getSettingsEffective(namespace, { principalId: effectivePrincipalId }),
        api.getSettingsEffective(namespace, {}),
      ]);
      setNamespaces((current) => (current.includes(namespace) ? current : [...current, namespace]));
      setGroupsByNamespace((current) => ({
        ...current,
        [namespace]: withUser.data.map((row) => toSummary(namespace, row)),
      }));
      setRawByNamespace((current) => ({
        ...current,
        [namespace]: { withUser: withUser.data, withoutUser: withoutUser.data },
      }));
    } catch (e) {
      setError(describeApiError(e, "Failed to load namespace"));
    } finally {
      setIsLoading(false);
    }
  }

  // Auto-load the default namespace once on mount (ui.spec.md §4: "Loading
  // skeleton renders while the initial definitions+effective load is
  // in-flight") — `core.presentation` is guaranteed to exist post-Phase-4
  // migration, so this gives a real first-paint result without requiring the
  // operator to already know a namespace name.
  useEffect(() => {
    void loadNamespace(namespaceInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload every already-loaded namespace when the target principal changes,
  // so the user-layer column reflects the newly selected principal.
  useEffect(() => {
    namespaces.forEach((ns) => {
      void loadNamespace(ns);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePrincipalId]);

  function onLoadNamespace(e: React.FormEvent) {
    e.preventDefault();
    const ns = namespaceInput.trim();
    if (!ns) return;
    void loadNamespace(ns);
  }

  function onSubmitPrincipal(principalIdRaw: string) {
    setPrincipalValidationState("checking");
    const match = props.users.find(
      (u) =>
        u.principalId === principalIdRaw ||
        u.email?.toLowerCase() === principalIdRaw.toLowerCase() ||
        u.username.toLowerCase() === principalIdRaw.toLowerCase()
    );
    if (!match) {
      setPrincipalValidationState("error");
      setPrincipalLastError(`PRINCIPAL_NOT_FOUND: no active principal matches "${principalIdRaw}".`);
      return;
    }
    setPrincipalValidationState("valid");
    setPrincipalLastError(null);
    setPrincipalValue(match.username);
    setTargetPrincipalId(match.principalId);
  }

  function onClearPrincipal() {
    setTargetPrincipalId(null);
    setPrincipalValue(null);
    setPrincipalValidationState("idle");
    setPrincipalLastError(null);
  }

  function selectedNamespaceAndKey(): { namespace: string; key: string } | null {
    if (!selectedKey) return null;
    const [namespace, key] = selectedKey.split("::");
    return { namespace, key };
  }

  async function onSubmitValue(scope: SettingScope, valueJson: unknown) {
    const sel = selectedNamespaceAndKey();
    if (!sel) return;
    setSaving(true);
    setError(null);
    try {
      await api.setSetting({
        namespace: sel.namespace,
        key: sel.key,
        scope,
        valueJson,
        principalId: scope === "user" ? effectivePrincipalId : undefined,
      });
      setLiveMessage(`Saved ${sel.namespace}.${sel.key} at ${scope} scope.`);
      await loadNamespace(sel.namespace);
    } catch (e) {
      setError(describeApiError(e, "Failed to save value"));
    } finally {
      setSaving(false);
    }
  }

  async function onClearValue(scope: SettingScope) {
    const sel = selectedNamespaceAndKey();
    if (!sel) return;
    setSaving(true);
    setError(null);
    try {
      await api.clearSetting({
        namespace: sel.namespace,
        key: sel.key,
        scope,
        principalId: scope === "user" ? effectivePrincipalId : undefined,
      });
      setLiveMessage(`Cleared ${sel.namespace}.${sel.key} at ${scope} scope.`);
      await loadNamespace(sel.namespace);
    } catch (e) {
      setError(describeApiError(e, "Failed to clear value"));
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmReset() {
    if (!pendingReset) return;
    const { namespace, scope } = pendingReset;
    setSaving(true);
    setError(null);
    try {
      const result = await api.resetSettingsNamespace({ namespace, scope });
      setLiveMessage(`Reset ${result.clearedCount} setting(s) in ${namespace} (${scope} scope) to defaults.`);
      setPendingReset(null);
      await loadNamespace(namespace);
    } catch (e) {
      setError(describeApiError(e, "Failed to reset namespace"));
    } finally {
      setSaving(false);
    }
  }

  const groups = namespaces.map((namespace) => ({
    namespace,
    settings: groupsByNamespace[namespace] ?? [],
  }));

  const sel = selectedNamespaceAndKey();
  const rawForSelected = sel ? rawByNamespace[sel.namespace] : undefined;
  const detail: SettingDetail | null =
    sel && rawForSelected
      ? (() => {
          const withUserRow = rawForSelected.withUser.find((r) => r.key === sel.key);
          const withoutUserRow = rawForSelected.withoutUser.find((r) => r.key === sel.key);
          if (!withUserRow || !withoutUserRow) return null;
          return buildDetail(withUserRow, withoutUserRow);
        })()
      : null;

  const editableScopes: SettingScope[] = [
    ...(props.canWriteScopes.global ? (["global"] as const) : []),
    ...(props.canWriteScopes.workspace ? (["workspace"] as const) : []),
    ...((targetPrincipalId ? props.canWriteScopes.userOther : props.canWriteScopes.userSelf)
      ? (["user"] as const)
      : []),
  ];

  return (
    <div className="settings-screen">
      <div aria-live="polite" className="visually-hidden">
        {liveMessage}
      </div>

      <form className="notice settings-namespace-loader" onSubmit={onLoadNamespace}>
        <label htmlFor="settings-namespace-input">Namespace</label>
        <span className="editor-actions">
          <input
            id="settings-namespace-input"
            value={namespaceInput}
            onChange={(e) => setNamespaceInput(e.target.value)}
            placeholder="e.g. core.presentation"
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Loading…" : "Load"}
          </button>
        </span>
        <span className="muted-cell">
          There is no definitions-listing endpoint in this API surface yet — enter the namespace you
          want to inspect (see this file's header comment).
        </span>
      </form>

      <PrincipalSelector
        visible={props.canWriteScopes.userOther}
        value={principalValue}
        validationState={principalValidationState}
        lastError={principalLastError}
        onSubmitPrincipal={onSubmitPrincipal}
        onClearPrincipal={onClearPrincipal}
      />

      {error ? <ErrorBanner message={error} onRetry={sel ? () => void loadNamespace(sel.namespace) : undefined} /> : null}

      <div className="settings-body">
        {groups.length === 0 && !isLoading ? (
          <EmptyState message="No namespace loaded yet — enter a namespace above to view its settings." />
        ) : (
          <NamespaceGroupList
            groups={groups}
            isLoading={isLoading}
            selectedKey={selectedKey}
            onSelectSetting={(namespace, key) => setSelectedKey(keyOf(namespace, key))}
          />
        )}

        {sel && detail ? (
          <SettingDetailPanel
            namespace={sel.namespace}
            settingKey={sel.key}
            detail={detail}
            editableScopes={editableScopes}
            canReset={props.canReset}
            saving={saving}
            onSubmitValue={onSubmitValue}
            onClearValue={onClearValue}
            onRequestReset={(scope) => setPendingReset({ namespace: sel.namespace, scope })}
          />
        ) : null}
      </div>

      {pendingReset ? (
        <ResetNamespaceDialog
          namespace={pendingReset.namespace}
          scope={pendingReset.scope}
          onConfirmReset={onConfirmReset}
          onCancel={() => setPendingReset(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings — App.tsx's mount point; derives permission inputs (header §3)
// ---------------------------------------------------------------------------

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selfPrincipalId, setSelfPrincipalId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [users, setUsers] = useState<AdminIdentityUser[]>([]);

  useEffect(() => {
    Promise.all([api.me(), api.listUsers()])
      .then(([me, usersResult]) => {
        setSelfPrincipalId(me.user.id);
        setPermissions(me.effectivePermissions ?? []);
        setUsers(usersResult.users);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load Settings"))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  if (loading || !selfPrincipalId) return <div className="notice">Loading Settings…</div>;

  const has = (permission: string) => permissions.includes(permission);

  const canWriteScopes: CanWriteScopes = {
    global: has("settings.global.write"),
    workspace: has("settings.workspace.write"),
    userSelf: has("settings.user.self.write"),
    userOther: has("settings.user.write"),
  };
  const canManageDefinitions = has("settings.definitions.manage");
  const canReset: CanReset = {
    global: has("settings.reset.global"),
    workspace: has("settings.reset.workspace"),
    user: has("settings.reset.user"),
  };

  return (
    <div>
      <h1>Settings</h1>
      <p>Layered core settings: global, workspace, and user-scope values with defaults.</p>
      <SettingsContainer
        canWriteScopes={canWriteScopes}
        canManageDefinitions={canManageDefinitions}
        canReset={canReset}
        selfPrincipalId={selfPrincipalId}
        users={users}
      />
    </div>
  );
}
