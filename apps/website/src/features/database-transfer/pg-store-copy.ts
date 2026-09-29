import { type RawBuilder, sql } from "kysely";

import type { StorageKernel } from "../../platform/db/kernel/port.js";

/**
 * @file A Postgres-to-Postgres copy of a site's whole store (R1g, `tovu storage move`): every table
 * in the `public` (content) and `ai_chat` (AI chat, ADR-067) schemas, row for row, from a PGlite
 * source into a Postgres target that the migration runner has already brought to head.
 *
 * Same dialect on both sides, so nothing is translated: rows travel as each column's text form and
 * the target's own input functions read them back (jsonb, tsvector, bytea, arrays alike). Unlike the
 * SQLite transfer (`copy-engine.ts`) nothing is excluded: a move is the switch, so logins and sealed
 * credentials go too (still sealed with the same site key).
 *
 * - Tables the migrations do not create (a plugin's `p_<id>__*` tables, `_plugin_*` bookkeeping) are
 *   created on the target from the source's own catalog: columns, identity, constraints, indexes.
 * - Everything happens in ONE target transaction: the target's tables are locked and must still be
 *   empty (no migration seeds rows), foreign keys are dropped, rows copied, foreign keys put back
 *   (validated), identity counters moved past the copied ids, and each table verified (row count + a
 *   checksum of its primary keys). Any failure rolls the target back to its migrated, empty state.
 * - The migration ledgers are not copied: both sides are at head, and the ledgers must agree.
 *
 * The source must not change during the copy (the caller holds its PGlite owner lock). Source reads
 * are short statements, in batches of {@link BATCH_ROWS}, walked by `ctid`.
 */

export const MOVED_SCHEMAS = ["public", "ai_chat"] as const;

/** The migration ledgers: compared, never copied. */
export const LEDGERS: readonly { schema: string; name: string }[] = [
  { schema: "public", name: "tovu_migrations" },
  { schema: "ai_chat", name: "tovu_chat_migrations" },
];

/** Rows per source read / target insert (fewer for a wide table, to stay under the bind limit). */
export const BATCH_ROWS = 500;
const MAX_BIND_PARAMETERS = 60_000;

interface CatalogColumn {
  name: string;
  type: string;
  notNull: boolean;
  /** A default expression, or the generation expression of a generated column. */
  expression: string | null;
  identity: "" | "a" | "d";
  generated: boolean;
}

export interface CatalogTable {
  schema: string;
  name: string;
  columns: CatalogColumn[];
  primaryKey: string[];
}

interface CatalogConstraint {
  schema: string;
  table: string;
  name: string;
  type: string;
  definition: string;
}

export interface CopiedTable {
  /** `schema.table` */
  table: string;
  rows: number;
  /** True for a table the migrations do not create, made on the target from the source's catalog. */
  created: boolean;
}

/** The copy found something it must not hand back. The target transaction is rolled back. */
export class StoreCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreCopyError";
  }
}

const qualified = (table: { schema: string; name: string }): string => `${table.schema}.${table.name}`;
const tableRef = (table: { schema: string; name: string }) => sql.table(qualified(table));
/** `"schema"."table"` as text, for functions that take a relation name (`pg_get_serial_sequence`). */
const quotedName = (table: { schema: string; name: string }): string =>
  [table.schema, table.name].map((part) => `"${part.replace(/"/g, '""')}"`).join(".");
const isLedger = (table: { schema: string; name: string }) => LEDGERS.some((l) => l.schema === table.schema && l.name === table.name);

/** Every base table in the moved schemas, with columns and primary key, in a stable order. */
export async function readCatalog(kernel: StorageKernel<unknown>): Promise<CatalogTable[]> {
  const schemas = sql.join(MOVED_SCHEMAS.map((s) => sql.lit(s)));
  const columns = await kernel.query<{
    schema: string;
    table: string;
    column: string;
    type: string;
    not_null: boolean;
    expression: string | null;
    identity: string;
    generated: string;
  }>(sql`
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS expression, a.attidentity::text AS identity,
           a.attgenerated::text AS generated
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN (${schemas})
    ORDER BY n.nspname, c.relname, a.attnum`);
  const keys = await kernel.query<{ schema: string; table: string; column: string }>(sql`
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS column
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, position) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    WHERE con.contype = 'p' AND n.nspname IN (${schemas})
    ORDER BY n.nspname, c.relname, k.position`);
  const tables = new Map<string, CatalogTable>();
  for (const row of columns) {
    const id = `${row.schema}.${row.table}`;
    let table = tables.get(id);
    if (table === undefined) {
      table = { schema: row.schema, name: row.table, columns: [], primaryKey: [] };
      tables.set(id, table);
    }
    table.columns.push({
      name: row.column,
      type: row.type,
      notNull: row.not_null,
      expression: row.expression,
      identity: row.identity as CatalogColumn["identity"],
      generated: row.generated !== "",
    });
  }
  for (const row of keys) tables.get(`${row.schema}.${row.table}`)?.primaryKey.push(row.column);
  return [...tables.values()];
}

async function readConstraints(kernel: StorageKernel<unknown>): Promise<CatalogConstraint[]> {
  return kernel.query<CatalogConstraint>(sql`
    SELECT n.nspname AS schema, c.relname AS table, con.conname AS name, con.contype::text AS type,
           pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN (${sql.join(MOVED_SCHEMAS.map((s) => sql.lit(s)))}) AND con.contype IN ('p', 'u', 'c', 'f', 'x')
    ORDER BY n.nspname, c.relname, con.conname`);
}

/** Indexes that are not a constraint's own (those come back with the constraint). */
async function readIndexes(kernel: StorageKernel<unknown>): Promise<{ schema: string; table: string; definition: string }[]> {
  return kernel.query(sql`
    SELECT n.nspname AS schema, t.relname AS table, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname IN (${sql.join(MOVED_SCHEMAS.map((s) => sql.lit(s)))})
      AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid AND con.conrelid = i.indrelid AND con.contype IN ('p', 'u', 'x'))
    ORDER BY n.nspname, t.relname, 1`);
}

/**
 * The target's tables that hold rows (ledgers aside). A move goes into an empty database only.
 * @returns `schema.table` names, empty when the target may be used.
 */
export async function nonEmptyTables(kernel: StorageKernel<unknown>): Promise<string[]> {
  const found: string[] = [];
  for (const table of await readCatalog(kernel)) {
    if (isLedger(table)) continue;
    const [row] = await kernel.query<{ any: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM ${tableRef(table)}) AS any`);
    if (row?.any) found.push(qualified(table));
  }
  return found;
}

/** Throws unless both ledgers hold the same steps with the same checksums on both sides. */
export async function assertLedgersAgree(source: StorageKernel<unknown>, target: StorageKernel<unknown>): Promise<void> {
  for (const ledger of LEDGERS) {
    const read = async (kernel: StorageKernel<unknown>) =>
      (await kernel.query<{ id: string; checksum: string }>(sql`SELECT id, checksum FROM ${tableRef(ledger)} ORDER BY id`))
        .map((r) => `${r.id}:${r.checksum}`)
        .join(",");
    const [a, b] = [await read(source), await read(target)];
    if (a !== b) throw new StoreCopyError(`the migration ledger ${qualified(ledger)} differs between the source (${a}) and the target (${b})`);
  }
}

function columnDdl(column: CatalogColumn): RawBuilder<unknown> {
  let ddl = sql`${sql.ref(column.name)} ${sql.raw(column.type)}`;
  if (column.generated) return sql`${ddl} GENERATED ALWAYS AS (${sql.raw(column.expression ?? "NULL")}) STORED`;
  if (column.identity !== "") ddl = sql`${ddl} GENERATED ${sql.raw(column.identity === "a" ? "ALWAYS" : "BY DEFAULT")} AS IDENTITY`;
  if (column.notNull) ddl = sql`${ddl} NOT NULL`;
  if (column.expression !== null && column.identity === "") {
    if (/\bnextval\s*\(/i.test(column.expression)) {
      throw new StoreCopyError(`column ${column.name} takes its default from a sequence (${column.expression}); this move cannot recreate it`);
    }
    ddl = sql`${ddl} DEFAULT ${sql.raw(column.expression)}`;
  }
  return ddl;
}

/** The columns a row is copied through (a generated column is recomputed by the target). */
const copiedColumns = (table: CatalogTable) => table.columns.filter((c) => !c.generated).map((c) => c.name);

async function copyRows(source: StorageKernel<unknown>, target: StorageKernel<unknown>, table: CatalogTable): Promise<number> {
  const columns = copiedColumns(table);
  if (columns.length === 0) return 0;
  const batch = Math.max(1, Math.min(BATCH_ROWS, Math.floor(MAX_BIND_PARAMETERS / columns.length)));
  const select = sql.join(columns.map((c) => sql`${sql.ref(c)}::text AS ${sql.ref(c)}`));
  const into = sql.join(columns.map((c) => sql.ref(c)));
  let after = "(0,0)";
  let copied = 0;
  for (;;) {
    const rows = await source.query<Record<string, string | null>>(
      sql`SELECT ctid::text AS "__ctid", ${select} FROM ${tableRef(table)} WHERE ctid > ${after}::tid ORDER BY ctid LIMIT ${batch}`
    );
    if (rows.length === 0) return copied;
    const values = sql.join(rows.map((row) => sql`(${sql.join(columns.map((c) => sql`${row[c]}`))})`));
    await target.execute(sql`INSERT INTO ${tableRef(table)} (${into}) OVERRIDING SYSTEM VALUE VALUES ${values}`);
    copied += rows.length;
    after = rows[rows.length - 1].__ctid as string;
  }
}

/** Row count and an order-independent checksum of the primary keys (count only without one). */
async function fingerprint(kernel: StorageKernel<unknown>, table: CatalogTable): Promise<string> {
  const key =
    table.primaryKey.length === 0 ? sql`''` : sql`concat_ws(E'\\t', ${sql.join(table.primaryKey.map((c) => sql`${sql.ref(c)}::text`))})`;
  const [row] = await kernel.query<{ n: number; sum: string }>(
    sql`SELECT count(*)::int AS n, md5(coalesce(string_agg(k, E'\\n' ORDER BY k COLLATE "C"), '')) AS sum
        FROM (SELECT ${key} AS k FROM ${tableRef(table)}) keyed`
  );
  return `${row.n}:${row.sum}`;
}

/**
 * Copies every table of `source` into `target` (see this file's header). Call it with both at head
 * and the target empty ({@link nonEmptyTables}); the ledgers are checked here first.
 *
 * @param optional.onCopied runs inside the target transaction after everything is verified; a throw
 *   rolls the copy back (tests inject a failure here).
 * @throws {StoreCopyError} ledgers disagree, a table's columns differ between the sides, the target
 *   holds rows once locked, a table cannot be recreated, or a table's rows do not verify.
 * @complexity O(total rows) reads and writes, in batches of {@link BATCH_ROWS}.
 */
export async function copyPgStore(
  source: StorageKernel<unknown>,
  target: StorageKernel<unknown>,
  optional: { onCopied?: () => Promise<void> } = {}
): Promise<CopiedTable[]> {
  await assertLedgersAgree(source, target);
  const sourceTables = (await readCatalog(source)).filter((t) => !isLedger(t));
  const targetTables = new Map((await readCatalog(target)).map((t) => [qualified(t), t]));
  for (const table of sourceTables) {
    const other = targetTables.get(qualified(table));
    if (other === undefined) continue;
    const shape = (t: CatalogTable) => t.columns.map((c) => `${c.name} ${c.type}`).join(", ");
    if (shape(table) !== shape(other)) {
      throw new StoreCopyError(`table ${qualified(table)} differs: source (${shape(table)}), target (${shape(other)})`);
    }
  }
  const created = sourceTables.filter((t) => !targetTables.has(qualified(t)));
  const createdIds = new Set(created.map(qualified));
  const sourceConstraints = await readConstraints(source);
  const sourceIndexes = await readIndexes(source);

  return target.transaction(async () => {
    // Foreign keys off for the copy (any order, self-references, cycles), back on and validated after.
    const foreignKeys = (await readConstraints(target)).filter((c) => c.type === "f");
    for (const fk of foreignKeys) {
      await target.execute(sql`ALTER TABLE ${tableRef({ schema: fk.schema, name: fk.table })} DROP CONSTRAINT ${sql.ref(fk.name)}`);
    }
    // Emptiness again, under locks this transaction holds to the end: a row another process wrote
    // after the caller's check would otherwise be lost or mixed in.
    const existing = [...targetTables.values()].filter((t) => !isLedger(t));
    if (existing.length > 0) await target.execute(sql`LOCK TABLE ${sql.join(existing.map(tableRef))} IN ACCESS EXCLUSIVE MODE`);
    const occupied = await nonEmptyTables(target);
    if (occupied.length > 0) throw new StoreCopyError(`the target database already holds data (${occupied.join(", ")}); nothing was copied`);

    for (const table of created) {
      await target.execute(sql`CREATE TABLE ${tableRef(table)} (${sql.join(table.columns.map(columnDdl))})`);
    }
    const createdConstraints = sourceConstraints.filter((c) => createdIds.has(`${c.schema}.${c.table}`));
    for (const constraint of createdConstraints.filter((c) => c.type !== "f")) {
      await target.execute(
        sql`ALTER TABLE ${tableRef({ schema: constraint.schema, name: constraint.table })} ADD CONSTRAINT ${sql.ref(constraint.name)} ${sql.raw(constraint.definition)}`
      );
    }
    for (const index of sourceIndexes.filter((i) => createdIds.has(`${i.schema}.${i.table}`))) {
      await target.execute(sql.raw(index.definition));
    }

    const report: CopiedTable[] = [];
    for (const table of sourceTables) {
      const rows = await copyRows(source, target, table);
      report.push({ table: qualified(table), rows, created: createdIds.has(qualified(table)) });
    }

    for (const fk of [...foreignKeys, ...createdConstraints.filter((c) => c.type === "f")]) {
      await target.execute(
        sql`ALTER TABLE ${tableRef({ schema: fk.schema, name: fk.table })} ADD CONSTRAINT ${sql.ref(fk.name)} ${sql.raw(fk.definition)}`
      );
    }
    // Identity counters past the copied ids, or the first insert after the move collides.
    for (const table of sourceTables) {
      for (const column of table.columns.filter((c) => c.identity !== "")) {
        await target.execute(
          sql`SELECT setval(pg_get_serial_sequence(${quotedName(table)}, ${column.name}),
                            COALESCE((SELECT max(${sql.ref(column.name)}) FROM ${tableRef(table)}), 0) + 1, false)`
        );
      }
    }
    for (const table of sourceTables) {
      const [a, b] = [await fingerprint(source, table), await fingerprint(target, table)];
      if (a !== b) throw new StoreCopyError(`table ${qualified(table)} did not verify after the copy: source ${a}, target ${b}`);
    }
    await optional.onCopied?.();
    return report;
  });
}
