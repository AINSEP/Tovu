import type { Express, Response } from "express";

import { isMenuHtmlAuthoring, MENU_RAW_HTML_PERMISSION, type MenuHtmlAuthoring, type MenuRepoPort, type NavMenuMode } from "#src/features/navigation/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import type {
  NavItemNode,
  NavLocationBindingRepoPort,
  NavLocationBindingRow,
  NavMenuEntry,
} from "#src/features/navigation/index";
import type { RouteDeps } from "#src/server/routes/types";

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
  /** HTML mode (2026-10-08): absent on a menu that never used it. */
  mode?: NavMenuMode;
  html?: string;
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

export interface AdminTrashMenuEnvelope {
  trashed: true;
  id: string;
  version: number | null;
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
    ...(menu.doc.mode !== undefined ? { mode: menu.doc.mode } : {}),
    ...(menu.doc.html !== undefined ? { html: menu.doc.html } : {}),
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

export function toAdminTrashMenuResponse(required: { id: string; version: number | null }): AdminTrashMenuEnvelope {
  return { trashed: true, id: required.id, version: required.version };
}

/** A create/update body's HTML-mode fields as sent; `createMenu`/`updateMenuTree` validate the values. */
export function parseMenuHtmlAuthoring(body: Record<string, unknown>): MenuHtmlAuthoring {
  return {
    ...(body.mode !== undefined ? { mode: body.mode as NavMenuMode } : {}),
    ...(body.html !== undefined ? { html: body.html as string } : {}),
  };
}

/**
 * Menu HTML is trusted raw markup, so a write carrying it also needs {@link MENU_RAW_HTML_PERMISSION}
 * (the HTML-mode forms boundary). Switching back to items authors nothing and passes. Writes the 403
 * and returns `false` on a denial, like `authorizeOrRespond`.
 */
export async function authorizeMenuHtmlOrRespond(
  res: Response,
  deps: Pick<MenuRouteDeps, "authorize" | "workspaceId">,
  { principalId, authoring, menuId }: { principalId: string; authoring: MenuHtmlAuthoring; menuId?: string },
): Promise<boolean> {
  if (!isMenuHtmlAuthoring(authoring)) return true;
  return authorizeOrRespond(res, deps.authorize, {
    principalId, permission: MENU_RAW_HTML_PERMISSION, workspaceId: deps.workspaceId, entityType: "menu", ...(menuId ? { entityId: menuId } : {}),
  });
}
