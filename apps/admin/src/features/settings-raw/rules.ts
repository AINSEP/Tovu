import {
  ApiError,
  describeApiError as describeApiErrorDefault,
  type SettingResolvedValue,
  type SettingScope,
} from "../../lib/api";

/**
 * @file Pure logic for the `settings-raw` feature (SPEC-007 `ui.spec.md`) — everything that
 * computes a value rather than rendering one.
 *
 * Named `rules.ts` to match `features/posts/rules.ts`'s convention: the slice's decisions live in
 * one importable, directly testable module with no React in it.
 *
 * Several functions here carry decision-record comments that used to live in `Settings.tsx`'s file
 * header — moved with the code they describe rather than summarised, per this extraction pass's
 * rule that a comment separated from its code stops being read. `Settings.tsx`'s own header still
 * carries the full spec crosswalk (§1-§3); the pointers below name the section relevant to that
 * specific function.
 */

// ---------------------------------------------------------------------------
// Types (ui.spec.md §1/§2)
// ---------------------------------------------------------------------------

export type ValidationState = "idle" | "checking" | "valid" | "error";

export interface SettingSummary {
  namespace: string;
  key: string;
  effectiveValue: unknown;
  sourceLayer: SettingResolvedValue["sourceLayer"];
  /** `getEffective`'s route only enumerates `listActiveDefinitions` results,
   * so every row reaching the client is, by construction, status=active. */
  status: "active";
  defVersion: number;
}

export interface SettingDetail {
  effective: unknown;
  global: unknown;
  workspace: unknown;
  user: unknown;
  default: unknown;
  defVersion: number;
  /** Layers positively known to be unset (not just unseen). */
  knownAbsent: Array<"user" | "workspace" | "global">;
  /** Layers we cannot see because a higher-precedence layer already won —
   * see `Settings.tsx`'s file header §2. */
  masked: Array<"workspace" | "global" | "default">;
}

export interface CanWriteScopes {
  global: boolean;
  workspace: boolean;
  userSelf: boolean;
  userOther: boolean;
}

export interface CanReset {
  global: boolean;
  workspace: boolean;
  user: boolean;
}

/** Render state for one layer cell in `SettingDetailPanel` — "hidden" means masked by a
 *  higher-precedence layer (§2), not merely absent. */
export type LayerState = "set" | "not-set" | "hidden";

// ---------------------------------------------------------------------------
// Namespace / selection helpers
// ---------------------------------------------------------------------------

/** @complexity Time/space: O(1). */
export function keyOf(namespace: string, key: string): string {
  return `${namespace}::${key}`;
}

/** Builds a `SettingSummary` from a single effective-with-principal row.
 *
 * @complexity Time/space: O(1).
 */
export function toSummary(required: { namespace: string; row: SettingResolvedValue }): SettingSummary {
  const { namespace, row } = required;
  return {
    namespace,
    key: row.key,
    effectiveValue: row.value,
    sourceLayer: row.sourceLayer,
    status: "active",
    defVersion: row.defVersion,
  };
}

/** Parses `selectedKey` (the `keyOf`-joined string `NamespaceGroupList`/`SettingRow` select) back
 *  into its parts, or `null` when nothing is selected.
 *
 * @complexity Time/space: O(1).
 */
export function selectedNamespaceAndKey(selectedKey: string | null): { namespace: string; key: string } | null {
  if (!selectedKey) return null;
  const [namespace, key] = selectedKey.split("::");
  return { namespace, key };
}

/** Groups each loaded namespace's settings for `NamespaceGroupList` — a namespace with no rows
 *  loaded yet renders as an empty group rather than being omitted, so it stays visible while its
 *  own first load is in flight.
 *
 * @complexity Time/space: O(n) in loaded namespaces.
 */
export function buildNamespaceGroups(
  namespaces: string[],
  groupsByNamespace: Record<string, SettingSummary[]>
): Array<{ namespace: string; settings: SettingSummary[] }> {
  return namespaces.map((namespace) => ({
    namespace,
    settings: groupsByNamespace[namespace] ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Per-layer detail (Settings.tsx file header §2)
// ---------------------------------------------------------------------------

/**
 * Combines the "with principalId" and "without principalId" `GET_EFFECTIVE` reads for one key into
 * the per-layer detail `SettingDetailPanel` needs — see `Settings.tsx`'s file header §2 for the
 * technique and its limits.
 *
 * @complexity Time/space: O(1) — fixed number of layers.
 */
export function buildDetail(required: {
  withUser: SettingResolvedValue;
  withoutUser: SettingResolvedValue;
}): SettingDetail {
  const { withUser, withoutUser } = required;
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

/** Looks up the selected key's raw rows for its namespace and builds its `SettingDetail`, or
 *  `null` when nothing is selected, the namespace hasn't loaded, or the key isn't in either read
 *  (can happen for a moment right after a namespace switch).
 *
 * @complexity Time: O(r) in that namespace's row count (two linear `find`s); space: O(1).
 */
export function resolveSelectedDetail(required: {
  sel: { namespace: string; key: string } | null;
  rawByNamespace: Record<string, { withUser: SettingResolvedValue[]; withoutUser: SettingResolvedValue[] }>;
}): SettingDetail | null {
  const { sel, rawByNamespace } = required;
  if (!sel) return null;
  const rawForSelected = rawByNamespace[sel.namespace];
  if (!rawForSelected) return null;
  const withUserRow = rawForSelected.withUser.find((r) => r.key === sel.key);
  const withoutUserRow = rawForSelected.withoutUser.find((r) => r.key === sel.key);
  if (!withUserRow || !withoutUserRow) return null;
  return buildDetail({ withUser: withUserRow, withoutUser: withoutUserRow });
}

/** Derives each layer cell's render state from a resolved `SettingDetail` — "hidden" (masked by a
 *  higher-precedence layer, §2) takes priority over "not-set" wherever both could apply, matching
 *  `SettingDetailPanel`'s original inline ternary chain exactly. "Default" has no "not-set" state:
 *  it is the last layer, so it is always either shown or hidden.
 *
 * @complexity Time/space: O(1).
 */
export function layerStates(detail: SettingDetail): {
  user: LayerState;
  workspace: LayerState;
  global: LayerState;
  default: LayerState;
} {
  return {
    user: detail.knownAbsent.includes("user") ? "not-set" : "set",
    workspace: detail.masked.includes("workspace")
      ? "hidden"
      : detail.knownAbsent.includes("workspace")
        ? "not-set"
        : "set",
    global: detail.masked.includes("global")
      ? "hidden"
      : detail.knownAbsent.includes("global")
        ? "not-set"
        : "set",
    default: detail.masked.includes("default") ? "hidden" : "set",
  };
}

// ---------------------------------------------------------------------------
// Permission derivation (Settings.tsx file header §3)
// ---------------------------------------------------------------------------

/** Which scopes `ValueEditor`/`ResetNamespaceDialog` should allow editing/resetting for the
 *  currently selected key — `user` follows `userOther` once a target principal is set, `userSelf`
 *  otherwise, matching AC-23's split between reading another principal (`settings.user.read`,
 *  handled separately — see `Settings.tsx`'s file header §3) and writing their user layer
 *  (`settings.user.write`).
 *
 * @complexity Time/space: O(1).
 */
export function computeEditableScopes(required: {
  canWriteScopes: CanWriteScopes;
  hasTargetPrincipal: boolean;
}): SettingScope[] {
  const { canWriteScopes, hasTargetPrincipal } = required;
  return [
    ...(canWriteScopes.global ? (["global"] as const) : []),
    ...(canWriteScopes.workspace ? (["workspace"] as const) : []),
    ...((hasTargetPrincipal ? canWriteScopes.userOther : canWriteScopes.userSelf) ? (["user"] as const) : []),
  ];
}

// ---------------------------------------------------------------------------
// Formatting / parsing
// ---------------------------------------------------------------------------

/** @complexity Time/space: O(1) for primitives; O(n) in serialized size for objects (`JSON.stringify`). */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Raw-JSON parse for the schema-less `ValueEditor` fallback (see `Settings.tsx`'s file header
 *  §3's sibling note on `ValueEditor.schema` being optional today).
 *
 * @complexity Time/space: O(n) in input length (`JSON.parse`).
 */
export function parseJsonInput(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Enter a JSON value (e.g. \"text\", 42, true, null)." };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, error: "Not valid JSON — try \"text\", 42, true, false, or null." };
  }
}

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`) — see that
 *  function's header for why per-screen codes stay local rather than one shared table.
 *
 * @complexity Time/space: O(1).
 */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "FORBIDDEN") return "You do not have permission to do that.";
    if (e.code === "PRINCIPAL_NOT_FOUND") return "That principal was not found in this workspace.";
    if (e.code === "SCOPE_NOT_ALLOWED") return "This setting cannot be edited at that scope.";
    if (e.code === "VALUE_VALIDATION_FAILED") return e.message || "That value did not validate.";
    if (e.code === "DEFINITION_TOMBSTONED") return "This setting has been retired.";
    if (e.code === "DEFINITION_NOT_FOUND") return "This setting definition no longer exists.";
  }
  return describeApiErrorDefault(e, fallback);
}
