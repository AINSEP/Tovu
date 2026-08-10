import { useMemo, useRef, useState } from "react";

import type {
  AddSourceInput,
  AddSourceResult,
  SourceConfigDependencies,
  SourceConfigItem,
  SourceFieldSpec,
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

import { api, describeApiError, type AdminExternalMcpServer, type AdminExternalMcpServerInput } from "../../../lib/api";

/**
 * @file The real transport behind Settings → External MCP, replacing the empty in-memory fake that
 * tab mounted while Tovu had no config store.
 *
 * ## Why the field specs are overridden rather than Jini's defaults
 *
 * `@jini-ai/ui`'s `MCP_SOURCE_FIELD_SPECS` were derived from Open Design's own MCP section, and
 * differ from what Tovu needs in two ways that both matter:
 *
 * 1. They offer a `transport` choice of `stdio | http`. Tovu federates over stdio only
 *    (`assistant/mcp-federation/adapter.stdio.ts` is the sole adapter), so offering `http` would
 *    let an operator fill in a whole form that the server then rejects.
 * 2. They have NO allowlist field at all. Federation is default-deny (`mcp-federation/trust.ts`
 *    R2), so a server saved without one contributes exactly zero tools. That control is the one
 *    doing the real security work — the design doc demonstrates it with Supabase's `execute_sql`,
 *    which reports `readOnlyHint: true` about itself — so the field is required here, not optional.
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
 */

/**
 * Tovu's own field specs — see this file's header for why Jini's defaults are not used.
 *
 * There is deliberately NO `transport` field. Jini's default specs render one as a required
 * `select`, but Tovu supports exactly one transport, so the control could only ever offer a single
 * option — and because the add form starts every field empty, a required select with one option is
 * not merely noise: it blocks submission with "Transport is required" until the operator opens a
 * dropdown to pick the only thing in it. Both the port and the write route default the value, so
 * omitting the field is also what keeps that default in one place. When a second transport is
 * implemented, this comes back as a real choice.
 *
 * `env` is a plain `textarea`, not Jini's `secret-textarea`. That kind masks a loaded value and
 * renders the control readOnly until revealed, which is right for a host that serves stored secrets
 * back to the form — and wrong here twice over: Tovu never returns an env VALUE (`toItem` always
 * sets it blank), so there is nothing to mask, and the readOnly rule applies even to an empty
 * field, so an operator cannot type a token at all without first hunting for a reveal toggle.
 */
export const TOVU_MCP_FIELD_SPECS: readonly SourceFieldSpec[] = [
  { key: "id", label: "ID", kind: "text", required: true, placeholder: "lowercase letters, digits and dashes" },
  { key: "command", label: "Command", kind: "text", required: true, placeholder: "e.g. npx, node, /path/to/binary" },
  { key: "args", label: "Args", kind: "text", placeholder: "space-separated" },
  {
    key: "allowedToolNames",
    label: "Allowed tools",
    kind: "text",
    placeholder: "comma-separated — nothing runs unless it is listed here",
  },
  {
    key: "env",
    label: "Env (KEY=VALUE)",
    kind: "textarea",
    placeholder: "GITHUB_TOKEN=…  (leave blank to keep the stored values)",
  },
];

function toItem(server: AdminExternalMcpServer): SourceConfigItem {
  return {
    id: server.serverId,
    label: server.label,
    enabled: server.enabled,
    fields: {
      id: server.serverId,
      transport: server.transport,
      command: server.command,
      args: server.args.join(" "),
      allowedToolNames: server.allowedToolNames.join(", "),
      // Never populated — see this file's header. The names are surfaced in `statusMessage` instead,
      // so an operator can still see which variables are set.
      env: "",
    },
    ...(server.envNames.length > 0
      ? { statusMessage: `Credentials set: ${server.envNames.join(", ")}` }
      : {}),
  };
}

/**
 * Builds the write body from a field map, omitting `env` when it is blank.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function toWriteBody(fields: Record<string, string>, enabled: boolean, label?: string): AdminExternalMcpServerInput {
  const env = fields.env ?? "";
  return {
    ...(label !== undefined ? { label } : {}),
    transport: fields.transport || "stdio",
    enabled,
    command: fields.command ?? "",
    args: fields.args ?? "",
    allowedToolNames: fields.allowedToolNames ?? "",
    // Blank means "untouched", never "clear" — see this file's header.
    ...(env.trim() === "" ? {} : { env }),
  };
}

export interface ExternalMcpController {
  dependencies: SourceConfigDependencies<SourceConfigItem>;
  fieldSpecs: readonly SourceFieldSpec[];
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
          const fields = { ...(previous?.fields ?? {}), ...(patch.fields ?? {}) };
          const enabled = patch.enabled ?? previous?.enabled ?? true;
          const label = patch.label ?? previous?.label;
          try {
            const { server } = await api.saveExternalMcpServer(id, toWriteBody(fields, enabled, label));
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

  return { dependencies, fieldSpecs: TOVU_MCP_FIELD_SPECS, restartRequired };
}
