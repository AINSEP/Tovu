import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { InMemoryEventBus, InMemoryOutbox } from "../core/events";
import { InMemoryChangeSetRepo } from "../core/commands";
import { SqlitePostRepo } from "../features/post";
import { SqlitePresentationSettingsRepo } from "../features/presentation";
import { discoverThemes } from "../features/theme";
import { SqliteWorkspaceRepo } from "../features/workspace";
import { openContentDb } from "../infra/sqlite/content-db";
import { seededWorkspace } from "./seed";
import type { RouteDeps } from "./routes/types";

/** Built-in themes ship in the repo-root `themes/` dir (SPEC-004 spike). */
export function builtInThemesDir(): string {
  return process.env.TOVU_THEMES_DIR ?? join(process.cwd(), "themes");
}

/**
 * @file SQLite-backed composition of route dependencies.
 *
 * Purpose:
 * Builds the same `RouteDeps` shape the in-memory path produces, but with the
 * three feature repos backed by a persistent content.db.
 *
 * How it relates to the project:
 * - Used by the process entrypoint (`index.ts`) for the running server.
 * - Tests keep using the in-memory default in `server/app.ts` (hermetic).
 *
 * Note: outbox + event bus remain in-memory for now (events are fire-on-write
 * side effects, not yet durable across restarts) — a durable outbox is a later
 * slice. Persistence here covers the content model (workspaces/posts/themes).
 */
export function defaultContentDbPath(): string {
  return process.env.TOVU_CONTENT_DB ?? "content.db";
}

export function createSqliteRouteDeps(dbPath: string = defaultContentDbPath()): RouteDeps {
  const db = openContentDb(dbPath);

  return {
    workspaceId: seededWorkspace.id,
    workspaceRepo: new SqliteWorkspaceRepo(db),
    postRepo: new SqlitePostRepo(db),
    presentationRepo: new SqlitePresentationSettingsRepo(db),
    changeSets: new InMemoryChangeSetRepo(),
    themes: discoverThemes(builtInThemesDir(), "built-in"),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    clock: { nowIso: () => new Date().toISOString() },
    idGen: { newId: () => randomUUID() },
  };
}
