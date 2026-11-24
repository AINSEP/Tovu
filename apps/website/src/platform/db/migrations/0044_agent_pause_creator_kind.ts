import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0044: who created a scheduled newsletter send or a scheduled post, and the
 * assistant-switch resume hold.
 *
 * Owner decision (11-23): turning the admin assistant off pauses only what an AGENT created
 * (webhooks, scheduled sends, scheduled publishes, API keys), and turning it back on resumes them
 * only through the approval card, never silently. 0043 recorded the creator on webhooks; this step
 * records it on `newsletter_campaigns` and `posts` (`created_by_kind`, the `CreatorKind`
 * vocabulary from `@jini-ai/core/primitives`: `person` | `agent`) and adds `agent_pause_holds`, one
 * row per workspace while agent-created work is held (set when the switch is seen off, deleted only
 * by an approved resume), so a restart with the switch back on does not resume anything on its own.
 *
 * Additive: existing rows default to `person` (they were made before agents were attributed, and
 * pausing an owner's own work is the failure the decision rules out). A constant default is O(1)
 * on SQLite and Postgres 11+ (no row rewrite). Portable DDL shared with the fresh-database
 * bootstrap. Added as an ADR-066 step: the Drizzle chain is frozen.
 */
export const AGENT_PAUSE_CREATOR_KIND_ID = "0044_agent_pause_creator_kind";

export const AGENT_PAUSE_CREATOR_KIND_STATEMENTS = [
  "ALTER TABLE newsletter_campaigns ADD COLUMN created_by_kind text NOT NULL DEFAULT 'person'",
  "ALTER TABLE posts ADD COLUMN created_by_kind text NOT NULL DEFAULT 'person'",
  "CREATE TABLE agent_pause_holds (workspace_id text PRIMARY KEY NOT NULL, held_since text NOT NULL)",
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of AGENT_PAUSE_CREATOR_KIND_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example agentPauseCreatorKind({ checksum: pinnedChecksum }) */
export function agentPauseCreatorKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: AGENT_PAUSE_CREATOR_KIND_ID, checksum: required.checksum, up };
}
