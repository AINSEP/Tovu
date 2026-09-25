import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import { TRASH_PERMISSION_BY_ENTITY_TYPE } from "./permissions.js";
import type { TrashEntityType } from "./ports.js";
import type { TrashRegistry } from "./registry.js";

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
 *
 * **The catalog is built per call, from the kinds actually reachable, not a fixed enum (2026-09-24,
 * F6).** `TRASHABLE` (`registry.ts`) grew phase-2 kinds — `form`, `widget`, `menu`, `term`,
 * `taxonomy` — that `trash_list_items`/`trash_restore_item` could already resolve permissions and
 * restore outcomes for (`tool-registrations.ts`'s handlers read the kind off the input, not off a
 * hardcoded list), but whose published `entityType`/`entityTypes` schema still enumerated only the
 * four phase-1 kinds. A model reading the schema had no way to learn `entityType: "widget"` was
 * valid; it would only find out by trying it and reading a schema-decorated rejection back.
 * {@link buildTrashAgentToolCatalog} takes the reachable kinds as an argument instead of baking them
 * in, so `tool-registrations.ts` can build the catalog from the live registry on every call — the
 * same "resolved at call time" rule `registry.ts`'s own header states for `TRASHABLE` itself.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** The four phase-1 domains, kept only as {@link getTrashAgentToolCatalog}'s zero-arg fallback so
 *  existing importers (that call it with no registry in hand) keep compiling. Nothing that can
 *  resolve a real {@link TrashRegistry} should read this constant directly — call
 *  {@link trashToolEntityTypes} instead. */
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
        "forms and submissions, widgets, menus, taxonomies and terms, plugins; see the entityType enum for the " +
        "exact list — newest first. Each row reports entityType, entityId, the title as it was when it was " +
        "deleted, who deleted it, when, and the date it will be permanently removed automatically. Rows past " +
        "that date are already excluded. Restore anything listed here with trash_restore_item. Reading this " +
        "never touches the deleted thing itself, so it works even on items whose content is corrupt. Rows the " +
        "caller has no permission to restore are omitted.",
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
        "There is deliberately NO tool for deleting something permanently: that is done by a human, from the Trash screen.",
      sideEffects: "mutates-durable-state",
      // Resolved per entity type at the handler; this declares the floor, and the handler checks the
      // permission that domain's own delete tool checked on the way in.
      authorization: { permission: "content.read" },
      inputSchema: restoreInputSchema(kinds),
    },
  ];
}

/** Zero-arg wrapper over {@link TRASH_TOOL_ENTITY_TYPES}, kept so an importer that has no
 *  {@link TrashRegistry} in hand (a completeness/schema test that only cares about tool names, not
 *  the live kind set) keeps compiling. `tool-registrations.ts` does not call this — it calls
 *  {@link buildTrashAgentToolCatalog} with {@link trashToolEntityTypes}'s output instead.
 *  @complexity O(1). */
export function getTrashAgentToolCatalog(): readonly AgentToolDefinition[] {
  return buildTrashAgentToolCatalog(TRASH_TOOL_ENTITY_TYPES);
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
