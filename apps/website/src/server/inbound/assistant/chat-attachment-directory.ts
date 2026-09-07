import path from "node:path";

import { defaultContentDbPath } from "../../runtime/composition/deps.js";

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
 * `dirname(defaultContentDbPath())` — the same directory the daemon's own `content.db` connection
 * resolves against, which is the strongest "this process agrees where the site's home is" signal
 * available without adding a resolution path neither process already has. It is deliberately NOT
 * `process.cwd()`-relative the way `mediaUploadsDir()` is: the daemon is a `spawn()` child of
 * `src/index.ts` and inherits whatever cwd THAT process happened to have.
 *
 * Residual, disclosed rather than assumed safe: `defaultContentDbPath()` reads `TOVU_CONTENT_DB`
 * and `siteDir()`, so the two processes agree only while they see the same environment. The daemon
 * is spawned as a child of the API today, so it inherits that environment — but nothing asserts it,
 * and an operator who needs a guaranteed location should set `TOVU_CHAT_ATTACHMENTS_DIR`
 * explicitly, same as `TOVU_CONTENT_DB`/`TOVU_MEDIA_UPLOADS_DIR`.
 */
export function resolveChatAttachmentUploadDirectory(): string {
  return (
    process.env.TOVU_CHAT_ATTACHMENTS_DIR
    ?? path.join(path.dirname(defaultContentDbPath()), "uploads", "chat-attachments")
  );
}
