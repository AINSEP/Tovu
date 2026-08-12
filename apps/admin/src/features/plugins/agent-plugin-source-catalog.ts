// The manifest is one fixed, well-known filename every Agent Plugin has -- unlike the skill tree
// below, its existence isn't something that grows over time, so a plain static import is enough;
// it still reflects the file's current content on every rebuild.
import pluginManifestSource from "../../../../../../Jini/packages/plugins/samples/agent-plugins/ui-ux-design/plugin.json?raw";

export interface BundledAgentPluginSourceFile {
  readonly relativePath: string;
  readonly content: string;
}

/**
 * Every file under the `ui-ux-design` plugin's `skills/` tree, resolved and inlined at build
 * time by `import.meta.glob`.
 *
 * `eager: true` makes Vite inline each matched file's content into the built bundle the same way
 * a static `import "...?raw"` does -- there is no runtime `fetch`, dynamic `import()`, or
 * filesystem call a click can trigger, so `AgentPluginDetailsModal` selecting a row is still a
 * pure lookup over a fixed set of strings baked into the JS, never an arbitrary file read. What
 * this trades away, on purpose (owner decision, 2026-08-12), is the review gate the previous
 * explicit-per-file import list also gave for free: a file newly added under
 * `samples/agent-plugins/ui-ux-design/skills/` in Jini now appears here on Tovu's next build with
 * no Tovu-side edit required. That auto-sync is the actual point of this cutover -- Tovu stops
 * carrying a hand-maintained, driftable subset of what Jini ships. If a curated/reviewed subset
 * is ever needed again, go back to one `import ... from "...?raw"` line per file (see git history
 * before this change for that shape).
 *
 * The pattern reaches into the sibling Jini checkout by relative path rather than through the
 * package's `@jini-ai/plugins/samples/*` export: `import.meta.glob` patterns must start with `./`
 * or `/` (a bare package specifier is a hard compile-time error -- confirmed against this exact
 * specifier, "Invalid glob ... It must start with '/' or './'"), and a
 * `/node_modules/@jini-ai/plugins/...` pattern works too but would couple this file to
 * node_modules' physical layout instead of to something already documented. `vite.config.ts` and
 * `vitest.config.ts` already reference this sibling checkout the same way, in their
 * `server.fs.allow` entries, as part of ADR-049 Decision 7's temporary `file:`-link state -- this
 * mirrors that existing, already-audited assumption rather than introducing a second one.
 */
const skillFileModules = import.meta.glob<string>(
  "../../../../../../Jini/packages/plugins/samples/agent-plugins/ui-ux-design/skills/**/*",
  { query: "?raw", import: "default", eager: true },
);

/** The glob's own path prefix, ahead of the `skills/...` suffix every displayed path keeps. */
const SKILLS_SEGMENT = "/skills/";

/**
 * Strips the glob's absolute-ish module key down to the `skills/...` suffix `relativePath`s use
 * elsewhere in this module (matching the pre-glob explicit list's convention).
 *
 * @param moduleKey - A key from `skillFileModules`, e.g.
 *   `"../../../../../../Jini/packages/plugins/samples/agent-plugins/ui-ux-design/skills/shadcn-ui/SKILL.md"`.
 * @returns The plugin-root-relative path, e.g. `"skills/shadcn-ui/SKILL.md"`.
 * @throws If a key doesn't contain `/skills/` -- every key the glob above can produce does, by
 *   construction (the glob is rooted at `.../ui-ux-design/skills/**`), so this only fires if a
 *   future edit changes the glob's root without updating this function to match.
 * @complexity O(n) in the length of `moduleKey` (a single `indexOf` scan).
 */
function toSkillRelativePath(moduleKey: string): string {
  const index = moduleKey.indexOf(SKILLS_SEGMENT);
  if (index === -1) {
    throw new Error(`Agent plugin source module key missing an expected "/skills/" segment: ${moduleKey}`);
  }
  return `skills/${moduleKey.slice(index + SKILLS_SEGMENT.length)}`;
}

/**
 * Compile-time inventory of package files that Tovu is allowed to display: the plugin manifest
 * plus every file across all 7 bundled skills, sorted for a stable, predictable row order
 * independent of the glob's own (unspecified) result order.
 */
export const UI_UX_DESIGN_SOURCE_FILES: readonly BundledAgentPluginSourceFile[] = [
  { relativePath: "plugin.json", content: pluginManifestSource },
  ...Object.entries(skillFileModules)
    .map(([moduleKey, content]) => ({ relativePath: toSkillRelativePath(moduleKey), content }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
];

/** Closed lookup: unknown plugin ids expose no files and trigger no IO. */
export function getBundledAgentPluginSourceFiles(pluginId: string): readonly BundledAgentPluginSourceFile[] {
  return pluginId === "ui-ux-design" ? UI_UX_DESIGN_SOURCE_FILES : [];
}

/** Exact allowlist lookup: traversal-like or otherwise unknown paths never resolve. */
export function findBundledAgentPluginSourceFile(
  files: readonly BundledAgentPluginSourceFile[],
  relativePath: string,
): BundledAgentPluginSourceFile | null {
  return files.find((file) => file.relativePath === relativePath) ?? null;
}
