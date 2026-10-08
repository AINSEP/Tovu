import { WIDGET_REGION_BINDINGS_TABLE } from "../widgets/repo.sqlite.js";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { kernelStampWatermark } from "../../platform/db/watermark-kernel.js";
import { DECLARED_CONTENT_TYPE_OWNERS } from "../content-types/declared-owners.js";
import { buildTrashRegistry, createTableTrashAdapter, type TrashAdapter, type TrashEntry } from "../trash/index.js";

/**
 * @file A once-per-site boot data repair: removes `entries` rows whose envelope namespace does not
 * match their content type's declared owner.
 *
 * Why it exists: on 2026-08-03 the generic entries route created two `widget` entries in production
 * with their payload under `fieldsJson.ext.site`. The widgets reader only reads `ext.widget`, so
 * nothing can ever parse them. Since 2026-10-04 the entries chokepoint reads the namespace off the
 * owning content type (`content-types/declared-owners.ts`), so no new ones can be written; this
 * removes the old ones. Owner decision 2026-10-04: a boot step that ships with the deploy, never a
 * hand edit of the production database.
 *
 * Safety: the predicate ({@link isMismatchedOwnerEnvelope}) is deliberately narrower than "unreadable".
 * Only types with a declared non-`site` owner are scanned, a trashed row is left to the Trash sweeper,
 * and a row is removed only when its `ext` has namespaces and none of them is the owner's. A row with
 * the owner's key present is never touched, even when malformed or carrying a stray namespace too.
 *
 * Marker: a reserved `setting_values_global` row, as `post/search-index.ts`'s projection version
 * (no schema change on any dialect; no setting definition, so no settings surface shows it). It also
 * records what was removed (ids and types only, never payloads), since the rows themselves are gone.
 */

/** The marker row's id. Present means the repair has run on this site; later boots skip it. */
export const UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID = "tovu.internal.boot_repair.unreadable_owner_entries";

/** Recorded in the marker for a type with no Trash registration (today `widget_area`). */
export const UNREADABLE_OWNER_ENTRIES_HARD_DELETE_REASON =
  "boot repair 2026-10-04: an entry whose envelope namespace does not match its content type's declared owner can never be read; this type has no Trash registration, so it was deleted directly";

const LOCK_KEY = "boot_repair_unreadable_owner_entries";

/** How a row was removed: through its registered Trash entry, or (no registration) directly. */
export type OwnerEntryRemovalVia = "trash-purge" | "hard-delete";

/** One removed row, as logged and recorded in the marker. */
export interface RemovedOwnerEntry {
  workspaceId: string;
  id: string;
  type: string;
  via: OwnerEntryRemovalVia;
}

/** The adapter that removes one type's rows (hide, then purge), and which path it is. */
export interface OwnerEntryRemoval {
  adapter: TrashAdapter;
  via: OwnerEntryRemovalVia;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether `fieldsJson`'s envelope has at least one `ext` namespace and none of them is `owner`.
 * A missing or non-object envelope, or an empty `ext`, is not this defect and returns `false`.
 *
 * @complexity O(k) in the number of `ext` keys.
 */
export function isMismatchedOwnerEnvelope(required: { fieldsJson: unknown; owner: string }, _optional: Record<string, never> = {}): boolean {
  const { fieldsJson, owner } = required;
  if (!isPlainObject(fieldsJson) || !isPlainObject(fieldsJson.ext)) return false;
  const namespaces = Object.keys(fieldsJson.ext);
  return namespaces.length > 0 && !namespaces.includes(owner);
}

/**
 * The removal for `type`: its `TRASHABLE` entry when one scopes `entries` to that type (`widget`),
 * else a repair-local entry with the same shape, which deletes the row directly. Both purge the
 * row's own refs and revisions; the local one also drops a region binding to it (a `widget_area`
 * row's `widget_region_bindings`, a derived index).
 *
 * @complexity O(r) in the registry's fixed handful of entries.
 */
export function ownerEntryRemovalFor(required: { kernel: ContentKernel; type: string }, _optional: Record<string, never> = {}): OwnerEntryRemoval {
  const { kernel, type } = required;
  const registered = [...buildTrashRegistry().values()].find(
    (entry) => entry.table === "entries" && entry.scope?.column === "type" && entry.scope.equals === type
  );
  const entry: TrashEntry = registered ?? {
    entityType: `boot-repair:${type}`,
    label: type,
    permission: "",
    table: "entries",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    scope: { column: "type", equals: type },
    marker: { kind: "timestamp", column: "deleted_at" },
    versionColumn: "version",
    display: { title: "entries.title", subtitle: "entries.slug" },
    purgeFirst: [
      { table: "entry_refs", parentIdColumn: "source_entry_id" },
      { table: "entry_revisions", parentIdColumn: "entry_id" },
      { table: WIDGET_REGION_BINDINGS_TABLE, parentIdColumn: "area_entry_id" },
    ],
  };
  return { adapter: createTableTrashAdapter({ entry, db: kernel }), via: registered ? "trash-purge" : "hard-delete" };
}

/** Parses a `fields_json` cell; `undefined` when it is not JSON (left alone, never removed). */
function parseFields(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Runs the repair once per site: under one transaction and lock, skips when the marker exists,
 * otherwise removes every matching row, stamps the write watermark when anything went, and writes
 * the marker. Any failure rolls the whole run back (rows and marker), so the next boot retries it
 * from scratch. Each removal re-checks the version it classified, so a row edited in between fails
 * the run rather than being removed.
 *
 * @param optional.removalFor - Which adapter removes a type (tests inject a failing one).
 * @param optional.log - Where the removal lines go (ids and types only), after commit.
 * @param optional.now - The hide timestamp and the marker's `completedAt`.
 * @returns `ran: false` when the marker was already set.
 * @complexity O(n) in the declared-owner types' live rows, once per site; each removal O(1) statements.
 */
export async function removeUnreadableOwnerEntries(
  required: { kernel: ContentKernel },
  optional: { removalFor?: (type: string) => OwnerEntryRemoval; log?: (line: string) => void; now?: () => string } = {}
): Promise<{ ran: boolean; removed: RemovedOwnerEntry[] }> {
  const { kernel } = required;
  const { removalFor = (type: string) => ownerEntryRemovalFor({ kernel, type }), log = console.log, now = () => new Date().toISOString() } = optional;
  const result = await kernel.transaction(async () => {
    await kernel.lockKey(LOCK_KEY);
    const marker = await kernel.run((db) =>
      db.selectFrom("setting_values_global").select("setting_id").where("setting_id", "=", UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID).executeTakeFirst()
    );
    if (marker !== undefined) return { ran: false, removed: [] };

    const rows = await kernel.run((db) =>
      db
        .selectFrom("entries")
        .select(["id", "workspace_id", "type", "version", "fields_json"])
        .where("type", "in", Object.keys(DECLARED_CONTENT_TYPE_OWNERS))
        .where("deleted_at", "is", null)
        .orderBy("id")
        .execute()
    );
    const at = now();
    const removed: RemovedOwnerEntry[] = [];
    for (const row of rows) {
      if (!isMismatchedOwnerEnvelope({ fieldsJson: parseFields(row.fields_json), owner: DECLARED_CONTENT_TYPE_OWNERS[row.type]! })) continue;
      const { adapter, via } = removalFor(row.type);
      const where = { workspaceId: row.workspace_id, entityId: row.id };
      const hidden = await adapter.hide({ ...where, at, expectedVersion: Number(row.version) });
      if (!hidden.ok) {
        throw new Error(`boot repair: entry ${row.id} (type ${row.type}) changed since it was classified (${hidden.reason}); nothing was removed, the next boot retries`);
      }
      const purged = await adapter.purge({ ...where, expectedVersion: hidden.version });
      if (purged !== "purged") {
        throw new Error(`boot repair: entry ${row.id} (type ${row.type}) was not purged (${purged}); nothing was removed, the next boot retries`);
      }
      removed.push({ workspaceId: row.workspace_id, id: row.id, type: row.type, via });
    }

    if (removed.length > 0) await kernelStampWatermark(kernel)();
    const value = { completedAt: at, removed, hardDeleteReason: UNREADABLE_OWNER_ENTRIES_HARD_DELETE_REASON };
    await kernel.run((db) =>
      db
        .insertInto("setting_values_global")
        .values({
          setting_id: UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID, value_json: JSON.stringify(value), state: "set", def_version: 0, seq: 0,
          updated_by: "system:boot-repair", updated_at: at, origin_plugin_id: null,
        })
        .execute()
    );
    return { ran: true, removed };
  });
  for (const entry of result.removed) {
    log(`[boot-repair] removed unreadable entry ${entry.id} (type ${entry.type}, workspace ${entry.workspaceId}) via ${entry.via}`);
  }
  return result;
}
