// Atomic replacement and token-owned locks live in Jini packages/platform/src/fs/durable-json.ts.
/** Host adapter for the existing synchronous stores and Tovu's corruption/lock notices. */
import {
  createDurableJsonFile,
  createNodeDurableJsonPorts,
  salvageJsonPrefix as recoverJsonPrefix,
} from "@jini-ai/platform/fs/durable-json";
import type { FileLockOptions, JsonFileRead, QuarantineNotice } from "@jini-ai/platform/fs/durable-json";

/** Bind native effects and Tovu notices to one file. @complexity O(1). */
function fileAt(filePath: string) {
  return createDurableJsonFile({
    filePath,
    ...createNodeDurableJsonPorts({}),
    notices: {
      prefix: "tovu desktop",
      lockTimeout: ({ lockPath, waitMs }) => `tovu desktop: ${lockPath} is still held by another Tovu process after ${waitMs}ms, so this change was not saved. Nothing was written over. Try again, or quit the other Tovu window.`,
    },
  });
}

/** Read without folding corrupt content into missing state. @complexity O(n) file bytes. */
function readJsonFile(filePath: string): JsonFileRead {
  return fileAt(filePath).read({});
}

/** Preserve the stores' per-process temporary path contract. @complexity O(n) path length. */
function tempPathFor(filePath: string, pid: number = process.pid): string {
  return fileAt(filePath).tempPath({}, { pid });
}

/** Fsync then replace; filesystem failures propagate. @complexity O(n) serialized bytes. */
function writeJsonFileAtomic(filePath: string, value: unknown): void {
  fileAt(filePath).write({ value });
}

/** Preserve damaged bytes and report using Tovu wording. @complexity O(n) path length. */
function quarantineUnreadableFile(filePath: string, notice: QuarantineNotice): boolean {
  return fileAt(filePath).quarantine({ notice });
}

/** Keep synchronous store writes inside Jini's token-owned lock. @complexity O(waitMs / 10) lock attempts. */
// Multiple desktop windows are intentional; CLI and MCP bridge processes also edit shared lists.
// requestSingleInstanceLock would defeat that use. Lock shared read-modify-writes; instance-owned
// crash-recovery rows can use separate files, while atomic replacement alone suffices for readers.
function withFileLock<T>(filePath: string, critical: () => T, options: FileLockOptions = {}): T {
  return fileAt(filePath).withLock({ critical }, options);
}

/** Preserve existing recovery call sites with the host's 1,000-attempt budget. @complexity O(n) scan plus bounded parses. */
function salvageJsonPrefix(text: string): unknown {
  return recoverJsonPrefix({ text }, { maxAttempts: 1_000 });
}

export { readJsonFile, tempPathFor, writeJsonFileAtomic, quarantineUnreadableFile, withFileLock, salvageJsonPrefix };
export type { FileLockOptions, JsonFileRead, QuarantineNotice };
