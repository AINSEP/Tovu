import type { SourceFieldSpec, SourceFieldValues } from "@jini-ai/ui";

import { buildAgentListHandles } from "../../lib/agent-list-handles";
import type { SaveState } from "../../hooks/use-settings-slice.hooks";

/**
 * @file Pure logic for the `settings` feature (the Open Design settings-dialog port) —
 * everything that computes a value rather than rendering one.
 *
 * Named `rules.ts` to match `features/posts/rules.ts`'s (and the since-deleted
 * `features/settings-raw/rules.ts`'s) convention: the slice's decisions live in one importable,
 * directly testable module with no React in it.
 *
 * `SettingsUi.tsx` mounts six independent `useSettingsSlice` instances (Execution, Instructions,
 * Notifications, Privacy, Dialog appearance, Language); the functions below all operate on that
 * homogeneous `{ value, loadError, saveState }` shape rather than on any one slice's own type, so
 * they don't need to know which of the six they're being called with.
 *
 * `mergeSourceUpdate` below serves a different hook in this same feature
 * (`hooks/use-external-mcp.hooks.ts`'s `updateSource`) — landed here rather than a second file
 * because it is the same "pure decision, no React, directly testable" shape as everything else in
 * this module, just for a different screen within `settings`.
 */

/** The subset of `SourceConfigItem`'s shape {@link mergeSourceUpdate} actually reads — kept
 *  narrow and local rather than importing `@jini-ai/ui`'s full `SourceConfigItem` type here, so
 *  this module stays free of that package's own type surface. */
interface PreviousSourceFields {
  fields?: Record<string, string>;
  enabled?: boolean;
  label?: string;
}

/** Mirrors the shape `use-external-mcp.hooks.ts`'s local `SourceUpdateInput` type describes (a
 *  partial patch: `fields`/`enabled`/`label`, each optional). */
interface SourceUpdatePatch {
  fields?: Record<string, string>;
  enabled?: boolean;
  label?: string;
}

/** What `updateSource` sends to `toWriteBody` — the merged result of a partial patch over the
 *  last-known values for a source that a write route replaces wholesale (see
 *  `use-external-mcp.hooks.ts`'s own comment on `lastKnown` for why the merge is needed at all:
 *  the route replaces the whole row, so an unmerged patch would blank out every field it doesn't
 *  mention). */
export interface MergedSourceUpdate {
  fields: Record<string, string>;
  enabled: boolean;
  label: string | undefined;
}

/**
 * `updateSource`'s own decision, pulled out to a top-level pure function per the 2026-08-12
 * complexity-ceiling pass: every `?.`/`??` in the three merged fields below is its own branch under
 * ESLint's `complexity` rule, and moving them out of `updateSource`'s own scope is what actually
 * lowers that function's score (unlike a switch, where moving CASE BODIES out doesn't reduce the
 * case count — this is a flat expression, so extracting the whole computation removes the branches
 * entirely from the caller). Also now directly testable with plain object literals, no port, no
 * `useRef`, no `await`.
 *
 * @complexity Time/space: O(k) in the patch's own field count — one shallow merge, no iteration.
 */
export function mergeSourceUpdate(previous: PreviousSourceFields | undefined, patch: SourceUpdatePatch): MergedSourceUpdate {
  return {
    fields: { ...(previous?.fields ?? {}), ...(patch.fields ?? {}) },
    enabled: patch.enabled ?? previous?.enabled ?? true,
    label: patch.label ?? previous?.label,
  };
}

// ---------------------------------------------------------------------------
// External MCP: reactive field specs for transport + auth mode
// ---------------------------------------------------------------------------
//
// `@jini-ai/ui`'s `SourceFieldSpec[]` is a flat, non-reactive array — the generic primitive has no
// concept of "hide this field unless that other field has this value" (see `types.ts`'s own
// `SourceFieldSpec` doc: `required` is a plain boolean, not a predicate). Rather than teach that
// generic package a host-specific notion of conditional fields, the spec ARRAY ITSELF is recomputed
// here, in Tovu, from the draft's current values — a field simply isn't in the array when it doesn't
// apply, which means it is neither rendered (`SourceConfigAddForm`/`SourceConfigItemCard` only ever
// map over what they're given) nor validated (`validateSourceDraft` only ever iterates what it's
// given). `ExternalMcpSettingsPanel.tsx` is what makes the recomputation live as the operator types —
// this module stays the pure decision, same split as the rest of this file.

/** A server is `stdio` unless it explicitly says `streamable_http` — the same default
 *  `parseExternalMcpPutBody` applies server-side, restated here so the add form shows the SAME
 *  set of required/visible fields a freshly-opened, not-yet-touched draft would actually save as.
 *  @complexity O(1). */
export function resolveExternalMcpEffectiveTransport(values: SourceFieldValues): "stdio" | "streamable_http" {
  return values.transport === "streamable_http" ? "streamable_http" : "stdio";
}

/** A server is `static_env` unless it explicitly says `none` or `oauth` — mirrors
 *  `resolveExternalMcpAuthMode`'s server-side default for the identical reason
 *  {@link resolveExternalMcpEffectiveTransport} does. @complexity O(1). */
export function resolveExternalMcpEffectiveAuthMode(values: SourceFieldValues): "none" | "static_env" | "oauth" {
  if (values.authMode === "none") return "none";
  if (values.authMode === "oauth") return "oauth";
  return "static_env";
}

/**
 * Builds the field-spec list a draft's CURRENT `transport`/`authMode` values imply.
 *
 * Order matters for both forms this feeds: connection identity first, then how to reach it
 * (transport-specific), then how to authenticate (auth-mode-specific) — an operator reads the form
 * top to bottom in the order they'd naturally think through setting up a connection.
 *
 * @param values - The draft's current field values (or a saved item's `fields`, for the edit card).
 * @returns The specs to render AND validate against for these values — nothing else exists to the
 * form once this returns; see this module's own section header for why that is the whole mechanism.
 * @complexity O(1) — a fixed, bounded number of conditionally-included entries.
 */
export function buildExternalMcpFieldSpecs(values: SourceFieldValues): SourceFieldSpec[] {
  const transport = resolveExternalMcpEffectiveTransport(values);
  const authMode = resolveExternalMcpEffectiveAuthMode(values);
  const isStdio = transport === "stdio";
  const isOAuth = authMode === "oauth";

  const specs: SourceFieldSpec[] = [
    { key: "id", label: "ID", kind: "text", required: true, placeholder: "lowercase letters, digits and dashes" },
    {
      key: "transport",
      label: "Connection type",
      kind: "select",
      required: true,
      options: [
        { value: "stdio", label: "Local command (stdio)" },
        { value: "streamable_http", label: "Hosted server (URL)" },
      ],
    },
  ];

  if (isStdio) {
    specs.push(
      { key: "command", label: "Command", kind: "text", required: true, placeholder: "e.g. npx, node, /path/to/binary" },
      { key: "args", label: "Args", kind: "text", placeholder: "space-separated" },
    );
  } else {
    specs.push({ key: "url", label: "URL", kind: "text", required: true, placeholder: "https://…" });
  }

  specs.push({
    key: "allowedToolNames",
    label: "Allowed tools",
    kind: "text",
    placeholder: "comma-separated — nothing runs unless it is listed here",
  });

  if (isStdio) {
    specs.push({
      key: "env",
      label: "Environment variables (KEY=VALUE)",
      kind: "textarea",
      placeholder: "GITHUB_TOKEN=…  (leave blank to keep the stored values)",
    });
  }

  specs.push({
    key: "authMode",
    label: "Credentials",
    kind: "select",
    required: true,
    options: [
      { value: "none", label: "None needed" },
      { value: "static_env", label: "API key / token (above)" },
      { value: "oauth", label: "Connect via OAuth" },
    ],
  });

  if (isOAuth) {
    specs.push(
      {
        key: "oauthProviderId",
        label: "Provider ID",
        kind: "text",
        placeholder: "leave blank to define this connection's own endpoints below",
      },
      {
        key: "oauthGrant",
        label: "Sign-in method",
        kind: "select",
        required: true,
        options: [
          { value: "authorization_code", label: "Browser sign-in" },
          { value: "device_code", label: "Device code" },
        ],
      },
      {
        key: "oauthClientId",
        label: "Client ID",
        kind: "text",
        // Required only for stdio, matching the server rule in `external-mcp-store.ts`: a REMOTE
        // connection can run OAuth discovery against its own URL and mint a client for itself by
        // RFC 7591 dynamic client registration, and a growing share of hosted MCP servers publish a
        // registration endpoint and no developer console — so for those there is no client id a
        // human could type. A stdio connection has no URL to discover from, so there it stands.
        required: isStdio,
        ...(isStdio ? {} : { placeholder: "leave blank to register with this server automatically" }),
      },
      { key: "oauthClientSecret", label: "Client secret", kind: "password", placeholder: "leave blank to keep the stored secret" },
      { key: "oauthScopes", label: "Scopes", kind: "text", placeholder: "space- or comma-separated" },
    );
    if (isStdio) {
      specs.push({
        key: "oauthTokenEnvName",
        label: "Access token environment variable",
        kind: "text",
        required: true,
        placeholder: "the variable name the command reads its token from",
      });
    }
    specs.push(
      {
        key: "oauthAuthorizationEndpoint",
        label: "Authorization endpoint",
        kind: "text",
        placeholder: "needed for Browser sign-in, unless Provider ID is set",
      },
      { key: "oauthTokenEndpoint", label: "Token endpoint", kind: "text", placeholder: "needed unless Provider ID is set" },
      {
        key: "oauthDeviceAuthorizationEndpoint",
        label: "Device authorization endpoint",
        kind: "text",
        placeholder: "needed for Device code, unless Provider ID is set",
      },
    );
  }

  return specs;
}

// ---------------------------------------------------------------------------
// External MCP: agent handles
// ---------------------------------------------------------------------------
//
// `@jini-ai/ui`'s source-config components take ONE base handle each (`agentHandle`) and derive
// every sub-element's handle from it themselves — see that package's `agent-handles.ts`. Tovu's
// only job is to hand each mounted component a base, and to guarantee those bases are DISTINCT:
// two cards under one base publish duplicate `data-agent-element` values, which does not fail
// loudly — it silently makes `page.click`/`page.fill` ambiguous on whichever card the DOM happens
// to reach first.

/** The add form's base handle. Its own namespace, so no server id can ever collide with it. */
export const EXTERNAL_MCP_ADD_FORM_HANDLE = "mcp-add";

/** Every configured server's base handle starts here. Distinct from {@link EXTERNAL_MCP_ADD_FORM_HANDLE}. */
export const EXTERNAL_MCP_CARD_HANDLE_PREFIX = "mcp-server";

/**
 * A distinct, stable base handle for each configured server, in list order.
 *
 * Derived from the server's own id rather than its position, so an agent reading `find_elements`
 * sees `mcp-server-higgsfield-remove` and not `mcp-server-3-remove` — legibility is the whole
 * point of publishing handles at all. The slugify + uniqueness-by-suffix-search mechanics now live
 * in the shared {@link buildAgentListHandles} (extracted once a second list screen needed the
 * identical logic); this function is kept as the named, typed entry point this feature's own
 * callers and tests already use.
 *
 * @param sourceIds - The configured servers' ids, in the order they are rendered.
 * @returns One base handle per id, positionally aligned with `sourceIds`, all distinct.
 * @complexity See {@link buildAgentListHandles}.
 */
export function buildExternalMcpCardHandles(sourceIds: readonly string[]): string[] {
  return buildAgentListHandles(EXTERNAL_MCP_CARD_HANDLE_PREFIX, sourceIds);
}

/**
 * The one cross-field OAuth rule `buildExternalMcpFieldSpecs`' per-field `required` flags cannot
 * express: an OAuth connection needs EITHER a registered provider id OR its own token endpoint, not
 * both — the same "OR", not "AND", `resolveOAuthProviderIdentity`/`assertOAuthProviderIdentity`
 * enforce server-side. Checked manually, the same way `useExternalMcp`'s `addSource` already checks
 * "An ID is required." before ever calling the API.
 *
 * @returns An operator-facing message when the rule is violated, else `null`.
 * @complexity O(1).
 */
export function validateExternalMcpOAuthIdentity(values: SourceFieldValues): string | null {
  if (resolveExternalMcpEffectiveAuthMode(values) !== "oauth") return null;
  const hasProviderId = (values.oauthProviderId ?? "").trim() !== "";
  const hasTokenEndpoint = (values.oauthTokenEndpoint ?? "").trim() !== "";
  if (hasProviderId || hasTokenEndpoint) return null;
  return "Enter a Provider ID, or fill in this connection's own Token endpoint.";
}

/** The subset of `SettingsSlice<T>` these functions actually read, kept generic-free so callers
 *  don't have to reconcile six different `T`s into one array type. */
export interface SliceLoadState {
  value: unknown;
  loadError: string | null;
}

/**
 * `SettingsUi`'s "everything resolved" gate. Every slice starts `null` and settles
 * independently; gating on the whole set keeps tabs from popping in one at a time as their
 * namespaces resolve.
 *
 * @complexity Time: O(n) in slice count; space: O(1).
 */
export function areAnySlicesLoading(slices: readonly SliceLoadState[]): boolean {
  return slices.some((slice) => slice.value === null);
}

/**
 * First load error across the mounted slices. One banner is enough — they all mean the same thing
 * to the operator (this screen is showing defaults), and one banner per slice would push the tabs
 * off the fold.
 *
 * @complexity Time: O(n) in slice count; space: O(1).
 */
export function firstLoadError(slices: readonly SliceLoadState[]): string | null {
  return slices.find((slice) => slice.loadError !== null)?.loadError ?? null;
}

/** Renders the merged save state as the status pill's text — the branch order (saving, then
 *  saved, then error's own message, then nothing) matches `mergeSaveStates`' own precedence, since
 *  this only ever runs on its output.
 *
 * @complexity Time/space: O(1).
 */
export function describeSaveStatus(save: SaveState): string {
  if (save.status === "saving") return "Saving…";
  if (save.status === "saved") return "Saved";
  if (save.status === "error") return save.message;
  return "";
}

/**
 * Maps the stored `core.appearance.theme` choice to the settings panel's `data-theme` attribute.
 *
 * `"system"` means "match the OS", which the panel already does natively via
 * `@media (prefers-color-scheme)` when no `data-theme` is set at all — so `"system"` maps to
 * `undefined` here rather than a literal string `data-theme` has no value for. See
 * `SettingsUi.tsx`'s own comment at the call site for the fuller history (the reconciled-default
 * fix that made this control real again).
 *
 * @complexity Time/space: O(1).
 */
export function resolveDialogDataTheme(theme: string): string | undefined {
  return theme === "system" ? undefined : theme;
}
