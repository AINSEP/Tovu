import { sql } from "kysely";

/**
 * The `revoked_at` an upsert of a session row must write on conflict: the stored one when the row is
 * already revoked, else the incoming one.
 *
 * Revocation is one-way. A session record built from a read made before a logout, password reset or
 * principal disable carries no `revokedAt`; writing it back with a whole-row conflict update restored
 * a revoked session to live (lost-update class, security). `revoke` is the only thing that sets the
 * column; a save may add a revocation but never remove one.
 *
 * @param required.table - The session table the upsert targets (`sessions`, `member_sessions`).
 * @complexity O(1): one expression in the statement.
 */
export function keepStoredRevocation({ table }: { table: "sessions" | "member_sessions" }, _optional = {}) {
  return sql<string | null>`COALESCE(${sql.ref(`${table}.revoked_at`)}, ${sql.ref("excluded.revoked_at")})`;
}
