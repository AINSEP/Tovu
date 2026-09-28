import { dirname, join } from "node:path";

import { SqlitePostRepo } from "#src/features/post/index";
import type { PostRepoPort } from "#src/features/post/post";
import { postRepoFor } from "#src/features/post/repo";
import { openPgliteContentStore, type PgliteContentStore } from "#src/platform/db/pglite/content-store";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";

/**
 * @file Which store the content repos run on — the `TOVU_CONTENT_STORE` switch.
 *
 * - unset / `sqlite` (default): every repo on `content.db`, exactly as before this switch existed.
 * - `pglite` (prototype, 2026-09-28): the post repo (`posts`, `post_revisions`) runs on PGlite in a
 *   NEW data dir — `TOVU_PGLITE_DIR`, default `<dir of content.db>/pglite/content`. The first boot
 *   copies the site's posts into it; `content.db` is only read, never changed. Everything else stays
 *   on SQLite. Turning the switch off returns to `content.db` as it was (edits made while it was on
 *   stay in the PGlite dir). Plan and deferred list:
 *   `ADS-memory/.local-artifacts/plans/2026-09-28-pglite-adapter-slices.md`.
 *
 * Only one process may open a PGlite data dir. The API process is the `owner`. The agent daemon is a
 * `client`: until it can reach the owner's instance (pglite-socket, slice 2) its post repo refuses
 * every call instead of opening the dir a second time or writing to a stale SQLite copy.
 */

export type ContentStoreRole = "owner" | "client";

/** One store per data dir per process, so a second `createSqliteRouteDeps` call never re-opens it. */
const openStores = new Map<string, PgliteContentStore>();

/** The pglite switch is on for this environment. Anything other than `pglite`/`sqlite`/unset throws. */
export function contentStoreIsPglite(env: NodeJS.ProcessEnv): boolean {
  const value = env.TOVU_CONTENT_STORE;
  if (value === undefined || value === "" || value === "sqlite") return false;
  if (value === "pglite") return true;
  throw new Error(`TOVU_CONTENT_STORE='${value}' is not a store; use 'sqlite' (default) or 'pglite'`);
}

export function pgliteDataDir(env: NodeJS.ProcessEnv, contentDbPath: string): string {
  return env.TOVU_PGLITE_DIR ?? join(dirname(contentDbPath), "pglite", "content");
}

function refuseInClient(): never {
  throw new Error(
    "Posts are on PGlite (TOVU_CONTENT_STORE=pglite), owned by the site's API process; the agent daemon cannot reach them yet"
  );
}

/** Every method rejects: see this file's header. No `then`, so awaiting the repo itself is harmless. */
function clientPostRepo(): PostRepoPort {
  return new Proxy({} as PostRepoPort, {
    get: (_target, key) => (key === "then" ? undefined : async () => refuseInClient()),
  });
}

export function selectPostRepo(required: {
  db: ContentDb;
  contentDbPath: string;
  env: NodeJS.ProcessEnv;
  role: ContentStoreRole;
}): PostRepoPort {
  const { db, contentDbPath, env, role } = required;
  if (!contentStoreIsPglite(env)) return new SqlitePostRepo(db);
  if (role === "client") return clientPostRepo();
  const dataDir = pgliteDataDir(env, contentDbPath);
  let store = openStores.get(dataDir);
  if (store === undefined) {
    store = openPgliteContentStore({ dataDir, importFrom: db });
    openStores.set(dataDir, store);
    // eslint-disable-next-line no-console
    console.log(`[content-store] posts on PGlite at ${dataDir}`);
  }
  return postRepoFor(store);
}
