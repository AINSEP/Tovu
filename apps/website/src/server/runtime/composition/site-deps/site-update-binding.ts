/**
 * @file Binds `RouteDeps.siteUpdateRuntime` from the environment, for a self-hosted site or a desktop-launched one.
 * Opt-in on every axis: no `TOVU_UPDATE_FEED_URL` (the release feed, no built-in default), no `TOVU_UPDATE_HOST`
 * naming the host kind, or (self-hosted) no `TOVU_VERSION`/`TOVU_IMAGE_TAG` / (desktop) no hand-off port to the
 * desktop main means no runtime, so the update tools are not registered and nothing touches the network.
 * Self-hosted is check-only: there is no update driver (see `self-hosted-update-supervisor.ts`), so no apply port.
 */
import type { DesktopAppUpdaterPort, SiteHealthPort } from "@jini-ai/devops/deploy";
import type { DbOpsPort } from "@jini-ai/core/contracts/site/gated-mutations-ports";
import type { HttpClientPort, IdGenerator } from "@jini-ai/core/primitives";
import { composeConfiguredSiteUpdateRuntime } from "#src/features/site-update/configured-runtime";
import { createRestorePointBackup, createUpdateBackupRegistry } from "#src/features/site-update/restore-point-backup";
import { createCandidateReadiness, rehearsalUnavailable, type RehearseMigration } from "#src/features/site-update/candidate-readiness";
import type { SiteUpdateHost } from "#src/features/site-update/host-runtime";
import { createSelfHostedCheckRuntime } from "#src/features/site-update/self-hosted-host";
import type { SiteUpdateCheckRuntime, SiteUpdateLockPort, SiteUpdateRuntime } from "#src/features/site-update/tools";

export interface SiteUpdateBindingRequired {
  env: Readonly<Record<string, string | undefined>>;
  dbOps: Pick<DbOpsPort, "getCapabilities" | "captureRestorePoint" | "restoreFromArtifact">;
  ids: IdGenerator;
  /** The site's one operation lock, shared with migration and restore (see `operation-update-lock.ts`). */
  lock: SiteUpdateLockPort;
  /** JSON over the guarded outbound HTTP client; throws on a non-2xx answer. Used for the feed and the health URL. */
  getJson: (required: { url: string }, optional?: { signal?: AbortSignal | undefined }) => Promise<unknown>;
}

/** The running version: `TOVU_VERSION`, else the image tag without a leading `v`. */
function runningVersionFrom(env: SiteUpdateBindingRequired["env"]): string | null {
  const explicit = env["TOVU_VERSION"]?.trim();
  if (explicit) return explicit;
  const tag = env["TOVU_IMAGE_TAG"]?.trim();
  return tag ? tag.replace(/^v(?=\d)/, "") : null;
}

/**
 * The desktop main's side of an update, reached over the desktop hand-off channel. The site process never holds the
 * app updater: `app` and `health` call back into the main that spawned it, so stage and install happen only there.
 */
export interface DesktopHandoffPorts {
  app: DesktopAppUpdaterPort;
  health: SiteHealthPort;
}

export interface SiteUpdateBindingOptional {
  /** Absent (a desktop-launched site whose main never handed the channel over) means a desktop host cannot update. */
  desktop?: DesktopHandoffPorts | undefined;
  /**
   * Rehearses the staged candidate on a copy of the update's backup. Absent (no host stages candidates yet) means
   * every apply is blocked at readiness, so production apply stays unexposed until the update supervisor lands.
   */
  rehearseMigration?: RehearseMigration | undefined;
}

/**
 * @returns The runtime, or null unless the host kind is named, the feed URL is configured, and (self-hosted) the
 *   version is known or (desktop) the main handed over its update channel.
 * @complexity O(1); builds ports without calling them.
 */
export function bindSiteUpdateRuntime(required: SiteUpdateBindingRequired, optional: SiteUpdateBindingOptional = {}): SiteUpdateCheckRuntime | SiteUpdateRuntime | null {
  const { env, ids, getJson } = required;
  const config = { feedUrl: env["TOVU_UPDATE_FEED_URL"] };
  if (env["TOVU_UPDATE_HOST"] === "desktop") return bindDesktopRuntime(required, optional);
  const version = runningVersionFrom(env);
  if (env["TOVU_UPDATE_HOST"] !== "self-hosted" || version === null) return null;
  // Check-only: no target-tag or restart port is constructed here, so none can be exposed or called.
  return createSelfHostedCheckRuntime({ runningVersion: version, config, getJson, ids });
}

/** The desktop runtime with apply ports, or null when the main never handed its update channel over. */
function bindDesktopRuntime({ env, dbOps, ids, lock, getJson }: SiteUpdateBindingRequired, { desktop, rehearseMigration }: SiteUpdateBindingOptional, _optional = {}): SiteUpdateRuntime | null {
  if (!desktop) return null;
  const { checkCandidate } = createCandidateReadiness({ rehearseMigration: rehearseMigration ?? rehearsalUnavailable });
  const { backup, readiness, data } = createRestorePointBackup({ dbOps, ...createUpdateBackupRegistry({ ids }), checkCandidate });
  // The app swap relaunches the desktop, and the new version runs its own migrations on that boot; the restore
  // point is taken before `migrate` is reached (backup precedes apply), so the only data step is the restore.
  const migrate = { migrate: async () => undefined, restore: data.restore };
  const host: SiteUpdateHost = { kind: "desktop", app: desktop.app, migrate, health: desktop.health };
  const runtime = composeConfiguredSiteUpdateRuntime({ config: { feedUrl: env["TOVU_UPDATE_FEED_URL"] }, host, shared: { backup, readiness, ids, runningVersion: () => desktop.app.currentVersion({}) }, getJson });
  return runtime && { ...runtime, lock };
}

/** JSON GET over the guarded outbound client: a non-2xx or non-JSON answer throws, so a check says "could not check". */
export function createHttpJsonGetter({ client }: { client: HttpClientPort }, _optional = {}): SiteUpdateBindingRequired["getJson"] {
  return async ({ url }, optional) => {
    const response = await client.send({ request: { url, method: "GET", headers: { accept: "application/vnd.github+json, application/json", "user-agent": "tovu-site-update" }, idleTimeoutMs: 10_000, ...(optional?.signal ? { signal: optional.signal } : {}) } });
    if (response.status < 200 || response.status >= 300) throw new Error(`The update server answered ${response.status}.`);
    return JSON.parse(response.bodyText) as unknown;
  };
}
