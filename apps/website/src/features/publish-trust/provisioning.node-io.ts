/**
 * @file Zero-setup publishing auth — the real filesystem behind {@link ProvisioningFileIo}.
 *
 * The one place this feature touches a disk. Kept apart from `provisioning.ts` so the port, the
 * codecs and every merge rule stay testable with an in-memory map, and so nothing that runs on the
 * destination at boot drags `node:fs` in behind it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ProvisioningFileIo } from "./provisioning.js";

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

  async write(path: string, contents: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, "utf8");
  },
};
