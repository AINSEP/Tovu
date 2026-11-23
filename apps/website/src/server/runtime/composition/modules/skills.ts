import type { Express } from "express";
import path from "node:path";

import type { InstalledSkillToolSource } from "@jini-ai/agentic/skills/tools";
import { skillFilesRoute } from "@jini-ai/cms/admin-http/routes/skills/files";
import { skillGuidanceRoute } from "@jini-ai/cms/admin-http/routes/skills/guidance";
import { skillInstallRoute } from "@jini-ai/cms/admin-http/routes/skills/install";
import { skillSetEnabledRoute } from "@jini-ai/cms/admin-http/routes/skills/set-enabled";
import { skillUninstallRoute } from "@jini-ai/cms/admin-http/routes/skills/uninstall";
import { PLUGIN_PACKAGE_FILE_LIMITS, readPluginPackageFiles } from "@jini-ai/plugins/host/node";
import { withExtensionApprovalPolicy } from "#src/assistant/assistant-tool-approval-policy";
import type { ApplyExtensionApprovalPolicy } from "#src/contracts/headless/assistant-tool-approval-policy";
import { installSkill, setSkillEnabled, SkillInputError, uninstallSkill } from "#src/features/skills/install-service";
import { SKILL_STATE_FILE } from "#src/features/skills/state";
import { buildSkillToolRegistrations, loadInstalledSkillToolSources } from "#src/features/skills/tool-registrations";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { registerSkillsListRoute } from "#src/server/inbound/admin-http/routes/skills/list";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `skills` server module: skill listings, file inspection, guidance, installation,
 * enablement and removal behind admin sessions.
 *
 * K1 (RT-K1-adm-skills): files and the four management routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/skills/*`) mounted behind the admin ports. The list route stays
 * hand-written (it answers `Cache-Control`/`ETag`/`304`, which a JSON spec cannot). `RouteDeps` is
 * read only here: each mount gets small function-typed collaborators bound to the booted skill
 * layout and site binding, the Node package reader, the skill state file name and the approval policy.
 */

/**
 * C-003a `SkillsRouteDeps` — narrow `RouteDeps` slice for the `skills` admin HTTP surface
 * (implementation-outline.md, skills-composer-typeahead).
 *
 * A genuine narrowing, mirroring `apps/website/src/server/inbound/admin-http/routes/system/module-status.ts`'s
 * `AdminModuleStatusDeps` — the registrars this module owns read `workspaceId`
 * (the path-param guard, and the input to `loadInstalledSkillToolSources`) and `authorize`
 * (the `admin.assistant.use` gate, D-3), plus the booted `skillLayout` and `siteBinding`.
 * No repo, no clock, no id-gen: C-001 is a pure read of `<site>/skills/` through
 * `loadInstalledSkillToolSources`, using the same binding as installation and tool registration.
 */
export type SkillsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "skillLayout" | "siteBinding">;

export type SkillsRouteRegistrar = (required: { app: Express; deps: SkillsRouteDeps }, optional?: Record<string, never>) => void;

/** The management registrar also needs the approval policy the guidance preview's tool carries. */
type SkillsManagementDeps = SkillsRouteDeps & { withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy };

/** The two port fields every skills mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function skillsPortDeps({ deps }: { deps: SkillsRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The booted layout and binding, read per call (not captured at mount) as the routes read `deps`. */
function siteContext({ deps }: { deps: SkillsRouteDeps }, _optional: Record<string, never> = {}) {
  return { skillLayout: deps.skillLayout, siteBinding: deps.siteBinding };
}

/** Installed skills of the served workspace, through the same binding as installation and tool registration. */
function skillSourcesLoader({ deps }: { deps: SkillsRouteDeps }, _optional: Record<string, never> = {}) {
  return (input: { includeDisabled?: boolean }) => loadInstalledSkillToolSources({ ...siteContext({ deps }), workspaceId: deps.workspaceId, ...input });
}

/** Every skills route was guarded (`authorizeOrRespond`): a publishing credential answers from its grant. */
function mountOptions(operation: string, message?: string) {
  return { authorization: "guarded" as const, failure: { operation, code: "INTERNAL_ERROR", ...(message === undefined ? {} : { message }) } };
}

/** Read-only sibling of plugin files: resolve an installed id before joining any path. */
export const registerSkillFilesRoute: SkillsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: skillFilesRoute, deps: {
    ...skillsPortDeps({ deps }), loadSkillSources: skillSourcesLoader({ deps }),
    // The spec hands over only a discovered directory; the shared reader enforces realpath
    // containment under the workspace's skill container and the Plugins caps.
    readSkillFiles: async ({ directory }) => {
      const containerDir = deps.skillLayout.forWorkspace({ workspaceId: deps.workspaceId }).root;
      return readPluginPackageFiles({ input: { rootDir: path.join(containerDir, directory), containerDir } });
    },
    fileLimits: PLUGIN_PACKAGE_FILE_LIMITS, installRecordFileName: SKILL_STATE_FILE,
  } },
  // Path errors can contain private server paths; match the plugin files refusal.
  mountOptions("routes/skills/files"));
};

/** Session-gated routes; one validator/service owns every installation transport. Same order as before:
 *  install, enable/disable, remove, guidance. */
export const registerSkillsManagementRoutes = ({ app, deps }: { app: Express; deps: SkillsManagementDeps }, _optional = {}): void => {
  const options = mountOptions("routes/skills/manage", "Could not change skills. Try again.");
  const isSkillInputError = ({ err }: { err: unknown }) => err instanceof SkillInputError;
  const port = skillsPortDeps({ deps });
  mountAdminJsonRoute({ app, spec: skillInstallRoute, deps: { ...port, isSkillInputError,
    installSkill: (input) => installSkill({ ...input, ...siteContext({ deps }) }) } }, options);
  mountAdminJsonRoute({ app, spec: skillSetEnabledRoute, deps: { ...port, isSkillInputError,
    setSkillEnabled: (input) => setSkillEnabled({ ...input, ...siteContext({ deps }) }) } }, options);
  mountAdminJsonRoute({ app, spec: skillUninstallRoute, deps: { ...port, isSkillInputError,
    uninstallSkill: (input) => uninstallSkill({ ...input, ...siteContext({ deps }) }) } }, options);
  mountAdminJsonRoute({ app, spec: skillGuidanceRoute, deps: { ...port, isSkillInputError, loadSkillSources: skillSourcesLoader({ deps }),
    // Typed on the host's own source: the spec passes back the exact objects the loader returned.
    skillRegistrations: { build: ({ source }: { source: InstalledSkillToolSource }) =>
      buildSkillToolRegistrations({ sources: [source], withExtensionApprovalPolicy: deps.withExtensionApprovalPolicy })[0] },
  } }, options);
};

/** Composes skill listings, file inspection, guidance, installation, enablement and removal behind admin sessions. */
export function createSkillsModule(deps: SkillsRouteDeps): ServerModuleHandle {
  return {
    name: "skills",
    registerRoutes: ({ app }, _options = {}) => {
      registerSkillsListRoute({ app, deps });
      registerSkillFilesRoute({ app, deps });
      registerSkillsManagementRoutes({ app, deps: { ...deps, withExtensionApprovalPolicy } });
    },
  };
}
