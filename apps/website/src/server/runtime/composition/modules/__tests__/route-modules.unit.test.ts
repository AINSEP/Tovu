import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createApp } from "../../app.js";
import { createAgentPluginsModule } from "../agent-plugins.js";
import { createAnalyticsModule } from "../analytics.js";
import { createApiKeysModule } from "../api-keys.js";
import { createCommentsModerationModule } from "../comments-moderation.js";
import { createDatabaseRecoveryModule } from "../database-recovery.js";
import { createFormsAdminModule } from "../forms-admin.js";
import { createIntegrationsAdminModule } from "../integrations-admin.js";
import { createMembersModule } from "../members.js";
import { createMenusModule } from "../menus.js";
import { createPluginsModule } from "../plugins.js";
import { createRedirectsModule } from "../redirects.js";
import { createSettingsModule } from "../settings.js";
import { createSkillsModule } from "../skills.js";
import { createTaxonomyModule } from "../taxonomy.js";
import { createUsersModule } from "../users.js";
import { createWorkspaceModule } from "../workspace.js";
import type { ServerModuleHandle } from "../types.js";

/**
 * @file Route inventory for the route-only server modules.
 *
 * Each of these modules is a list of registrar calls and nothing else, so the realistic regression
 * is a dropped or duplicated registrar line: the admin screen that calls that URL then gets the
 * site's `/:slug` catch-all (a 404 page) instead of its API. Before this file, no test asserted any
 * module's full route set — several of the routes (the agent-plugins, forms-admin and skills
 * families) were reached by no `createApp()` HTTP test at all, so deleting one of those lines
 * shipped green.
 *
 * The expected lists are the URLs the admin frontend calls (method + Express path), written out by
 * hand rather than derived from the registrars, so a registrar that silently changes its path fails
 * here too. Order is asserted because Express matches in registration order.
 *
 * Registration needs no working dependencies (every registrar only closes over `deps`), so each
 * module is registered against an empty deps object on a bare Express app. A second test checks the
 * same routes are present on the real `createApp()` router, i.e. that `app.ts` mounts every module.
 */

const W = "/api/admin/v1/workspaces/:workspaceId";

type ModuleCase = {
  readonly name: string;
  readonly create: () => ServerModuleHandle;
  readonly routes: readonly string[];
};

// Registration never reads deps, so an empty object is the honest stand-in.
const noDeps = {} as never;

const CASES: readonly ModuleCase[] = [
  {
    name: "agent-plugins",
    // With API connections composed (both real roots do), so their public callback is listed too;
    // registration still reads nothing from the host.
    create: () => createAgentPluginsModule({ apiConnections: { host: {} } } as never),
    routes: [
      `GET ${W}/agent-plugins`,
      `PATCH ${W}/agent-plugins/:pluginId`,
      `GET ${W}/agent-plugins/:pluginId/files`,
      `POST ${W}/agent-plugins/install/zip`,
      `POST ${W}/agent-plugins/:pluginId/update/zip`,
      `GET ${W}/agent-plugins/:pluginId/memory`,
      `PUT ${W}/agent-plugins/:pluginId/memory`,
      // Plugin-owned admin surfaces: the three session-gated admin routes, then the PUBLIC files
      // route (a sandboxed frame's module fetches carry no cookie, so it sits outside /api/admin).
      `GET ${W}/agent-plugins/:pluginId/surfaces`,
      `POST ${W}/agent-plugins/:pluginId/surfaces/:surfaceId/bootstrap`,
      `POST ${W}/agent-plugins/:pluginId/surfaces/:surfaceId/actions`,
      "GET /api/agent-plugin-surfaces/v1/:pluginId/:surfaceId/*",
      "GET /api/agent-plugin-exports/v1/:pluginId/:component/*",
      // Session-gated: a hosted sign-in link binds the starting browser, then redirects to the provider.
      `GET ${W}/agent-plugins/connections/sign-in/:handoffId`,
      // PUBLIC: plugin-declared API connections' hosted OAuth callback (session-less by necessity).
      "GET /api/agent-plugins/connections/oauth/callback",
    ],
  },
  { name: "analytics", create: () => createAnalyticsModule(noDeps), routes: [`GET ${W}/analytics/recent-hits`] },
  {
    name: "api-keys",
    create: () => createApiKeysModule(noDeps),
    routes: ["POST /api/admin/v1/api-keys/principals", "POST /api/admin/v1/api-keys", "POST /api/admin/v1/api-keys/:id/revoke"],
  },
  {
    name: "comments-moderation",
    create: () => createCommentsModerationModule(noDeps),
    routes: [
      `GET ${W}/comments/queue`,
      `POST ${W}/comments/:commentId/approve`,
      `POST ${W}/comments/:commentId/spam`,
      `POST ${W}/comments/:commentId/trash`,
      `POST ${W}/comments/:commentId/restore`,
      `POST ${W}/comments/:commentId/purge`,
      `GET ${W}/comments/settings`,
      `PUT ${W}/comments/settings`,
    ],
  },
  {
    name: "database-recovery",
    create: () => createDatabaseRecoveryModule(noDeps),
    routes: [
      "GET /api/admin/v1/database/timeline",
      "GET /api/admin/v1/database/schema-state",
      "GET /api/admin/v1/database/restore-points",
      "POST /api/admin/v1/database/restore-points",
      "GET /api/admin/v1/recovery/restore-points",
      "POST /api/admin/v1/recovery/disclosure",
      "POST /api/admin/v1/recovery/deep-link",
      "GET /api/admin/v1/recovery/status",
    ],
  },
  {
    name: "forms-admin",
    create: () => createFormsAdminModule(noDeps),
    routes: [
      `GET ${W}/forms`,
      `POST ${W}/forms`,
      `GET ${W}/forms/:formId`,
      `PUT ${W}/forms/:formId`,
      `PUT ${W}/forms/:formId/authoring`,
      `GET ${W}/forms/:formId/submissions`,
      `GET ${W}/forms/:formId/submissions/:submissionId`,
      `DELETE ${W}/forms/:formId/submissions/:submissionId`,
      // why: 789a6e02 (forms_pull_submissions) added the admin pull route to this module.
      `POST ${W}/forms/submissions/pull`,
    ],
  },
  {
    name: "integrations-admin",
    create: () => createIntegrationsAdminModule(noDeps),
    routes: [
      `GET ${W}/integrations/subscriptions`,
      `POST ${W}/integrations/subscriptions`,
      `POST ${W}/integrations/subscriptions/:subscriptionId/pause`,
      `DELETE ${W}/integrations/subscriptions/:subscriptionId`,
      `GET ${W}/integrations/subscriptions/:subscriptionId/deliveries`,
    ],
  },
  {
    name: "members",
    create: () => createMembersModule({ admin: noDeps, public: noDeps }, { oidc: noDeps }),
    routes: [
      `GET ${W}/members`,
      `GET ${W}/members/:memberId`,
      `POST ${W}/members/:memberId/disable`,
      `DELETE ${W}/members/:memberId`,
      `POST ${W}/members/request-magic-link`,
      "POST /api/members/v1/workspaces/:workspaceId/sign-in",
      "POST /api/members/v1/workspaces/:workspaceId/sign-in/complete",
      "POST /api/members/v1/workspaces/:workspaceId/password/sign-in",
      "POST /api/members/v1/workspaces/:workspaceId/forgot-password",
      "POST /api/members/v1/workspaces/:workspaceId/reset-password",
      "POST /api/members/v1/workspaces/:workspaceId/password/set",
      "GET /api/members/v1/workspaces/:workspaceId/me",
      "POST /api/members/v1/workspaces/:workspaceId/sign-out",
      "GET /api/members/v1/workspaces/:workspaceId/login-providers",
      "GET /api/members/v1/workspaces/:workspaceId/oidc/:providerId/start",
      "GET /api/members/v1/workspaces/:workspaceId/oidc/:providerId/callback",
      "POST /api/members/v1/workspaces/:workspaceId/oidc/:providerId/verify-email",
      "POST /api/members/v1/workspaces/:workspaceId/identities/:providerId/unlink",
    ],
  },
  {
    name: "menus",
    create: () => createMenusModule(noDeps),
    routes: [
      `GET ${W}/menus`,
      `GET ${W}/menus/:menuId`,
      `POST ${W}/menus`,
      `PUT ${W}/menus/:menuId`,
      `POST ${W}/menus/:menuId/locations`,
      `DELETE ${W}/menus/:menuId`,
    ],
  },
  {
    name: "plugins",
    create: () => createPluginsModule(noDeps),
    routes: [
      `GET ${W}/chart-providers`,
      `GET ${W}/chart-providers/assets/:pluginId/:version/:digest/:asset`,
      `GET ${W}/plugins`,
      `PATCH ${W}/plugins/:pluginId`,
      `DELETE ${W}/plugins/:pluginId`,
      `GET ${W}/plugins/:pluginId/files`,
      `GET ${W}/plugins/:pluginId/provider-settings`,
      `PUT ${W}/plugins/:pluginId/provider-settings`,
      `PUT ${W}/project-keys/:keyId/use`,
      `POST ${W}/plugins/install/preview`,
      `POST ${W}/plugins/install`,
      `POST ${W}/plugins/install/zip/preview`,
      `POST ${W}/plugins/install/zip`,
      // Must stay after `install/preview`: `:pluginId/preview` also matches that URL (pluginId =
      // "install"), and Express runs the first registered match, so registering it earlier sends the
      // install dialog's consent preview to the plugin-preview handler instead.
      `GET ${W}/plugins/:pluginId/preview`,
      `POST ${W}/plugins/:pluginId/preview`,
    ],
  },
  {
    name: "redirects",
    create: () => createRedirectsModule(noDeps),
    routes: [
      `GET ${W}/redirects`,
      `GET ${W}/redirects/:id`,
      `POST ${W}/redirects`,
      `PATCH ${W}/redirects/:id`,
      `DELETE ${W}/redirects/:id`,
      `POST ${W}/redirects/import`,
      `GET ${W}/redirects/:id/hits`,
    ],
  },
  {
    name: "settings",
    create: () => createSettingsModule(noDeps),
    routes: [
      `POST ${W}/settings/definitions`,
      `GET ${W}/settings/effective`,
      `GET ${W}/settings/raw`,
      `GET ${W}/settings/definitions`,
      `PUT ${W}/settings/value`,
      `DELETE ${W}/settings/value`,
      `POST ${W}/settings/reset`,
      `GET ${W}/settings/events`,
    ],
  },
  {
    name: "skills", create: () => createSkillsModule(noDeps),
    routes: [
      `GET ${W}/skills`,
      `GET ${W}/skills/:toolId/files`,
      `POST ${W}/skills`,
      `PATCH ${W}/skills/:toolId`,
      `DELETE ${W}/skills/:toolId`,
      `GET ${W}/skills/:toolId/guidance`,
    ],
  },
  {
    name: "taxonomy",
    create: () => createTaxonomyModule(noDeps),
    routes: [
      "GET /api/admin/v1/taxonomy",
      "POST /api/admin/v1/taxonomy",
      "POST /api/admin/v1/taxonomy/:taxonomyId/terms",
      "PUT /api/admin/v1/taxonomy/terms/:id",
      "POST /api/admin/v1/taxonomy/assign-terms",
      "POST /api/admin/v1/taxonomy/unassign-terms",
      "GET /api/admin/v1/taxonomy/assigned-terms",
      "DELETE /api/admin/v1/taxonomy/:id",
      "DELETE /api/admin/v1/taxonomy/terms/:id",
    ],
  },
  {
    name: "users",
    create: () => createUsersModule(noDeps),
    routes: [
      `GET ${W}/users`,
      `POST ${W}/users`,
      `PATCH ${W}/users/:principalId`,
      `POST ${W}/users/:principalId/disable`,
      `POST ${W}/users/:principalId/enable`,
      `POST ${W}/users/:principalId/reset-password`,
      `DELETE ${W}/users/:principalId`,
      `POST ${W}/users/:principalId/roles`,
      `POST ${W}/users/:principalId/policies`,
      `GET ${W}/roles`,
      `POST ${W}/roles`,
      `PATCH ${W}/roles/:roleId`,
      `DELETE ${W}/roles/:roleId`,
      `GET ${W}/policies`,
      `POST ${W}/policies`,
      `PATCH ${W}/policies/:policyId`,
      `DELETE ${W}/policies/:policyId`,
      `POST ${W}/policies/:policyId/permissions`,
      `GET ${W}/policies/:policyId/permissions`,
      `DELETE ${W}/policies/:policyId/permissions/:policyPermissionId`,
    ],
  },
  {
    name: "workspace",
    create: () => createWorkspaceModule(noDeps),
    routes: [
      "GET /api/admin/v1/workspaces",
      "POST /api/admin/v1/workspaces",
      "GET /api/admin/v1/workspaces/:workspaceId",
      "PATCH /api/admin/v1/workspaces/:workspaceId",
      "DELETE /api/admin/v1/workspaces/:workspaceId",
    ],
  },
];

interface ExpressRouteLayer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
}

function routesOf(app: express.Express): string[] {
  const stack = (app as unknown as { _router?: { stack: ExpressRouteLayer[] } })._router?.stack ?? [];
  return stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods)
          .filter((m) => layer.route!.methods[m])
          // OIDC's unavailable handler mounts several explicit paths on one Express route.
          .flatMap((m) => [layer.route!.path].flat().map((path) => `${m.toUpperCase()} ${path}`))
      : []
  );
}

for (const c of CASES) {
  test(`module '${c.name}': registers exactly its routes, in order, and nothing else`, () => {
    const handle = c.create();
    assert.equal(handle.name, c.name);
    assert.equal(handle.start, undefined, "a route-only module owns no boot work");
    assert.equal(handle.bootModule, undefined, "a route-only module owns no readiness participant");
    assert.equal(typeof handle.registerRoutes, "function");

    const app = express();
    handle.registerRoutes!(app);
    assert.deepEqual(routesOf(app), c.routes);
  });
}

test("createApp() mounts every route-only module: each module's routes are on the real router", () => {
  const mounted = new Set(routesOf(createApp()));
  const missing = CASES.flatMap((c) => c.routes.filter((r) => !mounted.has(r)).map((r) => `${c.name}: ${r}`));
  assert.deepEqual(missing, []);
});
