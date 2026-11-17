import { executeCommand } from "@jini-ai/cms/core";
import type { JsonObject } from "@jini-ai/core/primitives";
import { BackstopRefusal, checkRawTable, checkRawValues, BACKSTOP_LIMITS } from "./backstop-policy.js";
import type { RawColumn, RawRowPort, RawRowSnapshot, RawValue } from "./backstop-ports.js";
import { PublishContentApplyRowError } from "./apply-errors.js";
import { contentHash, CONTENT_HASH_VERSION } from "./content-hash.js";
import type { PackedEntity, PublishContentContributor, PublishContentDeps, PublishContentHandler, SkippedPackEntity } from "./type-registry.js";

export function rawRowId({ table, pk }: { table: string; pk: Readonly<Record<string, RawValue>> }, _optional = {}): string {
  return `${table}:${JSON.stringify(Object.fromEntries(Object.entries(pk).sort(([a], [b]) => a.localeCompare(b))))}`;
}

function decodeId({ id }: { id: string }, _optional = {}): { table: string; pk: Readonly<Record<string, RawValue>> } | null {
  try {
    const split = id.indexOf(":");
    if (split < 1) return null;
    const table = id.slice(0, split);
    const pk = JSON.parse(id.slice(split + 1));
    if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: Object.keys(pk) })) return null;
    if (Object.keys(pk).length === 0 || Object.values(pk).some((value) => {
      if (value === null || !["string", "number"].includes(typeof value)) return true;
      return typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)));
    })) return null;
    return { table, pk };
  } catch { return null; }
}

function rowState(row: RawRowSnapshot): Record<string, unknown> {
  return { table: row.table, columns: row.columns, pk: row.pk, values: row.values };
}
function rowHash(row: RawRowSnapshot): string { return contentHash({ entityType: "raw-row", state: rowState(row) }); }
function rowVersion(row: RawRowSnapshot): number { return Number.parseInt(rowHash(row).slice(0, 12), 16); }
function shape(columns: readonly RawColumn[]): string {
  return JSON.stringify([...columns].sort((a, b) => a.name.localeCompare(b.name)));
}
function scalar(value: unknown): value is RawValue {
  if (value === null || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
  return blobScalar({ value });
}

/** Every column, including bookkeeping columns, stays NESTED in values so the typed hashing
 * exclusions cannot silently discard raw data. A hash-derived version supplies the existing OCC seam. */
export function contributeRawRowPublish(_required = {}, _optional = {}): PublishContentContributor {
  return {
    entityType: "raw-row", dependsOn: [], build: (deps) => buildRawRowHandler({ deps }),
  };
}

type RawRowApplyInput = Parameters<PublishContentHandler["apply"]>[0];

/** What every step of one built raw-row handler reads. `port` is fixed when the handler is built (as
 *  before the split); `deps.backstop` is read again by each step; `skipped` is the one list `pack`
 *  rewrites and `listSkipped` reads. */
interface RawRowEnv {
  readonly deps: PublishContentDeps;
  readonly port: RawRowPort | undefined;
  readonly skipped: SkippedPackEntity[];
}

type RawRowGateway = Required<Pick<PublishContentDeps, "changeSets" | "authorize" | "outbox">>;

function blockedTable({ env, table }: { env: RawRowEnv; table: string }, _optional = {}): string | null {
  return env.deps.backstop?.coveredTables.some((covered) => covered.toLowerCase() === table.toLowerCase())
    ? `Table '${table}' already publishes normally; use Overwrite live in normal publishing.` : null;
}

function checkShape({ env, entity }: { env: RawRowEnv; entity: PackedEntity }, _optional = {}): string | null {
  const { table, columns, values } = entity.state;
  if (typeof table !== "string") return "The raw row has no valid table name.";
  const covered = blockedTable({ env, table });
  if (covered) return covered;
  if (!values || typeof values !== "object" || Array.isArray(values)) return "The raw row has no valid column values.";
  const policy = checkRawTable({ table, columns: Object.keys(values) });
  if (policy) return policy;
  if (!Array.isArray(columns) || columns.some((column) => invalidColumn({ column }))) return "The raw row has no valid column shape.";
  return checkRawTable({ table, columns: columns.map((c: RawColumn) => c.name) });
}

function checkPrimaryKey({ entity, live }: { entity: PackedEntity; live: readonly RawColumn[] }, _optional = {}): string | null {
  const { table, pk, values } = entity.state as unknown as RawRowSnapshot;
  if (!recordValue({ value: pk })) return "Choose a row by its complete primary key.";
  const decoded = decodeId({ id: entity.id });
  if (!decoded || decoded.table !== table || JSON.stringify(decoded.pk) !== JSON.stringify(Object.fromEntries(Object.entries(pk).sort(([a], [b]) => a.localeCompare(b))))) return "The raw row's primary key does not match its address.";
  const primary = live.filter((c) => c.pk > 0).map((c) => c.name).sort();
  if (primary.length === 0 || JSON.stringify(primary) !== JSON.stringify(Object.keys(decoded.pk).sort()) || primary.some((name) => decoded.pk[name] !== (values as Record<string, RawValue>)[name])) return "Choose a row by its complete primary key.";
  return null;
}

function checkLiveValues({ env, entity, live }: { env: RawRowEnv; entity: PackedEntity; live: readonly RawColumn[] }, _optional = {}): string | null {
  const { values } = entity.state as unknown as RawRowSnapshot;
  if (JSON.stringify(Object.keys(values).sort()) !== JSON.stringify(live.map((c) => c.name).sort()) || Object.values(values).some((value) => !scalar(value))) return "The raw row must contain a valid value for every column.";
  const invalidKey = checkPrimaryKey({ entity, live });
  if (invalidKey) return invalidKey;
  if (Object.hasOwn(values, "workspace_id") && (values as Record<string, unknown>).workspace_id !== env.deps.workspaceId) return "This row belongs to a different workspace.";
  return null;
}

async function precheckRawRow({ env, entity }: { env: RawRowEnv; entity: PackedEntity }, _optional = {}): Promise<string | null> {
  const { port, deps } = env;
  if (!port || !deps.backstop) return "Send by hand is not available on this destination.";
  const { table, columns } = entity.state as unknown as RawRowSnapshot;
  const invalid = checkShape({ env, entity });
  if (invalid) return invalid;
  let live: readonly RawColumn[] | null;
  try { live = await port.columns({ table }); } catch (error) {
    // Only expected refusals are public; unexpected diagnostics belong to the shared failure handler.
    if (!(error instanceof BackstopRefusal)) throw error;
    return error.message;
  }
  if (!live || shape(live) !== shape(columns)) return `Live's '${table}' has a different shape; update live first.`;
  const invalidValues = checkLiveValues({ env, entity, live });
  if (invalidValues) return invalidValues;
  return checkContent({ entity });
}

/** Reads the selected row. Only a typed refusal becomes a reason; any other port failure propagates. */
async function readSelectedRow(
  { port, selected }: { port: RawRowPort | undefined; selected: { table: string; pk: Readonly<Record<string, RawValue>> } },
  _optional = {}
): Promise<{ row: RawRowSnapshot | null; readReason: string | null }> {
  try {
    if (!port) throw new Error("Send by hand has no row reader");
    return { row: await port.read(selected), readReason: null };
  } catch (error) {
    if (!(error instanceof BackstopRefusal)) throw error;
    return { row: null, readReason: error.message };
  }
}

async function packSelectedRow(
  { env, selected }: { env: RawRowEnv; selected: { table: string; pk: Readonly<Record<string, RawValue>> } },
  _optional = {}
) {
  const id = rawRowId(selected);
  const early = checkRawTable({ table: selected.table, columns: Object.keys(selected.pk) }) ?? blockedTable({ env, table: selected.table });
  const { row, readReason } = early ? { row: null, readReason: null } : await readSelectedRow({ port: env.port, selected });
  const entity: PackedEntity | null = row ? {
    entityType: "raw-row", id, schemaVersion: 1,
    hashVersion: CONTENT_HASH_VERSION, contentHash: rowHash(row), requiredBlobs: [], state: rowState(row)
  } : null;
  const reason = early ?? readReason ?? (entity ? await precheckRawRow({ env, entity }) : "The selected row no longer exists.");
  return { id, entity, reason };
}

async function* packRawRows({ env }: { env: RawRowEnv }, _optional = {}): AsyncIterable<PackedEntity> {
  env.skipped.length = 0;
  if (!env.port) return;
  const selection = env.deps.backstop?.selection?.rows ?? [];
  if (selection.length > BACKSTOP_LIMITS.rows) throw new Error("Choose at most 200 rows per send.");
  for (const selected of selection) {
    const { id, entity, reason } = await packSelectedRow({ env, selected });
    if (reason) env.skipped.push({ entityType: "raw-row", id, label: id, reason });
    else {
      if (entity) yield entity;
    }
  }
}

async function inspectRawRow({ env, id }: { env: RawRowEnv; id: string }, _optional = {}) {
  const { port } = env;
  const address = decodeId({ id });
  if (!address || !port || blockedTable({ env, table: address.table })) return null;
  let row: RawRowSnapshot | null;
  try { row = await port.read(address); } catch { return null; }
  if (!row) return null;
  // Inspect never exposes values; it still refuses private columns and scans live data.
  if (checkRawTable({ table: row.table, columns: row.columns.map((c) => c.name) })) return null;
  return { hash: rowHash(row), hashVersion: CONTENT_HASH_VERSION, version: rowVersion(row) };
}

/** The command that writes one raw row, with its inverse: a hash-derived version is the OCC seam. */
async function writeRawRowCommand(
  { env, port, gateway, input, incoming }: { env: RawRowEnv; port: RawRowPort; gateway: RawRowGateway; input: RawRowApplyInput; incoming: RawRowSnapshot },
  _optional = {}
): Promise<{ changeSetId: string }> {
  const { deps } = env;
  const { changeSets, authorize, outbox } = gateway;
  let prior: RawRowSnapshot | null = null;
  const result = await executeCommand<{ version: number }>({
    deps: { clock: deps.clock, idGen: deps.idGen, authorize, changeSets, outbox },
    command: { workspaceId: deps.workspaceId, actor: { id: input.principalId, kind: "user" }, permission: "publish.backstop",
      summary: `Send '${input.entity.id}' by hand`, idempotencyKey: input.idempotencyKey },
    mutation: { entityType: "raw-row", entityId: input.entity.id, operation: input.expectedVersion === undefined ? "create" : "update",
      captureInverse: async () => {
        prior = await port.read({ table: incoming.table, pk: incoming.pk });
        return prior ? rowState(prior) as JsonObject : null;
      },
      execute: async () => {
        if (input.expectedVersion === undefined ? prior !== null : prior === null || rowVersion(prior) !== input.expectedVersion) {
          throw new PublishContentApplyRowError({ rowOutcome: "conflict", message: "This row changed on live after it was checked." });
        }
        await port.upsert(incoming);
        return { version: rowVersion(incoming) };
      },
      captureEntityVersion: ({ result: saved }) => saved.version,
      rollback: async () => { if (prior) await port.upsert(prior); else await port.removeCreated(incoming); },
    },
  });
  deps.backstop?.inverses?.push({ kind: "raw-row", entity: input.entity, before: prior, afterHash: input.entity.contentHash });
  return { changeSetId: result.changeSetId };
}

async function applyRawRow({ env, input }: { env: RawRowEnv; input: RawRowApplyInput }, _optional = {}): Promise<{ changeSetId: string }> {
  const { port, deps } = env;
  const reason = await precheckRawRow({ env, entity: input.entity });
  if (reason) throw new PublishContentApplyRowError({ rowOutcome: "blocked", message: reason });
  const { changeSets, authorize, outbox } = deps;
  if (!port || !changeSets || !authorize || !outbox) throw new Error("The raw row command gateway is not wired.");
  const incoming = input.entity.state as unknown as RawRowSnapshot;
  return port.transaction({ work: async () => {
    const freshReason = await precheckRawRow({ env, entity: input.entity });
    if (freshReason) throw new PublishContentApplyRowError({ rowOutcome: "blocked", message: freshReason });
    return writeRawRowCommand({ env, port, gateway: { changeSets, authorize, outbox }, input, incoming });
  } });
}

function buildRawRowHandler({ deps }: { deps: PublishContentDeps }, _optional = {}): PublishContentHandler {
  const env: RawRowEnv = { deps, port: deps.backstop?.rows, skipped: [] };
  return {
    entityType: "raw-row", schemaVersion: 1, permission: "publish.backstop", dependsOn: [], idempotencyScope: "run",
    pack: () => packRawRows({ env }),
    inspect: ({ id }: { id: string }, _optional = {}) => inspectRawRow({ env, id }),
    precheck: ({ entity }: { entity: PackedEntity }, _optional = {}) => precheckRawRow({ env, entity }),
    apply: (input: RawRowApplyInput) => applyRawRow({ env, input }),
    listSkipped: async () => [...env.skipped],
  };
}

/** Used by the audited undo route, never by normal publish. Check and inverse share the same DB
 * transaction, preventing an edit between OCC and restoration. FK failures roll back the undo. */
export async function undoRawRow(
  { deps, entity, before, afterHash }: { deps: PublishContentDeps; entity: PackedEntity; before: RawRowSnapshot | null; afterHash: string },
  _optional = {},
): Promise<string | null> {
  const rows = deps.backstop?.rows;
  if (!rows) return "Send by hand is not available on this destination.";
  const handler = contributeRawRowPublish().build(deps);
  const reason = await handler.precheck({ entity });
  if (reason) return typeof reason === "string" ? reason : reason.reason;
  return rows.transaction({ work: async () => {
    const live = await handler.inspect({ id: entity.id });
    if (live?.hash !== afterHash) return `Row '${entity.id}' changed on live after this send; it was left alone.`;
    if (before) {
      const inverse = { ...entity, state: rowState(before), contentHash: rowHash(before) };
      const denied = await handler.precheck({ entity: inverse });
      if (denied) return typeof denied === "string" ? denied : denied.reason;
      await rows.upsert(before);
    } else {
      const incoming = entity.state as unknown as RawRowSnapshot;
      await rows.removeCreated({ table: incoming.table, pk: incoming.pk });
    }
    return null;
  } });
}

function blobScalar({ value }: { value: unknown }, _optional = {}): boolean {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 1) return false;
  return typeof (value as { blobBase64?: unknown }).blobBase64 === "string" &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test((value as { blobBase64: string }).blobBase64);
}

function invalidColumn({ column }: { column: RawColumn | null }, _optional = {}): boolean {
  if (!column || typeof column.name !== "string" || typeof column.type !== "string") return true;
  return !Number.isInteger(column.pk) || !Number.isInteger(column.notnull);
}

function recordValue({ value }: { value: unknown }, _optional = {}): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function checkContent({ entity }: { entity: PackedEntity }, _optional = {}): string | null {
  const { table, values } = entity.state as unknown as RawRowSnapshot;
  const scannable = Object.fromEntries(Object.entries(values).map(([name, value]) => [name,
    typeof value === "object" && value !== null ? Buffer.from((value as { blobBase64: string }).blobBase64, "base64").toString("utf8") : value]));
  return checkRawValues({ table, values: scannable }) ??
    (entity.contentHash === rowHash(entity.state as unknown as RawRowSnapshot) ? null : "The raw row does not match its checked content hash.");
}
