import type { Express } from "express";

import type { MenuRepoPort } from "#src/navigation/index";
import type {
  NavItemNode,
  NavLocationBindingRepoPort,
  NavLocationBindingRow,
  NavMenuEntry,
} from "#src/navigation/index";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Response DTOs + route-dependency shape for the admin `menus` HTTP
 * surface (ADR-029).
 *
 * Purpose:
 * Serializes `navigation` library read models (`NavMenuEntry`,
 * `NavLocationBindingRow`) into stable admin JSON envelopes, mirroring
 * `server/http/admin/posts.ts`'s `toAdminPostResponse` pattern.
 *
 * Also declares `MenuRouteDeps` / `MenuRouteRegistrar` — the superset of the
 * shared `RouteDeps` (`server/routes/types.ts`) these routes need
 * (`menuRepo` + `navLocationBindingRepo`). Declared here rather than in
 * `routes/types.ts` because that file is a shared collision point 4 parallel
 * agents are editing today for their own sections; folding these two fields
 * into `RouteDeps` and wiring `createRouteDeps()`/`createApp()`
 * (`server/app.ts`) is the integration step this build hands to the
 * coordinator (see the wiring handoff report).
 *
 * Architectural role:
 * HTTP-facing serialization + wiring-seam declarations only — no navigation
 * business logic lives here (that stays in `navigation/menu-service.ts`).
 */

/**
 * Deps these routes need beyond the shared `RouteDeps`: `menuRepo` (the
 * local, navigation-owned `MenuRepoPort` — see `navigation/repo.memory.ts`'s
 * file header for why it is not a frozen ADR port) and
 * `navLocationBindingRepo` (the one real ADR-029 port,
 * `NavLocationBindingRepoPort`).
 */
export interface MenuRouteDeps extends RouteDeps {
  menuRepo: MenuRepoPort;
  navLocationBindingRepo: NavLocationBindingRepoPort;
}

/** Registrar signature for the menus route modules (mirrors `RouteRegistrar`). */
export type MenuRouteRegistrar = (app: Express, deps: MenuRouteDeps) => void;

/** Wire-format link target — structurally identical to `navigation`'s `NavTarget`. */
export type AdminMenuTargetDto = NavItemNode["target"];

export interface AdminMenuItemDto {
  id: string;
  label?: string;
  target: AdminMenuTargetDto;
  attrs?: NavItemNode["attrs"];
  children?: AdminMenuItemDto[];
}

export interface AdminMenuDto {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  status: string;
  items: AdminMenuItemDto[];
  locations: string[];
  updatedAt: string;
  version: number;
}

export interface AdminMenuEnvelope {
  menu: AdminMenuDto;
}

export interface AdminMenuListEnvelope {
  menus: AdminMenuDto[];
}

export interface AdminMenuBindingDto {
  workspaceId: string;
  locationKey: string;
  menuId: string;
  boundAt: string;
}

export interface AdminAssignLocationEnvelope {
  menu: AdminMenuDto;
  binding: AdminMenuBindingDto;
  displacedMenu: AdminMenuDto | null;
}

export interface AdminDeleteMenuEnvelope {
  menu: AdminMenuDto | null;
  purged: boolean;
}

function toAdminMenuItemDto(node: NavItemNode): AdminMenuItemDto {
  return {
    id: node.id,
    label: node.label,
    target: node.target,
    attrs: node.attrs,
    children: node.children ? node.children.map(toAdminMenuItemDto) : undefined,
  };
}

export function toAdminMenuDto(menu: NavMenuEntry): AdminMenuDto {
  return {
    id: menu.id,
    workspaceId: menu.workspaceId,
    slug: menu.slug,
    title: menu.title,
    status: menu.status,
    items: menu.doc.items.map(toAdminMenuItemDto),
    locations: [...menu.locations],
    updatedAt: menu.updatedAt,
    version: menu.version,
  };
}

export function toAdminMenuResponse(menu: NavMenuEntry): AdminMenuEnvelope {
  return { menu: toAdminMenuDto(menu) };
}

export function toAdminMenuListResponse(menus: NavMenuEntry[]): AdminMenuListEnvelope {
  return { menus: menus.map(toAdminMenuDto) };
}

export function toAdminMenuBindingDto(binding: NavLocationBindingRow): AdminMenuBindingDto {
  return {
    workspaceId: binding.workspaceId,
    locationKey: binding.locationKey,
    menuId: binding.menuId,
    boundAt: binding.boundAt,
  };
}

export function toAdminAssignLocationResponse(required: {
  menu: NavMenuEntry;
  binding: NavLocationBindingRow;
  displacedMenu: NavMenuEntry | null;
}): AdminAssignLocationEnvelope {
  return {
    menu: toAdminMenuDto(required.menu),
    binding: toAdminMenuBindingDto(required.binding),
    displacedMenu: required.displacedMenu ? toAdminMenuDto(required.displacedMenu) : null,
  };
}

export function toAdminDeleteMenuResponse(required: {
  menu: NavMenuEntry | null;
  purged: boolean;
}): AdminDeleteMenuEnvelope {
  return { menu: required.menu ? toAdminMenuDto(required.menu) : null, purged: required.purged };
}
