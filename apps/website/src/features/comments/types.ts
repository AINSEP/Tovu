/**
 * @file Tovu's plugin data-module declaration for comments (ADR-023/ADR-031).
 * Comment tables are plugin-owned relational tables under the reserved `p_comments__*`
 * namespace, declared as data that CORE alone executes. Domain types live in Jini.
 */
import { COMMENTS_PLUGIN_ID } from "@jini-ai/cms/comments";
import type { ColumnType, DataModuleDecl } from "@jini-ai/db/data-modules";

const T = ({ name }: { name: string }, { notNull = false }: { notNull?: boolean } = {}): { name: string; type: ColumnType; notNull?: boolean } => ({
  name,
  type: "TEXT",
  notNull,
});

export const COMMENTS_DATA_MODULE = {
  pluginId: COMMENTS_PLUGIN_ID,
  pluginTier: "tier-2",
  provenance: { sourceUrl: "builtin://comments", publisher: "tovu-core" },
  tables: [
    {
      name: "comments",
      // Visitor content and moderation history contain personal data.
      portability: { kind: "private" },
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        T({ name: "workspace_id" }, { notNull: true }),
        T({ name: "entry_id" }, { notNull: true }),
        T({ name: "parent_id" }),
        T({ name: "thread_root_id" }, { notNull: true }),
        { name: "depth", type: "INTEGER", notNull: true },
        T({ name: "status" }, { notNull: true }),
        T({ name: "author_principal_id" }),
        T({ name: "author_name" }, { notNull: true }),
        T({ name: "author_email" }),
        T({ name: "author_url" }),
        T({ name: "author_ip_hash" }),
        T({ name: "body_text" }, { notNull: true }),
        { name: "spam_score", type: "REAL" },
        T({ name: "spam_provider" }),
        T({ name: "created_at" }, { notNull: true }),
        T({ name: "updated_at" }, { notNull: true }),
        { name: "version", type: "INTEGER", notNull: true },
      ],
      // ADR-031 OQ-1 (resolved, SPEC-033): the moderation queue's own query pattern.
      indexes: [
        { name: "moderation_queue", columns: ["workspace_id", "status", "created_at"] },
        { name: "thread", columns: ["workspace_id", "entry_id", "thread_root_id"] },
      ],
    },
    {
      name: "moderation_log",
      // Visitor content and moderation history contain personal data.
      portability: { kind: "private" },
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        T({ name: "workspace_id" }, { notNull: true }),
        T({ name: "comment_id" }, { notNull: true }),
        T({ name: "actor_principal_id" }, { notNull: true }),
        T({ name: "action" }, { notNull: true }),
        T({ name: "from_status" }),
        T({ name: "to_status" }, { notNull: true }),
        T({ name: "at" }, { notNull: true }),
        T({ name: "note" }),
      ],
      indexes: [{ name: "by_comment", columns: ["workspace_id", "comment_id"] }],
    },
  ],
} satisfies DataModuleDecl;
