/**
 * @file Public surface (barrel) for `navigation` — re-exported from `@jini-ai/cms/navigation`.
 *
 * The domain moved into the package on 2026-08-03 so a second host can use the same menus,
 * location bindings, and resolution rules. What is left in this directory is only what is
 * genuinely this host's:
 *
 * - `repo.sqlite.ts` — the Drizzle adapters. They name `db/schema.ts`, which is this repo's shared
 *   1,246-line schema covering every domain, so they are host persistence, not library code.
 *
 * Everything else here is a re-export, and the shape of what is *not* re-exported is the point:
 * there is no SQLite export on this barrel, so nothing outside the composition root can
 * accidentally depend on this host's persistence choice.
 */
export type {
  NavTargetKind,
  ReservedNavTargetKind,
  NavTarget,
  NavEntryTarget,
  NavTermTarget,
  NavUrlTarget,
  NavRouteTarget,
  NavItemAttrs,
  NavItemNode,
  NavMenuDoc,
  NavMenuEntry,
  MenuStatus,
  NavLocationKey,
  NavLocationBindingRow,
  NavLocationDescriptor,
  ResolvedNavItem,
  ResolvedNav,
} from "@jini-ai/cms/navigation";

export { NAV_MENU_CONTENT_TYPE, NAV_FIELD_NAMESPACE, NAV_DOC_TYPE } from "@jini-ai/cms/navigation";

export type {
  NavLocationBindingRepoPort,
  NavResolveContext,
  NavTargetResolver,
  NavMenuReadModel,
  NavLocationRegistry,
} from "@jini-ai/cms/navigation";

export type {
  NavigationPermission,
  CreateMenuInput,
  UpdateMenuInput,
  AssignLocationInput,
  UnassignLocationInput,
  DeleteMenuInput,
  NavigationEventName,
  NavMenuChangedPayload,
  NavLocationChangedPayload,
  NavigationHookName,
  NavigationAiTool,
  NavWhereUsedResult,
} from "@jini-ai/cms/navigation";

export {
  NAVIGATION_PERMISSIONS,
  NAVIGATION_EVENTS,
  NAVIGATION_HOOKS,
  NAVIGATION_AI_TOOLS,
} from "@jini-ai/cms/navigation";

export { createNavMenuReadModel, type NavMenuReadModelDeps } from "@jini-ai/cms/navigation";

export {
  InMemoryMenuRepo,
  InMemoryNavLocationBindingRepo,
  type MenuRepoPort,
} from "@jini-ai/cms/navigation";

export {
  createMenu,
  updateMenuTree,
  assignLocation,
  deleteMenu,
  validateAndCloneTree,
  MenuNotFoundError,
  MenuValidationError,
  MenuConflictError,
  MenuLocationBoundError,
  DEFAULT_MAX_TREE_DEPTH,
  DEFAULT_MAX_ITEM_COUNT,
  type TreeValidationLimits,
  type CreateMenuDeps,
  type CreateMenuServiceInput,
  type CreateMenuRequired,
  type CreateMenuOptional,
  type UpdateMenuTreeDeps,
  type UpdateMenuTreeServiceInput,
  type UpdateMenuTreeRequired,
  type UpdateMenuTreeOptional,
  type AssignLocationDeps,
  type AssignLocationServiceInput,
  type AssignLocationRequired,
  type AssignLocationOptional,
  type DeleteMenuDeps,
  type DeleteMenuServiceInput,
  type DeleteMenuRequired,
  type DeleteMenuOptional,
} from "@jini-ai/cms/navigation";

export {
  resolveForLocation,
  resolveMenuDoc,
  type ResolveTargetHrefFn,
  type ResolvedTargetHref,
  type ResolveForLocationDeps,
  type ResolveForLocationServiceInput,
  type ResolveForLocationRequired,
  type ResolveForLocationOptional,
} from "@jini-ai/cms/navigation";

export {
  rebuildNavLocationBindings,
  type RebuildNavLocationBindingsDeps,
  type RebuildNavLocationBindingsResult,
} from "@jini-ai/cms/navigation";

/** The agent-tool surface for this domain (see the package's `agent-tools.ts` for what is deliberately omitted). */
export {
  menusAgentToolCatalog,
  type NavigationAgentToolDefinition,
  type NavigationAgentToolSideEffect,
  type NavigationAgentToolActorClassRule,
} from "@jini-ai/cms/navigation";

/**
 * The agent-tool wiring for this domain. Also re-exported (unchanged) by `tool-registrations.ts`
 * as a thin shim, since `assistant/tool-registrations.ts` imports every domain uniformly as
 * `../<domain>/tool-registrations` — see that file's own header for why it stays a separate file
 * rather than being deleted in favor of this barrel export.
 */
export {
  buildMenusRegistrations,
  menusDerivedRisk,
  type MenusToolDeps,
} from "@jini-ai/cms/navigation";
