import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import { TRASH_PERMISSION_BY_ENTITY_TYPE } from "./permissions.js";
import type { TrashEntityType } from "@jini-ai/cms/trash";
import type { TrashRegistry } from "./registry.js";

/**
 * @file Which entity kinds the Trash agent tools offer. This is the host's kind policy: the bespoke
 * kinds' own constants and permission map live in this app, so the kind list is read here and handed
 * to the tool catalog as an argument.
 */

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
