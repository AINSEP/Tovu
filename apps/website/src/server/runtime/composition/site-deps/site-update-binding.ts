/**
 * @file Binds `RouteDeps.siteUpdateRuntime` for a self-hosted site from the environment. Opt-in on every axis:
 * no `TOVU_UPDATE_FEED_URL` (the release feed, no built-in default), no `TOVU_UPDATE_HOST=self-hosted`, or no
 * `TOVU_VERSION`/`TOVU_IMAGE_TAG` means no runtime, so the update tools are not registered and nothing touches the network.
 */
import type { DbOpsPort } from "@jini-ai/core/contracts/site/gated-mutations-ports";
import type { HttpClientPort, IdGenerator } from "@jini-ai/core/primitives";
import { composeConfiguredSiteUpdateRuntime } from "#src/features/site-update/configured-runtime";
import { createRestorePointBackup } from "#src/features/site-update/restore-point-backup";
import { createSelfHostedUpdateHost, type SelfHostedHostOptional } from "#src/features/site-update/self-hosted-host";
import type { SiteUpdateRuntime } from "#src/features/site-update/tools";

export interface SiteUpdateBindingRequired {
  env: Readonly<Record<string, string | undefined>>;
  dbOps: Pick<DbOpsPort, "getCapabilities" | "captureRestorePoint" | "restoreFromArtifact">;
  ids: IdGenerator;
  /** JSON over the guarded outbound HTTP client; throws on a non-2xx answer. Used for the feed and the health URL. */
  getJson: (required: { url: string }, optional?: { signal?: AbortSignal | undefined }) => Promise<unknown>;
  /** Records the target tag for the operator's deploy tooling (the composition decides where). */
  recordTargetTag: (required: { tag: string }) => Promise<void>;
}

/** The running version: `TOVU_VERSION`, else the image tag without a leading `v`. */
function runningVersionFrom(env: SiteUpdateBindingRequired["env"]): string | null {
  const explicit = env["TOVU_VERSION"]?.trim();
  if (explicit) return explicit;
  const tag = env["TOVU_IMAGE_TAG"]?.trim();
  return tag ? tag.replace(/^v(?=\d)/, "") : null;
}

/**
 * @returns The runtime, or null unless this is explicitly a self-hosted site with a feed URL and a known version.
 * @complexity O(1); builds ports without calling them.
 */
export function bindSiteUpdateRuntime({ env, dbOps, ids, getJson, recordTargetTag }: SiteUpdateBindingRequired, optional: SelfHostedHostOptional = {}): SiteUpdateRuntime | null {
  const version = runningVersionFrom(env);
  if (env["TOVU_UPDATE_HOST"] !== "self-hosted" || version === null) return null;
  const healthUrl = env["TOVU_UPDATE_HEALTH_URL"]?.trim() ?? "";
  const { backup, readiness, data } = createRestorePointBackup({ dbOps });
  const host = createSelfHostedUpdateHost({
    runningTag: env["TOVU_IMAGE_TAG"]?.trim() || version, recordTargetTag,
    readHealth: async () => {
      if (healthUrl === "") return { ok: false };
      const body = await getJson({ url: healthUrl }) as { status?: unknown; version?: unknown } | null;
      return { ok: body?.status === "ok", version: typeof body?.version === "string" ? body.version : undefined };
    },
  }, { data, ...optional });
  return composeConfiguredSiteUpdateRuntime({ config: { feedUrl: env["TOVU_UPDATE_FEED_URL"] }, host, shared: { backup, readiness, ids, runningVersion: async () => version }, getJson });
}

/** JSON GET over the guarded outbound client: a non-2xx or non-JSON answer throws, so a check says "could not check". */
export function createHttpJsonGetter({ client }: { client: HttpClientPort }, _optional = {}): SiteUpdateBindingRequired["getJson"] {
  return async ({ url }, optional) => {
    const response = await client.send({ request: { url, method: "GET", headers: { accept: "application/vnd.github+json, application/json", "user-agent": "tovu-site-update" }, idleTimeoutMs: 10_000, ...(optional?.signal ? { signal: optional.signal } : {}) } });
    if (response.status < 200 || response.status >= 300) throw new Error(`The update server answered ${response.status}.`);
    return JSON.parse(response.bodyText) as unknown;
  };
}

/** Records the target tag as a one-line file the operator's deploy tooling reads; `directory` is the site's data folder. */
export function createTargetTagRecorder({ directory, writeFile }: { directory: string; writeFile: (path: string, text: string) => Promise<void> }, _optional = {}): SiteUpdateBindingRequired["recordTargetTag"] {
  return ({ tag }) => writeFile(`${directory}/update-target-tag`, `${tag}\n`);
}
