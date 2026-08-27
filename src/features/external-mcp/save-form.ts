import {
  buildFormSurface,
  type SurfaceField,
  type UIResource,
  type UIResourceUri,
} from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchange } from "../../contracts/core/tool-surface-exchanges.js";
import type { ExternalMcpServerView } from "#src/assistant/index";

/**
 * @file The confirmation form `external_mcp_save` renders — see `tool-registrations.ts`'s handler
 * for how it is opened, answered, and turned into a real write.
 *
 * ## Why the field LIST is computed once, not reactive
 *
 * `apps/admin/src/features/settings/rules.ts`'s `buildExternalMcpFieldSpecs` solves the identical
 * "which fields apply to this transport/authMode" decision for the admin UI, where it must be
 * REACTIVE — a human can change their mind mid-form. An MCP-UI form has no such need: it is a
 * server-rendered HTML document generated once per tool call, and the agent has already committed
 * to a transport/authMode by the time it calls this tool (see `agent-tools.ts`'s own schema doc).
 * So this file restates the SAME decision rules as a one-shot computation over the tool's own input,
 * rather than importing the admin package's React-specific type. Two independent, intentionally
 * parallel implementations of one documented rule — not a shared abstraction — because the two
 * outputs are genuinely different shapes (`@jini-ai/ui`'s `SourceFieldSpec` vs `@jini-ai/ui/mcp-ui/
 * surfaces`'s `SurfaceField`) for two different rendering systems.
 *
 * ## Secrets never appear as `value`
 *
 * `env`/`oauthClientSecret` are rendered `secret: true` with NO `value` — never pre-filled, even
 * when updating a row that already has one, because there is nothing to pre-fill FROM: no read model
 * in this subsystem ever returns a stored secret (see `apps/admin`'s own `use-external-mcp.hooks.ts`
 * header for the identical rule, restated for the identical reason). Leaving it blank on submit is
 * what "keep what's stored" means to `saveExternalMcpServer` — the same tri-state convention the
 * admin form's own write path already relies on.
 */

export const EXTERNAL_MCP_SAVE_TOOL_ID = "external_mcp_save";

/** `external_mcp_save`'s own non-secret input, narrowed to what {@link buildExternalMcpSaveFormFields}
 *  and {@link buildExternalMcpSaveForm} actually read. Matches `agent-tools.ts`'s `SAVE_INPUT_SCHEMA`
 *  property-for-property. */
export interface ExternalMcpSaveInput {
  id: string;
  label?: string;
  transport: string;
  command?: string;
  args?: string;
  url?: string;
  allowedToolNames?: string;
  authMode?: string;
  oauthProviderId?: string;
  oauthGrant?: string;
  oauthClientId?: string;
  oauthScopes?: string;
  oauthTokenEnvName?: string;
  oauthAuthorizationEndpoint?: string;
  oauthTokenEndpoint?: string;
  oauthDeviceAuthorizationEndpoint?: string;
}

function externalMcpSaveFormUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/external-mcp-save/${exchangeId}` as UIResourceUri;
}

/**
 * Merges the agent's own input over an existing row's current (non-secret) values, so an UPDATE's
 * form shows the human accurate current state for anything the agent did not explicitly restate,
 * rather than blanks. `existing` is `undefined` for a brand-new id.
 *
 * @complexity O(1).
 */
export function mergeExternalMcpSavePrefill(
  input: ExternalMcpSaveInput,
  existing: ExternalMcpServerView | undefined,
): ExternalMcpSaveInput {
  if (!existing) return input;
  return {
    id: input.id,
    label: input.label ?? existing.label,
    transport: input.transport,
    command: input.command ?? existing.command,
    args: input.args ?? existing.args.join(" "),
    url: input.url ?? existing.url ?? undefined,
    allowedToolNames: input.allowedToolNames ?? existing.allowedToolNames.join(", "),
    authMode: input.authMode ?? existing.authMode,
    oauthProviderId: input.oauthProviderId ?? existing.oauth.providerId ?? undefined,
    oauthGrant: input.oauthGrant ?? existing.oauth.grant ?? undefined,
    oauthClientId: input.oauthClientId ?? existing.oauth.clientId ?? undefined,
    oauthScopes: input.oauthScopes ?? existing.oauth.scopes.join(" "),
    oauthTokenEnvName: input.oauthTokenEnvName ?? existing.oauth.tokenEnvName ?? undefined,
    // NOT merged from `existing` — `ExternalMcpOAuthView` carries no field for a connection's own
    // typed endpoints (only `providerId`, for a registered one). There is nothing stored to merge
    // from; see `apps/admin`'s `use-external-mcp.hooks.ts` header for the identical, already-disclosed
    // gap on the admin side.
    oauthAuthorizationEndpoint: input.oauthAuthorizationEndpoint,
    oauthTokenEndpoint: input.oauthTokenEndpoint,
    oauthDeviceAuthorizationEndpoint: input.oauthDeviceAuthorizationEndpoint,
  };
}

/**
 * The field list for one save form — see this file's header for why this is computed once rather
 * than reactively.
 *
 * @complexity O(1) — a fixed, bounded number of conditionally-included entries.
 */
export function buildExternalMcpSaveFormFields(input: ExternalMcpSaveInput, isUpdate: boolean): SurfaceField[] {
  const isStdio = input.transport !== "streamable_http";
  const isOAuth = input.authMode === "oauth";
  const fields: SurfaceField[] = [];

  if (!isUpdate) {
    fields.push({ kind: "string", name: "id", label: "ID", required: true, value: input.id, hint: "Lowercase letters, digits and dashes." });
  }
  fields.push({ kind: "string", name: "label", label: "Display name", ...(input.label !== undefined ? { value: input.label } : {}) });

  if (isStdio) {
    fields.push(
      { kind: "string", name: "command", label: "Command", required: true, ...(input.command !== undefined ? { value: input.command } : {}), placeholder: "e.g. npx, node, /path/to/binary" },
      { kind: "string", name: "args", label: "Args", ...(input.args !== undefined ? { value: input.args } : {}), placeholder: "space-separated" },
    );
  } else {
    fields.push({ kind: "string", name: "url", label: "URL", required: true, ...(input.url !== undefined ? { value: input.url } : {}), placeholder: "https://…" });
  }

  fields.push({
    kind: "string",
    name: "allowedToolNames",
    label: "Allowed tools",
    ...(input.allowedToolNames !== undefined ? { value: input.allowedToolNames } : {}),
    hint: "Comma-separated — nothing runs unless it is listed here.",
  });

  if (isStdio) {
    fields.push({
      kind: "string",
      name: "env",
      label: "Environment variables",
      multiline: true,
      rows: 3,
      secret: true,
      placeholder: "KEY=VALUE, one per line",
      hint: isUpdate ? "Leave blank to keep the stored values." : undefined,
    });
  }

  if (isOAuth) {
    fields.push(
      { kind: "string", name: "oauthProviderId", label: "Provider ID", ...(input.oauthProviderId !== undefined ? { value: input.oauthProviderId } : {}), hint: "Leave blank to use your own endpoints below." },
      {
        kind: "enum",
        name: "oauthGrant",
        label: "Sign-in method",
        required: true,
        options: [
          { value: "authorization_code", label: "Browser sign-in" },
          { value: "device_code", label: "Device code" },
        ],
        ...(input.oauthGrant !== undefined ? { value: input.oauthGrant } : {}),
      },
      { kind: "string", name: "oauthClientId", label: "Client ID", required: true, ...(input.oauthClientId !== undefined ? { value: input.oauthClientId } : {}) },
      { kind: "string", name: "oauthClientSecret", label: "Client secret", secret: true, hint: isUpdate ? "Leave blank to keep the stored secret." : "Leave blank if this provider needs none (a public/PKCE client)." },
      { kind: "string", name: "oauthScopes", label: "Scopes", ...(input.oauthScopes !== undefined ? { value: input.oauthScopes } : {}), placeholder: "space- or comma-separated" },
    );
    if (isStdio) {
      fields.push({
        kind: "string",
        name: "oauthTokenEnvName",
        label: "Access token environment variable",
        required: true,
        ...(input.oauthTokenEnvName !== undefined ? { value: input.oauthTokenEnvName } : {}),
      });
    }
    fields.push(
      { kind: "string", name: "oauthAuthorizationEndpoint", label: "Authorization endpoint", ...(input.oauthAuthorizationEndpoint !== undefined ? { value: input.oauthAuthorizationEndpoint } : {}), hint: "Needed for Browser sign-in, unless Provider ID is set." },
      { kind: "string", name: "oauthTokenEndpoint", label: "Token endpoint", ...(input.oauthTokenEndpoint !== undefined ? { value: input.oauthTokenEndpoint } : {}), hint: "Needed unless Provider ID is set." },
      { kind: "string", name: "oauthDeviceAuthorizationEndpoint", label: "Device authorization endpoint", ...(input.oauthDeviceAuthorizationEndpoint !== undefined ? { value: input.oauthDeviceAuthorizationEndpoint } : {}), hint: "Needed for Device code, unless Provider ID is set." },
    );
  }

  return fields;
}

/**
 * Builds `external_mcp_save`'s confirmation form.
 *
 * `id`/`transport`/`authMode` ride in `baseParams` rather than as editable fields — see this file's
 * header on why the field SET is fixed per call; changing transport or auth mode is "call this tool
 * again", not an in-form control. Posts back on cancel rather than a silent close, matching
 * `deployment_propose_custom_provider_credential`'s own `buildProposeCredentialForm` — with the call
 * parked, a silent close would strand the handler for the full TTL staring at a form the human
 * already walked away from.
 *
 * @complexity O(f) in the field count this call includes.
 */
export function buildExternalMcpSaveForm(input: {
  exchange: SurfaceExchange;
  save: ExternalMcpSaveInput;
  isUpdate: boolean;
}): UIResource {
  const { exchange, save, isUpdate } = input;
  return buildFormSurface({
    uri: externalMcpSaveFormUri(exchange.id),
    title: isUpdate ? `Update "${save.id}"` : `Add "${save.id}"`,
    description: isUpdate
      ? "The assistant wants to update this external MCP server's configuration. Review and edit anything before saving."
      : "The assistant wants to add this external MCP server. Review and edit anything before saving.",
    details: [
      { label: "Connection type", value: save.transport === "streamable_http" ? "Hosted server (URL)" : "Local command (stdio)" },
      { label: "Credentials", value: save.authMode === "oauth" ? "Connect via OAuth" : save.authMode === "none" ? "None needed" : "API key / token" },
    ],
    submitLabel: isUpdate ? "Save changes" : "Add server",
    toolName: EXTERNAL_MCP_SAVE_TOOL_ID,
    baseParams: {
      [SURFACE_EXCHANGE_ID_PARAM]: exchange.id,
      id: save.id,
      transport: save.transport,
      ...(save.authMode !== undefined ? { authMode: save.authMode } : {}),
    },
    fields: buildExternalMcpSaveFormFields(save, isUpdate),
    cancel: {
      label: "Cancel",
      toolName: EXTERNAL_MCP_SAVE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true },
    },
    app: { appName: "tovu-external-mcp-save", appVersion: "1" },
    preferredFrameSize: ["100%", "640px"],
  });
}
