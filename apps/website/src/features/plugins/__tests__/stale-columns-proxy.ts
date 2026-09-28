import type Database from "better-sqlite3";

/**
 * @file Test double for the dataModule fault-injection tests: `db` behind a proxy whose SECOND
 * column read of `table` (the kernel's `listColumns`, i.e. `pragma_table_info(<table>)`) reports only
 * the `id` column. The first read (planning, before the DDL transaction) passes through; the second
 * (`verifyPostDdl`, inside the transaction right after the ALTER) sees stale, pre-ALTER data — so
 * "verification can't confirm what was just applied" is injected without an unreachable
 * SQLite-level failure. Every other statement and method goes straight to the real connection.
 */
export function staleColumnsOnSecondRead(db: Database.Database, table: string): Database.Database {
  let columnReads = 0;
  const passThrough = <T extends object>(target: T, prop: string | symbol) => {
    const value = Reflect.get(target, prop) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  };
  return new Proxy(db, {
    get(target, prop) {
      if (prop !== "prepare") return passThrough(target, prop);
      return (text: string) => {
        const statement = target.prepare(text);
        if (!text.includes("pragma_table_info(")) return statement;
        return new Proxy(statement, {
          get(real, name) {
            if (name !== "all") return passThrough(real, name);
            return (params: unknown[]) => {
              if (params[0] === table) {
                columnReads += 1;
                if (columnReads === 2) return [{ name: "id", type: "TEXT", not_null: 0, pk: 1 }];
              }
              return real.all(params);
            };
          },
        });
      };
    },
  });
}
