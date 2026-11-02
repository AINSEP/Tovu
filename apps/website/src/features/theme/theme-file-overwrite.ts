import { readFileSync, statSync } from "node:fs";

import type { HumanConfirmSpec } from "#src/contracts/core/human-confirm";

import { trashDestinationFor } from "./file-identity-lock.js";
import { copyThemeFile, listThemeFiles, resolveThemeFilePath, resolveThemeFileWriteScope, ThemePathError } from "./theme-files.js";
import type { DiscoveredTheme } from "./theme.js";

/**
 * @file `theme_write_file`'s overwrite guard (owner decision 2026-11-02, YC demo): the chat rebuilt
 * an existing theme IN PLACE — `theme.css` replaced by a placeholder mid-run — with no card and no
 * way back. Two rules close it at the tool, for every agent CLI, since all of them reach the same
 * handler:
 *
 * 1. Replacing an existing file's bytes asks first, on the same held-open confirmation card every
 *    other confirmed tool uses (`approvalToolHandler`). Creating a NEW file does not ask — building a
 *    theme from nothing, or adding files to a fresh `theme_duplicate` copy, stays unattended.
 * 2. Before the bytes are replaced, the current file is kept as a revision in the theme's own
 *    `.trash/<epoch-ms>/<path>` — the existing, reversible soft-delete store `theme_trash_file`
 *    writes, `theme_list_files({ includeTrash: true })` lists, `theme_read_file` reads and the admin
 *    Explore screen shows. No second revision store is invented: there was no theme-file history
 *    (`agent-tools.ts`'s header), and the trash already holds restorable bytes per file.
 */

/** What the card is drawn from and what the write re-checks: frozen before the human is asked. */
export interface PreparedThemeFileWrite {
  readonly theme: DiscoveredTheme;
  readonly relativePath: string;
  readonly content: string;
  /** Whether a file with DIFFERENT bytes is at `relativePath` now (an identical rewrite changes nothing). */
  readonly overwrite: boolean;
  /** Whether the current bytes can be kept as a revision (a built theme's `.trash/` is read-only). */
  readonly revisionKeepable: boolean;
  readonly previousBytes: number;
}

/** The current bytes at `relativePath`, or `null` when no regular file is there. A directory or an
 *  unreadable link is left to `writeThemeFile`, whose own refusal names it. @complexity O(b) read. */
function currentBytes({ target }: { target: string }, _optional: Record<string, never> = {}): Buffer | null {
  try {
    return statSync(target).isFile() ? readFileSync(target) : null;
  } catch {
    return null;
  }
}

/**
 * Freezes one write before its card: is it an overwrite, and can a revision be kept.
 * Runs after the handler's own permission and writability refusals; performs no writes.
 * @throws {ThemePathError} On a containment failure (the same refusal the write itself makes).
 * @complexity O(b) in the existing file's size.
 */
export function prepareThemeFileWrite(
  required: { theme: DiscoveredTheme; themesRoot: string; relativePath: string; content: string },
  _optional: Record<string, never> = {},
): PreparedThemeFileWrite {
  const { theme, themesRoot, relativePath, content } = required;
  const existing = currentBytes({ target: resolveThemeFilePath({ themeDir: theme.dir, themesRoot, relativePath }) });
  const overwrite = existing !== null && !existing.equals(Buffer.from(content, "utf8"));
  const revisionScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: trashDestinationFor(relativePath) });
  return { theme, relativePath, content, overwrite, revisionKeepable: revisionScope.kind !== "generated-readonly", previousBytes: existing?.length ?? 0 };
}

/**
 * The card for one overwrite: which theme, which file, sizes, and where the old bytes go.
 * @complexity O(1).
 */
export function describeThemeFileOverwrite(prepared: PreparedThemeFileWrite, _optional: Record<string, never> = {}): HumanConfirmSpec {
  const { theme, relativePath, content, revisionKeepable, previousBytes } = prepared;
  return {
    toolId: "theme_write_file", errorCode: "THEME_WRITE",
    title: `Replace ${relativePath} in the ${theme.manifest.name} theme?`,
    description: "The assistant wants to replace this existing theme file with new content.",
    details: [
      { label: "Theme", value: `${theme.manifest.name} (${theme.manifest.id})` },
      { label: "File", value: relativePath },
      { label: "Current size", value: `${previousBytes} bytes` },
      { label: "New size", value: `${Buffer.byteLength(content, "utf8")} bytes` },
    ],
    warning: revisionKeepable
      ? "The current file is kept in this theme's trash, so it can be restored."
      : "This theme is a built release, so the current file cannot be kept. There is no undo.",
    danger: true,
    confirmLabel: "Replace file",
  };
}

/**
 * Re-checks the frozen decision just before writing: a file that appeared, vanished or changed
 * since the card would make the human's answer (or the lack of a question) about something else.
 * @throws {ThemePathError} When the overwrite state differs from the prepared one; nothing is written.
 * @complexity O(b) in the existing file's size.
 */
export function assertThemeFileWriteUnchanged(
  required: { prepared: PreparedThemeFileWrite; themesRoot: string },
  _optional: Record<string, never> = {},
): void {
  const { prepared, themesRoot } = required;
  const now = prepareThemeFileWrite({ theme: prepared.theme, themesRoot, relativePath: prepared.relativePath, content: prepared.content });
  if (now.overwrite !== prepared.overwrite || now.previousBytes !== prepared.previousBytes) {
    throw new ThemePathError(`'${prepared.relativePath}' changed on disk since this write was prepared — nothing was written; read it again and retry`);
  }
}

/**
 * Keeps the current bytes of an about-to-be-replaced file as `.trash/<epoch-ms>/<path>` (a copy:
 * the live file stays until the write's own atomic rename replaces it).
 * @returns The revision's theme-relative path, or `null` when no revision applies (not an
 *   overwrite, or a built theme with no writable trash).
 * @complexity O(n + b) for n listed theme files and b copied bytes.
 */
export function keepThemeFileRevision(
  required: { prepared: PreparedThemeFileWrite; themesRoot: string },
  _optional: Record<string, never> = {},
): string | null {
  const { prepared, themesRoot } = required;
  if (!prepared.overwrite || !prepared.revisionKeepable) return null;
  const themeDir = prepared.theme.dir;
  const existingPaths = new Set(listThemeFiles({ themeDir, themesRoot }));
  const revisionPath = trashDestinationFor(prepared.relativePath, existingPaths);
  copyThemeFile({ themeDir, themesRoot, sourcePath: prepared.relativePath, destPath: revisionPath });
  return revisionPath;
}
