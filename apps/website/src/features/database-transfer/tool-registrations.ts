import { readFile, unlink } from "node:fs/promises";

import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { ToolInputError, type SurfaceEmission, type ToolExecutionContext } from "@jini-ai/core";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import type { ToolContributor } from "#src/assistant/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { describeErrorForLog, forbiddenRule, withModelFacingErrors, type ModelFacingErrorRule } from "../../contracts/core/model-facing-tool-errors.js";
import {
  askThenReport,
  resolveConfirmationDecision,
  SURFACE_DISMISSED_PARAM,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
  type SurfaceMessage,
} from "../../contracts/core/tool-surface-exchanges.js";
import { buildConfirmationSurface, DATABASE_TRANSFER_RUN_TOOL_ID } from "./confirmation-ui.js";
import { countPartialExclusions, countSourceRows, inspectTarget, planSnapshotTables, runCopy, SourceSchemaMismatchError } from "./copy-engine.js";
import { databaseDestinationStore as DEFAULT_DESTINATION_STORE, DestinationUnreadableError, type DatabaseDestinationStorePort, type SavedDatabaseDestination } from "./destination-store.js";
import { buildDestinationForm, buildDestinationOutcome, DESTINATION_ADDRESS_FIELD, SET_DESTINATION_TOOL_ID } from "./destination-ui.js";
import { databaseTransferPlanStore as DEFAULT_PLAN_STORE, type DatabaseTransferPlan, type DatabaseTransferPlanStore } from "./plan-store.js";
import { createPsqlPostgresTarget, InvalidConnectionStringError, type PostgresTargetPort, type TargetDescription } from "./postgres-target.js";
import { openSqliteSnapshotSource, type TransferSource } from "./sqlite-source.js";
import { LEFT_OUT_REASON } from "./table-catalog.js";

/**
 * @file `database_transfer_plan` (read-only) and `database_transfer_run` (human-confirmed): COPY this
 * site's database into a private `tovu` area of any Postgres database, while the site keeps running
 * on its built-in storage. Plan slice P0 of `ADS-memory/reports/2026-09-27-assistant-db-transfer-plan.md`
 * — core tables, row-count check. Vendor-blind: a plugin (e.g. Supabase) supplies the destination
 * later; core never names one.
 *
 * The destination is never a tool input: `database_transfer_set_destination` raises a private form the
 * human pastes the address into (`destination-ui.ts`), and every other tool reads it from
 * `destination-store.ts`. `database_transfer_status` reports the destination, the last run and the copy
 * found there.
 *
 * Two calls, the `site_backup_plan`/`site_backup_push` shape: the plan snapshots the database
 * (`DbOpsPort.captureRestorePoint`, never the live file), connects to the destination, counts every
 * table and refuses anything that would fail (unreachable, too old, someone else's `tovu` area). The
 * run raises the Copy/Cancel card and, on Copy, writes exactly the planned snapshot in one
 * transaction (`copy-engine.ts`).
 *
 * The connection string is never returned, shown or logged: results carry only host, port, database
 * and user.
 */

interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

const DOMAIN = "database-transfer";
const PLAN_TOOL_ID = "database_transfer_plan";
const STATUS_TOOL_ID = "database_transfer_status";
const NO_INPUT_SCHEMA = { type: "object", additionalProperties: false, properties: {} } as const;
/** Owner-only: in no built-in role but the owner's `*`. */
const RUN_PERMISSION = "database-transfer.run";
const SNAPSHOT_SCOPE_ID = "database-transfer";
/** Postgres 14, the oldest this copy is tested against. */
const MIN_SERVER_VERSION_NUM = 140000;

export const databaseTransferAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: PLAN_TOOL_ID,
    description:
      "Plans a COPY of this site's data into a Postgres database (for example 'move/transfer/copy my data to Postgres'). The site keeps running on its built-in storage; this only makes a copy, into the site's own private area (Postgres schema) on that database: 'tovu' for the first site copied there, 'tovu_<site name>' for any other, and always the same one for this site afterwards. Several sites can share one database; each copy replaces only its own area. Read-only: it snapshots the site database, connects to the saved destination, and counts what would be copied. Logins, saved keys and secret settings are never copied; photos and files stay where they are. No input: the destination is the one the human saved with database_transfer_set_destination. Returns {planned: true, planId, expiresAt, destination: {host, port, database, user}, area (the schema), snapshotAt, tableCount, rowCount, replaces (the earlier copy's time, or null), leftOut, notes, nextStep}, or {planned: false, code, message} (codes: NO_DESTINATION, UNREACHABLE, SERVER_TOO_OLD, NO_CREATE_PERMISSION, TARGET_NOT_OURS, DATABASE_SNAPSHOT_FAILED, SCHEMA_MISMATCH, UNAVAILABLE). Tell the human in plain words what will be copied, then call database_transfer_run with the planId.",
    sideEffects: "none",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: SET_DESTINATION_TOOL_ID,
    description:
      "Asks the human where a copy of this site's data should go: shows a private form where they paste a Postgres database address. HUMAN-GATED: this one call shows the form and WAITS. You never see the address, and must never ask for it in chat; if the human pastes one into the chat anyway, do not repeat it, call this tool, and suggest they change that database password. Checks that the database can be reached before saving it (one destination per site; saving replaces the earlier one). Returns {saved: true, destination: {host, port, database, user}, replaces (the time of a copy this site already made there, or null)}, {saved: false, code, message} (INVALID_CONNECTION_STRING, UNREACHABLE, SERVER_TOO_OLD, NO_CREATE_PERMISSION, TARGET_NOT_OURS), or {saved: false, reason} (cancelled, expired, abandoned). Then call database_transfer_plan.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: STATUS_TOOL_ID,
    description:
      "Reports where this site's data copy goes and how the last copy went ('is my data copied?', 'when was the last copy?'). Read-only. Returns {destination: {host, port, database, user} or null, lastRun: {copied: true, snapshotAt, tableCount, rowCount} or {copied: false, snapshotAt, code, message} or null (since the server started), copyOnDestination: {site, snapshotAt} or null, or {unreachable: message}}.",
    sideEffects: "none",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: DATABASE_TRANSFER_RUN_TOOL_ID,
    description:
      "Copies the data planned by database_transfer_plan. HUMAN-GATED: this one call shows a Copy/Cancel card and WAITS; there is no second call. On Copy it writes the planned snapshot as one transaction into this site's private area (this site's earlier copy is replaced; other sites' copies and anything else in the database are untouched), checks every table's row count, and returns {copied: true, destination, area, snapshotAt, tableCount, rowCount, tables: [{name, rows}]}. Any failure throws the copy away and keeps the earlier one: {copied: false, cancelled: false, code, message} (TARGET_NOT_OURS, COPY_FAILED, COUNT_MISMATCH, PLAN_NOT_FOUND, PLAN_EXPIRED). Cancel returns {copied: false, cancelled: true}.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId"],
      properties: { planId: { type: "string", description: "The planId database_transfer_plan returned. Single-use; valid for 10 minutes." } },
    },
  },
];

const CATALOG_BY_ID = indexCatalogById(databaseTransferAgentToolCatalog);

export const databaseTransferDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [PLAN_TOOL_ID, "none"],
  [DATABASE_TRANSFER_RUN_TOOL_ID, "mutates-durable-state"],
  [SET_DESTINATION_TOOL_ID, "mutates-durable-state"],
  [STATUS_TOOL_ID, "none"],
]);

/** The slice of the route-deps bag these tools read. Structural, so this module never imports `server/routes/types`. */
export interface DatabaseTransferToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly dbOps: DbOpsPort;
  /** The site's folder name, written into the copy's marker. */
  readonly siteBinding?: { readonly name: string };
  /** Test-only; defaults to the process-wide store. */
  readonly databaseTransferPlanStore?: DatabaseTransferPlanStore;
  /** The sealed, persistent store (`server/runtime/composition/deps.ts`); absent -> the in-memory fallback. */
  readonly databaseTransferDestinationStore?: DatabaseDestinationStorePort;
  /** Test-only; defaults to the `psql` adapter. */
  readonly databaseTransferTarget?: (connectionString: string) => PostgresTargetPort;
  /** Test-only; defaults to `console.warn`. Never receives a connection string or row data. */
  readonly databaseTransferFailureLog?: (line: string) => void;
}

interface Refusal {
  readonly code: string;
  readonly message: string;
}

function destinationsOf(deps: DatabaseTransferToolDeps): DatabaseDestinationStorePort {
  return deps.databaseTransferDestinationStore ?? DEFAULT_DESTINATION_STORE;
}

function targetFor(deps: DatabaseTransferToolDeps, connectionString: string): PostgresTargetPort {
  return (deps.databaseTransferTarget ?? createPsqlPostgresTarget)(connectionString);
}

function log(deps: DatabaseTransferToolDeps, line: string): void {
  (deps.databaseTransferFailureLog ?? ((text: string) => console.warn(text)))(`[database-transfer] ${line}`);
}

/**
 * A consistent copy of the site database, as bytes. The restore-point file is deleted as soon as it
 * is read.
 *
 * @complexity O(database size).
 */
async function captureSnapshot(deps: DatabaseTransferToolDeps): Promise<{ ok: true; bytes: Buffer } | Refusal> {
  const { restorePoint } = await deps.dbOps.getCapabilities();
  if (restorePoint.costClass !== "cheap" || restorePoint.kind !== "file-snapshot") {
    return { code: "UNAVAILABLE", message: "only a site on built-in storage (SQLite) can be copied" };
  }
  let artifactRef: string;
  try {
    ({ artifactRef } = await deps.dbOps.captureRestorePoint({ scopeId: SNAPSHOT_SCOPE_ID }));
  } catch (err) {
    log(deps, `snapshot failed: ${describeErrorForLog(err)}`);
    return { code: "DATABASE_SNAPSHOT_FAILED", message: "the site database could not be snapshotted; nothing was copied" };
  }
  try {
    return { ok: true, bytes: await readFile(artifactRef) };
  } catch (err) {
    log(deps, `snapshot read failed: ${describeErrorForLog(err)}`);
    return { code: "DATABASE_SNAPSHOT_FAILED", message: "the site database snapshot could not be read; nothing was copied" };
  } finally {
    await unlink(artifactRef).catch(() => undefined);
  }
}

/** The site name copies are marked with; it also picks the site's schema (`copy-engine.ts`). */
function siteOf(deps: DatabaseTransferToolDeps): string {
  return deps.siteBinding?.name ?? deps.workspaceId;
}

/** Connection, version, permission, and which private schema this site's copy goes to. */
async function checkTarget(target: PostgresTargetPort, site: string): Promise<{ ok: true; schema: string; replaces: string | null } | Refusal> {
  const inspected = await inspectTarget(target, site);
  const where = `${target.describe().database} on ${target.describe().host}`;
  if (!inspected.ok) return { code: "UNREACHABLE", message: `could not connect to ${where}: ${inspected.error}` };
  if (inspected.serverVersionNum < MIN_SERVER_VERSION_NUM) return { code: "SERVER_TOO_OLD", message: `${where} runs Postgres ${inspected.serverVersionNum}; version 14 or later is needed` };
  if (inspected.schema === null) {
    return { code: "TARGET_NOT_OURS", message: `every private area this site could use in ${where} already holds other data. Nothing will be overwritten.` };
  }
  if (inspected.schemaState === "absent" && !inspected.canCreateSchema) return { code: "NO_CREATE_PERMISSION", message: `the user '${target.describe().user}' may not create a private area in ${where}` };
  return { ok: true, schema: inspected.schema, replaces: inspected.lastCopy?.snapshotAt ?? null };
}

/** Row counts from the snapshot, plus what is left out and why. */
function countSnapshot(bytes: Buffer): { ok: true; tableCount: number; rowCount: number; leftOut: DatabaseTransferPlan["leftOut"] } | Refusal {
  const source = openSqliteSnapshotSource(bytes);
  try {
    const inventory = planSnapshotTables(source);
    const counts = countSourceRows(source, inventory.tables);
    // The human hears about their own data left behind; the database's bookkeeping and search
    // indexes (rebuilt from the content) are not theirs to miss.
    const leftOut = [
      ...inventory.leftOut
        .filter((entry) => entry.reason !== LEFT_OUT_REASON.bookkeeping && entry.reason !== LEFT_OUT_REASON.derived)
        .map((entry) => ({ ...entry, rows: source.countRows(entry.table) })),
      ...countPartialExclusions(source),
    ];
    return { ok: true, tableCount: counts.length, rowCount: counts.reduce((sum, count) => sum + count.rows, 0), leftOut };
  } catch (err) {
    if (err instanceof SourceSchemaMismatchError) return { code: "SCHEMA_MISMATCH", message: `${err.message}; this Tovu version's Postgres layout does not match it` };
    throw err;
  } finally {
    source.close();
  }
}

function planResult(plan: DatabaseTransferPlan): Record<string, unknown> {
  return {
    planned: true,
    planId: plan.planId,
    expiresAt: new Date(plan.expiresAtMs).toISOString(),
    destination: plan.destination,
    area: plan.schema,
    snapshotAt: plan.snapshotAt,
    tableCount: plan.tableCount,
    rowCount: plan.rowCount,
    replaces: plan.replaces,
    leftOut: plan.leftOut.filter((entry) => entry.rows > 0),
    notes: ["The site keeps running on its built-in storage; this is a copy.", "Photos and files stay where they are; only their records are copied."],
    nextStep: "Tell the human what will be copied, then call database_transfer_run with this planId. It shows a Copy/Cancel card.",
  };
}

/**
 * The plan: parse, check permission, reach the destination, then snapshot and count. A refusal before
 * the snapshot costs no snapshot.
 *
 * @complexity One connection check plus O(database size) for the snapshot and O(tables) counts.
 */
async function handlePlan(deps: DatabaseTransferToolDeps, ctx: ToolExecutionContext): Promise<Record<string, unknown>> {
  await requireToolPermission(deps, { principalId: ctx.principal.id, permission: RUN_PERMISSION, entityType: DOMAIN });
  const destination = await destinationsOf(deps).get(deps.workspaceId);
  if (destination === null) {
    return {
      planned: false,
      code: "NO_DESTINATION",
      message: "no destination database is saved for this site yet",
      nextStep: `Call ${SET_DESTINATION_TOOL_ID}. It shows the human a private form for the database address; you never see it.`,
    };
  }
  const { connectionString } = destination;
  const target = targetFor(deps, connectionString);

  const checked = await checkTarget(target, siteOf(deps));
  if (!("ok" in checked)) return { planned: false, ...checked };
  const snapshot = await captureSnapshot(deps);
  if (!("ok" in snapshot)) return { planned: false, ...snapshot };
  const counted = countSnapshot(snapshot.bytes);
  if (!("ok" in counted)) return { planned: false, ...counted };

  const plan = (deps.databaseTransferPlanStore ?? DEFAULT_PLAN_STORE).save({
    principalId: ctx.principal.id,
    workspaceId: deps.workspaceId,
    content: {
      connectionString,
      destination: target.describe(),
      replaces: checked.replaces,
      snapshot: snapshot.bytes,
      snapshotAt: new Date().toISOString(),
      site: siteOf(deps),
      schema: checked.schema,
      tableCount: counted.tableCount,
      rowCount: counted.rowCount,
      leftOut: counted.leftOut,
    },
  });
  return planResult(plan);
}

type RunResult = Record<string, unknown>;

async function askToConfirm(ctx: ToolExecutionContext, surfaces: AssistantSurfaceDeps, plan: DatabaseTransferPlan, emitSurface: NonNullable<ToolExecutionContext["emitSurface"]>): Promise<{ confirmed: true } | { confirmed: false; result: RunResult }> {
  const exchange: SurfaceExchange = surfaces.surfaceExchanges.open({ toolId: DATABASE_TRANSFER_RUN_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const ui: UIResource = buildConfirmationSurface({ plan, exchangeId: exchange.id });
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
    if (outcome.confirmed) return { confirmed: true };
    if (outcome.reason === "declined") return { confirmed: false, result: { copied: false, cancelled: true } };
    return { confirmed: false, result: { copied: false, cancelled: false, reason: outcome.reason } };
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/** @complexity O(total rows), streamed. */
async function copyPlanned(deps: DatabaseTransferToolDeps, plan: DatabaseTransferPlan): Promise<RunResult> {
  const source: TransferSource = openSqliteSnapshotSource(plan.snapshot);
  try {
    const { tables } = planSnapshotTables(source);
    const counts = countSourceRows(source, tables);
    const result = await runCopy({ source, target: targetFor(deps, plan.connectionString), tables, counts, schema: plan.schema, marker: { site: plan.site, snapshotAt: plan.snapshotAt } });
    if (!result.ok) {
      if (result.logDetail !== undefined) log(deps, `${DATABASE_TRANSFER_RUN_TOOL_ID}: ${result.code} ${result.logDetail}`);
      await destinationsOf(deps).recordRun(deps.workspaceId, { copied: false, snapshotAt: plan.snapshotAt, code: result.code, message: result.message });
      return { copied: false, cancelled: false, code: result.code, message: result.message };
    }
    if (result.warning !== undefined) log(deps, `${DATABASE_TRANSFER_RUN_TOOL_ID}: ${result.warning}`);
    const rowCount = result.tables.reduce((sum, table) => sum + table.rows, 0);
    await destinationsOf(deps).recordRun(deps.workspaceId, { copied: true, snapshotAt: plan.snapshotAt, tableCount: result.tables.length, rowCount });
    return {
      copied: true,
      destination: plan.destination,
      area: plan.schema,
      snapshotAt: plan.snapshotAt,
      tableCount: result.tables.length,
      rowCount,
      tables: result.tables,
      ...(result.unvalidatedConstraints.length === 0
        ? {}
        : {
            unvalidatedConstraints: result.unvalidatedConstraints,
            note: "Some copied rows point at records that no longer exist in this site's data. Those links are kept but marked unchecked on the destination; everything was still copied.",
          }),
    };
  } finally {
    source.close();
  }
}

const PLAN_TAKE_MESSAGES = {
  PLAN_NOT_FOUND: "no copy plan with that planId is waiting (a planId works once, for this principal, and a server restart drops plans). Call database_transfer_plan again.",
  PLAN_EXPIRED: "that copy plan expired (plans last 10 minutes). Call database_transfer_plan again.",
} as const;

async function handleRun(deps: DatabaseTransferToolDeps, surfaces: AssistantSurfaceDeps, ctx: ToolExecutionContext): Promise<RunResult> {
  const planId = requireString(requireInputRecord(ctx.input), "planId");
  await requireToolPermission(deps, { principalId: ctx.principal.id, permission: RUN_PERMISSION, entityType: DOMAIN });
  if (!ctx.emitSurface) {
    throw new ToolInputError(`${DATABASE_TRANSFER_RUN_TOOL_ID}: this execution context has no interactive confirmation channel (no emitSurface), so a copy cannot be confirmed here. Nothing was copied.`);
  }
  const taken = (deps.databaseTransferPlanStore ?? DEFAULT_PLAN_STORE).take({ planId, principalId: ctx.principal.id, workspaceId: deps.workspaceId });
  if (!taken.ok) return { copied: false, cancelled: false, code: taken.code, message: PLAN_TAKE_MESSAGES[taken.code] };

  const decision = await askToConfirm(ctx, surfaces, taken.plan, ctx.emitSurface);
  if (!decision.confirmed) return decision.result;
  return copyPlanned(deps, taken.plan);
}

type SetDestinationResult =
  | { saved: true; destination: TargetDescription; replaces: string | null }
  | { saved: false; code: string; message: string }
  | { saved: false; reason: "cancelled" | "expired" | "abandoned" };

function failedDestination(exchangeId: string, code: string, message: string): { result: SetDestinationResult; outcome: SurfaceEmission } {
  return { result: { saved: false, code, message }, outcome: { channel: "mcp-ui", payload: { resource: buildDestinationOutcome({ exchangeId, state: "failure", message: `Not saved: ${message}.` }) } } };
}

/**
 * The submitted address lives in one local for the width of this function: parsed, checked against
 * the real server, then saved. It is never returned, logged or put in the outcome card.
 *
 * @complexity One connection check.
 */
async function handleDestinationAnswer(deps: DatabaseTransferToolDeps, exchangeId: string, answer: SurfaceMessage): Promise<{ result: SetDestinationResult; outcome?: SurfaceEmission }> {
  if (answer.status !== "received") return { result: { saved: false, reason: answer.status } };
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: { saved: false, reason: "cancelled" } };
  const address = typeof answer.params[DESTINATION_ADDRESS_FIELD] === "string" ? (answer.params[DESTINATION_ADDRESS_FIELD] as string).trim() : "";
  let target: PostgresTargetPort;
  try {
    target = targetFor(deps, address);
  } catch (err) {
    if (err instanceof InvalidConnectionStringError) return failedDestination(exchangeId, "INVALID_CONNECTION_STRING", err.message);
    throw err;
  }
  const checked = await checkTarget(target, siteOf(deps));
  if (!("ok" in checked)) return failedDestination(exchangeId, checked.code, checked.message);
  const destination: SavedDatabaseDestination = { connectionString: address, description: target.describe(), savedAt: new Date().toISOString() };
  await destinationsOf(deps).save(deps.workspaceId, destination);
  const { database, host } = destination.description;
  return {
    result: { saved: true, destination: destination.description, replaces: checked.replaces },
    outcome: { channel: "mcp-ui", payload: { resource: buildDestinationOutcome({ exchangeId, state: "success", message: `Copies of this site's data will go to ${database} on ${host}.` }) } },
  };
}

async function handleSetDestination(deps: DatabaseTransferToolDeps, surfaces: AssistantSurfaceDeps, ctx: ToolExecutionContext): Promise<SetDestinationResult> {
  await requireToolPermission(deps, { principalId: ctx.principal.id, permission: RUN_PERMISSION, entityType: DOMAIN });
  if (!ctx.emitSurface) {
    throw new ToolInputError(`${SET_DESTINATION_TOOL_ID}: this execution context has no interactive form channel (no emitSurface), so the human cannot type the address here. Nothing was saved.`);
  }
  const exchange = surfaces.surfaceExchanges.open({ toolId: SET_DESTINATION_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface);
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    return await askThenReport(exchange, { channel: "mcp-ui", payload: { resource: buildDestinationForm(exchange.id) } }, (answer) => handleDestinationAnswer(deps, exchange.id, answer));
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/**
 * The saved destination (described, never the address), this process's last run, and the copy the
 * destination itself holds (its marker), when it can be reached.
 *
 * @complexity One connection check when a destination is saved.
 */
async function handleStatus(deps: DatabaseTransferToolDeps, ctx: ToolExecutionContext): Promise<Record<string, unknown>> {
  await requireToolPermission(deps, { principalId: ctx.principal.id, permission: RUN_PERMISSION, entityType: DOMAIN });
  const destination = await destinationsOf(deps).get(deps.workspaceId);
  const lastRun = await destinationsOf(deps).lastRun(deps.workspaceId);
  if (destination === null) return { destination: null, lastRun, copyOnDestination: null };
  const inspected = await inspectTarget(targetFor(deps, destination.connectionString), siteOf(deps));
  const copyOnDestination = inspected.ok ? inspected.lastCopy : { unreachable: inspected.error };
  return { destination: destination.description, lastRun, copyOnDestination };
}

/** Input errors name the rule, never the connection string. */
const DATABASE_TRANSFER_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule("DATABASE_TRANSFER"),
  { error: InvalidConnectionStringError, code: "DATABASE_TRANSFER_INVALID_CONNECTION_STRING" },
  { error: DestinationUnreadableError, code: "DATABASE_TRANSFER_DESTINATION_UNREADABLE" },
];

/** @complexity O(1) at registration. */
export function buildDatabaseTransferRegistrations(deps: DatabaseTransferToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [PLAN_TOOL_ID]: (ctx) => handlePlan(deps, ctx),
    [DATABASE_TRANSFER_RUN_TOOL_ID]: (ctx) => handleRun(deps, surfaces, ctx),
    [SET_DESTINATION_TOOL_ID]: (ctx) => handleSetDestination(deps, surfaces, ctx),
    [STATUS_TOOL_ID]: (ctx) => handleStatus(deps, ctx),
  };
  return buildDomainRegistrations({
    domain: DOMAIN,
    catalogModule: "features/database-transfer/tool-registrations.ts",
    catalog: CATALOG_BY_ID,
    handlers: withModelFacingErrors(handlers, DATABASE_TRANSFER_MODEL_FACING_ERRORS),
    derivedRisk: databaseTransferDerivedRisk,
  });
}

/** Called once by `server/runtime/composition/tool-catalog-manifest.ts`. */
export function contributeDatabaseTransferTools(): ToolContributor {
  return { domain: DOMAIN, build: buildDatabaseTransferRegistrations, risk: databaseTransferDerivedRisk };
}
