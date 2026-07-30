/**
 * @file Public surface of the Tovu `navigation` library (ADR-029).
 *
 * ADR-029 ships the design-frozen TYPES + PORT interfaces only. The command
 * handlers, the entries-backed read model, the resolver, and the in-memory /
 * SQLite `NavLocationBindingRepo` adapters land in the implementation phases
 * (design report §Implementation Proposal). Re-exports are type-only here.
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
} from "./types";

export { NAV_MENU_CONTENT_TYPE, NAV_FIELD_NAMESPACE, NAV_DOC_TYPE } from "./types";

export type {
  NavLocationBindingRepoPort,
  NavResolveContext,
  NavTargetResolver,
  NavMenuReadModel,
  NavLocationRegistry,
} from "./ports";

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
} from "./contracts";

export {
  NAVIGATION_PERMISSIONS,
  NAVIGATION_EVENTS,
  NAVIGATION_HOOKS,
  NAVIGATION_AI_TOOLS,
} from "./contracts";

export { createNavMenuReadModel, type NavMenuReadModelDeps } from "./read-model";
