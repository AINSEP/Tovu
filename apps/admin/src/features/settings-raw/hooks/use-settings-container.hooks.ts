import { useEffect, useState } from "react";

import { api, type AdminIdentityUser, type SettingResolvedValue, type SettingScope } from "../../../lib/api";
import {
  buildNamespaceGroups,
  computeEditableScopes,
  describeApiError,
  keyOf,
  resolveSelectedDetail,
  selectedNamespaceAndKey,
  toSummary,
  type CanWriteScopes,
  type SettingDetail,
  type SettingSummary,
  type ValidationState,
} from "../rules";

/**
 * @file `SettingsContainer`'s full load/select/edit/reset lifecycle, so `SettingsContainer` in
 * `Settings.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect bodies, same error
 * strings. `Settings.tsx`'s file header §1 explains why namespace entry is a typed field rather
 * than a browsable list, and §2 explains why per-layer detail comes from two `GET_EFFECTIVE`
 * calls rather than a raw-read endpoint — both techniques are implemented in `loadNamespace` below
 * and in `resolveSelectedDetail`/`buildDetail` (`rules.ts`).
 *
 * The derived render inputs (`groups`, `sel`, `detail`, `editableScopes`, `onRetryLoad`) are
 * computed here — via the pure functions in `rules.ts` — rather than in `Settings.tsx`, so a test
 * can drive the whole screen (list, detail panel, and edit permissions) through this hook's return
 * value alone, without assembling raw namespace/effective-value fixtures by hand.
 */

export interface SettingsContainerHookProps {
  canWriteScopes: CanWriteScopes;
  selfPrincipalId: string;
  users: AdminIdentityUser[];
}

export interface SettingsContainerController {
  namespaceInput: string;
  setNamespaceInput: (value: string) => void;
  onLoadNamespace: (e: React.FormEvent) => void;
  isLoading: boolean;
  error: string | null;
  liveMessage: string;

  principalValue: string | null;
  principalValidationState: ValidationState;
  principalLastError: string | null;
  onSubmitPrincipal: (principalIdRaw: string) => void;
  onClearPrincipal: () => void;

  groups: Array<{ namespace: string; settings: SettingSummary[] }>;
  selectedKey: string | null;
  onSelectSetting: (namespace: string, key: string) => void;

  /** The parsed `{namespace,key}` for `selectedKey`, or `null` when nothing is selected. Kept
   *  separate from `detail` because a retry action needs the namespace even when `detail` itself
   *  hasn't resolved (row not yet loaded, or not found in either `GET_EFFECTIVE` read). */
  sel: { namespace: string; key: string } | null;
  detail: SettingDetail | null;
  editableScopes: SettingScope[];

  saving: boolean;
  onSubmitValue: (scope: SettingScope, valueJson: unknown) => void;
  onClearValue: (scope: SettingScope) => void;

  pendingReset: { namespace: string; scope: SettingScope } | null;
  onRequestReset: (scope: SettingScope) => void;
  onConfirmReset: () => void;
  onCancelReset: () => void;

  /** `undefined` when nothing is selected — matches `ErrorBanner`'s optional `onRetry`. */
  onRetryLoad: (() => void) | undefined;
}

/**
 * @complexity Time: each `loadNamespace` call is O(k) in that namespace's active key count (server
 * work aside); the principal-change effect re-issues one `loadNamespace` per already-loaded
 * namespace, O(n) namespaces. Space: O(n·k) across `groupsByNamespace`/`rawByNamespace`.
 */
export function useSettingsContainer(props: SettingsContainerHookProps): SettingsContainerController {
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
        api.getSettingsEffective({ namespace }, { principalId: effectivePrincipalId }),
        api.getSettingsEffective({ namespace }),
      ]);
      setNamespaces((current) => (current.includes(namespace) ? current : [...current, namespace]));
      setGroupsByNamespace((current) => ({
        ...current,
        [namespace]: withUser.data.map((row) => toSummary({ namespace, row })),
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

  async function onSubmitValue(scope: SettingScope, valueJson: unknown) {
    const sel = selectedNamespaceAndKey(selectedKey);
    if (!sel) return;
    setSaving(true);
    setError(null);
    try {
      await api.setSetting(
        { namespace: sel.namespace, key: sel.key, scope, valueJson },
        { principalId: scope === "user" ? effectivePrincipalId : undefined }
      );
      setLiveMessage(`Saved ${sel.namespace}.${sel.key} at ${scope} scope.`);
      await loadNamespace(sel.namespace);
    } catch (e) {
      setError(describeApiError(e, "Failed to save value"));
    } finally {
      setSaving(false);
    }
  }

  async function onClearValue(scope: SettingScope) {
    const sel = selectedNamespaceAndKey(selectedKey);
    if (!sel) return;
    setSaving(true);
    setError(null);
    try {
      await api.clearSetting(
        { namespace: sel.namespace, key: sel.key, scope },
        { principalId: scope === "user" ? effectivePrincipalId : undefined }
      );
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

  const groups = buildNamespaceGroups(namespaces, groupsByNamespace);
  const sel = selectedNamespaceAndKey(selectedKey);
  const detail = resolveSelectedDetail({ sel, rawByNamespace });
  const editableScopes = computeEditableScopes({
    canWriteScopes: props.canWriteScopes,
    hasTargetPrincipal: Boolean(targetPrincipalId),
  });
  const onRetryLoad = sel ? () => void loadNamespace(sel.namespace) : undefined;

  function onSelectSetting(namespace: string, key: string) {
    setSelectedKey(keyOf(namespace, key));
  }

  function onRequestReset(scope: SettingScope) {
    if (!sel) return;
    setPendingReset({ namespace: sel.namespace, scope });
  }

  function onCancelReset() {
    setPendingReset(null);
  }

  return {
    namespaceInput,
    setNamespaceInput,
    onLoadNamespace,
    isLoading,
    error,
    liveMessage,

    principalValue,
    principalValidationState,
    principalLastError,
    onSubmitPrincipal,
    onClearPrincipal,

    groups,
    selectedKey,
    onSelectSetting,

    sel,
    detail,
    editableScopes,

    saving,
    onSubmitValue,
    onClearValue,

    pendingReset,
    onRequestReset,
    onConfirmReset,
    onCancelReset,

    onRetryLoad,
  };
}
