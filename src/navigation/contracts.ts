/**
 * @file Command inputs, permission catalog, events, and hook points for the
 * Tovu `navigation` library (ADR-029).
 *
 * All mutation runs through the ADR-008 command gateway (`core/commands`) so
 * menus inherit the single write chokepoint, same-transaction revisions,
 * `pluginId`/actor attribution, and revert — no bespoke write path. These are
 * the typed shapes those commands take; the handler bodies live in
 * `navigation/navigation.ts` (not in this ADR-029 interface-only slice).
 *
 * INTERFACES + DATA CATALOGS ONLY. No feature logic.
 */
import type { UUID } from "../core/ports";
import type {
  NavItemNode,
  NavLocationKey,
  NavMenuEntry,
} from "./types";

// ---------------------------------------------------------------------------
// Permission catalog (ADR-021 §3 — flat dotted strings, code-side registered)
// ---------------------------------------------------------------------------

/**
 * The `navigation.*` permission strings, validated against the ADR-021 code-side
 * catalog and enforced by the gateway `authorize()` call before every mutation.
 * `assign` is split from `update` because changing where a menu appears on the
 * live site is higher-trust than editing an item label (mirrors ADR-027's
 * `media.delete.force` / `media.upload_svg` splits).
 */
export const NAVIGATION_PERMISSIONS = [
  "navigation.read",
  "navigation.create",
  "navigation.update",
  "navigation.delete",
  "navigation.delete.force",
  "navigation.assign",
  "navigation.manage",
] as const;

export type NavigationPermission = (typeof NAVIGATION_PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// Command inputs (shapes the gateway carries; ADR-008 `CommandMutation`)
// ---------------------------------------------------------------------------

export interface CreateMenuInput {
  readonly workspaceId: UUID;
  readonly title: string;
  readonly slug: string;
  /** Optional initial tree; defaults to an empty menu. */
  readonly items?: readonly NavItemNode[];
}

export interface UpdateMenuInput {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly title: string;
  readonly slug: string;
  /**
   * The full replacement tree. Menus are edited whole → whole-menu revisions +
   * clean optimistic-concurrency on the entry `version` (a point in favor of the
   * entry-native model, ADR-029 §Consequences). Item ids must be preserved for
   * items that survive the edit (id-stability validation).
   */
  readonly items: readonly NavItemNode[];
}

export interface AssignLocationInput {
  readonly workspaceId: UUID;
  readonly menuId: UUID;
  readonly locationKey: NavLocationKey;
}

export interface UnassignLocationInput {
  readonly workspaceId: UUID;
  readonly locationKey: NavLocationKey;
}

export interface DeleteMenuInput {
  readonly workspaceId: UUID;
  readonly id: UUID;
  /** Force-purge past the 409 dangling-reference guard (needs `delete.force`). */
  readonly force?: boolean;
}

// ---------------------------------------------------------------------------
// Domain events (ADR-009 §2 — outbox, async, workspace-scoped)
// ---------------------------------------------------------------------------

/** Stable event names emitted on the outbox for async consumers. */
export const NAVIGATION_EVENTS = [
  "navigation.menu.created",
  "navigation.menu.updated",
  "navigation.menu.deleted",
  "navigation.location.assigned",
  "navigation.location.unassigned",
] as const;

export type NavigationEventName = (typeof NAVIGATION_EVENTS)[number];

export interface NavMenuChangedPayload {
  readonly menuId: UUID;
  readonly slug: string;
}

export interface NavLocationChangedPayload {
  readonly locationKey: NavLocationKey;
  /** Menu now bound (assigned) / previously bound (unassigned). */
  readonly menuId: UUID;
}

// ---------------------------------------------------------------------------
// Hook points (ADR-009 §3 — synchronous, ordered, declared-before-attached)
// ---------------------------------------------------------------------------

/**
 * Typed navigation hook points. Filters transform a value in-line (events
 * cannot); the action lets extensions register locations. Declared here so the
 * SDK/type system can enforce "declared points only" (the anti-hook-rot rule,
 * tovu-v2-design §7).
 */
export const NAVIGATION_HOOKS = [
  /** filter: transform a single resolved item (badge/count/dynamic label). */
  "navigation.item.resolve",
  /** filter: transform the whole resolved tree before render (visibility). */
  "navigation.tree.filter",
  /** action: register additional theme/plugin location keys. */
  "navigation.locations.register",
] as const;

export type NavigationHookName = (typeof NAVIGATION_HOOKS)[number];

// ---------------------------------------------------------------------------
// AI tool surface (clients of the SAME gateway handlers — ADR-027 §7 dogfood)
// ---------------------------------------------------------------------------

/**
 * AI tools are thin clients of the same command/read handlers admins use (no
 * back door). Agents are delegated principals (`grant ∩ delegator`, ADR-021 §6);
 * `update`/`assign`/`delete` are HITL through the change-set review layer.
 */
export const NAVIGATION_AI_TOOLS = [
  "navigation.search",
  "navigation.get",
  "navigation.where_used",
  "navigation.update", // HITL
  "navigation.assign", // HITL
] as const;

export type NavigationAiTool = (typeof NAVIGATION_AI_TOOLS)[number];

/** Result shape of `navigation.where_used` — menus referencing a target. */
export interface NavWhereUsedResult {
  readonly targetId: UUID;
  readonly menus: readonly Pick<NavMenuEntry, "id" | "slug" | "title">[];
}
