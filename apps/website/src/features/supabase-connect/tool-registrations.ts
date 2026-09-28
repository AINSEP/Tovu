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
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  saveExternalMcpServer,
  type ExternalMcpServerRecord,
  type ExternalMcpServerRepoPort,
  type ToolContributor,
} from "#src/assistant/index";
import { supabaseConnectAgentToolCatalog, SUPABASE_CONNECT_PERMISSION } from "./agent-tools.js";
import {
  buildAccessTokenFormResource,
  buildSupabaseOutcomeResource,
  SUPABASE_SET_ACCESS_TOKEN_TOOL_ID,
  type SupabaseSurfaceKind,
} from "./supabase-connect-ui.js";
import { listSupabaseProjects } from "./supabase-management-api.js";
import { isSupabaseMcpUrl, SUPABASE_MCP_URL } from "./supabase-mcp-url.js";

/**
 * @file Wires `supabase_set_access_token`, the one Supabase form tool left in core, onto existing
 * generic machinery — no new credential store, sealer, or rendering path (INV-03).
 *
 * A masked form; the submitted token is probed against Supabase's Management API (EC-03), then saved
 * as the `supabase` External MCP row's sealed `static_env` access token through
 * `saveExternalMcpServer`. The store already sends that token to a hosted server as
 * `Authorization: Bearer`, and switching the row's auth mode replaces any unfinished OAuth attempt on
 * it (EC-04) — there is only ever one `supabase` row.
 *
 * It does not touch `enabled`, `allowedToolNames`, or `writeAllowedToolNames`: the row keeps whatever
 * the operator set, and write tools still need `trust.ts`'s explicit write grant (REQ-12). It refuses
 * before any form or network call when the `supabase` row does not exist, which is the state before
 * the plugin is enabled (REQ-02).
 *
 * Driven by `askThenReport`, like `custom_credential_set_token`: the form's own round trip resolves
 * the moment the submission is delivered, so a second send replaces the form with the real outcome
 * once the probe and save have actually run. Fails closed with no `emitSurface`.
 *
 * 2026-09-27: `supabase_get_database` and `supabase_set_project_scope` were deleted. The generic
 * `agent_plugin_connect { pluginId: "supabase" }` connects, and the plugin works account-wide, so a
 * one-project picker contradicted it. This whole folder leaves core once the token form moves into
 * the generic Connect card (plan v2 slice S-G10, then R2).
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
  unavailable: "Supabase is unavailable right now. Try again shortly.",
  tokenInvalid: "That access token didn't work. Create a new one and try again. Nothing was saved.",
  blankToken: "The access token cannot be blank. Nothing was saved.",
  saveFailed: "The access token could not be saved. Nothing was changed.",
} as const;

const NEXT_AFTER_TOKEN =
  "Ask the operator to enable 'supabase' in Settings → External MCP, tick the tools it may use, and restart the assistant.";

type UnansweredReason = "cancelled" | "expired" | "abandoned";
type SetAccessTokenResult =
  | { saved: true; next: string }
  | { saved: false; reason: UnansweredReason | "invalid" | "unavailable" | "error"; message?: string };
type AnswerOutcome<T> = { result: T; outcome?: SurfaceEmission };

export const supabaseConnectDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listSupabaseProjects (one outbound GET) then saveExternalMcpServer: a sealed write, via the human's form.
  ["supabase_set_access_token", "mutates-durable-state"],
]);

function outcome(kind: SupabaseSurfaceKind, exchange: SurfaceExchange, state: "success" | "failure", title: string, message: string): SurfaceEmission {
  return { channel: "mcp-ui", payload: { resource: buildSupabaseOutcomeResource({ kind, exchangeId: exchange.id, state, title, message }) } };
}

function readSubmittedString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
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
  return { result: { saved: true, next: NEXT_AFTER_TOKEN }, outcome: outcome("access-token", ctx.exchange, "success", "Token saved", "Token saved.") };
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

  };

  return buildDomainRegistrations({
    domain: DOMAIN,
    catalogModule: "features/supabase-connect/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: supabaseConnectDerivedRisk,
  });
}

/** Contributes the Supabase token form tool — called once by `tool-catalog-manifest.ts`. */
export function contributeSupabaseConnectTools(): ToolContributor {
  return { domain: DOMAIN, build: buildSupabaseConnectRegistrations, risk: supabaseConnectDerivedRisk };
}
