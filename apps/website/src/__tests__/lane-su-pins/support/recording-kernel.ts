import { type ContentKernel } from "#src/platform/db/content-kernel";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";

/**
 * @file The pins' kernel: the real migrated SQLite content kernel behind a thin wrapper that records
 * every `lockKey` literal in call order. The wrapper implements the kernel interface and delegates
 * every call, so transactions, locks and statements behave exactly as in production.
 */

export interface RecordingKernel {
  kernel: ContentKernel;
  /** Every `lockKey` literal, in call order. */
  keys: string[];
}

/** A fresh in-memory content database, wrapped so each `lockKey` call is recorded before it runs. */
export function recordingKernel(_optional: Record<string, never> = {}): RecordingKernel {
  const base = freshSqliteContentKernel();
  const keys: string[] = [];
  const kernel: ContentKernel = {
    ...base,
    lockKey: async (key: string) => {
      keys.push(key);
      await base.lockKey(key);
    },
  };
  return { kernel, keys };
}
