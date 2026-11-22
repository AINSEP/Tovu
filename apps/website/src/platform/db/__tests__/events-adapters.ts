import { SqlChangeSetRepo, SqlOutboxAdapter } from "@jini-ai/db/events";

import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "#src/contracts/core/events/index";
import { schemaErasedKernel, type ContentKernel } from "../content-kernel.js";
import { CHANGE_SET_TABLES } from "../sqlite/change-set-repo.sqlite.js";
import { OUTBOX_TABLES } from "../sqlite/outbox-repo.sqlite.js";

/**
 * @file Test-only construction of Jini's outbox and change-set adapters over a kernel of any dialect (the SQLite
 * binding classes take a SQLite store; the dialect-matrix suites also run these on PGlite). Same tables and lease
 * default as the production binding.
 */

/** The outbox adapter over `kernel`, with Tovu's table name and (unless overridden) its claim lease. */
export function outboxOn({ kernel }: { kernel: ContentKernel }, optional: { claimLeaseMs?: number } = {}): SqlOutboxAdapter {
  return new SqlOutboxAdapter({ kernel: schemaErasedKernel({ store: kernel }), tables: OUTBOX_TABLES, claimLeaseMs: optional.claimLeaseMs ?? DEFAULT_OUTBOX_CLAIM_LEASE_MS }, {});
}

/** The change-set repo over `kernel`, with Tovu's table names. */
export function changeSetsOn({ kernel }: { kernel: ContentKernel }, _optional: Record<string, never> = {}): SqlChangeSetRepo {
  return new SqlChangeSetRepo({ kernel: schemaErasedKernel({ store: kernel }), tables: CHANGE_SET_TABLES }, {});
}
