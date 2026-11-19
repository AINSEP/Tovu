import { ThemeFileReadOnlyError, ThemeFileEditMatchError } from "./asset-operations.js";

import { resolve } from "node:path";
import { type DiscoveredTheme } from "./theme.js";


/** Editable manifest metadata must not turn a compiled release's generated files into source. */
export function assertCompiledWriteBoundaryUnchanged(
  { theme, relativePath, content }: { theme: DiscoveredTheme; relativePath: string; content: string },
  _optional = {}
): void {
  if (theme.manifest.build?.source !== "compiled" || resolve(theme.dir, relativePath) !== resolve(theme.dir, "theme.json")) return;
  let next: { build?: { source?: string; sourceDir?: string } } | null;
  try {
    next = JSON.parse(content);
  } catch {
    throw new ThemeFileReadOnlyError({ message: "a compiled release's write boundary is read-only and requires a valid theme.json" });
  }
  if (next?.build?.source !== "compiled" || next.build.sourceDir !== theme.manifest.build.sourceDir) {
    throw new ThemeFileReadOnlyError({ message: "build.source and build.sourceDir are read-only for a compiled release; rebuild the complete release instead" });
  }
}

/** How many times `needle` occurs in `haystack`, as a plain literal substring (never a regex) — the
 *  same counting trick `split(needle).length - 1` uses everywhere else a literal (not regex) count
 *  is wanted, avoiding any need to escape `needle` for a regex engine. */
export function countOccurrences({ haystack, needle }: { haystack: string; needle: string }, _optional = {}): number {
  return haystack.split(needle).length - 1;
}

/**
 * Apply `theme_edit_file`'s old-string/new-string replacement to `currentContent`, enforcing the
 * uniqueness contract described on {@link ThemeFileEditMatchError}: `oldString` must appear exactly
 * once unless `replaceAll` is set, in which case every occurrence changes. Ambiguity is refused
 * rather than guessed at — silently picking "the first match" on a multiply-occurring string would
 * risk changing the wrong one with no signal to the caller that anything was ambiguous.
 *
 * @complexity O(n) in the file's size, for the split/replace `oldString`/`newString` each perform.
 */
export function applyThemeFileEdit(
  { currentContent, edit, relativePath }: { currentContent: string; edit: { oldString: string; newString: string; replaceAll: boolean; intent?: "delete" }; relativePath: string },
  _optional: Record<string, never> = {},
): string {
  const nextContent = replaceThemeFileText({ currentContent, edit, relativePath });
  // An empty `newString` deletes text (allowed as is); only an edit that leaves NOTHING (empty or
  // whitespace-only) needs the explicit `intent: "delete"` — the one deletion a too-wide oldString
  // could do by accident, and a whole-file wipe is never what "remove this line" meant.
  if (nextContent.trim() === "" && edit.intent !== "delete") {
    throw new ThemeFileEditMatchError({ message: `this edit would leave '${relativePath}' empty; narrow oldString to the text to remove, or pass intent: 'delete' if emptying the whole file is really intended` });
  }
  return nextContent;
}

function replaceThemeFileText(
  { currentContent, edit, relativePath }: { currentContent: string; edit: { oldString: string; newString: string; replaceAll: boolean }; relativePath: string },
  _optional: Record<string, never> = {},
): string {
  const occurrences = countOccurrences({ haystack: currentContent, needle: edit.oldString });
  if (occurrences === 0) {
    throw new ThemeFileEditMatchError({ message: `oldString was not found in '${relativePath}' — read the file with theme_read_file and copy the exact text to replace, including whitespace` });
  }
  if (occurrences > 1 && !edit.replaceAll) {
    throw new ThemeFileEditMatchError({ message: `oldString matches ${occurrences} times in '${relativePath}'; pass more surrounding context in oldString to make it unique, or replaceAll: true to change every occurrence` });
  }
  return edit.replaceAll
    ? currentContent.split(edit.oldString).join(edit.newString)
    : currentContent.replace(edit.oldString, () => edit.newString);
}
