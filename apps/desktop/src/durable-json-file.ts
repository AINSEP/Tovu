// Atomic replacement and token-owned locks live in Jini packages/platform/src/fs/durable-json.ts.
/** Host adapter for the existing synchronous stores and Tovu's corruption/lock notices. */
import {
  createDurableJsonFile,
  createNodeDurableJsonPorts,
  salvageJsonPrefix as recoverJsonPrefix,
} from "@jini-ai/platform/fs/durable-json";
import type { FileLockOptions, JsonFileRead, QuarantineNotice } from "@jini-ai/core/contracts/site/fs-durable-json";

/** Bind native effects and Tovu notices to one file. @complexity O(1). */
function desktopJsonFile({ filePath }: { filePath: string }, _optional = {}) {
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
function readJsonFile({ filePath }: { filePath: string }, _optional = {}): JsonFileRead {
  return desktopJsonFile({ filePath }).read({});
}

/** Preserve the stores' per-process temporary path contract. @complexity O(n) path length. */
function tempPathFor({ filePath }: { filePath: string }, { pid = process.pid }: { pid?: number } = {}): string {
  return desktopJsonFile({ filePath }).tempPath({}, { pid });
}

/** Fsync then replace; filesystem failures propagate. @complexity O(n) serialized bytes. */
function writeJsonFileAtomic({ filePath, value }: { filePath: string; value: unknown }, _optional = {}): void {
  desktopJsonFile({ filePath }).write({ value });
}

/** Preserve damaged bytes and report using Tovu wording. @complexity O(n) path length. */
function quarantineUnreadableFile({ filePath, notice }: { filePath: string; notice: QuarantineNotice }, _optional = {}): boolean {
  return desktopJsonFile({ filePath }).quarantine({ notice });
}

/** Keep synchronous store writes inside Jini's token-owned lock. @complexity O(waitMs / 10) lock attempts. */
// Multiple desktop windows are intentional; CLI and MCP bridge processes also edit shared lists.
// requestSingleInstanceLock would defeat that use. Lock shared read-modify-writes; instance-owned
// crash-recovery rows can use separate files, while atomic replacement alone suffices for readers.
function withFileLock<T>({ filePath, critical }: { filePath: string; critical: () => T }, options: FileLockOptions = {}): T {
  return desktopJsonFile({ filePath }).withLock({ critical }, options);
}

/** Preserve existing recovery call sites with the host's 1,000-attempt budget. @complexity O(n) scan plus bounded parses. */
function salvageJsonPrefix({ text }: { text: string }, _optional = {}): unknown {
  return recoverJsonPrefix({ text }, { maxAttempts: 1_000 });
}

export { desktopJsonFile, readJsonFile, tempPathFor, writeJsonFileAtomic, quarantineUnreadableFile, withFileLock, salvageJsonPrefix };
export type { FileLockOptions, JsonFileRead, QuarantineNotice };
