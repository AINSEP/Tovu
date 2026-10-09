import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import { TRASH_PERMISSION_BY_ENTITY_TYPE } from "./permissions.js";
import type { TrashEntityType } from "@jini-ai/cms/trash";
import type { TrashRegistry } from "./registry.js";

/**
 * @file The Trash domain's agent-tool catalog (SPEC-016 REQ-22's naming/callability convention).
 * Design of record: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`, step 5.
 *
 * Permanent removal belongs to the permanent-delete contributor and requires a human card.
 * The purge-ban contract test ensures model-supplied confirmation cannot authorize that service.
 *
 * trash_item lives at its own post-processing seam and delegates to each domain's built handler.
 * A generic writer here would skip those domains' permission, confirmation and transactional index
 * gates. Delegation preserves those owners; this catalog itself lists and restores.
 *
 * What this catalog owns is the half no domain owns: reading the Trash, and undoing a delete from it.
 *
 * The catalog is built from reachable kinds per call. A fixed enum would conceal live registry
 * kinds from the model even when list/restore handlers support them. buildTrashAgentToolCatalog
 * receives the same live kinds used by handler permission and restoration resolution.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** The four phase-1 domains, originally kept as a zero-argument fallback for importers without
 *  a registry. The constant remains available to the existing schema tests. Nothing that can
 *  resolve a real {@link TrashRegistry} should read this constant directly — call
 *  {@link trashToolEntityTypes} instead.
 */
export const TRASH_TOOL_ENTITY_TYPES = [
  POST_ENTITY_TYPE,
  COMMENT_ENTITY_TYPE,
  MEDIA_ENTITY_TYPE,
  REDIRECT_ENTITY_TYPE,
] as const;

function entityTypeProperty(kinds: readonly TrashEntityType[]) {
  return {
    type: "string",
    enum: [...kinds],
    description: "Which kind of thing this is, exactly as trash_list_items reported it.",
  } as const;
}

function listInputSchema(kinds: readonly TrashEntityType[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      entityTypes: {
        type: "array",
        items: entityTypeProperty(kinds),
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
}

function restoreInputSchema(kinds: readonly TrashEntityType[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["entityType", "entityId"],
    properties: {
      entityType: entityTypeProperty(kinds),
      entityId: {
        type: "string",
        minLength: 1,
        description: "The entityId trash_list_items reported — the thing's own id, not the trash row's id.",
      },
    },
  } as const;
}

/**
 * Builds the two-tool catalog against `kinds` — every entity type the caller can currently list or
 * restore. Called fresh by `tool-registrations.ts` on each `buildTrashRegistrations`, with
 * {@link trashToolEntityTypes}'s output, so the published enum always matches what the registry
 * actually holds that call.
 *
 * @complexity O(k) in `kinds.length` to build the two schemas.
 */
export function buildTrashAgentToolCatalog(kinds: readonly TrashEntityType[]): readonly AgentToolDefinition[] {
  return [
    {
      name: "trash_list_items",
      description:
        "Lists what is currently in the Trash — anything in the Trash: posts, pages, comments, media, redirects, " +
        "forms and submissions, widgets, menus, taxonomies and terms, plugins, themes; see the entityType enum for the " +
        "exact list — newest first. Each row reports entityType, entityId, the title as it was when it was " +
        "deleted, who deleted it, when, and the date it will be permanently removed automatically. Rows past " +
        "that date are already excluded. Restore anything listed here with trash_restore_item. Reading this " +
        "never touches the deleted thing itself, so it works even on items whose content is corrupt. Rows the " +
        "caller has no permission to restore are omitted. " +
        "Use trash_empty to empty the Trash or trash_purge_item to permanently delete one item; both wait for a human confirmation card. " +
        "Items here are removed automatically on the date shown.",
      sideEffects: "none",
      // The entry gate only. Each row is then filtered by the permission that would be needed to
      // restore THAT row's kind, so this never widens what a principal can see — see
      // `RESTORE_PERMISSION_BY_ENTITY_TYPE` in `tool-registrations.ts`.
      authorization: { permission: "content.read" },
      inputSchema: listInputSchema(kinds),
    },
    {
      name: "trash_restore_item",
      description:
        "Takes one item back out of the Trash and makes it live again — anything in the Trash: posts, pages, " +
        "comments, media, redirects, forms and submissions, widgets, menus, taxonomies and terms, plugins; see " +
        "the entityType enum for the exact list. Reversible — deleting it again puts it back. Returns " +
        "{ restored: true } on success. Returns restored:false with a reason when the item is not in the Trash " +
        "('not-found'), when it changed since it was deleted ('version-changed' — nothing was touched), or when " +
        "the plugin that owns that kind of thing is no longer installed ('adapter-unavailable'). " +
        "For permanent deletion, use trash_purge_item or trash_empty; both require a human confirmation card.",
      sideEffects: "mutates-durable-state",
      // Resolved per entity type at the handler; this declares the floor, and the handler checks the
      // permission that domain's own delete tool checked on the way in.
      authorization: { permission: "content.read" },
      inputSchema: restoreInputSchema(kinds),
    },
  ];
}

/**
 * Every kind the Trash can currently list or restore: the bespoke phase-1 kinds
 * ({@link TRASH_PERMISSION_BY_ENTITY_TYPE}'s own keys — post, comment, media, redirect, plugin,
 * user) plus whatever `registry` (`TRASHABLE`) holds today (form, form_submission, widget, menu,
 * term, taxonomy, and any future phase-2 kind with no edit here). De-duplicated because a kind
 * cannot be registered in both sources, but nothing here assumes that stays true.
 *
 * `registry` is optional — a caller with no {@link TrashRegistry} in hand (a fixture that never set
 * one) still gets the bespoke six rather than a crash.
 *
 * @complexity O(k) in the combined kind count.
 */
export function trashToolEntityTypes(registry?: TrashRegistry): TrashEntityType[] {
  return [...new Set([...TRASH_PERMISSION_BY_ENTITY_TYPE.keys(), ...(registry?.keys() ?? [])])];
}
