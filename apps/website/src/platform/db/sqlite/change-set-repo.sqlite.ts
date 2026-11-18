import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import { SqlChangeSetRepo } from "@jini-ai/db/events";
import type { ContentDb } from "./content-db.js";

/** Tovu owns the persisted names; the change-set repo's header, items and co-persisted outbox row use the same wiring. */
export const CHANGE_SET_TABLES = { changeSets: "change_sets", changeSetItems: "change_set_items", outboxEvents: "outbox_events" } as const;

/**
 * @file The change-set repo on a site's SQLite `content.db`: {@link SqlChangeSetRepo} (the one
 * Kysely query body, in Jini `@jini-ai/db/events`), kept as a named class so the composition root
 * that builds it from the content db handle stays as it is.
 */
export class SqliteChangeSetRepo extends SqlChangeSetRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: CHANGE_SET_TABLES }, {});
  }
}
