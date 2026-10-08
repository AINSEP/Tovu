/**
 * @file Tovu's plugin data-module declaration for comments (ADR-023/ADR-031).
 * Comment tables are plugin-owned relational tables under the reserved `p_comments__*`
 * namespace, declared as data that CORE alone executes. Domain types live in Jini.
 */
import { COMMENTS_PLUGIN_ID } from "@jini-ai/cms/comments";
import type { ColumnType, DataModuleDecl } from "../plugins/index.js";

const T = (name: string, notNull = false): { name: string; type: ColumnType; notNull?: boolean } => ({
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
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        T("workspace_id", true),
        T("entry_id", true),
        T("parent_id"),
        T("thread_root_id", true),
        { name: "depth", type: "INTEGER", notNull: true },
        T("status", true),
        T("author_principal_id"),
        T("author_name", true),
        T("author_email"),
        T("author_url"),
        T("author_ip_hash"),
        T("body_text", true),
        { name: "spam_score", type: "REAL" },
        T("spam_provider"),
        T("created_at", true),
        T("updated_at", true),
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
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        T("workspace_id", true),
        T("comment_id", true),
        T("actor_principal_id", true),
        T("action", true),
        T("from_status"),
        T("to_status", true),
        T("at", true),
        T("note"),
      ],
      indexes: [{ name: "by_comment", columns: ["workspace_id", "comment_id"] }],
    },
  ],
} satisfies DataModuleDecl;
