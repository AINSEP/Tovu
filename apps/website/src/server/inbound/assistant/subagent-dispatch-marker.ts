import { join } from "node:path";

/**
 * @file Decides whether an assistant run's prompt starts with the `<<SUBAGENT_DISPATCH>>` marker.
 *
 * WHY THE MARKER EXISTS: it is AGENTS.md's own documented signal (Mandatory Startup section, first
 * detection rule) for "skip the startup ceremony: this is a dispatched task, not an interactive
 * session". A CLI launched in a folder whose `AGENTS.md` asks for that ceremony would otherwise
 * spend its first turns on it before touching the owner's request.
 *
 * WHY IT IS CONDITIONAL (owner decision P10 G7-11): the marker is only meaningful where such an
 * `AGENTS.md` exists. In an ordinary site folder there is no ceremony to skip, and an unexplained
 * developer marker on the first line of every prompt is noise the model can echo back to the owner.
 *
 * Pure: the file check is injected, so this module holds no filesystem handle and tests need no disk.
 */

/** AGENTS.md's documented dispatch marker. It only works as the prompt's first line. */
export const SUBAGENT_DISPATCH_MARKER = "<<SUBAGENT_DISPATCH>>";

/** Files, relative to the site folder, that carry the startup ceremony: the folder's own `AGENTS.md`
 *  or a vendored AI Dev Shop toolkit's. Only the site folder is checked, never its ancestors. */
const STARTUP_CEREMONY_FILES: readonly string[] = ["AGENTS.md", join("AI-Dev-Shop", "AGENTS.md")];

/**
 * True when `siteDir` holds an `AGENTS.md` that would start the AI Dev Shop ceremony.
 *
 * @complexity O(1): at most two injected existence checks.
 */
export function shouldPrefixSubagentDispatch(
  { siteDir, fileExists }: { siteDir: string; fileExists: (path: string) => boolean },
  _optional: Record<string, never> = {},
): boolean {
  return STARTUP_CEREMONY_FILES.some((file) => fileExists(join(siteDir, file)));
}

/**
 * The text to put before a run prompt: the marker and a blank line, or `""` when the site folder
 * has no ceremony to skip, which leaves the prompt exactly as assembled.
 *
 * @complexity O(1).
 */
export function subagentDispatchPrefix(
  { siteDir, fileExists }: { siteDir: string; fileExists: (path: string) => boolean },
  _optional: Record<string, never> = {},
): string {
  return shouldPrefixSubagentDispatch({ siteDir, fileExists }) ? `${SUBAGENT_DISPATCH_MARKER}\n\n` : "";
}
