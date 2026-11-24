import { deriveDuplicateName as deriveJiniDuplicateName } from "@jini-ai/cms/content-duplication/derive-available-name";

/**
 * @file Tovu's copy-naming policy for `content_duplicate`'s DEFAULT copy name, bound once for the post/page,
 * form and media duplicate paths. Owner ruling (2026-09-08): a copy is the source's name plus a plain
 * space-separated number (`Landing sample — xai` -> `Landing sample — xai 2`), never `Copy of ...`, which
 * produces `Copy of Copy of X` on a second copy and is untranslatable.
 */

/** The owner's suffix style: a plain space then the number. @complexity O(1). */
function withCopySuffix({ base, suffix }: { base: string; suffix: number }, _optional: Record<string, never> = {}): string {
  return `${base} ${suffix}`;
}

/** The exhaustion wording shown to the agent. @complexity O(1). */
function copyExhaustionMessage({ base, maxAttempts }: { base: string; maxAttempts: number }, _optional: Record<string, never> = {}): string {
  return `no free name could be derived from '${base}' after ${maxAttempts} attempts — give the copy an explicit name`;
}

/** Jini's numbered-copy name search with Tovu's suffix style and wording injected. @complexity as `deriveDuplicateName`. */
export function deriveDuplicateName(
  required: { sourceName: string },
  options: { isTaken: (required: { candidate: string }, optional?: Record<string, never>) => Promise<boolean> },
): Promise<string> {
  return deriveJiniDuplicateName(required, { ...options, withSuffix: withCopySuffix, exhaustionMessage: copyExhaustionMessage });
}
