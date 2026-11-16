import type { checkpointProgress } from "@jini-ai/chat/core";

/**
 * @file Pure checkpoint rules of the run finalizer: how large a saved projection is, and whether
 * a run has produced progress worth another write. No clock, no timer, no storage.
 */

/** The last successfully saved progress of a watch (fields of its `Watch` record). */
export interface SavedCheckpointProgress {
  readonly checkpointedTextCharacters: number;
  readonly checkpointedExtensionEvents: number;
  readonly checkpointedTools: Set<string>;
}

/**
 * String characters in a JSON-shaped value: a cheap lower bound of its serialized size, measured
 * without serializing it (the point is to avoid another multi-MB string per checkpoint).
 * @complexity O(nodes) time, O(depth) stack.
 */
export function approximateJsonBytes({ value }: { value: unknown }, _optional = {}): number {
  if (typeof value === "string") return value.length;
  if (value === null || typeof value !== "object") return 1;
  let total = 0;
  for (const item of Array.isArray(value) ? value : Object.values(value)) total += approximateJsonBytes({ value: item });
  return total;
}

/** Compare live progress with a successful or attempted checkpoint, including replayed tool ids.
 * @returns Whether unsaved meaningful progress needs a write or trailing timer; no side effects.
 * @complexity O(tool identities) time and space for the comparison. */
export function checkpointGrew(
  { previous, progress }: { previous: ReturnType<typeof checkpointProgress>; progress: ReturnType<typeof checkpointProgress> },
  _options = {},
): boolean {
  return progress.textCharacters > previous.textCharacters ||
    progress.extensionEvents > previous.extensionEvents ||
    [...progress.tools].some((key) => !previous.tools.has(key));
}

/** Compare with the last successful save, so replay prefixes and unchanged rows need no retry.
 * @complexity O(tool identities) comparison; does not serialize or mutate progress. */
export function hasUnsavedCheckpointGrowth({ watch, progress }: { watch: SavedCheckpointProgress; progress: ReturnType<typeof checkpointProgress> }, _options = {}): boolean {
  return checkpointGrew({ progress, previous: {
    textCharacters: watch.checkpointedTextCharacters,
    extensionEvents: watch.checkpointedExtensionEvents,
    tools: watch.checkpointedTools,
  } });
}
