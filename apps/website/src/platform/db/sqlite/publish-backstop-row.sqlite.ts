import { sql } from "kysely";
import type { ContentKernel } from "../content-kernel.js";
import { sqliteForeignKeyCheckedTransaction, sqliteTableInfo } from "../kernel/sqlite-only.js";
import type { RawColumn, RawRowPort, RawValue } from "#src/features/publish-content/backstop-ports";
import { checkRawTable } from "#src/features/publish-content/backstop-policy";

function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid raw database identifier.");
  return `"${name}"`;
}
function allowed(table: string, columns: readonly string[]): void {
  const denied = checkRawTable({ table, columns });
  if (denied) throw new Error(denied);
}
function encode(value: unknown): RawValue {
  if (value instanceof Uint8Array) return { blobBase64: Buffer.from(value).toString("base64") };
  // The default SQLite driver reads INTEGER as number; refuse values that JSON would round.
  if (value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value)))) return value;
  throw new Error("This row contains a database value that cannot be sent safely.");
}
function decode(value: RawValue): string | number | null | Buffer {
  return typeof value === "object" && value !== null ? Buffer.from(value.blobBase64, "base64") : value;
}

/** Site content.db adapter, using Jini's storage kernel for transaction serialization (including
 * nested command gateways). It never opens a second connection and does no schema installation. */
export function createRawRowSqlitePort({ kernel }: { kernel: ContentKernel }, _optional: Record<string, never> = {}): RawRowPort {
  if (kernel.dialect !== "sqlite") throw new Error("Send by hand currently requires a SQLite content database.");
  async function columns({ table }: { table: string }): Promise<readonly RawColumn[] | null> {
    allowed(table, []);
    // SQLite's own table_info shape, not listColumns': both peers compare and hash it (see sqlite-only.ts).
    const info = await sqliteTableInfo({ kernel, table });
    if (!info) return null;
    identifier(table); // a live table whose name later SQL could not quote is refused here, as before
    allowed(table, info.map((c) => c.name));
    return info.map(({ name, type, pk, notnull }) => ({ name, type, pk, notnull })).sort((a, b) => a.name.localeCompare(b.name));
  }
  function where(pk: Readonly<Record<string, RawValue>>) {
    if (Object.keys(pk).length === 0) throw new Error("A complete primary key is required.");
    return sql.join(Object.entries(pk).map(([name, value]) => sql`${sql.raw(identifier(name))} = ${decode(value)}`), sql` AND `);
  }
  async function verifyPk(table: string, pk: Readonly<Record<string, RawValue>>): Promise<readonly RawColumn[]> {
    const info = await columns({ table });
    if (!info) throw new Error(`Table '${table}' does not exist.`);
    const names = info.filter((c) => c.pk > 0).map((c) => c.name).sort();
    if (names.length === 0 || JSON.stringify(names) !== JSON.stringify(Object.keys(pk).sort()) ||
      Object.values(pk).some((value) => value === null || !["string", "number"].includes(typeof value))) throw new Error("Choose a row by its complete primary key.");
    return info;
  }
  return {
    columns,
    read: async ({ table, pk }) => {
      const info = await verifyPk(table, pk);
      const [row] = await kernel.query<Record<string, unknown>>(sql`SELECT * FROM ${sql.raw(identifier(table))} WHERE ${where(pk)}`);
      return row ? { table, pk, columns: info, values: Object.fromEntries(Object.entries(row).map(([name, value]) => [name, encode(value)])) } : null;
    },
    upsert: async ({ table, pk, values }) => {
      allowed(table, Object.keys(values));
      const info = await verifyPk(table, pk);
      if (JSON.stringify(Object.keys(values).sort()) !== JSON.stringify(info.map((c) => c.name).sort()) ||
        Object.keys(pk).some((name) => values[name] !== pk[name])) throw new Error("The raw row does not contain every column or its primary key.");
      const names = Object.keys(values).sort();
      const nonPk = names.filter((name) => !Object.hasOwn(pk, name));
      const updates = nonPk.length > 0 ? sql`DO UPDATE SET ${sql.join(nonPk.map((name) => sql`${sql.raw(identifier(name))} = excluded.${sql.raw(identifier(name))}`))}` : sql`DO NOTHING`;
      await kernel.execute(sql`INSERT INTO ${sql.raw(identifier(table))} (${sql.join(names.map((name) => sql.raw(identifier(name))))})
        VALUES (${sql.join(names.map((name) => sql`${decode(values[name]!)}`))})
        ON CONFLICT (${sql.join(Object.keys(pk).map((name) => sql.raw(identifier(name))))}) ${updates}`);
    },
    removeCreated: async ({ table, pk }) => {
      await verifyPk(table, pk);
      await kernel.execute(sql`DELETE FROM ${sql.raw(identifier(table))} WHERE ${where(pk)}`);
    },
    transaction: async ({ work }) => {
      // A per-row gateway may join the push's outer transaction; only that outer call checks FKs.
      if (kernel.inTransaction()) return work();
      return sqliteForeignKeyCheckedTransaction({ kernel, work, onViolation: (first) =>
        new Error(`Foreign key check failed: '${first.table}' row '${first.rowid}' points at a missing '${first.parent}' row; this send was rolled back.`) });
    },
  };
}
