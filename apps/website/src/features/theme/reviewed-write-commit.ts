import { AsyncLocalStorage } from 'node:async_hooks';
import { ToolInputError } from '@jini-ai/core';

/** What a tool reviewed before it asked the persistence owner to write: the file and the SHA-256 it had then. */
export type ReviewedThemeFile = {
  file: { themeDir: string; themesRoot: string; relativePath: string };
  target: string;
  version: string | null;
};

/** The reviewed file, and the version the write inside this scope committed (set once its rename succeeded). */
export type ReviewedWriteScope = { prepared: ReviewedThemeFile; committed: string | undefined };

const reviewedThemeWrite = new AsyncLocalStorage<ReviewedWriteScope>();

/** The scope the current write runs in, when a tool opened one. */
export const reviewedWriteScope = (_required: Record<string, never> = {}): ReviewedWriteScope | undefined => reviewedThemeWrite.getStore();

/** Carry a tool's reviewed destination through asynchronous source reads to every theme writer.
 * Async-local scope keeps concurrent imports isolated without putting trusted state in tool input.
 * @returns The original handler's result and the version the write itself committed (`undefined` when it wrote
 * nothing). A stale destination fails before persistence. The committed version is what a batch pins its next item
 * to: it comes from the write, never from reading the file again, which would adopt a foreign writer's bytes.
 * @complexity O(1) scope setup; the commit compares O(destination bytes).
 */
export async function runReviewedThemeFileWrite<T>(
  { prepared, run }: { prepared: ReviewedThemeFile; run: () => Promise<T> },
  _options = {},
): Promise<{ result: T; committedVersion: string | undefined }> {
  const scope: ReviewedWriteScope = { prepared, committed: undefined };
  const result = await reviewedThemeWrite.run(scope, run);
  return { result, committedVersion: scope.committed };
}

/** The one sentence for a theme file that changed after the tool read it. It says what to do (read again, retry) and that
 * nothing was written; it is its own error type so it is shown as written, never with a "fix the input" note, because
 * a different input would not help. */
export const THEME_FILE_CHANGED_MESSAGE = 'This theme file changed after it was read. Read it again and retry; this change was not applied.';

export class ThemeFileChangedError extends ToolInputError {
  constructor(_required: Record<string, never> = {}) {
    super({ message: THEME_FILE_CHANGED_MESSAGE });
    this.name = 'ThemeFileChangedError';
  }
}
