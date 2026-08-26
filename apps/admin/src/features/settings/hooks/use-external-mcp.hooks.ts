import { useMemo, useRef, useState } from "react";

import type {
  AddSourceInput,
  AddSourceResult,
  SourceConfigDependencies,
  SourceConfigItem,
} from "@jini-ai/ui";

/**
 * `SourceUpdateInput` is declared in `@jini-ai/ui`'s `source-config-list/types.ts` but is not
 * re-exported from that feature's barrel, unlike every one of its siblings — an upstream oversight,
 * since `updateSource` is part of the public port contract. Derived from the port itself rather
 * than restated, so it tracks upstream automatically if the export is ever added or the shape
 * changes.
 */
type SourceUpdateInput = Parameters<
  NonNullable<SourceConfigDependencies<SourceConfigItem>["port"]["updateSource"]>
>[1];

import {
  api,
  describeApiError,
  type AdminExternalMcpOAuthInput,
  type AdminExternalMcpServer,
  type AdminExternalMcpServerInput,
} from "../../../lib/api";
import { mergeSourceUpdate, resolveExternalMcpEffectiveAuthMode, validateExternalMcpOAuthIdentity } from "../rules";

/**
 * @file The real transport behind Settings → External MCP, replacing the empty in-memory fake that
 * tab mounted while Tovu had no config store.
 *
 * ## Why field rendering is NOT driven by a fixed `SourceFieldSpec[]` here anymore
 *
 * Earlier versions of this file exported a single static `TOVU_MCP_FIELD_SPECS` array and Tovu
 * mounted `@jini-ai/ui`'s assembled `ExternalMcpTab` directly against it. That stopped being viable
 * once a server could be `stdio` OR `streamable_http`, with credentials `none`/`static_env`/`oauth`:
 * a static spec list has no way to hide `url`/`command` or the OAuth block depending on what the
 * operator is currently choosing, and showing every field for every combination unconditionally is
 * exactly the "here are all the fields, figure out which apply" experience this tab exists to avoid.
 * `../rules.ts`'s `buildExternalMcpFieldSpecs(values)` now computes the visible/required field set
 * from the draft's current values, and `../components/ExternalMcpSettingsPanel.tsx` — Tovu's own
 * replacement for `ExternalMcpTab` — recomputes it live as the operator types. This hook stays
 * unchanged in shape (still a `SourceConfigDependencies` port), it just no longer also hands back one
 * frozen spec list.
 *
 * ## The env field never round-trips a value
 *
 * `fetchSources` cannot populate `env`: no route returns a stored env value, deliberately. So the
 * field always arrives blank, and {@link toWriteBody} omits `env` entirely when it is still blank.
 *
 * That asymmetry is the safe direction and is chosen on purpose. If blank meant "clear", then every
 * enable/disable toggle and every label edit would silently wipe the operator's credentials —
 * exactly the failure the store's `undefined`-vs-`""` distinction exists to prevent. The cost is
 * that clearing credentials from the card alone is not expressible; removing and re-adding the
 * server is. Losing a token by accident is much worse than needing two steps to discard one.
 * `oauthClientSecret` follows the identical rule, for the identical reason — no read model ever
 * returns a stored client secret either.
 */

function toItem(server: AdminExternalMcpServer): SourceConfigItem {
  return {
    id: server.serverId,
    label: server.label,
    enabled: server.enabled,
    fields: {
      id: server.serverId,
      transport: server.transport,
      command: server.command,
      url: server.url ?? "",
      args: server.args.join(" "),
      allowedToolNames: server.allowedToolNames.join(", "),
      authMode: server.authMode,
      // Never populated — see this file's header. The names are surfaced in `statusMessage` instead,
      // so an operator can still see which variables are set.
      env: "",
      // The rest of the OAuth block is NOT secret (a client id travels in the authorization URL by
      // design, same as the store's own doc comment on this), so it round-trips the real stored
      // value — only `oauthClientSecret` stays blank, matching `env`.
      oauthProviderId: server.oauth.providerId ?? "",
      oauthGrant: server.oauth.grant ?? "",
      oauthClientId: server.oauth.clientId ?? "",
      oauthClientSecret: "",
      oauthScopes: server.oauth.scopes.join(" "),
      oauthTokenEnvName: server.oauth.tokenEnvName ?? "",
      // The store's `ExternalMcpOAuthView` does not carry a connection's own endpoints back —
      // `providerId` is enough to identify a registered one, and a connection with its own
      // endpoints has no other read model for them today. Left blank rather than guessed; an
      // operator editing a custom-endpoint connection re-enters them, the same disclosed gap
      // `env`/`oauthClientSecret` already accept for secret-shaped fields (this one isn't secret,
      // it just isn't surfaced yet — a future `oauthEndpoints` field on the view would close it).
      oauthAuthorizationEndpoint: "",
      oauthTokenEndpoint: "",
      oauthDeviceAuthorizationEndpoint: "",
    },
    ...(server.envNames.length > 0
      ? { statusMessage: `Credentials set: ${server.envNames.join(", ")}` }
      : {}),
  };
}

/** Builds the OAuth block for a save, or `undefined` when the draft's effective auth mode isn't
 *  `oauth` — matching the store's own `resolveOAuthFields`, which ignores the whole block outside
 *  that mode. Every member except `clientSecret` is sent as-is (never tri-state): the value the
 *  operator sees IS the true current value (round-tripped by {@link toItem}, or freshly typed), so
 *  there is no "untouched vs cleared" ambiguity to preserve — sending exactly what's shown is
 *  simpler than reconstructing it, and the store's own `firstTrimmed` precedence treats a blank
 *  string as "keep what's stored" for the identity fields regardless. `clientSecret` is the one
 *  member with no round-trip at all (see this file's header), so it keeps the `env` convention: omit
 *  when blank, so a save never silently wipes a stored secret.
 *  @complexity O(1). */
function toOAuthWriteBody(fields: Record<string, string>): AdminExternalMcpOAuthInput | undefined {
  if (resolveExternalMcpEffectiveAuthMode(fields) !== "oauth") return undefined;
  const clientSecret = fields.oauthClientSecret ?? "";
  return {
    providerId: fields.oauthProviderId ?? "",
    grant: fields.oauthGrant ?? "",
    clientId: fields.oauthClientId ?? "",
    scopes: fields.oauthScopes ?? "",
    tokenEnvName: fields.oauthTokenEnvName ?? "",
    authorizationEndpoint: fields.oauthAuthorizationEndpoint ?? "",
    tokenEndpoint: fields.oauthTokenEndpoint ?? "",
    deviceAuthorizationEndpoint: fields.oauthDeviceAuthorizationEndpoint ?? "",
    ...(clientSecret.trim() === "" ? {} : { clientSecret }),
  };
}

/**
 * Builds the write body from a field map, omitting `env`/`oauth.clientSecret` when blank.
 *
 * `command`/`url` are both always sent regardless of transport — harmless, since the store's own
 * `resolveTransportTarget` reads only the one that matches `transport` and ignores the other, and
 * sending both unconditionally is simpler than a transport-keyed omission that would buy nothing.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function toWriteBody(fields: Record<string, string>, enabled: boolean, label?: string): AdminExternalMcpServerInput {
  const env = fields.env ?? "";
  const oauth = toOAuthWriteBody(fields);
  return {
    ...(label !== undefined ? { label } : {}),
    transport: fields.transport || "stdio",
    enabled,
    command: fields.command ?? "",
    url: fields.url ?? "",
    args: fields.args ?? "",
    allowedToolNames: fields.allowedToolNames ?? "",
    authMode: resolveExternalMcpEffectiveAuthMode(fields),
    // Blank means "untouched", never "clear" — see this file's header.
    ...(env.trim() === "" ? {} : { env }),
    ...(oauth ? { oauth } : {}),
  };
}

export interface ExternalMcpController {
  dependencies: SourceConfigDependencies<SourceConfigItem>;
  /** Set once any write succeeds — federation only re-reads the roster at daemon boot. */
  restartRequired: boolean;
}

/**
 * Wires `ExternalMcpTab` to Tovu's real `/mcp-servers` routes.
 *
 * The port is memoized behind a ref so the tab's own hooks see one stable object across renders;
 * `useWiredSourceConfigList` treats a new `dependencies` identity as a reason to refetch.
 *
 * @complexity O(n) per fetch in the configured server count.
 * @overallScore 100
 */
export function useExternalMcp(): ExternalMcpController {
  const [restartRequired, setRestartRequired] = useState(false);
  // `updateSource` receives a PARTIAL patch, but the write route replaces the whole row, so the
  // last-known field values are kept here to merge against. Without this, toggling `enabled` would
  // blank out `command` and the allowlist.
  const lastKnown = useRef(new Map<string, SourceConfigItem>());

  const dependencies = useMemo<SourceConfigDependencies<SourceConfigItem>>(
    () => ({
      port: {
        async fetchSources() {
          const { servers } = await api.listExternalMcpServers();
          const items = servers.map(toItem);
          lastKnown.current = new Map(items.map((item) => [item.id, item]));
          return items;
        },

        async addSource(input: AddSourceInput): Promise<AddSourceResult<SourceConfigItem>> {
          const serverId = (input.fields.id ?? "").trim();
          if (serverId === "") return { ok: false, message: "An ID is required." };
          const oauthIdentityIssue = validateExternalMcpOAuthIdentity(input.fields);
          if (oauthIdentityIssue) return { ok: false, message: oauthIdentityIssue };
          try {
            const { server } = await api.saveExternalMcpServer(
              serverId,
              toWriteBody(input.fields, true, input.fields.label)
            );
            setRestartRequired(true);
            const item = toItem(server);
            lastKnown.current.set(item.id, item);
            return { ok: true, source: item };
          } catch (e) {
            return { ok: false, message: describeApiError(e, "That server could not be saved.") };
          }
        },

        async removeSource(id: string) {
          try {
            await api.deleteExternalMcpServer(id);
            setRestartRequired(true);
            lastKnown.current.delete(id);
            return true;
          } catch {
            return false;
          }
        },

        async updateSource(id: string, patch: SourceUpdateInput) {
          const previous = lastKnown.current.get(id);
          const merged = mergeSourceUpdate(previous, patch);
          try {
            const { server } = await api.saveExternalMcpServer(id, toWriteBody(merged.fields, merged.enabled, merged.label));
            setRestartRequired(true);
            const item = toItem(server);
            lastKnown.current.set(item.id, item);
            return item;
          } catch {
            return null;
          }
        },
      },
    }),
    []
  );

  return { dependencies, restartRequired };
}
