/**
 * @file `TrashDb` — the database the Trash's generic pieces (`createTableTrashAdapter`,
 * `moveToTrash`, the `trash_item` tool) and its bespoke adapters run against: the content
 * database's storage kernel (`platform/db/kernel`). One Kysely body serves SQLite, PGlite and
 * Postgres, so nothing under `features/trash` imports a driver.
 *
 * Two rules the queries built over it keep, from the port's earlier Drizzle shape:
 *  - **no `RETURNING`, anywhere** — a version bump is always read back with a second select, never
 *    chained off the write.
 *  - **rows-affected, not the row** — a write's outcome is its affected-row count.
 */
import type { ContentKernel } from "../../platform/db/content-kernel.js";

export type TrashDb = ContentKernel;
