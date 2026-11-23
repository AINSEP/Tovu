import { homedir } from "node:os";
import type { Express } from "express";

import {
  deploymentOverviewRoute,
  type DeploymentEnvVarStatus as SpecDeploymentEnvVarStatus,
  type DeploymentOverviewSnapshot as SpecDeploymentOverviewSnapshot,
} from "@jini-ai/cms/admin-http/routes/system/deployment-overview";
import { exportSiteStatusRoute, exportSiteTriggerRoute } from "@jini-ai/cms/admin-http/routes/system/export-site";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { getExportRunSnapshot, startExportRun } from "#src/features/deployments/index";
import { DEFAULT_OWNER_PASSWORD } from "#src/features/identity/wiring";
import { inspectSiteKeyMaterial, siteKeySources, type SiteKeyStatus } from "#src/features/webhooks/index";
import { startupSecretEnvironment } from "#src/platform/secrets/startup-secrets";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { resolveSiteKeySources } from "#src/server/inbound/admin-http/routes/system/site-key";
import type { RouteDeps, SiteStoragePaths } from "#src/server/routes/types";
import { isAssistantDaemonKnownFailed } from "#src/server/runtime/lifecycle/readiness-state";

/**
 * @file The `system` deploy registrars (Deployment panel: Overview, Static Site export): Jini route
 * specs (`@jini-ai/cms/admin-http/routes/system/{deployment-overview,export-site}`) mounted behind
 * the admin ports. `RouteDeps` is read only here, at registration: each mount builds that route's
 * own small deps object, so a spec never sees the whole bag. The Tovu-owned collaborators the specs
 * need are bound here: the live process-state snapshot (runtime mode, env presence, this site's
 * site-key resolution, storage paths), the default owner password constant, and the process-local
 * export run slot (`features/deployments/export-run.ts`, shared with the agent export tools).
 * Registration order is the original order (`mount-admin-system.ts`).
 */

/** One required-for-production env var's presence, never its value (the site key row narrows `source`). */
export interface DeploymentEnvVarStatus extends Omit<SpecDeploymentEnvVarStatus, "source"> {
  /** site key row only: where the keyring's material came from. `set` there means "usable site key",
   *  so a valid generated key file counts, and malformed env/file material does not. */
  source?: SiteKeyStatus["source"];
}

/** The Overview tab's wire body, with Tovu's own site-key source vocabulary. */
export interface DeploymentOverviewSnapshot extends Omit<SpecDeploymentOverviewSnapshot, "envVars"> {
  envVars: DeploymentEnvVarStatus[];
}

/** The four env vars the brief calls out — order here is display order. */
const REQUIRED_ENV_VAR_NAMES = [
  "TOVU_ADMIN_PASSWORD",
  "TOVU_ADMIN_USER",
  "TOVU_SITE_KEY",
  "JINI_AGENT_DAEMON_PORT",
] as const;

/** The site key row, from what `EnvOrFileKeyring` would actually resolve — the env var OR a generated
 *  key file, validated — rather than the env var's bare presence. @complexity O(1). */
function siteKeyEnvVarStatus(siteKey: SiteKeyStatus): DeploymentEnvVarStatus {
  return {
    name: "TOVU_SITE_KEY",
    set: siteKey.active,
    source: siteKey.source,
    ...(siteKey.invalid ? { invalid: true as const } : {}),
  };
}

function envVarStatus(name: (typeof REQUIRED_ENV_VAR_NAMES)[number], siteKey: SiteKeyStatus): DeploymentEnvVarStatus {
  return name === "TOVU_SITE_KEY" ? siteKeyEnvVarStatus(siteKey) : { name, set: Boolean(startupSecretEnvironment({ env: process.env })[name]) };
}

/**
 * Builds the Overview snapshot from live process state — the host half of the deployment-overview
 * route (the spec computes `defaultOwnerPasswordUnsafe` from the owner's stored hash). Exported so a
 * test can call it directly without spinning up Express.
 *
 * The production readiness gate is "entirely inert outside production mode", and in production a
 * failing gate exits the process before it listens (`index.ts`'s `runBootGateOrExit`), so a request
 * reaching this route in production mode is itself proof the gate passed. `daemonKnownFailed` is a
 * negative signal only (`readiness-state.ts`): "not known-failed" can also mean "never spawned".
 *
 * @param input.siteKey test seam; defaults to a live {@link inspectSiteKeyMaterial} read.
 * @param input.storagePaths the booted site's paths (`RouteDeps.siteStoragePaths`). Injected, never
 *   re-derived here: this used to call `defaultContentDbPath()`/`mediaUploadsDir()`, which read
 *   `TOVU_CONTENT_DB`/`siteDir()` — the env/cwd site, not necessarily the one this process serves
 *   once several local sites run side by side (hardwiring audit #19).
 * @complexity O(1) — fixed-size env var list, no iteration over caller-controlled data.
 */
export function buildDeploymentOverviewSnapshot(input: {
  defaultOwnerPasswordUnsafe: boolean;
  storagePaths: Pick<SiteStoragePaths, "contentDbPath" | "mediaUploadsDir">;
  siteKey?: SiteKeyStatus;
}): DeploymentOverviewSnapshot {
  const mode = resolveRuntimeMode();
  const siteKey = input.siteKey ?? inspectSiteKeyMaterial({ sources: siteKeySources({ mode, env: process.env, home: homedir(), cwd: process.cwd() }) });
  return {
    mode,
    productionReadinessGate: { applicable: mode === "production", passed: mode === "production" },
    defaultOwnerPasswordUnsafe: input.defaultOwnerPasswordUnsafe,
    daemonKnownFailed: isAssistantDaemonKnownFailed(),
    dbPath: input.storagePaths.contentDbPath,
    uploadsDir: input.storagePaths.mediaUploadsDir,
    envVars: REQUIRED_ENV_VAR_NAMES.map((name) => envVarStatus(name, siteKey)),
  };
}

/** The two port fields every mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function deployPortDeps({ deps }: { deps: Pick<RouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Both routes answered unexpected failures with `sendAdminFailure`'s `INTERNAL_ERROR` under their own
 *  operation, and authorized `direct` (`authorizeDirectOrRespond`: no publishing-credential override). */
function directMount(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The deps `registerAdminDeploymentOverviewRoute` reads. */
export type AdminDeploymentOverviewDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "identityReady" | "ownerPrincipalId" | "userRepo" | "passwordHasher" | "siteBinding" | "siteStoragePaths"
>;

/** `GET .../system/deployment-overview` (Jini spec). Every collaborator is read per request, as the
 *  hand-written route read `deps.*`.
 * @complexity O(1) setup.
 */
export function registerAdminDeploymentOverviewRoute({ app, deps }: { app: Express; deps: AdminDeploymentOverviewDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute({ app, spec: deploymentOverviewRoute, deps: {
    ...deployPortDeps({ deps }),
    get identityReady() { return deps.identityReady; },
    get ownerPrincipalId() { return deps.ownerPrincipalId; },
    userRepo: { findByPrincipalId: (args) => deps.userRepo.findByPrincipalId(args) },
    passwordHasher: { verify: (args) => deps.passwordHasher.verify(args) },
    defaultOwnerPassword: DEFAULT_OWNER_PASSWORD,
    // Site-key plan §A3b: resolve THIS site's own source order (the same `resolveSiteKeySources` seam
    // `site-key.ts`'s GET/reveal/generate verbs use) rather than the snapshot builder's bare-default
    // `inspectSiteKeyMaterial()`, so a site with a resolvable per-site key file
    // (`~/.tovu/site-keys/<siteKeyId>.hex`) reports it here too, not just on the site key tab. A site
    // with no readable `.site-meta.json` (or production, which has no per-site file) falls back.
    buildSnapshot: ({ defaultOwnerPasswordUnsafe }) => buildDeploymentOverviewSnapshot({
      defaultOwnerPasswordUnsafe,
      storagePaths: deps.siteStoragePaths,
      siteKey: inspectSiteKeyMaterial({ sources: resolveSiteKeySources(deps).sources }),
    }),
  } }, directMount("routes/system/deployment-overview"));
}

/** The deps `registerAdminExportSiteRoutes` reads (the run starter takes the whole bag as `routeDeps`). */
export type AdminExportSiteDeps = RouteDeps;

/**
 * `POST`/`GET .../system/export` (Jini specs), trigger then status, as registered before. The run
 * slot is `export-run.ts`'s process-local holder, shared with the `deployment_trigger_export` agent
 * tool so both trigger and poll the SAME run; `startExportRun` itself is not awaited (the run
 * continues in the background).
 * @complexity O(1) setup.
 */
export function registerAdminExportSiteRoutes({ app, deps }: { app: Express; deps: AdminExportSiteDeps }, _optional: Record<string, never> = {}): void {
  const getRunSnapshot = () => getExportRunSnapshot();
  mountAdminJsonRoute({ app, spec: exportSiteTriggerRoute, deps: {
    ...deployPortDeps({ deps }),
    getRunSnapshot,
    startRun: ({ clean, actorId }, { basePath }) => startExportRun({ routeDeps: deps, runExportSite: deps.runExportSite, clean }, { basePath,
      productEvent: { tracker: deps.tracker, userId: actorId, operationId: deps.idGen.newId(), source: "admin" } }),
  } }, directMount("routes/system/export-site"));
  mountAdminJsonRoute({ app, spec: exportSiteStatusRoute, deps: { ...deployPortDeps({ deps }), getRunSnapshot } }, directMount("routes/system/export-site"));
}
