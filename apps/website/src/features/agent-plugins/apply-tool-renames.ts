import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort, ExternalMcpStoreDeps } from "#src/assistant/index";

import { deriveAgentPluginConnectionId } from "./federate-mcp.js";
import { listInstalledAgentPluginServers, type InstalledAgentPluginServers, type TokenImportLog } from "./import-access-token.js";

/**
 * @file Carries saved tool selections across a vendor's tool rename, so an operator never has to
 * re-tick a tool the server now offers under a new name.
 *
 * A plugin's `mcp.json` declares the rename on the server entry (`tovuRenamedTools: { "get_logs":
 * "query_logs" }`, parsed by `manifest.ts`). At boot, every row that plugin provisioned has each old
 * name in `allowedToolNames` and `writeAllowedToolNames` replaced by the new one. Added 2026-09-29
 * when Supabase renamed `get_logs` to `query_logs` and the saved dev row kept asking for a tool the
 * server no longer offers.
 *
 * Applied only to a row that names this plugin as its provisioner AND sits at the url the plugin
 * declares — the same match `apply-connect-defaults.ts` uses — so an operator's own row, or one
 * pointed elsewhere, is never touched.
 *
 * Never widens access: a new name takes exactly the grants its old name had (read stays read, write
 * stays write), and a rename whose old name is not in a list adds nothing to that list. Idempotent:
 * once rewritten, the old names are gone and later boots write nothing. Reversible: declaring the
 * opposite rename puts the old names back.
 */

/** Recorded as the row's write-grant attribution when a rename changes its write list. */
const TOOL_RENAMES_ACTOR = "system:tool-renames";

export interface ApplyAgentPluginToolRenamesDeps {
  readonly workspaceId: string;
  readonly agentPluginLayout: import("./layout.js").AgentPluginLayout;
  readonly externalMcpServerRepo: ExternalMcpServerRepoPort;
  readonly clock: ExternalMcpStoreDeps["clock"];
  /** Injected for tests. Defaults to `import-access-token.ts`'s `listInstalledAgentPluginServers`. */
  readonly listPlugins?: () => Promise<readonly InstalledAgentPluginServers[]>;
  /** Announces a changed roster so live runtimes reload — the composition root passes
   *  `notifyExternalMcpRosterChanged`. A port rather than a value import: a feature module may not
   *  value-import `#src/assistant/` (`domain-no-direct-tool-registration.boundary.test.ts`). */
  readonly notifyRosterChanged: () => Promise<void>;
}

/** A stored JSON tool list as names, or `null` when it is not a JSON array of strings (left alone). */
function readToolList(raw: string | null): string[] | null {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((name): name is string => typeof name === "string") ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `names` with every renamed entry replaced, order kept, duplicates dropped — or `null` when
 * nothing in it was renamed.
 * @complexity O(n) in the list length.
 */
export function renameToolNames(names: readonly string[], renames: Readonly<Record<string, string>>): string[] | null {
  if (!names.some((name) => Object.hasOwn(renames, name))) return null;
  return [...new Set(names.map((name) => (Object.hasOwn(renames, name) ? renames[name]! : name)))];
}

/** The matching provisioned row with its two tool lists renamed, or `null` when neither list
 * changed (or either is unreadable). */
function renameRowTools(
  input: {
    readonly row: ExternalMcpServerRecord;
    readonly renames: Readonly<Record<string, string>>;
    readonly clock: ExternalMcpStoreDeps["clock"];
    readonly pluginId: string;
    readonly url: string;
  },
  _options = {},
): ExternalMcpServerRecord | null {
  const { row, renames, clock, pluginId, url } = input;
  if (row.provisionedByPluginId !== pluginId || row.url !== url) return null;
  const nowIso = clockNowIso({ clock });
  const allow = readToolList(row.allowedToolNames);
  const write = readToolList(row.writeAllowedToolNames);
  if (allow === null || write === null) return null;
  const renamedAllow = renameToolNames(allow, renames);
  const renamedWrite = renameToolNames(write, renames);
  if (renamedAllow === null && renamedWrite === null) return null;
  return {
    ...row,
    ...(renamedAllow === null ? {} : { allowedToolNames: JSON.stringify(renamedAllow) }),
    ...(renamedWrite === null
      ? {}
      : { writeAllowedToolNames: JSON.stringify(renamedWrite), writeGrantsUpdatedByPrincipalId: TOOL_RENAMES_ACTOR, writeGrantsUpdatedAt: nowIso }),
    updatedAt: nowIso,
  };
}

/** Applies one declaration only to its provisioned row at the declared endpoint. */
async function applyServerToolRenames(
  input: {
    readonly deps: ApplyAgentPluginToolRenamesDeps;
    readonly pluginId: string;
    readonly serverKey: string;
    readonly config: import("./mcp-metadata.js").McpServerConfig;
    readonly log: TokenImportLog;
  },
  _options = {},
): Promise<boolean> {
  const { deps, pluginId, serverKey, config, log } = input;
  if (config.type === "stdio" || !config.tovuRenamedTools) return false;
  const serverId = deriveAgentPluginConnectionId(serverKey);
  if (serverId === null) return false;
  const result = { changed: false };
  try {
    const row = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId });
    if (!row) return false;
    const renamed = renameRowTools({ row, renames: config.tovuRenamedTools, clock: deps.clock, pluginId, url: config.url });
    if (!renamed) return false;
    await deps.externalMcpServerRepo.upsert(renamed);
    result.changed = true;
    const renames = Object.entries(config.tovuRenamedTools).map(([from, to]) => `${from} -> ${to}`).join(", ");
    log.info(`[agent-plugins] '${serverId}': renamed saved tools to follow the '${pluginId}' plugin (${renames}).`);
    return true;
  } catch (err) {
    log.warn(`[agent-plugins] could not apply the '${pluginId}' plugin's tool renames to '${serverId}': ${err instanceof Error ? err.message : String(err)}`);
  }
  return result.changed;
}

/**
 * Boot: rewrites renamed tool names on every row an installed plugin provisioned. Logs each rewrite
 * once (the next boot finds nothing to do) and notifies the roster when any row changed. Never
 * throws: a failure is a warning and the next boot tries again.
 *
 * @complexity O(p·s) over installed plugins and their servers, plus one row read per declared rename
 * and at most one write per row.
 */
export async function applyAgentPluginToolRenames(deps: ApplyAgentPluginToolRenamesDeps, log: TokenImportLog): Promise<void> {
  let plugins: readonly InstalledAgentPluginServers[];
  try {
    plugins = await (deps.listPlugins ?? (() => listInstalledAgentPluginServers(deps)))();
  } catch (err) {
    log.warn(`[agent-plugins] could not list plugins to apply tool renames: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  let changed = false;
  for (const { pluginId, servers } of plugins) {
    for (const [serverKey, config] of Object.entries(servers)) {
      if (await applyServerToolRenames({ deps, pluginId, serverKey, config, log })) changed = true;
    }
  }
  if (changed) await deps.notifyRosterChanged();
}
