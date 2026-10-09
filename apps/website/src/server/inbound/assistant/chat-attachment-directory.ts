import path from "node:path";

/**
 * @file The ONE definition of where staged chat-attachment bytes live.
 *
 * Two processes need this path and they must not be able to disagree about it: the agent daemon
 * (`agent-daemon-server.ts`), which owns the directory and writes into it via
 * `createDiskAttachmentStore`, and the API (`composition/modules/assistant.ts`'s read-back route),
 * which reads the store's sidecar records back out of it. It was a module-scope `const` in the
 * daemon before this file existed; a second copy of the expression in the API would be the exact
 * "two call sites, one drifts" defect this repo keeps hitting, so there is one function instead.
 *
 * The resolution itself is unchanged from that original constant, including its residual risk.
 * `TOVU_CHAT_ATTACHMENTS_DIR` wins outright. Otherwise the path is anchored to
 * `dirname(contentDbPath)` — the same directory the daemon's own `content.db` connection
 * resolves against, which is the strongest "this process agrees where the site's home is" signal
 * available without adding a resolution path neither process already has. It is deliberately NOT
 * `process.cwd()`-relative the way `mediaUploadsDir()` is: the daemon is a `spawn()` child of
 * `src/index.ts` and inherits whatever cwd THAT process happened to have.
 *
 * Residual, disclosed rather than assumed safe: the two processes agree only while they are handed
 * the same `content.db` path. The daemon is spawned as a child of the API with that API's own site
 * pinned (`daemon-supervisor.ts`'s `buildDaemonSpawnEnvOverrides`), so its `defaultContentDbPath()`
 * lands on the same file — but nothing asserts it, and an operator who needs a guaranteed location
 * should set `TOVU_CHAT_ATTACHMENTS_DIR` explicitly, same as `TOVU_CONTENT_DB`/`TOVU_MEDIA_UPLOADS_DIR`.
 *
 * Pure since 2026-10-08 (hardwiring audit #19): it used to call `defaultContentDbPath()` itself, so
 * every caller — including the API's read-back route — resolved the env/cwd site (`TOVU_CONTENT_DB`
 * ?? `siteDir()`) rather than the site the process actually booted, which differ for any composition
 * that does not also pin `TOVU_SITE_DIR` (`deps.ts`'s `SitePathResolverOptional` doc). The
 * composition roots now resolve it ONCE from their booted content DB path into
 * `RouteDeps.siteStoragePaths.chatAttachmentsDir`, and every consumer reads that.
 *
 * @param required.contentDbPath the booted site's `content.db` path; its directory anchors the fallback.
 * @param optional.env defaults to `process.env`; injectable so the override is testable without
 *   mutating the runner's environment.
 * @complexity O(1).
 */
export function resolveChatAttachmentUploadDirectory(
  required: { contentDbPath: string },
  optional: { env?: NodeJS.ProcessEnv } = {},
): string {
  const env = optional.env ?? process.env;
  return env.TOVU_CHAT_ATTACHMENTS_DIR ?? path.join(path.dirname(required.contentDbPath), "uploads", "chat-attachments");
}
