import { apiConnectionCallbackFieldRules } from './oauth-bindings.js';
import {
  asApiConnectionHooksModule, checkApiConnectionClientNamespace, parseApiConnectionDescriptor,
  parseApiConnectionsFile as parseApiConnectionDeclarations,
  type ApiConnectionDeclaration, type ApiConnectionDescriptor, type ApiConnectionHooksModule,
} from "@jini-ai/integrations/api-connections";

import { defineExecutablePluginContribution, type LoadPluginContributions } from "../agent-plugins/lifecycle.js";

/**
 * @file Loads the OAuth API connections Agent Plugins declare in {@link API_CONNECTIONS_FILENAME}:
 * the provider descriptor Jini's api-connections service runs, the plugin's hooks module (scope
 * sets, account identity, revocation) and the names of the host config that holds its client ids.
 *
 * TRUST RULE: hooks are plugin code running in this process, so they load through the lifecycle's
 * one executable gate (ACTIVE plugin, bundled digest, contained `.mjs`), like mail adapters. The
 * descriptor is untrusted until Jini's `parseApiConnectionDescriptor` accepts it. Client config is
 * only ever NAMED by the plugin: names must sit in {@link CLIENT_NAMESPACE} and the full plugin-id namespace, so a plugin can point
 * at its own `…_CLIENT_ID` / `…_CLIENT_SECRET` and never at another secret of this host. Request
 * budgets (`budgets`) are clamped to the host's maxima by `budgets.ts` and never reach the descriptor;
 * nor do `scopeSets` (the plugin's scope-set ids, for status), `apiOrigins` (the https origins its
 * API calls reach, for form delivery's host allowlist) and `byoClient` (whether a workspace admin may
 * use their own OAuth client, `byo-client.ts`), which only the host reads.
 */

export const API_CONNECTIONS_FILENAME = "tovu-connections.json";
/** This host's client-setting namespace: every plugin's client settings are named `TOVU_<PLUGIN>_OAUTH_<RUNTIME>_CLIENT_*`. */
const CLIENT_NAMESPACE = "TOVU_";

export type { ApiConnectionClientConfig, ApiConnectionDeclaration, ApiConnectionHooksModule } from "@jini-ai/integrations/api-connections";

/** A declared, trusted connection ready for the host to build a service around. */
export interface DeclaredApiConnection {
  readonly pluginId: string;
  readonly descriptor: ApiConnectionDescriptor;
  readonly clients: ApiConnectionDeclaration["clients"];
  readonly budgets: ApiConnectionDeclaration["budgets"];
  readonly scopeSets: ApiConnectionDeclaration["scopeSets"];
  readonly apiOrigins: ApiConnectionDeclaration["apiOrigins"];
  readonly byoClient: ApiConnectionDeclaration["byoClient"];
  readonly module: ApiConnectionHooksModule;
}

/** Parses a plugin's {@link API_CONNECTIONS_FILENAME}. Pure; unknown keys go to the descriptor parser. @complexity O(c).
 * The parser lives in `@jini-ai/integrations/api-connections`; this keeps the host's name and signature
 * and supplies this host's client-setting namespace. */
export function parseApiConnectionsFile(required: { readonly raw: string }, _optional: Record<string, never> = {}): ReturnType<typeof parseApiConnectionDeclarations> {
  return parseApiConnectionDeclarations({ raw: required.raw, clientNamespace: CLIENT_NAMESPACE });
}

const connectionContribution = defineExecutablePluginContribution<ApiConnectionDeclaration, ApiConnectionHooksModule>({
  filename: API_CONNECTIONS_FILENAME, contribution: "API connections",
  parse: parseApiConnectionsFile, modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asApiConnectionHooksModule({ exported }),
  refusal: ({ plugin, descriptor, reason }) => `API connection '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${reason}`,
}, { onReadError: ({ error }) => ((error as NodeJS.ErrnoException)?.code === "ENOENT" ? [] : undefined) });

/**
 * Every trusted API connection the workspace's active plugins declare, plus log-safe refusals.
 * A descriptor Jini refuses drops only that connection.
 * @complexity O(p + c) plugins and connections, one contained import per connection.
 */
export async function loadDeclaredApiConnections(
  required: { readonly workspaceId: string; readonly loadContributions: LoadPluginContributions },
  _optional: Record<string, never> = {},
): Promise<{ readonly connections: readonly DeclaredApiConnection[]; readonly refusals: readonly string[] }> {
  const load = await required.loadContributions({ workspaceId: required.workspaceId, definition: connectionContribution }, { orderByPluginId: true });
  const connections: DeclaredApiConnection[] = [];
  const refusals = [...load.refusals];
  for (const item of load.items) {
    try {
      checkApiConnectionClientNamespace({ pluginId: item.pluginId, clients: item.descriptor.clients, clientNamespace: CLIENT_NAMESPACE });
      const descriptor = parseApiConnectionDescriptor({ callbackFieldRules: apiConnectionCallbackFieldRules, value: { ...item.descriptor.descriptor, pluginId: item.pluginId, connectionId: item.descriptor.id } });
      const { clients, budgets, scopeSets, apiOrigins, byoClient } = item.descriptor;
      connections.push({ pluginId: item.pluginId, descriptor, clients, budgets, scopeSets, apiOrigins, byoClient, module: item.module });
    } catch (error) {
      refusals.push(`API connection '${item.descriptor.id}' from '${item.pluginId}' was not loaded: ${error instanceof Error ? error.message : "invalid descriptor"}`);
    }
  }
  return { connections, refusals };
}
