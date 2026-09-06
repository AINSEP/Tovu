import type { TabBarTab } from "../../components/TabBar";
import type { Translate } from "../../lib/dictionary-translator";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { navigate } from "../../lib/router";

/**
 * @file The `/admin/roles` tab system's non-JSX logic, plus the two tab glyphs.
 *
 * Everything derived lives here rather than in `Roles.tsx`: the tab-id list, its `?tab=` guard, the
 * tab descriptors, and the navigation callback (standing rule — a component's derived logic belongs
 * in a sibling `*.hooks.ts(x)`, not in the `.tsx`). `.tsx` rather than `.ts` because
 * {@link resolveRolesTabs} returns `TabBarTab[]` whose `icon` is a `ReactNode`, the same reason
 * `Sites.hooks.tsx` carries the `x`.
 *
 * ## Why two tabs, and why this screen wants them
 *
 * The screen holds two independent object types, each with its own list, its own create form, and
 * its own row actions: **Roles** (what you assign to a person) and **Policies** (what a role is
 * allowed to do, plus the individual permission strings written onto each one).
 *
 * Tabs were not a foregone conclusion here, so the case against was checked first: roles and
 * policies are conceptually linked, and hiding one behind a tab costs any cross-referencing between
 * them. That cost turned out to be zero — the roles table's columns are Name, Type and More, and it
 * shows no policy information at all, so there is nothing on either screen that the other's
 * presence helps you read. Nothing is lost by separating them.
 *
 * What is gained is real. The Policies section is much the heavier of the two: every row can expand
 * an inline permission editor that lists the policy's current permissions, adds one, and removes
 * one. Stacked below the roles table, that pushed the screen's most-used control — the roles list —
 * into competition with a section that grows unboundedly as policies accumulate, and put an
 * arbitrary amount of scrolling between the two. Two peers side by side in a tab strip is the
 * honest shape of a screen that is doing two things.
 *
 * Both labels ("Roles", "Policies") are the EXISTING section headings' i18n keys, already
 * translated in every locale `roles-i18n.ts` carries — this conversion adds no new copy strings at
 * all. The role/policy -> user grant assignment still lives on `Users.tsx`, unchanged and not
 * duplicated here.
 */

/** Shared attributes for a decorative line icon — the same 24px/1.5-stroke/round-join set
 *  `deployment-visuals.tsx` and `Seo.hooks.tsx` use, so every tab row in this admin reads as one
 *  family. Local rather than imported across a feature boundary (`features/deployment/index.ts` is
 *  that feature's public surface and does not export it, and this app ships no shared icon module —
 *  `App.tsx`'s sidebar glyphs and `SettingsUi.tsx`'s tab icons are inline SVG for the same reason).
 *  `aria-hidden`, because each sits directly beside the text label that already says the same
 *  thing. */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Roles — a person, i.e. the thing a role is assigned TO. */
export function RolesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </svg>
  );
}

/** Policies — a shield over a document, i.e. a written rule about what is permitted. */
export function PoliciesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M12 3l7 2.5v6c0 4-3 7.4-7 8.5-4-1.1-7-4.5-7-8.5v-6z" />
      <path d="M9.5 11.5h5M9.5 14.5h3" />
    </svg>
  );
}

/** The two tab ids, in render order. `roles` is first and is the fallback — it is the list an
 *  operator arrives for, and a policy is only meaningful once a role exists to carry it. */
export const ROLES_TAB_IDS = ["roles", "policies"] as const;
export type RolesTabId = (typeof ROLES_TAB_IDS)[number];

/** Falls back to the Roles list for an absent or unrecognized `?tab=` value, through the same
 *  shared guard `Deployment.tsx`/`Sites.tsx`/`Database.tsx`/`Themes.tsx` use — a stale bookmark or
 *  a typo must open a real tab, never a blank panel. */
export function resolveRolesTabId(tabId: string | null | undefined): RolesTabId {
  return resolveActiveTabId(tabId, ROLES_TAB_IDS, "roles");
}

/**
 * The two tabs in the shape `TabBar` takes.
 *
 * Takes a bound {@link Translate} rather than a raw locale because that is what `useWiredRoles()`
 * already hands this screen (`roles-i18n.ts`'s `t` arrives pre-bound, unlike the SEO screen's
 * two-argument form) — threading a locale here instead would mean this screen carried both
 * conventions at once.
 *
 * Neither tab takes a `count`. `TabBar` supports one, and it was considered: the roles and policies
 * lists both have a length to show. It is left off because the count would be the length of a list
 * that is one click away and fully visible when you get there, so it earns nothing but density —
 * unlike `Sites.tsx`'s own count, which summarizes a grid you may have to scroll.
 *
 * @complexity O(1) — a fixed two-element array.
 */
export function resolveRolesTabs(t: Translate): TabBarTab[] {
  return [
    {
      id: "roles",
      label: t("Roles"),
      icon: <RolesIcon />,
      handle: "roles-tab-roles",
      handleLabel: "Switch to the Roles tab — list, create, rename and delete the roles a person can be assigned",
    },
    {
      id: "policies",
      label: t("Policies"),
      icon: <PoliciesIcon />,
      handle: "roles-tab-policies",
      handleLabel: "Switch to the Policies tab — list and create policies, and add or remove the individual permissions on each one",
    },
  ];
}

/** `replace: true` so moving between the two tabs does not grow the back stack one entry per click
 *  — the same call `Deployment.tsx`/`Sites.tsx`/`Themes.tsx` make for their own `?tab=`. A
 *  module-level function, not an inline arrow, so `TabBar`'s `onChange` takes it directly. */
export function goToRolesTab(tabId: string) {
  navigate(`/roles?tab=${tabId}`, { replace: true });
}
