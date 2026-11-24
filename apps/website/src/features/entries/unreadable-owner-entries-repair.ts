import { WIDGET_REGION_BINDINGS_TABLE } from "../../contracts/core/widget-tables.js";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { DECLARED_CONTENT_TYPE_OWNERS } from "@jini-ai/cms/widgets/site/declared-content-type-owners";
import { buildTrashRegistry } from "../trash/registry.js";
import { TRASH_TABLES } from "../trash/index.js";
import { createTableTrashAdapter } from "@jini-ai/cms/trash/sql";
import type { TrashEntry } from "@jini-ai/cms/trash";
import { removeMismatchedOwnerEntries, type OwnerEntryRemoval, type RemovedOwnerEntry } from "@jini-ai/cms/entries/site/unreadable-owner-entries-repair";

/**
 * @file A once-per-site boot data repair: removes `entries` rows whose envelope namespace does not
 * match their content type's declared owner. The predicate and the classify-then-remove loop live
 * in `@jini-ai/cms/entries/site/unreadable-owner-entries-repair`; this host binding supplies the
 * marker setting, the lock, the SQL, the declared-owner map, the Trash adapters and the log lines.
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
 * Marker: a reserved `setting_values_global` row, as `@jini-ai/cms/posts/sql`'s `search-index.ts` projection version
 * (no schema change on any dialect; no setting definition, so no settings surface shows it). It also
 * records what was removed (ids and types only, never payloads), since the rows themselves are gone.
 */

/** The marker row's id. Present means the repair has run on this site; later boots skip it. */
export const UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID = "tovu.internal.boot_repair.unreadable_owner_entries";

/** Recorded in the marker for a type with no Trash registration (today `widget_area`). */
export const UNREADABLE_OWNER_ENTRIES_HARD_DELETE_REASON =
  "boot repair 2026-10-04: an entry whose envelope namespace does not match its content type's declared owner can never be read; this type has no Trash registration, so it was deleted directly";

const LOCK_KEY = "boot_repair_unreadable_owner_entries";

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
  return { adapter: createTableTrashAdapter({ entry, kernel, tables: TRASH_TABLES }), via: registered ? "trash-purge" : "hard-delete" };
}

async function repairMarkerIsSet(required: { kernel: ContentKernel }, _optional = {}): Promise<boolean> {
  const marker = await required.kernel.run((db) =>
    db.selectFrom("setting_values_global").select("setting_id").where("setting_id", "=", UNREADABLE_OWNER_ENTRIES_REPAIR_SETTING_ID).executeTakeFirst()
  );
  return marker !== undefined;
}

function selectDeclaredOwnerRows(required: { kernel: ContentKernel }, _optional = {}) {
  return required.kernel.run((db) =>
    db
      .selectFrom("entries")
      .select(["id", "workspace_id", "type", "version", "fields_json"])
      .where("type", "in", Object.keys(DECLARED_CONTENT_TYPE_OWNERS))
      .where("deleted_at", "is", null)
      .orderBy("id")
      .execute()
  );
}

async function writeRepairMarker(required: { kernel: ContentKernel; at: string; removed: RemovedOwnerEntry[] }, _optional = {}): Promise<void> {
  const { kernel, at, removed } = required;
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
  required: { kernel: ContentKernel; stampWatermark: () => Promise<void> },
  optional: { removalFor?: (type: string) => OwnerEntryRemoval; log?: (line: string) => void; now?: () => string } = {}
): Promise<{ ran: boolean; removed: RemovedOwnerEntry[] }> {
  const { kernel } = required;
  const { removalFor = (type: string) => ownerEntryRemovalFor({ kernel, type }), log = console.log, now = () => new Date().toISOString() } = optional;
  const result = await kernel.transaction(async () => {
    await kernel.lockKey(LOCK_KEY);
    if (await repairMarkerIsSet({ kernel })) return { ran: false, removed: [] };

    const rows = await selectDeclaredOwnerRows({ kernel });
    const at = now();
    const removed = await removeMismatchedOwnerEntries({ rows, owners: DECLARED_CONTENT_TYPE_OWNERS, removalFor, at });

    if (removed.length > 0) await required.stampWatermark();
    await writeRepairMarker({ kernel, at, removed });
    return { ran: true, removed };
  });
  for (const entry of result.removed) {
    log(`[boot-repair] removed unreadable entry ${entry.id} (type ${entry.type}, workspace ${entry.workspaceId}) via ${entry.via}`);
  }
  return result;
}
