/**
 * @file Real `NavMenuReadModel` implementation (ADR-029 §7).
 *
 * Purpose:
 * `navigation/index.ts`'s file header names the entries-backed read model as an
 * implementation-phase item that hadn't landed as running code. This assembles the existing,
 * already-tested `MenuRepoPort` + `NavLocationBindingRepoPort` + `resolver.ts`'s
 * `resolveForLocation` into the one typed read surface `NavMenuReadModel` promises — no new
 * storage or resolution logic, just the composition root boot pass those pieces were always
 * waiting on (see `widgets/resolvers/menu.ts`'s file header, which names this exact gap for the
 * `menu` widget type).
 *
 * `resolveTargetHref` defaults to the same honest `async () => null` placeholder
 * `widgets/resolvers/menu.ts` already uses on its own — `src/routing` (ADR-039) is not running
 * code yet anywhere in this codebase, so every non-`url` target resolves to "cannot resolve" here
 * too, consistent with the rest of the system rather than a special-cased worse position. Swap the
 * default in this one place once routing ships.
 */
import type { UUID } from "../core/ports";
import type { NavLocationBindingRepoPort, NavMenuReadModel, NavResolveContext } from "./ports";
import type { MenuRepoPort } from "./repo.memory";
import { resolveForLocation, type ResolveTargetHrefFn } from "./resolver";
import type { NavLocationKey, NavMenuEntry } from "./types";

export interface NavMenuReadModelDeps {
  menuRepo: MenuRepoPort;
  bindingRepo: NavLocationBindingRepoPort;
  /** Overridable for tests / once `src/routing` (ADR-039) lands; defaults to the honest placeholder documented above. */
  resolveTargetHref?: ResolveTargetHrefFn;
}

const DEFAULT_RESOLVE_TARGET_HREF: ResolveTargetHrefFn = async () => null;

export function createNavMenuReadModel(deps: NavMenuReadModelDeps): NavMenuReadModel {
  const resolveTargetHref = deps.resolveTargetHref ?? DEFAULT_RESOLVE_TARGET_HREF;

  return {
    async getMenu(required: { workspaceId: UUID; menuId: UUID }): Promise<NavMenuEntry | null> {
      return deps.menuRepo.findById({ workspaceId: required.workspaceId, id: required.menuId });
    },

    async getMenuBySlug(required: { workspaceId: UUID; slug: string }): Promise<NavMenuEntry | null> {
      return deps.menuRepo.findBySlug(required);
    },

    async listMenus(required: { workspaceId: UUID }): Promise<NavMenuEntry[]> {
      return deps.menuRepo.list(required);
    },

    async resolveForLocation(required: { context: NavResolveContext; locationKey: NavLocationKey }) {
      return resolveForLocation({
        deps: { menuRepo: deps.menuRepo, bindingRepo: deps.bindingRepo, resolveTargetHref },
        input: {
          workspaceId: required.context.workspaceId,
          locationKey: required.locationKey,
          currentPath: required.context.currentPath,
        },
      });
    },
  };
}
