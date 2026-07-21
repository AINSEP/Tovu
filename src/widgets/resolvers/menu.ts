import type { JsonObject } from "../../core/ports";
import type { NavMenuReadModel } from "../../navigation/ports";
import type { WidgetResolveResult, WidgetResolver } from "../types";

/**
 * @file `menu` (menu-as-widget) resolver (SPEC-043 REQ-09, ADR-047 §1/§9 — "the primary menu as a
 * widget in the footer region costs nothing new").
 *
 * Purpose:
 * Delegates to `navigation`'s own read model — zero menu STORAGE logic duplicated in `widgets/`
 * (`getMenu`, a real `NavMenuReadModel` call, not a reimplementation of `MenuRepoPort`).
 *
 * DISCLOSED LIMITATION: `navigation/ports.ts`'s `NavMenuReadModel` exposes href-resolution
 * (target -> concrete URL, active-state) only through `resolveForLocation`, which is
 * location-scoped, not by-menu-id — there is no direct "resolve this menu id's hrefs" call. The
 * actual href-walking logic (`resolveItemList`/`resolveItem` in `navigation/resolver.ts`) is
 * private (unexported), so reimplementing it here to get real hrefs would violate the same
 * "zero menu-resolution logic duplicated" requirement this resolver exists to honor, and this task
 * is scoped to NOT modify `src/navigation/` (no export widening). Given no test in this TDD slice
 * exercises this resolver's real output shape (`resolver-service.integration.test.ts` only
 * exercises `recent-entries` and an unregistered type), this resolver stops at the honest boundary:
 * it loads the real menu entry via `getMenu` (real delegation) and passes its already-authored item
 * tree through as IR props verbatim, WITHOUT re-resolving `NavTarget`s to concrete hrefs. Wiring
 * true href resolution is flagged in the implementation report as a genuine follow-up needing
 * either a `navigation/resolver.ts` export widening or a location-shaped call this widget type does
 * not have — a decision for whoever owns `src/navigation/` next, not made unilaterally here.
 */
export interface MenuResolverDeps {
  navMenuReadModel: NavMenuReadModel;
}

export function createMenuResolver(deps: MenuResolverDeps): WidgetResolver {
  return {
    async resolveMany(instances, context) {
      const results = new Map<string, WidgetResolveResult>();
      for (const instance of instances) {
        const menuRef = typeof instance.config.menuRef === "string" ? instance.config.menuRef : undefined;
        if (!menuRef) {
          results.set(instance.id, { ok: false, reason: "invalid-config" });
          continue;
        }

        const menu = await deps.navMenuReadModel.getMenu({ workspaceId: context.workspaceId, menuId: menuRef });
        if (!menu) {
          results.set(instance.id, { ok: false, reason: "target-disabled" });
          continue;
        }

        results.set(instance.id, {
          ok: true,
          // Cast: NavItemNode[] is readonly/plain-JSON-shaped data (navigation/types.ts) with no
          // index signature of its own — see this file's header for why hrefs aren't re-resolved.
          ir: { componentId: "menu", props: { title: menu.title, items: menu.doc.items } as unknown as JsonObject },
          dependencyKeys: [menu.id],
        });
      }
      return results;
    },
  };
}
