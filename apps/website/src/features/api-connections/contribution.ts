import path from "node:path";

import { parseApiConnectionDescriptor, type ApiConnectionDescriptor, type ApiConnectionHooks } from "@jini-ai/integrations/api-connections";

import { defineExecutablePluginContribution, type LoadPluginContributions } from "../agent-plugins/lifecycle.js";
import { parseConnectionBudgets, type ConnectionBudget } from "./budgets.js";

/**
 * @file Loads the OAuth API connections Agent Plugins declare in {@link API_CONNECTIONS_FILENAME}:
 * the provider descriptor Jini's api-connections service runs, the plugin's hooks module (scope
 * sets, account identity, revocation) and the names of the host config that holds its client ids.
 *
 * TRUST RULE: hooks are plugin code running in this process, so they load through the lifecycle's
 * one executable gate (ACTIVE plugin, bundled digest, contained `.mjs`), like mail adapters. The
 * descriptor is untrusted until Jini's `parseApiConnectionDescriptor` accepts it. Client config is
 * only ever NAMED by the plugin: names must match {@link CLIENT_ENV_PATTERN}, so a plugin can point
 * at its own `…_CLIENT_ID` / `…_CLIENT_SECRET` and never at another secret of this host. Request
 * budgets (`budgets`) are clamped to the host's maxima by `budgets.ts` and never reach the descriptor;
 * nor do `scopeSets` (the plugin's scope-set ids, for status) and `apiOrigins` (the https origins its
 * API calls reach, for form delivery's host allowlist), which only the host reads.
 */

export const API_CONNECTIONS_FILENAME = "tovu-connections.json";
const CLIENT_ENV_PATTERN = /^TOVU_[A-Z0-9_]{1,80}_CLIENT_(ID|SECRET)$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CONNECTIONS = 8;
const MAX_ORIGINS = 32;
const MAX_API_ORIGINS = 8;
const MAX_SCOPE_SETS = 16;
/** The scope-set id shape Jini's admin-surface port accepts. */
const SCOPE_SET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Where a runtime's client id (and, for the hosted web client, its secret) is configured. */
export interface ApiConnectionClientConfig {
  readonly clientIdEnv: string;
  readonly clientSecretEnv?: string;
  /** Hosted only: the site origins the shared client has registered callbacks for, added to the host's
   *  configured list (`API_CONNECTION_CALLBACK_ORIGINS_ENV`). Neither: hosted sign-in is refused. */
  readonly redirectOrigins?: readonly string[];
}

/** One `connections[]` entry before the plugin id is known. */
export interface ApiConnectionDeclaration {
  readonly id: string;
  readonly module: string;
  readonly clients: { readonly web?: ApiConnectionClientConfig; readonly desktop?: ApiConnectionClientConfig };
  /** Clamped per-minute budgets the host charges on every token read; always includes an instance budget. */
  readonly budgets: readonly ConnectionBudget[];
  /** The scope-set ids (opaque product-module ids) the plugin offers, so status can report which are granted. */
  readonly scopeSets: readonly string[];
  /** The https origins the plugin's API calls with this connection reach (form delivery's host allowlist). */
  readonly apiOrigins: readonly string[];
  /** Passed to `parseApiConnectionDescriptor` with the plugin id at load time. */
  readonly descriptor: Readonly<Record<string, unknown>>;
}

/** What the hooks module default-exports: hooks built over the host's guarded HTTP capability. */
export interface ApiConnectionHooksModule {
  readonly createHooks: (required: { readonly http: unknown }, optional?: Record<string, never>) => ApiConnectionHooks;
}

/** A declared, trusted connection ready for the host to build a service around. */
export interface DeclaredApiConnection {
  readonly pluginId: string;
  readonly descriptor: ApiConnectionDescriptor;
  readonly clients: ApiConnectionDeclaration["clients"];
  readonly budgets: ApiConnectionDeclaration["budgets"];
  readonly scopeSets: ApiConnectionDeclaration["scopeSets"];
  readonly apiOrigins: ApiConnectionDeclaration["apiOrigins"];
  readonly module: ApiConnectionHooksModule;
}

type ParseResult = { readonly ok: true; readonly descriptors: readonly ApiConnectionDeclaration[] } | { readonly ok: false; readonly reason: string };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOrigin(value: unknown): boolean {
  return typeof value === "string" && URL.canParse(value) && new URL(value).origin === value;
}

function isEnvName(value: unknown, suffix: "_ID" | "_SECRET"): value is string {
  return typeof value === "string" && CLIENT_ENV_PATTERN.test(value) && value.endsWith(suffix);
}

function isOriginList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= MAX_ORIGINS && value.every(isOrigin);
}

/** Both runtime clients, or why one is invalid. @complexity O(o) origins. */
function parseClients(clients: Readonly<Record<string, unknown>>, at: string): ApiConnectionDeclaration["clients"] | string {
  const web = parseClient(clients.web, `${at}.clients.web`);
  const desktop = parseClient(clients.desktop, `${at}.clients.desktop`);
  if (typeof web === "string") return web;
  if (typeof desktop === "string") return desktop;
  return { ...(web ? { web } : {}), ...(desktop ? { desktop } : {}) };
}

/** One client config, or why it is invalid. @complexity O(o) origins. */
// complexity-debt: four optional fields, each validated in place; splitting further only moves the branches.
function parseClient(value: unknown, at: string): ApiConnectionClientConfig | string | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return `${at} must be an object`;
  const { clientIdEnv, clientSecretEnv, redirectOrigins } = value;
  if (!isEnvName(clientIdEnv, "_ID")) return `${at}.clientIdEnv must name a TOVU_…_CLIENT_ID setting`;
  if (clientSecretEnv !== undefined && !isEnvName(clientSecretEnv, "_SECRET")) return `${at}.clientSecretEnv must name a TOVU_…_CLIENT_SECRET setting`;
  if (redirectOrigins !== undefined && !isOriginList(redirectOrigins)) return `${at}.redirectOrigins must be a list of origins`;
  return { clientIdEnv, ...(clientSecretEnv === undefined ? {} : { clientSecretEnv }), ...(redirectOrigins === undefined ? {} : { redirectOrigins }) };
}

function isHttpsOrigin(value: unknown): value is string {
  return isOrigin(value) && new URL(value as string).protocol === "https:";
}

/** Optional host-read lists, each bounded; absent = empty. @complexity O(n) entries. */
function parseHostLists(scopeSets: unknown, apiOrigins: unknown, at: string): Pick<ApiConnectionDeclaration, "scopeSets" | "apiOrigins"> | string {
  const sets = scopeSets ?? [];
  const origins = apiOrigins ?? [];
  if (!Array.isArray(sets) || sets.length > MAX_SCOPE_SETS || !sets.every((id) => typeof id === "string" && SCOPE_SET_ID_PATTERN.test(id))) return `${at}.scopeSets must be at most ${MAX_SCOPE_SETS} short ids`;
  if (!Array.isArray(origins) || origins.length > MAX_API_ORIGINS || !origins.every(isHttpsOrigin)) return `${at}.apiOrigins must be at most ${MAX_API_ORIGINS} https:// origins`;
  return { scopeSets: [...sets] as string[], apiOrigins: [...origins] as string[] };
}

function idOrModuleProblem(id: unknown, module: unknown, at: string): string | undefined {
  if (typeof id !== "string" || id.length > 64 || !ID_PATTERN.test(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  return undefined;
}

/**
 * One declaration, or why it is invalid. Either client may name a secret setting: the desktop
 * (installed-app) client stays public even then, because some providers issue installed apps a
 * secret that is not confidential; the host still keeps it in config only, never in output or logs.
 * @complexity O(1).
 */
function parseDeclaration(entry: unknown, at: string): ApiConnectionDeclaration | string {
  if (!isObject(entry)) return `${at} must be an object`;
  const { id, module, clients, budgets: declaredBudgets, scopeSets, apiOrigins, ...descriptor } = entry;
  const invalid = idOrModuleProblem(id, module, at);
  if (invalid) return invalid;
  if (!isObject(clients)) return `${at}.clients must be an object`;
  const runtimeClients = parseClients(clients, at);
  if (typeof runtimeClients === "string") return runtimeClients;
  const budgets = parseConnectionBudgets({ value: declaredBudgets, at: `${at}.budgets` });
  if (typeof budgets === "string") return budgets;
  const lists = parseHostLists(scopeSets, apiOrigins, at);
  if (typeof lists === "string") return lists;
  // idOrModuleProblem returned undefined, so both are checked strings.
  return { id: id as string, module: module as string, clients: runtimeClients, budgets, ...lists, descriptor };
}

const INVALID_JSON = Symbol("invalid-json");
function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return INVALID_JSON; }
}

/** Parses a plugin's {@link API_CONNECTIONS_FILENAME}. Pure; unknown keys go to the descriptor parser. @complexity O(c). */
// complexity-debt: top-level shape checks plus the per-entry loop and duplicate check.
export function parseApiConnectionsFile(required: { readonly raw: string }, _optional: Record<string, never> = {}): ParseResult {
  const value = parseJson(required.raw);
  if (value === INVALID_JSON) return { ok: false, reason: "not valid JSON" };
  if (!isObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.connections) || value.connections.length > MAX_CONNECTIONS) return { ok: false, reason: `connections must be an array of at most ${MAX_CONNECTIONS}` };
  const descriptors: ApiConnectionDeclaration[] = [];
  for (const [index, entry] of value.connections.entries()) {
    const result = parseDeclaration(entry, `connections[${index}]`);
    if (typeof result === "string") return { ok: false, reason: result };
    if (descriptors.some((seen) => seen.id === result.id)) return { ok: false, reason: `connections[${index}].id '${result.id}' is declared twice` };
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

const connectionContribution = defineExecutablePluginContribution<ApiConnectionDeclaration, ApiConnectionHooksModule>({
  filename: API_CONNECTIONS_FILENAME, contribution: "API connections",
  parse: parseApiConnectionsFile, modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => (isObject(exported) && typeof exported.createHooks === "function" ? exported as unknown as ApiConnectionHooksModule : "its module has no createHooks() function"),
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
      const descriptor = parseApiConnectionDescriptor({ value: { ...item.descriptor.descriptor, pluginId: item.pluginId, connectionId: item.descriptor.id } });
      const { clients, budgets, scopeSets, apiOrigins } = item.descriptor;
      connections.push({ pluginId: item.pluginId, descriptor, clients, budgets, scopeSets, apiOrigins, module: item.module });
    } catch (error) {
      refusals.push(`API connection '${item.descriptor.id}' from '${item.pluginId}' was not loaded: ${error instanceof Error ? error.message : "invalid descriptor"}`);
    }
  }
  return { connections, refusals };
}
