/**
 * @file The admin-feature module mounts of `createApp` (all inside the `/api/admin` session gate `createCoreModule` mounts earlier):
 * comments moderation through database recovery. Registration order is behaviour. Moved verbatim out of `app.ts`.
 */

import { THEME_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/theme";
import { createThemeTrashMover } from "#src/features/theme/trash-theme-tool";
import { createAgentPluginsModule } from "../modules/agent-plugins.js";
import { createPluginsModule } from "../modules/plugins.js";
import { createSkillsModule } from "../modules/skills.js";
import { createCommentsModerationModule } from "../modules/comments-moderation.js";
import { createMenusModule } from "../modules/menus.js";
import { createWidgetsModule } from "../modules/widgets.js";
import { createSettingsModule } from "../modules/settings.js";
import { createUsersModule } from "../modules/users.js";
import { createApiKeysModule } from "../modules/api-keys.js";
import { createWorkspaceModule } from "../modules/workspace.js";
import { createIntegrationsAdminModule } from "../modules/integrations-admin.js";
import { createExternalMcpModule } from "../modules/external-mcp.js";
import { createMediaModule } from "../modules/media.js";
import { createTrashModule } from "../modules/trash.js";
import { withUserTrashAdminOverride } from "../trash-user-admin-override.js";
import { identityServiceDepsFrom } from "../../../inbound/admin-http/routes/users/deps.js";
import { createFormsAdminModule } from "../modules/forms-admin.js";
import { createRedirectsModule } from "../modules/redirects.js";
import { createDatabaseRecoveryModule } from "../modules/database-recovery.js";
import { mountRoutes } from "./module-handles.js";
import type { MountInput } from "./module-handles.js";

/** Comment moderation, menus, widgets, plugins, skills, webhooks admin, media, trash, external MCP, identity, settings, forms admin, redirects and database recovery modules, in registration order. */
export function mountAdminFeatures({ app, routeDeps }: MountInput, _optional = {}): void {
  // ADR-046 Phase 3 (SPEC-040): the `comments-moderation` server module — 4 admin
  // moderation-queue/moderate/settings routes. Distinct from `createCommentsModule` above
  // (the ADR-031 backend composition) and from `registerCommentsSubmitRoute` below (the public,
  // unauthenticated submission route, which stays inline near the site catch-all).
  mountRoutes({ app, mod: createCommentsModerationModule(routeDeps) });
  // ADR-046 Phase 3 (SPEC-040): the `menus` server module — 6 admin CRUD/location-assignment
  // routes (ADR-029). `MenuRouteDeps` reused as-is from its existing location in
  // `apps/website/src/server/inbound/admin-http/http/menus.ts` (see `modules/menus.ts`'s file header for why it lives there).
  mountRoutes({ app, mod: createMenusModule(routeDeps) });
  // SPEC-043 (widgets, ADR-047) — 13 admin routes (instance CRUD, region binding/placement,
  // server-side embed mutation) + the widgets.place/create/remove/diagnose AI tool surface.
  // `RouteDeps` already carries every dependency this module needs (`widgetBindingRepo`/
  // `entryRefsRepo`, added by this same dispatch) — no widened deps type, unlike menus.
  mountRoutes({ app, mod: createWidgetsModule(routeDeps) });
  // SPEC-005 (ADR-005-ARCH) — the `plugins` server module: PLUGINS_LIST/PLUGIN_SET_ENABLED (REQ-10).
  mountRoutes({ app, mod: createPluginsModule(routeDeps) });
  // 2026-09-09 — the `agent-plugins` server module: AGENT_PLUGINS_LIST, the admin Agent Plugins
  // screen's read of real installed Agent Plugins (a SEPARATE family from the `plugins` module
  // above — see `modules/agent-plugins.ts`'s own header).
  mountRoutes({ app, mod: createAgentPluginsModule(routeDeps) });
  // skills-composer-typeahead (implementation-outline.md, C-001/C-003) — the `skills` server
  // module: GET .../skills, the browser-reachable enumeration of installed standalone Agent Skills.
  mountRoutes({ app, mod: createSkillsModule(routeDeps) });
  // ADR-046 Phase 3 (SPEC-034): the `integrations-admin` server module — 5 admin CRUD/read routes
  // over webhook subscriptions/deliveries (ADR-036). Distinct from `createIntegrationsModule`
  // below, which owns the Forms-to-webhook fan-out subscriber, not an HTTP surface.
  mountRoutes({ app, mod: createIntegrationsAdminModule(routeDeps) });
  // ADR-046 Phase 3 (SPEC-034): the `media` server module — 5 admin routes + the public rendition
  // route (previously registered much later, see below near the old catch-all-precedence group;
  // moved up here since its only real constraint, "before `/:slug`", still holds — see
  // `modules/media.ts`'s file header for the full disclosure).
  mountRoutes({ app, mod: createMediaModule(routeDeps) });
  // The local admin Trash screen's 3 routes (design:
  // `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`). Registered next to `media`
  // because Media is one of the four kinds it lists, but it is a platform surface, not a media one:
  // it spans Posts, Comments, Media and Redirects. No ordering constraint — every path is under
  // `/api/admin/v1/workspaces/:workspaceId/trash` and none is a catch-all.
  //
  // `authorize` is overridden (ONLY for this module's own deps, never `routeDeps.authorize` itself,
  // which every other route reads unchanged) so restore/purge of a trashed USER also honor the
  // built-in `admin` role, not just the owner `TRASH_PERMISSION_BY_ENTITY_TYPE.get("user") === "*"`
  // alone (OWNER DECISION 2026-09-24, delete-user plan v2 Slice 3's "Open gap") — see
  // `trash-user-admin-override.ts`'s file header for why the override lives here and not in
  // `permissions.ts`/`mayActOnEntityType`, which are shared by every other trashable kind.
  mountRoutes(
    { app,
    mod: createTrashModule({
      ...routeDeps,
      authorize: withUserTrashAdminOverride({
        base: routeDeps.authorize,
        identity: identityServiceDepsFrom(routeDeps),
        workspaceId: routeDeps.workspaceId,
        seededOwnerPrincipalId: routeDeps.ownerPrincipalId,
      }),
      // A theme is a folder, not a `TRASHABLE` row: `POST /trash/items` reaches it through the same
      // `trashTheme` `theme_trash` runs (active-theme refusal included).
      movers: new Map([...(routeDeps.trashMovers ?? []), [THEME_ENTITY_TYPE, createThemeTrashMover(routeDeps)]]),
    }) }
  );
  mountRoutes({ app, mod: createExternalMcpModule(routeDeps) });
  // ADR-046 Phase 3 (SPEC-040): the `users` server module — 8 admin CRUD/list routes over
  // users/roles/policies (ADR-021/SPEC-006 identity RBAC).
  mountRoutes({ app, mod: createUsersModule(routeDeps) });
  // SPEC-006 REQ-08: the `api-keys` server module — the 3 api-key admin routes. Registered next to
  // `users` because both are the ADR-021/SPEC-006 identity surface, but kept a separate module —
  // see `modules/api-keys.ts` for why. Must sit after `createCoreModule` above, which mounts the
  // `/api/admin` session gate these three routes rely on for both auth and credential-kind.
  mountRoutes({ app, mod: createApiKeysModule(routeDeps) });
  // SPEC-044: the `workspace` server module — 5 admin routes (list/create/get/update/delete), the
  // real successor to the original unauthenticated inline `POST /workspaces` route this file used
  // to own directly (see the file header note).
  mountRoutes({ app, mod: createWorkspaceModule(routeDeps) });
  // ADR-046 Phase 3 (SPEC-040): the `settings` server module — 5 admin settings HTTP routes
  // (SPEC-007 Phase 5, T043).
  mountRoutes({ app, mod: createSettingsModule(routeDeps) });

  // ADR-046 Phase 3 (SPEC-041): the `forms-admin` server module — 7 admin routes (definitions
  // CRUD + submissions list/get/delete), gated per api.spec.md §2's `admin.forms.*` profiles.
  // Distinct from `createFormsModule` below, which owns the Forms-to-notify-subscriber
  // subscription, not an HTTP surface.
  mountRoutes({ app, mod: createFormsAdminModule(routeDeps) });

  // ADR-046 Phase 3 (SPEC-041): the `redirects` server module — 7 admin routes (list/get/create/
  // update/tombstone/import/hits), each gated by `admin.redirects.manage` (api.spec.md §1/§2).
  mountRoutes({ app, mod: createRedirectsModule(routeDeps) });

  // ADR-046 Phase 3 (SPEC-042, final slice): the `database-recovery` server module — all 7
  // Database/Recovery plain registrations (Timeline + restore-points list/create, Recovery's own
  // restore-points list, disclosure, deep-link, status). Consolidates what used to be two
  // non-contiguous inline blocks (this one, plus a second block after `createTaxonomyModule`
  // below) into one call site — see `modules/database-recovery.ts`'s file header for the full
  // disclosure of why that consolidation is safe (no path overlap with content-types/entries/
  // taxonomy). `registerAdminDatabaseMigrateForwardRoutes`/`registerAdminRecoveryRestoreRoutes`
  // (the 2 gated-mutation ceremonies) stay inline below, unchanged non-goal since SPEC-031.
  mountRoutes({ app, mod: createDatabaseRecoveryModule(routeDeps) });
}
