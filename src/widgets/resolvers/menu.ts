import type { JsonObject } from "../../core/ports";
import type { NavMenuReadModel } from "../../navigation/ports";
import { resolveMenuDoc } from "../../navigation/resolver";
import type { ResolveTargetHrefFn } from "../../navigation/resolver";
import type { ResolvedNavItem } from "../../navigation/types";
import type { WidgetResolveResult, WidgetResolver } from "../types";

/**
 * @file `menu` (menu-as-widget) resolver (SPEC-043 REQ-09, ADR-047 §1/§9 — "the primary menu as a
 * widget in the footer region costs nothing new").
 *
 * Purpose:
 * Delegates to `navigation`'s own read model — zero menu STORAGE logic duplicated in `widgets/`
 * (`getMenu`, a real `NavMenuReadModel` call, not a reimplementation of `MenuRepoPort`) — and now
 * also zero menu-HREF-RESOLUTION logic duplicated, via `navigation/resolver.ts`'s exported
 * `resolveMenuDoc` (the doc-level building block `resolveForLocation` itself composes on top of).
 * `resolveItemList`/`resolveItem` stay module-private in `navigation/resolver.ts`; `resolveMenuDoc`
 * is the one exported entry point to their behavior, added specifically so this resolver would not
 * need either an export-widening of those internals or a location-shaped call it doesn't have.
 *
 * DISCLOSED REMAINING LIMITATION: real href resolution for non-`url` targets (`entryRef`/`termRef`/
 * `route`) needs `src/routing` (ADR-039), which is being built in parallel and is not running code
 * yet anywhere in this codebase — not even `navigation`'s own production callers have a real
 * `ResolveTargetHrefFn` today (`resolveForLocation` takes it as an injected dependency precisely so
 * a fake can stand in until routing lands, per `navigation/resolver.ts`'s own header). This resolver
 * is in the same honest position as the rest of the system, not a special-cased worse one: `url`-kind
 * targets (already-resolved hrefs, no injected dependency needed) now resolve to real, concrete
 * `href`/`available`/`isActive` data; `entryRef`/`termRef`/`route` targets resolve to
 * `available: false, href: null` via the placeholder `resolveTargetHref` below, exactly the outcome
 * `navigation/resolver.ts`'s own doc describes for "cannot resolve" — swap the placeholder for the
 * real routing-backed implementation in one place (`DEFAULT_RESOLVE_TARGET_HREF` below) once
 * `src/routing` ships; no other change needed here.
 */
export interface MenuResolverDeps {
  navMenuReadModel: NavMenuReadModel;
  /** Overridable for tests / once `src/routing` (ADR-039) lands; defaults to the honest placeholder documented above. */
  resolveTargetHref?: ResolveTargetHrefFn;
}

/** `src/routing` (ADR-039) is not running code yet — every non-`url` target is "cannot resolve" today, system-wide. */
const DEFAULT_RESOLVE_TARGET_HREF: ResolveTargetHrefFn = async () => null;

function toMenuItemProps(items: readonly ResolvedNavItem[]): JsonObject {
  // Cast: ResolvedNavItem is a plain, JSON-serializable read model (navigation/types.ts) with no
  // index signature of its own — the resolved IR contract only requires structural JSON-compatibility.
  return items as unknown as JsonObject;
}

export function createMenuResolver(deps: MenuResolverDeps): WidgetResolver {
  const resolveTargetHref = deps.resolveTargetHref ?? DEFAULT_RESOLVE_TARGET_HREF;

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

        const items = await resolveMenuDoc({
          doc: menu.doc,
          context: { workspaceId: context.workspaceId },
          resolveTargetHref,
        });

        results.set(instance.id, {
          ok: true,
          ir: { componentId: "menu", props: { title: menu.title, items: toMenuItemProps(items) } },
          dependencyKeys: [menu.id],
        });
      }
      return results;
    },
  };
}
