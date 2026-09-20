import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";

/**
 * @file The Trash domain's agent-tool catalog (SPEC-016 REQ-22's naming/callability convention).
 * Design of record: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`, step 5.
 *
 * **There is no purge tool here, and there must never be one.** The owner's ruling is that an agent
 * can never hard-delete: permanent removal happens only from the Trash screen's confirm modal, by a
 * human, with the rows selected by hand. This catalog is where that ruling is made structural —
 * `TrashPort.purgeSelected` has no entry, so `buildDomainRegistrations` has nothing to wire, and
 * `__tests__/tool-registrations.purge-ban.test.ts` walks every registered tool in the whole product
 * and fails the build if any handler can reach it. A tool omitted from a catalog cannot be called;
 * a prompt asking a model not to call one can be argued with.
 *
 * **`trash_item` is not in this catalog, on purpose.** Moving something to the Trash is agent-callable
 * once per domain, through the tool that domain owns: `content_post_delete`, `comments_trash_comment`,
 * `media_trash_asset`, `redirects_tombstone`. Each carries its own permission and its own human
 * confirmation dialog, and each writes the Trash index in the same transaction as its marker. This
 * catalog first declined a generic `trash_item(entityType, entityId)` because, built here, it would
 * have been a fifth path to those writes that skipped all four gates. The owner asked for it anyway
 * (2026-09-20), so it lives in `trash-item-tool.ts` as a post-processing pass that routes INTO those
 * four tools' own built handlers, and never writes anything itself. Read that file's header.
 *
 * What this catalog owns is the half no domain owns: reading the Trash, and undoing a delete from it.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** The four phase-1 domains. Published as an enum so a model cannot invent a fifth and get a
 *  `not-found` it would read as "the item is gone" rather than "that type does not exist". */
export const TRASH_TOOL_ENTITY_TYPES = [
  POST_ENTITY_TYPE,
  COMMENT_ENTITY_TYPE,
  MEDIA_ENTITY_TYPE,
  REDIRECT_ENTITY_TYPE,
] as const;

const ENTITY_TYPE_PROPERTY = {
  type: "string",
  enum: [...TRASH_TOOL_ENTITY_TYPES],
  description: "Which kind of thing this is, exactly as trash_list_items reported it.",
} as const;

const LIST_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entityTypes: {
      type: "array",
      items: ENTITY_TYPE_PROPERTY,
      minItems: 1,
      description: "Optional filter. Omit it to see everything the caller is allowed to see.",
    },
    limit: { type: "integer", minimum: 1, maximum: 100, description: "Rows per page. Default 25." },
    cursor: {
      type: "string",
      minLength: 1,
      description: "The nextCursor from a previous call. Omit it for the first page.",
    },
  },
} as const;

const RESTORE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entityType", "entityId"],
  properties: {
    entityType: ENTITY_TYPE_PROPERTY,
    entityId: {
      type: "string",
      minLength: 1,
      description: "The entityId trash_list_items reported — the thing's own id, not the trash row's id.",
    },
  },
} as const;

const TRASH_TOOL_CATALOG: readonly AgentToolDefinition[] = [
  {
    name: "trash_list_items",
    description:
      "Lists what is currently in the Trash: deleted posts and pages, comments, media assets and redirect rules, newest first. " +
      "Each row reports entityType, entityId, the title as it was when it was deleted, who deleted it, when, and the date it " +
      "will be permanently removed automatically. Rows past that date are already excluded. Restore anything listed here with " +
      "trash_restore_item. Reading this never touches the deleted thing itself, so it works even on items whose content is corrupt. " +
      "Rows the caller has no permission to restore are omitted.",
    sideEffects: "none",
    // The entry gate only. Each row is then filtered by the permission that would be needed to
    // restore THAT row's kind, so this never widens what a principal can see — see
    // `RESTORE_PERMISSION_BY_ENTITY_TYPE` in `tool-registrations.ts`.
    authorization: { permission: "content.read" },
    inputSchema: LIST_INPUT_SCHEMA,
  },
  {
    name: "trash_restore_item",
    description:
      "Takes one item back out of the Trash and makes it live again: a post or page reappears in its list and on the site, a " +
      "comment goes back to moderation, a media asset becomes active, a redirect rule starts matching again. Reversible — " +
      "deleting it again puts it back. Returns { restored: true } on success. Returns restored:false with a reason when the " +
      "item is not in the Trash ('not-found'), when it changed since it was deleted ('version-changed' — nothing was touched), " +
      "or when the plugin that owns that kind of thing is no longer installed ('adapter-unavailable'). " +
      "There is deliberately NO tool for deleting something permanently: that is done by a human, from the Trash screen.",
    sideEffects: "mutates-durable-state",
    // Resolved per entity type at the handler; this declares the floor, and the handler checks the
    // permission that domain's own delete tool checked on the way in.
    authorization: { permission: "content.read" },
    inputSchema: RESTORE_INPUT_SCHEMA,
  },
];

/** @complexity O(1) — returns the module-level catalog. */
export function getTrashAgentToolCatalog(): readonly AgentToolDefinition[] {
  return TRASH_TOOL_CATALOG;
}
