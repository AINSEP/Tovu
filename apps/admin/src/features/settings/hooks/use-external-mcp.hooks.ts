import { useMemo, useRef, useState } from "react";

import type {
  AddSourceInput,
  AddSourceResult,
  SourceConfigDependencies,
  SourceConfigItem,
  SourceTestResult,
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
} from "@/lib/api";
import { useSerialWrites } from "@/hooks/use-serial-writes.hooks";
import { useExternalMcpDriftCopy } from "../ExternalMcpSettingsPanel.hooks";
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

/** Joins stored argv back into the one-line field the operator edits, double-quoting any argument
 *  that contains whitespace — the one quoting form the server's `parseArgs` reads — so a re-save
 *  (e.g. toggling `enabled`) splits it back into the same arguments instead of breaking a path like
 *  `C:\\Users\\John Smith\\...` in two. @complexity O(n) in the total arg length. */
function joinArgs(args: readonly string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");
}

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
      args: joinArgs(server.args),
      allowedToolNames: server.allowedToolNames.join(", "),
      // The operator's second, write-authorization list — same join convention as
      // `allowedToolNames` immediately above, and round-tripped the same way (never blanked, unlike
      // `env`/`oauthClientSecret`: the store returns this list in the clear, so there is nothing to
      // protect by omitting it).
      writeAllowedToolNames: server.writeAllowedToolNames.join(", "),
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
      // Write-only, exactly like `oauthClientSecret`: the store seals it and no read model returns it,
      // so it always arrives blank and {@link toAccessTokenWriteBody} treats blank as "keep".
      accessToken: "",
      // A NAME, not a secret — round-trips the real stored value like `oauthTokenEnvName` does.
      accessTokenEnvName: server.accessTokenEnvName ?? "",
    },
    ...includeIfDefined("statusMessage", describeStoredCredentials(server)),
  };
}

/** The card's "what is stored" line: env variable NAMES and whether an access token is held — never
 *  a value. `undefined` when neither is stored, so the card shows no status line at all.
 *  @complexity O(n) in the env variable count. */
function describeStoredCredentials(server: AdminExternalMcpServer): string | undefined {
  const parts = [
    ...(server.envNames.length > 0 ? [`Credentials set: ${server.envNames.join(", ")}`] : []),
    ...(server.hasAccessToken ? ["Access token set"] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** The `static_env` access-token half of a save, or nothing for any other auth mode — the store only
 *  reads these for a `static_env` row. Both are omit-when-blank: a blank token means "keep the sealed
 *  one" (the `env` rule), and a blank variable name resolves to the stored name server-side either way,
 *  so omitting it keeps every other mode's write body byte-identical to before this field existed.
 *  @complexity O(1). */
function toAccessTokenWriteBody(fields: Record<string, string>): Pick<AdminExternalMcpServerInput, "accessToken" | "accessTokenEnvName"> {
  if (resolveExternalMcpEffectiveAuthMode(fields) !== "static_env") return {};
  return {
    ...omitIfBlank("accessToken", fieldOrEmpty(fields, "accessToken")),
    ...omitIfBlank("accessTokenEnvName", fieldOrEmpty(fields, "accessTokenEnvName")),
  };
}

/** `fields[key] ?? ""` as a named helper — same rationale as `MenuEditor.tsx`'s `orEmpty`:
 *  ESLint's cyclomatic-complexity rule counts each `??` as its own branch, and
 *  {@link toOAuthWriteBody}/{@link toWriteBody} each default many fields this way. Naming it moves
 *  the count out of both functions' own scope without changing what either produces — every field
 *  still falls back to the same `""` for the same absent value it did before. */
function fieldOrEmpty(fields: Record<string, string>, key: string): string {
  return fields[key] ?? "";
}

/** `value.trim() === "" ? {} : { [key]: value }` as a named helper. The store reads the PRESENCE
 *  of these keys (not just their value) to decide whether a save touched OAuth identity or a
 *  tri-state field like `env` — see {@link toOAuthWriteBody}'s own doc — so the omit-when-blank
 *  convention must stay byte-for-byte the same; this only moves each call site's ternary branch
 *  out of the caller's own complexity count. */
function omitIfBlank<K extends string>(key: K, value: string): { [P in K]?: string } {
  return (value.trim() === "" ? {} : { [key]: value }) as { [P in K]?: string };
}

/** `value === undefined ? {} : { [key]: value }` as a named helper — same rationale as
 *  {@link omitIfBlank}, for the two fields (`label`, `oauth`) whose tri-state is "was this
 *  argument passed at all", not "is this string blank". */
function includeIfDefined<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

/** Builds the OAuth block for a save, or `undefined` when the draft's effective auth mode isn't
 *  `oauth` — matching the store's own `resolveOAuthFields`, which ignores the whole block outside
 *  that mode. `grant`/`clientId`/`scopes`/`tokenEnvName` are sent as-is: {@link toItem} round-trips
 *  their real stored value, so the store's own `firstTrimmed` precedence resolves them correctly
 *  whether or not the operator touched them. `providerId` and the three endpoint fields are
 *  omit-when-blank instead — the same convention `clientSecret` already uses — because the store
 *  reads their PRESENCE, not their value, to decide whether this save touched the connection's OAuth
 *  identity (`resolveOAuthEndpoints`). Endpoints are never round-tripped by {@link toItem} today, so
 *  sending them as an always-present blank string made every save look like an identity change and
 *  silently destroyed the stored token, refresh token, and DCR-minted client secret.
 *  @complexity O(1). */
function toOAuthWriteBody(fields: Record<string, string>): AdminExternalMcpOAuthInput | undefined {
  if (resolveExternalMcpEffectiveAuthMode(fields) !== "oauth") return undefined;
  return {
    ...omitIfBlank("providerId", fieldOrEmpty(fields, "oauthProviderId")),
    grant: fieldOrEmpty(fields, "oauthGrant"),
    clientId: fieldOrEmpty(fields, "oauthClientId"),
    scopes: fieldOrEmpty(fields, "oauthScopes"),
    tokenEnvName: fieldOrEmpty(fields, "oauthTokenEnvName"),
    ...omitIfBlank("authorizationEndpoint", fieldOrEmpty(fields, "oauthAuthorizationEndpoint")),
    ...omitIfBlank("tokenEndpoint", fieldOrEmpty(fields, "oauthTokenEndpoint")),
    ...omitIfBlank("deviceAuthorizationEndpoint", fieldOrEmpty(fields, "oauthDeviceAuthorizationEndpoint")),
    ...omitIfBlank("clientSecret", fieldOrEmpty(fields, "oauthClientSecret")),
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
  const oauth = toOAuthWriteBody(fields);
  return {
    ...includeIfDefined("label", label),
    transport: fields.transport || "stdio",
    enabled,
    command: fieldOrEmpty(fields, "command"),
    url: fieldOrEmpty(fields, "url"),
    args: fieldOrEmpty(fields, "args"),
    allowedToolNames: fieldOrEmpty(fields, "allowedToolNames"),
    // Resent in full on every save, same as `allowedToolNames` just above — NOT tri-state like
    // `env` below, because the store always returns this list in the clear and the tab can always
    // resend it. The server's own C-006 check rejects a name here absent from `allowedToolNames`.
    writeAllowedToolNames: fieldOrEmpty(fields, "writeAllowedToolNames"),
    authMode: resolveExternalMcpEffectiveAuthMode(fields),
    // Blank means "untouched", never "clear" — see this file's header.
    ...omitIfBlank("env", fieldOrEmpty(fields, "env")),
    ...toAccessTokenWriteBody(fields),
    ...includeIfDefined("oauth", oauth),
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
  // Serializes `updateSource` writes per id, through `useSerialWrites`' keyed lanes — see that
  // method's own doc for the race this closes.
  const writes = useSerialWrites();
  // Same bound translator `ExternalMcpToolPicker.tsx` uses for this dictionary (Phase 2C) — reused
  // here rather than re-resolving the locale a second way, so `testSource`'s unreachable-server
  // fallback below stays word-for-word identical to the picker's own copy in every locale, not just
  // English.
  const t = useExternalMcpDriftCopy();

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
          if (serverId === "") return { ok: false, message: t("An ID is required.") };
          const oauthIdentityIssue = validateExternalMcpOAuthIdentity(input.fields, t);
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
            return { ok: false, message: describeApiError(e, t("That server could not be saved.")) };
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

        /**
         * Runs the write behind whatever `updateSource` write for THIS SAME id is already in
         * flight (`writes.run(..., { key: id })`), so a second concurrent edit never reads
         * `lastKnown` until the first one has actually committed its own result there.
         *
         * The merge below is a read-then-write over `lastKnown` (see that ref's own doc), and
         * nothing else serializes two calls for the same id: `SourceConfigList` can fire a toggle
         * and a field-save close together (e.g. flipping "enabled" while a command edit is still
         * saving), and without this both reads see the SAME pre-write snapshot. Whichever write
         * then lands second wins outright — not merges — because it built its own full-row body
         * from a `previous` that never saw the first write's change, so the field the first write
         * touched (and the second's own patch never named) silently reverts the moment the second
         * write's response arrives. Keying the lane on `id` closes that: the second call's
         * `previous` read is delayed until the first call's `lastKnown.set` has actually run, so it
         * merges against the true current state instead of a stale one. Different ids are NOT
         * serialized against each other — they are independent rows with no shared merge base, and
         * each gets its own lane.
         */
        async updateSource(id: string, patch: SourceUpdateInput) {
          return writes.run(async () => {
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
          }, { key: id });
        },

        /**
         * Wired to `probeExternalMcpServer` (C-007, outline §3.1 Source A / §3.5's D-5). Its only
         * effect is lighting up Jini's existing "Test" button — `useSourceConfigList.ts` derives
         * `capabilities.canTest` from `Boolean(port.testSource)`, so implementing this method is
         * what makes the button appear at all.
         *
         * `id` is `undefined` for the add-form's still-unsaved draft (Jini's generic "test before
         * save" case). The probe route addresses an already-persisted server by id, so there is
         * nothing to probe yet — this returns a failure rather than guessing at a URL/command the
         * operator has not saved.
         *
         * `SourceTestResult` cannot carry a tool list (`{ ok, message?, latencyMs? }`), so this is
         * a reachability check ONLY — it complements, and does not replace, the dedicated
         * `ExternalMcpToolPicker` (Phase 4), which reads `probeExternalMcpServer`'s full
         * `AdminRemoteToolSurfaceEntry[]` directly.
         *
         * The port's `draft` second parameter (unsaved field edits to test against, for an
         * already-persisted item) is deliberately not accepted: `probeExternalMcpServer` (C-007)
         * takes only a `serverId` path param and always connects using the server's LAST SAVED
         * `url`/`command`, so there is nothing here that could honor an edited-but-unsaved value —
         * testing an in-progress edit would require the probe route to accept a draft connection
         * target, which is out of this slice's scope.
         */
        async testSource(id: string | undefined): Promise<SourceTestResult> {
          if (id === undefined) {
            return { ok: false, message: t("Save this server before you can test it.") };
          }
          const startedAt = Date.now();
          try {
            const { tools } = await api.probeExternalMcpServer(id);
            return {
              ok: true,
              message: `${tools.length} tool${tools.length === 1 ? "" : "s"} advertised.`,
              latencyMs: Date.now() - startedAt,
            };
          } catch (e) {
            return { ok: false, message: describeApiError(e, t("Could not reach this server. You can still type tool names by hand.")) };
          }
        },
      },
    }),
    [t, writes]
  );

  return { dependencies, restartRequired };
}
