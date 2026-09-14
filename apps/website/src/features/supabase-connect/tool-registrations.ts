import {
  buildDomainRegistrations,
  indexCatalogById,
  requireNoInput,
  requireToolPermission,
  type AgentToolSideEffect,
  type AuthorizeFn,
  type ClockPort,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type UUID,
} from "@jini-ai/cms/core";
import { ToolInputError, type SurfaceEmission, type SurfaceEmitter, type ToolExecutionContext } from "@jini-ai/core";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import { askThenReport, SURFACE_DISMISSED_PARAM, type AssistantSurfaceDeps, type SurfaceExchange, type SurfaceMessage } from "../../contracts/core/tool-surface-exchanges.js";
import type { HttpClientPort } from "../../platform/http/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import {
  buildScopedSupabaseMcpUrl,
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  isSupabaseMcpUrl,
  openExternalMcpOAuthPayload,
  resolveExternalMcpAuthMode,
  resolveExternalMcpOAuthStatus,
  saveExternalMcpServer,
  SUPABASE_MCP_URL,
  type ExternalMcpOAuthTokenResolverPort,
  type ExternalMcpServerRecord,
  type ExternalMcpServerRepoPort,
  type ToolContributor,
} from "#src/assistant/index";
import { supabaseConnectAgentToolCatalog, SUPABASE_CONNECT_PERMISSION } from "./agent-tools.js";
import {
  buildAccessTokenFormResource,
  buildProjectScopeFormResource,
  buildSupabaseOutcomeResource,
  SUPABASE_SET_ACCESS_TOKEN_TOOL_ID,
  SUPABASE_SET_PROJECT_SCOPE_TOOL_ID,
  type SupabaseSurfaceKind,
} from "./supabase-connect-ui.js";
import { listSupabaseProjects, type SupabaseProject } from "./supabase-management-api.js";

/**
 * @file Wires the two SPEC-052 form tools onto existing generic machinery — no new credential store,
 * sealer, or rendering path (INV-03).
 *
 * - `supabase_set_access_token` (fallback, REQ-08..10): a masked form; the submitted token is probed
 *   against Supabase's Management API (EC-03), then saved as the `supabase` External MCP row's sealed
 *   `static_env` access token through `saveExternalMcpServer`. The store already sends that token to
 *   a hosted server as `Authorization: Bearer`, and switching the row's auth mode replaces any
 *   unfinished OAuth attempt on it (EC-04) — there is only ever one `supabase` row.
 * - `supabase_set_project_scope` (REQ-05/06): lists the connection's projects, asks the human to pick
 *   exactly one with read-only ON by default, and writes the choice into the row's URL
 *   (`project_ref`, `read_only`). Written with a direct `repo.upsert` of the non-secret `url` column
 *   rather than `saveExternalMcpServer`, which would need every OAuth field resent and could clear an
 *   OAuth row's client identity. `readEnabledExternalMcpConfigs` refuses an unscoped Supabase row
 *   (`assistant/supabase-mcp-scope.ts`), so no tool is offered before this step (INV-04).
 *
 * Neither tool touches `enabled`, `allowedToolNames`, or `writeAllowedToolNames`: the row stays
 * disabled with whatever lists the operator set, and write tools still need `trust.ts`'s explicit
 * write grant (REQ-12). Both refuse before any form or network call when the `supabase` row does
 * not exist, which is the state before the plugin is enabled (REQ-02).
 *
 * Both are driven by `askThenReport`, like `custom_credential_set_token`: the form's own round trip
 * resolves the moment the submission is delivered, so a second send replaces the form with the real
 * outcome once the probe and save have actually run. Both fail closed with no `emitSurface`.
 */

/** The composition-root slice these handlers read. Declared structurally, like
 *  `features/external-mcp/deps.ts`, so this module has no back-edge into `RouteDeps`. */
export interface SupabaseConnectToolDeps {
  readonly workspaceId: UUID;
  readonly authorize: AuthorizeFn;
  readonly clock: ClockPort;
  readonly externalMcpServerRepo: ExternalMcpServerRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly siteAssistantSecretKeyring: KeyringPort;
  /** Optional: only an OAuth-connected row needs it, and a context without it reports "not connected". */
  readonly externalMcpOAuth?: { readonly tokenResolver: ExternalMcpOAuthTokenResolverPort };
  /** The guarded outbound client (ADR-038) whose egress policy already admits any public HTTPS host. */
  readonly customCredentialsHttpClient: HttpClientPort;
}

const DOMAIN = "supabase-connect";
const CONNECTION_ID = "supabase";
const CATALOG_BY_ID = indexCatalogById(supabaseConnectAgentToolCatalog);

/** Plain-language messages from errors.spec.md. None ever carries a token or a Supabase error body. */
const MESSAGES = {
  notInstalled:
    "Supabase isn't set up yet: there is no 'supabase' connection. Ask the operator to turn on the 'supabase' plugin in the Agent Plugins admin screen and restart the assistant. Nothing was changed.",
  notConnected:
    "Supabase isn't connected. Connect it again to continue: start with external_mcp_oauth_connect { id: 'supabase' }, or supabase_set_access_token if sign-in cannot start.",
  revoked: "Your Supabase connection was revoked. Reconnect to keep using it.",
  unavailable: "Supabase is unavailable right now. Try again shortly.",
  tokenInvalid: "That access token didn't work. Create a new one and try again. Nothing was saved.",
  blankToken: "The access token cannot be blank. Nothing was saved.",
  saveFailed: "The access token could not be saved. Nothing was changed.",
  noProjectSelected: "Pick a Supabase project to continue.",
  projectNotInAccount: "That project isn't available to this Supabase account.",
  noProjects: "This Supabase account has no projects yet. Create one in Supabase, then try again.",
} as const;

const NEXT_AFTER_TOKEN = "Call supabase_set_project_scope so the human can pick the one project to connect.";
const NEXT_AFTER_SCOPE =
  "Ask the operator to enable 'supabase' in Settings → External MCP, tick the tools it may use, and restart the assistant.";

type UnansweredReason = "cancelled" | "expired" | "abandoned";
type SetAccessTokenResult =
  | { saved: true; next: string }
  | { saved: false; reason: UnansweredReason | "invalid" | "unavailable" | "error"; message?: string };
type SetProjectScopeResult =
  | { scoped: true; projectRef: string; readOnly: boolean; next: string }
  | { scoped: false; reason: UnansweredReason | "no-project-selected" | "project-not-in-account" | "no-projects" | "error"; message?: string };
type AnswerOutcome<T> = { result: T; outcome?: SurfaceEmission };

export const supabaseConnectDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listSupabaseProjects (one outbound GET) then saveExternalMcpServer: a sealed write, via the human's form.
  ["supabase_set_access_token", "mutates-durable-state"],
  // -> listSupabaseProjects then repo.upsert of the row's url, via the human's form.
  ["supabase_set_project_scope", "mutates-durable-state"],
]);

function outcome(kind: SupabaseSurfaceKind, exchange: SurfaceExchange, state: "success" | "failure", title: string, message: string): SurfaceEmission {
  return { channel: "mcp-ui", payload: { resource: buildSupabaseOutcomeResource({ kind, exchangeId: exchange.id, state, title, message }) } };
}

function readSubmittedString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Only an explicit `false` turns read-only off; a missing or unrecognized value keeps it on (REQ-06). */
function readReadOnlyChoice(value: unknown): boolean {
  return value !== false && value !== "false";
}

function joinStoredList(raw: string | null): string {
  const parsed: unknown = raw === null ? [] : JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string").join(",") : "";
}

async function requirePermission(routeDeps: SupabaseConnectToolDeps, principalId: string): Promise<void> {
  await requireToolPermission(routeDeps, { principalId, permission: SUPABASE_CONNECT_PERMISSION, entityType: "external-mcp-server", entityId: CONNECTION_ID });
}

/**
 * The `supabase` row, freshly read. Refused (REQ-02) when it is missing or no longer points at
 * Supabase's hosted server.
 *
 * @throws {ToolInputError} With {@link MESSAGES.notInstalled}.
 */
async function requireSupabaseConnection(routeDeps: SupabaseConnectToolDeps): Promise<ExternalMcpServerRecord> {
  const record = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: CONNECTION_ID });
  if (record === null || !isSupabaseMcpUrl(record.url)) throw new ToolInputError(MESSAGES.notInstalled);
  return record;
}

function requireEmitSurface(ctx: ToolExecutionContext, toolId: string): SurfaceEmitter {
  if (!ctx.emitSurface) {
    throw new Error(`${toolId}: this execution context has no interactive form channel (no emitSurface), so this form cannot be shown here. Nothing was changed.`);
  }
  return ctx.emitSurface;
}

/** Opens one held-open exchange, emits `build`'s form, and resolves with `handle`'s result. */
async function holdFormOpen<T>(input: {
  ctx: ToolExecutionContext;
  surfaces: AssistantSurfaceDeps;
  emitSurface: SurfaceEmitter;
  toolId: string;
  build: (exchange: SurfaceExchange) => UIResource;
  handle: (answer: SurfaceMessage, exchange: SurfaceExchange) => Promise<AnswerOutcome<T>>;
}): Promise<T> {
  const { ctx, surfaces, emitSurface, toolId, build, handle } = input;
  const exchange = surfaces.surfaceExchanges.open({ toolId, principalId: ctx.principal.id }, emitSurface);
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    return await askThenReport<T>(exchange, { channel: "mcp-ui", payload: { resource: build(exchange) } }, (answer) => handle(answer, exchange));
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/** The row's stored static token. @throws {ToolInputError} When none is stored or it will not open. */
async function openStaticToken(routeDeps: SupabaseConnectToolDeps, record: ExternalMcpServerRecord): Promise<string> {
  let token: string | undefined;
  try {
    token = record.sealedOAuth === null ? undefined : (await openExternalMcpOAuthPayload(routeDeps.siteAssistantSecretSealer, record)).staticAccessToken;
  } catch {
    token = undefined;
  }
  if (!token) throw new ToolInputError(MESSAGES.notConnected);
  return token;
}

/** A connected OAuth row's access token, refreshed if due. @throws {ToolInputError} When not connected or revoked. */
async function resolveOAuthToken(routeDeps: SupabaseConnectToolDeps, record: ExternalMcpServerRecord): Promise<string> {
  if (resolveExternalMcpOAuthStatus(record) !== "connected" || !routeDeps.externalMcpOAuth) throw new ToolInputError(MESSAGES.notConnected);
  try {
    return await routeDeps.externalMcpOAuth.tokenResolver.resolveAccessToken({ serverId: record.serverId });
  } catch {
    throw new ToolInputError(MESSAGES.revoked);
  }
}

async function resolveConnectionToken(routeDeps: SupabaseConnectToolDeps, record: ExternalMcpServerRecord): Promise<string> {
  const authMode = resolveExternalMcpAuthMode(record);
  if (authMode === "static_env") return openStaticToken(routeDeps, record);
  if (authMode === "oauth") return resolveOAuthToken(routeDeps, record);
  throw new ToolInputError(MESSAGES.notConnected);
}

/**
 * Seals `token` onto the freshly re-read `supabase` row as its `static_env` access token, carrying
 * every operator-set field forward unchanged. Re-read at write time because the human may sit on the
 * form while the operator edits the allowlists.
 */
async function saveStaticAccessToken(routeDeps: SupabaseConnectToolDeps, principalId: string, token: string): Promise<void> {
  const record = await requireSupabaseConnection(routeDeps);
  await saveExternalMcpServer(
    { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer, keyring: routeDeps.siteAssistantSecretKeyring, clock: routeDeps.clock },
    {
      workspaceId: routeDeps.workspaceId,
      serverId: record.serverId,
      ...(record.label !== null ? { label: record.label } : {}),
      transport: "streamable_http",
      authMode: "static_env",
      enabled: record.enabled,
      command: "",
      url: record.url ?? SUPABASE_MCP_URL,
      args: "",
      allowedToolNames: joinStoredList(record.allowedToolNames),
      writeAllowedToolNames: joinStoredList(record.writeAllowedToolNames),
      accessToken: token,
      principalId,
    },
  );
}

/** Only the store's own validation/unconfigured messages are shown — neither embeds a value. */
function describeSaveError(err: unknown): string {
  const known = err instanceof ExternalMcpValidationError || err instanceof ExternalMcpSecretStoreUnconfiguredError || err instanceof ToolInputError;
  return known ? (err as Error).message : MESSAGES.saveFailed;
}

function tokenFailure(exchange: SurfaceExchange, reason: "invalid" | "unavailable" | "error", message: string): AnswerOutcome<SetAccessTokenResult> {
  return { result: { saved: false, reason, message }, outcome: outcome("access-token", exchange, "failure", "Token not saved", message) };
}

/**
 * `supabase_set_access_token`'s answer: probe, then seal. The token lives only in a local for the width
 * of this function and is never returned, logged, or put in an outcome.
 *
 * @complexity O(1) plus one outbound GET and one store save.
 */
async function handleAccessTokenAnswer(
  answer: SurfaceMessage,
  ctx: { routeDeps: SupabaseConnectToolDeps; principalId: string; exchange: SurfaceExchange },
): Promise<AnswerOutcome<SetAccessTokenResult>> {
  if (answer.status !== "received") return { result: { saved: false, reason: answer.status } };
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: { saved: false, reason: "cancelled" } };

  const token = readSubmittedString(answer.params, "token");
  if (token === "") return tokenFailure(ctx.exchange, "invalid", MESSAGES.blankToken);

  const probe = await listSupabaseProjects({ httpClient: ctx.routeDeps.customCredentialsHttpClient }, { token });
  if (!probe.ok) {
    return probe.reason === "token-invalid" ? tokenFailure(ctx.exchange, "invalid", MESSAGES.tokenInvalid) : tokenFailure(ctx.exchange, "unavailable", MESSAGES.unavailable);
  }
  try {
    await saveStaticAccessToken(ctx.routeDeps, ctx.principalId, token);
  } catch (err) {
    return tokenFailure(ctx.exchange, "error", describeSaveError(err));
  }
  return { result: { saved: true, next: NEXT_AFTER_TOKEN }, outcome: outcome("access-token", ctx.exchange, "success", "Token saved", "Token saved. Next, pick your Supabase project.") };
}

function scopeFailure(exchange: SurfaceExchange, reason: "no-project-selected" | "project-not-in-account" | "error", message: string): AnswerOutcome<SetProjectScopeResult> {
  return { result: { scoped: false, reason, message }, outcome: outcome("project-scope", exchange, "failure", "Project not connected", message) };
}

/** Writes the chosen project and read-only choice into the freshly re-read row's URL. */
async function persistProjectScope(routeDeps: SupabaseConnectToolDeps, choice: { projectRef: string; readOnly: boolean }): Promise<void> {
  const record = await requireSupabaseConnection(routeDeps);
  const url = buildScopedSupabaseMcpUrl({ url: record.url ?? SUPABASE_MCP_URL, projectRef: choice.projectRef, readOnly: choice.readOnly });
  await routeDeps.externalMcpServerRepo.upsert({ ...record, url, updatedAt: routeDeps.clock.nowIso() });
}

/**
 * `supabase_set_project_scope`'s answer. The submitted ref must be one of the projects listed when the
 * form opened (behavior.spec.md §4: exactly one, no "all projects"). A repeat submission simply
 * overwrites the URL; enablement is re-derived from the URL on every read, so nothing stale survives.
 *
 * @complexity O(n) in the listed project count.
 */
async function handleProjectScopeAnswer(
  answer: SurfaceMessage,
  ctx: { routeDeps: SupabaseConnectToolDeps; exchange: SurfaceExchange; projects: readonly SupabaseProject[] },
): Promise<AnswerOutcome<SetProjectScopeResult>> {
  if (answer.status !== "received") return { result: { scoped: false, reason: answer.status } };
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: { scoped: false, reason: "cancelled" } };

  const projectRef = readSubmittedString(answer.params, "projectRef");
  if (projectRef === "") return scopeFailure(ctx.exchange, "no-project-selected", MESSAGES.noProjectSelected);
  const project = ctx.projects.find((candidate) => candidate.ref === projectRef);
  if (project === undefined) return scopeFailure(ctx.exchange, "project-not-in-account", MESSAGES.projectNotInAccount);

  const readOnly = readReadOnlyChoice(answer.params["readOnly"]);
  try {
    await persistProjectScope(ctx.routeDeps, { projectRef, readOnly });
  } catch (err) {
    return scopeFailure(ctx.exchange, "error", err instanceof ToolInputError ? err.message : "The project could not be saved. Nothing was changed.");
  }
  const mode = readOnly ? "read-only" : "read-only off (writes still need an admin's per-tool grant)";
  return {
    result: { scoped: true, projectRef, readOnly, next: NEXT_AFTER_SCOPE },
    outcome: outcome("project-scope", ctx.exchange, "success", "Project connected", `Connected to ${project.name}, ${mode}.`),
  };
}

export function buildSupabaseConnectRegistrations(routeDeps: SupabaseConnectToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    supabase_set_access_token: async (ctx): Promise<SetAccessTokenResult> => {
      requireNoInput(ctx.input);
      await requirePermission(routeDeps, ctx.principal.id);
      await requireSupabaseConnection(routeDeps);
      const emitSurface = requireEmitSurface(ctx, SUPABASE_SET_ACCESS_TOKEN_TOOL_ID);
      return holdFormOpen<SetAccessTokenResult>({
        ctx,
        surfaces,
        emitSurface,
        toolId: SUPABASE_SET_ACCESS_TOKEN_TOOL_ID,
        build: (exchange) => buildAccessTokenFormResource({ exchangeId: exchange.id }),
        handle: (answer, exchange) => handleAccessTokenAnswer(answer, { routeDeps, principalId: ctx.principal.id, exchange }),
      });
    },

    supabase_set_project_scope: async (ctx): Promise<SetProjectScopeResult> => {
      requireNoInput(ctx.input);
      await requirePermission(routeDeps, ctx.principal.id);
      const record = await requireSupabaseConnection(routeDeps);
      const emitSurface = requireEmitSurface(ctx, SUPABASE_SET_PROJECT_SCOPE_TOOL_ID);
      const token = await resolveConnectionToken(routeDeps, record);
      const listed = await listSupabaseProjects({ httpClient: routeDeps.customCredentialsHttpClient }, { token });
      if (!listed.ok) throw new ToolInputError(listed.reason === "token-invalid" ? MESSAGES.revoked : MESSAGES.unavailable);
      if (listed.projects.length === 0) return { scoped: false, reason: "no-projects", message: MESSAGES.noProjects };
      const projects = listed.projects;
      return holdFormOpen<SetProjectScopeResult>({
        ctx,
        surfaces,
        emitSurface,
        toolId: SUPABASE_SET_PROJECT_SCOPE_TOOL_ID,
        build: (exchange) => buildProjectScopeFormResource({ exchangeId: exchange.id, projects }),
        handle: (answer, exchange) => handleProjectScopeAnswer(answer, { routeDeps, exchange, projects }),
      });
    },
  };

  return buildDomainRegistrations({
    domain: DOMAIN,
    catalogModule: "features/supabase-connect/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: supabaseConnectDerivedRisk,
  });
}

/** Contributes the two Supabase form tools — called once by `tool-catalog-manifest.ts`. */
export function contributeSupabaseConnectTools(): ToolContributor {
  return { domain: DOMAIN, build: buildSupabaseConnectRegistrations, risk: supabaseConnectDerivedRisk };
}
