import type { AdminNavGroup } from "@jini-ai/admin/core";
import { hasPermission } from "@jini-ai/ui/panel-kit";

/**
 * @file Which admin sections the signed-in operator can use — the sidebar filter and the direct-URL
 * gate, both answered from each panel's own `anyOfPermissions` declaration in `panels.tsx`.
 *
 * NOT A SECURITY BOUNDARY (same contract as `lib/permissions.ts`): this only decides whether a nav
 * row shows and whether a screen mounts. Every route still re-checks server-side in
 * `identity/authorize.ts`. The point is UX: an editor used to see Users and Roles & Permissions and
 * land on a screen whose first read the server answered 403.
 *
 * Why a Tovu field and not `@jini-ai/admin/core`'s own `AdminPanel.permissions`: that field (and its
 * `resolvePanels` filter) requires ALL listed permissions, and the Users screen's landing read
 * (`routes/users/list.ts`) admits EITHER `user.manage` or `member.manage` — the built-in admin role
 * holds only the second. All-of semantics would hide Users from every admin. Any-of support belongs
 * in Jini eventually; until then this module is the one place that reads the field.
 */

/** The per-panel declaration `panels.tsx` carries. */
export interface PanelAccessDeclaration {
  /**
   * Permission ids, exactly as the panel's landing server route checks them. The panel is usable
   * when the operator holds ANY one of them. Omit for a panel with no permission-gated landing read.
   */
  readonly anyOfPermissions?: readonly string[];
}

/** A panel as this module needs to see it: its id plus its declaration. */
export interface PanelAccessEntry extends PanelAccessDeclaration {
  readonly id: string;
}

/**
 * True when the operator may use `panel`.
 *
 * `permissions: undefined` means the session has not said yet (fresh sign-in before `/auth/me`
 * answers, or a response without the field) — every panel shows then, which is the pre-filter
 * behavior, rather than flashing an empty nav or a no-access screen at someone who has access.
 *
 * @complexity O(d * m) — d declared ids (one or two), m operator permissions.
 */
export function isPanelAccessible(input: {
  readonly panel: PanelAccessDeclaration;
  readonly permissions: readonly string[] | undefined;
}): boolean {
  const { panel, permissions } = input;
  const required = panel.anyOfPermissions ?? [];
  if (permissions === undefined || required.length === 0) return true;
  return required.some((permission) => hasPermission({ permissions: permissions, permission: permission }));
}

/**
 * The sidebar nav with every row the operator cannot use removed.
 *
 * Drops a group once all its rows are hidden, so no heading sits over nothing. The ungrouped top
 * row (`App.tsx` splits on `slice(0, 1)`) always survives: Overview declares no permission. A row
 * whose id names no registered panel is kept — there is nothing to check it against.
 *
 * Returns `groups` itself (same reference) while permissions are unknown.
 *
 * @complexity O(n * d * m) over n nav items; the panel lookup is a Map built once per call.
 */
export function withoutInaccessiblePanels(input: {
  readonly groups: readonly AdminNavGroup[];
  readonly panels: readonly PanelAccessEntry[];
  readonly permissions: readonly string[] | undefined;
}): readonly AdminNavGroup[] {
  const { groups, panels, permissions } = input;
  if (permissions === undefined) return groups;
  const panelsById = new Map(panels.map((panel) => [panel.id, panel] as const));
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isPanelAccessible({ panel: panelsById.get(item.id) ?? {}, permissions })),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Whether the routed panel may render, or the screen should say "no access" instead.
 *
 * `panelId: null` is the dashboard fallback (`App.tsx`'s `renderRoute`), which declares nothing.
 *
 * @complexity O(p + d * m) — a linear panel lookup, then {@link isPanelAccessible}.
 */
export function resolvePanelAccessGate(input: {
  readonly panelId: string | null;
  readonly panels: readonly PanelAccessEntry[];
  readonly permissions: readonly string[] | undefined;
}): "allowed" | "denied" {
  const panel = input.panels.find((candidate) => candidate.id === input.panelId) ?? {};
  return isPanelAccessible({ panel, permissions: input.permissions }) ? "allowed" : "denied";
}
