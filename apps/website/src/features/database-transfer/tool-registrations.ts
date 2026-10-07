import { createDestinationExchangeReporter } from './destination-exchange.js';
import { resolveOperatorLocale, type OperatorLocaleDeps } from '../agent-plugins/operator-locale.js';
import { assertCredentialToken, CredentialInputError } from '../../contracts/core/credential-token.js';
import { readFile } from "node:fs/promises";

import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission, adaptLegacyAuthorize } from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { describeErrorForLog, forbiddenRule } from "../../contracts/core/model-facing-tool-errors.js";
import {
  askThenReport,
  resolveConfirmationDecision,
  SURFACE_DISMISSED_PARAM,
  type AssistantSurfaceDeps,
} from "../../contracts/core/tool-surface-exchanges.js";
import { buildConfirmationSurface, DATABASE_TRANSFER_RUN_TOOL_ID } from "./confirmation-ui.js";
import { countPartialExclusions, planSnapshotTables } from "./copy-engine.js";
import { databaseDestinationStore as DEFAULT_DESTINATION_STORE, DestinationUnreadableError, type DatabaseDestinationStorePort } from "./destination-store.js";
import { buildDestinationForm, buildDestinationOutcome, DESTINATION_ADDRESS_FIELD, SET_DESTINATION_TOOL_ID } from "./destination-ui.js";
import { databaseTransferPlanStore as DEFAULT_PLAN_STORE, type DatabaseTransferPlanStore } from "./plan-store.js";
import { createPsqlPostgresTarget, InvalidConnectionStringError, type PostgresTargetPort } from "./postgres-target.js";
import { openSqliteSnapshotSource } from "./sqlite-source.js";

import { withModelFacingErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { databaseFile } from "@jini-ai/db/kernel";
import { openSqliteFileKernel, type SqliteKernel } from "../../platform/db/kernel/drivers/sqlite.js";
import { contentKernel } from "../../platform/db/content-kernel.js";
import { createDatabaseTransferTools, getDatabaseTransferAgentToolCatalog } from "@jini-ai/db/tools";
import { TRANSFER_NAMING } from "./copy-engine.js";
import { planChatSnapshotTables } from "./table-catalog.js";
import { TOVU_TRANSFER_MESSAGES } from "./transfer-messages.js";
/** Tovu's copy and real schema names ('tovu', 'tovu_'), not Jini's neutral defaults ('the source', 'app'). */
export const databaseTransferAgentToolCatalog = getDatabaseTransferAgentToolCatalog({}, { naming: TRANSFER_NAMING, messages: TOVU_TRANSFER_MESSAGES });
/** Composition adapter; all moved transfer/tool rationale now lives in @jini-ai/db/{transfer,tools}. */
const DOMAIN = "database-transfer";
const PLAN_TOOL_ID = "database_transfer_plan";
const STATUS_TOOL_ID = "database_transfer_status";
const CATALOG_BY_ID = indexCatalogById({ catalog: databaseTransferAgentToolCatalog });
export const databaseTransferDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [PLAN_TOOL_ID, "none"],
  [DATABASE_TRANSFER_RUN_TOOL_ID, "mutates-durable-state"],
  [SET_DESTINATION_TOOL_ID, "mutates-durable-state"],
  [STATUS_TOOL_ID, "none"],
]);

/** The slice of the route-deps bag these tools read. Structural, so this module never imports `server/routes/types`. */
export interface DatabaseTransferToolDeps extends OperatorLocaleDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly dbOps: DbOpsPort;
  /** The site's folder name, written into the copy's marker. */
  readonly siteBinding?: { readonly name: string; readonly dir?: string };
  readonly db?: Parameters<typeof contentKernel>[0];
  /** Disposable test capture seam; runtime resolves the exact sibling of its content DB. */
  readonly databaseTransferChatSnapshot?: () => Promise<Buffer>;
  /** Test-only; defaults to the process-wide store. */
  readonly databaseTransferPlanStore?: DatabaseTransferPlanStore;
  /** The sealed, persistent store (`server/runtime/composition/deps.ts`); absent -> the in-memory fallback. */
  readonly databaseTransferDestinationStore?: DatabaseDestinationStorePort;
  /** Test-only; defaults to the `psql` adapter. */
  readonly databaseTransferTarget?: (connectionString: string) => PostgresTargetPort;
  /** Test-only; defaults to `console.warn`. Never receives a connection string or row data. */
  readonly databaseTransferFailureLog?: (line: string) => void;
}

/** Input errors name the rule, never the connection string. */
const DATABASE_TRANSFER_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule("DATABASE_TRANSFER"),
  { error: InvalidConnectionStringError, code: "DATABASE_TRANSFER_INVALID_CONNECTION_STRING" },
  { error: DestinationUnreadableError, code: "DATABASE_TRANSFER_DESTINATION_UNREADABLE" },
];


/** Read-only online backup of the exact configured chat DB; never create a missing source. */
async function captureChatSnapshot(deps: DatabaseTransferToolDeps): Promise<Buffer> {
  if (deps.databaseTransferChatSnapshot) return deps.databaseTransferChatSnapshot();
  const contentPath = deps.db === undefined ? null : await databaseFile(contentKernel(deps.db));
  if (contentPath === null) throw new Error("the chat snapshot source is not wired");
  const path = process.env.TOVU_CHAT_DB ?? join(dirname(contentPath), "chat.db");
  const dir = await mkdtemp(join(tmpdir(), "tovu-transfer-chat-"));
  let source: SqliteKernel<unknown> | undefined;
  try {
    source = openSqliteFileKernel(path, { readOnly: true });
    const snapshotPath = join(dir, "chat.db");
    await source.backupTo(snapshotPath);
    return await readFile(snapshotPath);
  } finally {
    try { await source?.close(); }
    finally { await rm(dir, { recursive: true, force: true }); }
  }
}
/** @complexity O(1) at registration; consumer adapters supply all schema/security/UI policy. */
export function buildDatabaseTransferRegistrations(deps: DatabaseTransferToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const destinations = deps.databaseTransferDestinationStore ?? DEFAULT_DESTINATION_STORE;
  const localeByExchange = new Map<string, Promise<string>>();
  const reportDestination = createDestinationExchangeReporter({ store: destinations, workspaceId: deps.workspaceId }, {
    localeForExchange: async ({ exchangeId }) => {
      const locale = await (localeByExchange.get(exchangeId) ?? Promise.resolve('en'));
      localeByExchange.delete(exchangeId);
      return locale;
    },
  });
  const tools = createDatabaseTransferTools({
    workspaceId: deps.workspaceId, site: deps.siteBinding?.name ?? deps.workspaceId, naming: TRANSFER_NAMING,
    clock: { nowIso: () => new Date().toISOString() },
    dbOps: deps.dbOps, plans: deps.databaseTransferPlanStore ?? DEFAULT_PLAN_STORE,
    destinations,
    target: connectionString => {
      try { assertCredentialToken({ value: connectionString, field: 'address', hosted: false }); }
      catch (err) { if (err instanceof CredentialInputError) throw new InvalidConnectionStringError(err.message); throw err; }
      return (deps.databaseTransferTarget ?? createPsqlPostgresTarget)(connectionString);
    },
    requirePermission: request => requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: request.principalId, permission: request.permission }, { entityType: request.entityType }),
    openSource: openSqliteSnapshotSource,
    catalog: (name, source) => name === "chat" ? planChatSnapshotTables(source) : planSnapshotTables(source),
    partialExclusions: (name, source) => name === "content" ? countPartialExclusions(source) : [],
    captureChatSnapshot: () => captureChatSnapshot(deps),
    failureLog: deps.databaseTransferFailureLog ?? (line => console.warn(line)), describeError: describeErrorForLog,
    schemaMismatchGuidance: "this Tovu version's Postgres layout does not match it",
    readers: { inputRecord: input => requireInputRecord({ input }), string: (input, key) => requireString({ input, key }) },
    surfaces: {
      open: (binding, emit) => {
        const exchange = surfaces.surfaceExchanges.open(binding, emit);
        if (binding.toolId === SET_DESTINATION_TOOL_ID) localeByExchange.set(exchange.id, resolveOperatorLocale({ deps, workspaceId: deps.workspaceId, principalId: binding.principalId }));
        return exchange;
      },
      resolveDecision: resolveConfirmationDecision, askThenReport: reportDestination,
      confirmation: (plan, exchangeId, optional = {}) => ({ channel: "mcp-ui", payload: { resource: buildConfirmationSurface({ plan, exchangeId, ...optional }) } }),
      destinationForm: exchangeId => ({ channel: "mcp-ui", payload: { resource: buildDestinationForm(exchangeId) } }),
      destinationOutcome: input => ({ channel: "mcp-ui", payload: { resource: buildDestinationOutcome(input) } }),
      dismissedParam: SURFACE_DISMISSED_PARAM, addressField: DESTINATION_ADDRESS_FIELD,
    },
  }, { messages: TOVU_TRANSFER_MESSAGES });
  return buildDomainRegistrations({ domain: DOMAIN, catalogModule: "features/database-transfer/tool-registrations.ts", catalog: CATALOG_BY_ID,
    handlers: withModelFacingErrors({ handlers: Object.fromEntries(tools.map(tool => [tool.descriptor.id, tool.handler])), rules: DATABASE_TRANSFER_MODEL_FACING_ERRORS }), derivedRisk: databaseTransferDerivedRisk });
}
/** Called once by server/runtime/composition/tool-catalog-manifest.ts. */
export function contributeDatabaseTransferTools(): ToolContributor {
  return { domain: DOMAIN, build: buildDatabaseTransferRegistrations, risk: databaseTransferDerivedRisk };
}
