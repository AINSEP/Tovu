import { homedir } from "node:os";
import type { Express } from "express";

import { deploymentOverviewRoute } from "@jini-ai/cms/admin-http/routes/system/deployment-overview";
import type {
  DeploymentEnvVarStatus as SpecDeploymentEnvVarStatus,
  DeploymentOverviewSnapshot as SpecDeploymentOverviewSnapshot,
} from "@jini-ai/core/contracts/site/cms-system-deploy";
import { exportSiteStatusRoute, exportSiteTriggerRoute } from "@jini-ai/cms/admin-http/routes/system/export-site";
import { publishPreviewRoute } from "@jini-ai/cms/admin-http/routes/system/publish-site/preview";
import { publishStatusRoute } from "@jini-ai/cms/admin-http/routes/system/publish-site/status";
import { publishTargetsRoute } from "@jini-ai/cms/admin-http/routes/system/publish-site/targets";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { getExportRunSnapshot, startExportRun } from "#src/features/deployments/index";
import { getPublishRunSnapshot } from "#src/features/deployments/static-publish/index";
import { DEFAULT_OWNER_PASSWORD } from "#src/features/identity/wiring";
import { inspectSiteKeyMaterial, siteKeySources, type SiteKeyStatus } from "#src/features/webhooks/index";
import { startupSecretEnvironment } from "#src/platform/secrets/startup-secrets";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import {
  createPublishSiteContext, publishPreviewFor, publishTargetsFor, registerAdminPublishDestinationsRoute, registerAdminPublishTriggerRoute,
} from "#src/server/inbound/admin-http/routes/system/publish-site";
import { resolveSiteKeySources } from "#src/server/inbound/admin-http/routes/system/site-key";
import type { RouteDeps, SiteStoragePaths } from "#src/server/routes/types";
import { isAssistantDaemonKnownFailed } from "#src/server/runtime/lifecycle/readiness-state";

/**
 * @file The `system` deploy registrars (Deployment panel: Overview, Static Site export, Publish): Jini
 * route specs (`@jini-ai/cms/admin-http/routes/system/{deployment-overview,export-site,publish-site/*}`) mounted behind
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
function siteKeyEnvVarStatus({ siteKey }: { siteKey: SiteKeyStatus }, _optional: Record<string, never> = {}): DeploymentEnvVarStatus {
  return {
    name: "TOVU_SITE_KEY",
    set: siteKey.active,
    source: siteKey.source,
    ...(siteKey.invalid ? { invalid: true as const } : {}),
  };
}

function envVarStatus({ name, siteKey }: { name: (typeof REQUIRED_ENV_VAR_NAMES)[number]; siteKey: SiteKeyStatus }, _optional: Record<string, never> = {}): DeploymentEnvVarStatus {
  return name === "TOVU_SITE_KEY" ? siteKeyEnvVarStatus({ siteKey }) : { name, set: Boolean(startupSecretEnvironment({ env: process.env })[name]) };
}

/**
 * The host half of the deployment-overview route (the spec computes `defaultOwnerPasswordUnsafe` from the
 * owner's stored hash).
 *
 * Builds the snapshot from live process state. Exported separately from the route registrar so a
 * test can call it directly without spinning up Express.
 *
 * @param input.defaultOwnerPasswordUnsafe the one field that needs the database, resolved by the
 * caller ({@link isOwnerOnDefaultPassword}) so this stays synchronous.
 * @param input.siteKey test seam; defaults to a live {@link inspectSiteKeyMaterial} read.
 * @param input.storagePaths the booted site's paths (`RouteDeps.siteStoragePaths`). Injected, never
 * re-derived here: this used to call `defaultContentDbPath()`/`mediaUploadsDir()`, which read
 * `TOVU_CONTENT_DB`/`siteDir()` — the env/cwd site, not necessarily the one this process serves
 * once several local sites run side by side (hardwiring audit #19).
 * @complexity O(1) — fixed-size env var list, no iteration over caller-controlled data.
 */
export function buildDeploymentOverviewSnapshot(input: {
  defaultOwnerPasswordUnsafe: boolean;
  storagePaths: Pick<SiteStoragePaths, "contentDbPath" | "mediaUploadsDir">;
  siteKey?: SiteKeyStatus;
}, _optional: Record<string, never> = {}): DeploymentOverviewSnapshot {
  const mode = resolveRuntimeMode();
  const siteKey = input.siteKey ?? inspectSiteKeyMaterial({ sources: siteKeySources({ mode, env: process.env, home: homedir(), cwd: process.cwd() }) });
  return {
    // `resolveRuntimeMode()`'s own two-value type — deliberately not "development": Tovu's actual
    // runtime-mode signal is `"production" | "local"` (`core/runtime-mode.ts`), and echoing that
    // exact vocabulary here is more honest than translating it to a pair the UI never really has.
    mode,
    // The boot-time production readiness gate (`production-readiness-gate.ts`) is "entirely inert
    // outside production mode" by its own doc comment, and in production mode a failing gate exits
    // the process before it ever starts listening (`index.ts`'s `runBootGateOrExit`) — so a request
    // reaching this route in production mode is itself proof the gate passed. `applicable: false`
    // in local mode is the honest "this check does not run here" state, not a hidden pass.
    productionReadinessGate: { applicable: mode === "production", passed: mode === "production" },
    // Whether the seeded owner account is still on the publicly-documented default password — read
    // from the owner's STORED hash ({@link isOwnerOnDefaultPassword}), not from `TOVU_ADMIN_PASSWORD`.
    // Computed unconditionally (not gated on production mode) since it is a real, useful warning in
    // local mode too.
    defaultOwnerPasswordUnsafe: input.defaultOwnerPasswordUnsafe,
    // Whether the locally-spawned agent daemon is KNOWN to have failed (`readiness-state.ts`). This
    // is a negative signal only — "not known-failed" can also mean "never spawned" (e.g. pure BYOK
    // setups never start it), so the UI must not read `!daemonKnownFailed` as "confirmed alive".
    daemonKnownFailed: isAssistantDaemonKnownFailed(),
    // `RouteDeps.siteStoragePaths.contentDbPath` — the path this process's composition root opened.
    dbPath: input.storagePaths.contentDbPath,
    // `RouteDeps.siteStoragePaths.mediaUploadsDir` — the same path the blob store writes under.
    uploadsDir: input.storagePaths.mediaUploadsDir,
    envVars: REQUIRED_ENV_VAR_NAMES.map((name) => envVarStatus({ name, siteKey })),
  };
}

/** The two port fields every mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function deployPortDeps({ deps }: { deps: Pick<RouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Both routes answered unexpected failures with `sendAdminFailure`'s `INTERNAL_ERROR` under their own
 *  operation, and authorized `direct` (`authorizeDirectOrRespond`: no publishing-credential override). */
/** The unexpected-failure copy key and authorization of each mount, exactly as each hand-written
 *  route had them: overview and export kept `authorizeDirectOrRespond` (`"direct"`), the publish
 *  routes `authorizeOrRespond` (`"guarded"`). Every one authorized before reading its body or
 *  query, so none opts into `deferMissingPrincipal`. */
function mountOptions(
  { operation, authorization }: { operation: string; authorization: AdminRouteAuthorization },
  optional: Pick<AdminJsonRouteMountOptions, "authorizationByPermission" | "deferMissingPrincipal"> = {},
): AdminJsonRouteMountOptions {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" }, ...optional };
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
    // Whether the seeded owner's stored password still verifies against `DEFAULT_OWNER_PASSWORD`.
    //
    // Read from the database because `TOVU_ADMIN_PASSWORD` only says what a FIRST boot would seed:
    // seeding never rotates an existing owner, so the env var and the stored credential drift apart the
    // moment either changes. Both directions were wrong in practice — the desktop app now passes a
    // random `TOVU_ADMIN_PASSWORD` into every spawn (LAN-bind plan, 2026-09-23), so a site it created
    // before that fix, still on the default, read as "changed"; and an owner who changed their password
    // in the admin UI with the env var unset read as "still the default" forever.
    //
    // @returns `false` when there is no owner user row to check (nothing can sign in with the default).
    // @complexity O(1) — one user lookup and one argon2id verify (tens of ms, by design of the hash).
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
  } }, mountOptions({ operation: "routes/system/deployment-overview", authorization: "direct" }));
}

/** The deps `registerAdminExportSiteRoutes` reads (the run starter takes the whole bag as `routeDeps`). */
export type AdminExportSiteDeps = RouteDeps;

/**
 * @file Admin Deployment panel → Static Site tab backend.
 *
 * Registers TWO routes wrapping `src/features/site-export/site-exporter.ts`'s `exportSite` — the same engine
 * `tovu export` already drives, in-process, never shelled out to (a route running inside this same
 * process can call it directly; `exportSite` boots its OWN short-lived HTTP listener on port 0 to
 * fetch every route, so there is no self-request deadlock).
 *
 * TRIGGER + STATUS, not a synchronous request/response: a real export is
 * "seconds to minutes" (this feature's own build-session findings doc) — one HTTP request per
 * route/asset, serially, by design (`site-exporter.ts`'s own complexity note: fidelity over
 * throughput). Holding a single HTTP connection open for that whole span is the wrong shape for a
 * single-container product with no separate worker process to hand it to, and a hard client-side
 * timeout would just turn an in-progress export into an orphaned background write with no way to
 * learn its outcome. So `POST .../system/export` starts the run and returns `202` immediately with
 * a snapshot; `GET .../system/export` polls the same snapshot. A single process-local mutable slot
 * (mirrors `readiness-state.ts`'s exact "process-local holder" shape) rather than a job table: this
 * composition root serves exactly one workspace per process (`RouteDeps.workspaceId` is a single
 * value, not a repo — every route in this codebase already assumes that), so "one export at a
 * time" is the correct concurrency model, not an arbitrary limitation. A second trigger while one
 * is running gets `409`, never a silently queued or silently dropped request.
 *
 * `system.export`-gated for the trigger, distinct from the `system.read` the status poll and every
 * other route in this directory use — triggering writes a folder of files to disk, which is not a
 * read, the same reasoning that gives `database.migrate`/`backup.restore`/`theme.set` their own
 * write-class permission strings instead of reusing a `*.read` grant.
 *
 * `--out`/`--workspace` are NOT client-controllable fields on the request body: `startExportRun`
 * (`export-run.ts`) reads `RouteDeps.exportOutputRootDir` — the same `TOVU_EXPORT_DIR`
 * env-then-default value `cli/commands/export.ts`'s `resolveExportOutputDir` falls back to when its
 * own CLI-only `--out` flag is absent, both ultimately resolved once by the composition root
 * (`apps/website/src/server/runtime/composition/deps.ts`'s `resolveExportOutputRootDir`) — rather than accepting a caller-supplied path —
 * the brief's own instruction ("do not invent a new location") doubles as a path-injection guard:
 * nothing here ever builds a filesystem path out of request input.
 *
 * 2026-08-15: the process-local run state and the actual `exportSite` call moved out to
 * `features/deployments/export-run.ts` — this file now only translates HTTP
 * request/response shape around `startExportRun`/`getExportRunSnapshot`. The move exists so the new
 * `deployment_trigger_export`/`deployment_get_export_status` agent tools (`features/deployments/
 * tool-registrations.ts`) can trigger and poll the SAME run this route does — the assistant's own
 * `tool-registrations.ts` files may never import from `src/server/**` (see that file's header for
 * the full reasoning and the one disclosed gap: the standalone agent daemon process does not share
 * this process's in-memory run state).
 *
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
  } }, mountOptions({ operation: "routes/system/export-site", authorization: "direct" }));
  mountAdminJsonRoute({ app, spec: exportSiteStatusRoute, deps: { ...deployPortDeps({ deps }), getRunSnapshot } }, mountOptions({ operation: "routes/system/export-site", authorization: "direct" }));
}

/** The deps `registerAdminPublishSiteRoutes` reads (the publish context and trigger take the whole bag). */
export type AdminPublishSiteDeps = RouteDeps;

/** Every publish route authorized `guarded` (`authorizeOrRespond`: a publishing credential answers from
 *  its grant) and answered unexpected failures under the one `routes/system/publish-site` operation. */
const PUBLISH_MOUNT = mountOptions({ operation: "routes/system/publish-site", authorization: "guarded" });

/**
 * `.../system/publish` (trigger, status, preview, destinations) and `.../system/publish-targets`, in the
 * original registration order. Status, preview and targets are Jini specs; the trigger and the
 * destinations listing stay hand-written in `routes/system/publish-site.ts` (see each registrar's doc).
 * @complexity O(1) setup.
 */
export function registerAdminPublishSiteRoutes({ app, deps }: { app: Express; deps: AdminPublishSiteDeps }, _optional: Record<string, never> = {}): void {
  const context = createPublishSiteContext({ deps });
  registerAdminPublishTriggerRoute({ app, context });
  mountAdminJsonRoute({ app, spec: publishStatusRoute, deps: { ...deployPortDeps({ deps }), getRunSnapshot: () => getPublishRunSnapshot() } }, PUBLISH_MOUNT);
  mountAdminJsonRoute({ app, spec: publishPreviewRoute, deps: { ...deployPortDeps({ deps }), previewPublish: publishPreviewFor({ context }) } }, PUBLISH_MOUNT);
  registerAdminPublishDestinationsRoute({ app, context });
  // The registry's targets, for the admin publish card to render from descriptors (deploy plan T7).
  mountAdminJsonRoute({ app, spec: publishTargetsRoute, deps: { ...deployPortDeps({ deps }), listTargets: publishTargetsFor({ deps }) } }, PUBLISH_MOUNT);
}
