/**
 * @file Zero-setup publishing auth — the real filesystem behind {@link ProvisioningFileIo}.
 *
 * The one place this feature touches a disk. Kept apart from `provisioning.ts` so the port, the
 * codecs and every merge rule stay testable with an in-memory map, and so nothing that runs on the
 * destination at boot drags `node:fs` in behind it.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ProvisioningFileIo } from "./provisioning.js";

/**
 * The absolute base every repo-relative committed-config path (`PUBLISH_TRUST_CONFIG_PATH`,
 * `DEPLOY_CONFIG_CANDIDATE_PATHS`) resolves against.
 *
 * `process.cwd()` IS the repo root for the two cases this feature was originally built against: a
 * plain `tovu serve` run from the repo root, and the deployed container, whose `Dockerfile` sets
 * `WORKDIR` to the repo root before `COPY . .`. It is NOT the repo root for the desktop shell,
 * which launches its own site server from wherever opened Electron (`apps/desktop/src/tovu-
 * server.ts`'s `buildServeEnv` doc) — the same class of gap that variable's sibling
 * `TOVU_SITE_DIR` closes for the site directory. `TOVU_REPO_ROOT` closes it here: the desktop shell
 * sets it to the repo root it already resolved for itself, unless an operator pinned one first
 * (same "operator wins" rule `buildServeEnv` applies to every variable it sets conditionally).
 *
 * Deliberately NOT `import.meta.dirname`-relative arithmetic, unlike this repo's other REPO_ROOT
 * constants (`app.ts`, `deps.ts`, `secret-scan-guard.ts`): those tolerate being wrong in a compiled
 * build because what they feed is either overridden by its own explicit env var in production
 * (`TOVU_ADMIN_DIST`/`TOVU_SITE_CHAT_DIST`, see `Dockerfile`) or fails open into a harmless dev-only
 * fallback (dev TLS). A wrong root here is not harmless: it is silently the wrong committed-config
 * file, in production, on every boot's grant read — the exact bug class this function fixes, one
 * layer up. `Dockerfile`'s own comment on `TOVU_ADMIN_DIST` documents the fixed-`..`-count trap this
 * sidesteps: the compiled layout is one level shallower (`dist/src/...`) than the source tree
 * (`apps/website/src/...`), so a distance hardcoded for one is wrong for the other.
 *
 * @param env Defaults to `process.env`; callers that already thread `env` through for
 * `PUBLISH_TRUST_ENV_VAR` (`publish-trust-grants.ts`) pass the same object rather than triggering a
 * second hidden global read.
 * @complexity O(1).
 */
export function resolveCommittedConfigRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.TOVU_REPO_ROOT || process.cwd();
}

/**
 * Reads and writes provisioning config files on the local filesystem.
 *
 * A missing file reads as `null` rather than throwing: "this repo has never provisioned" is an
 * ordinary state, and the empty state has to be a sentence, not a stack trace. Every other read
 * error still throws — an unreadable-but-present config is a real problem and must not be silently
 * reported as "not connected", which would invite provisioning to overwrite it.
 *
 * @complexity O(n) in the file size per call.
 */
export const nodeProvisioningFileIo: ProvisioningFileIo = {
  async read(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },

  /**
   * Writes through a temporary file and one `rename`, so a reader never sees a half-written
   * document. This matters most for `revocations.ts`, which the RUNNING server writes while
   * requests are being admitted against it: a torn read there parses as a broken list, and a broken
   * revocation list correctly refuses every publish — so a non-atomic write would turn one
   * disconnect click into a brief outage of publishing.
   *
   * `rename` within a directory is atomic on every filesystem Tovu deploys onto, which is why the
   * temporary file is placed beside the target rather than in a temp dir on another device.
   */
  async write(path: string, contents: string): Promise<void> {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true });
    const staging = `${path}.${process.pid}.tmp`;
    await writeFile(staging, contents, "utf8");
    await rename(staging, path);
  },
};
