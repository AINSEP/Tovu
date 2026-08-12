import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOVU_BUNDLED_AGENT_PLUGINS } from "../agent-plugin-catalog";
import {
  findBundledAgentPluginSourceFile,
  getBundledAgentPluginSourceFiles,
} from "../agent-plugin-source-catalog";

// The real package Tovu now reads from -- no local fork to drift out of sync with. Matches
// `agent-plugin-source-catalog.ts`'s own glob root (see that file for why it's a relative path
// into the sibling checkout rather than the package's export map).
const PLUGIN_ROOT = path.resolve(
  process.cwd(),
  "../../../Jini/packages/plugins/samples/agent-plugins/ui-ux-design",
);
const SKILLS_ROOT = path.join(PLUGIN_ROOT, "skills");
const ALLOWED_MANIFEST_FIELDS = new Set([
  "$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions",
]);
// Jini's own package README documents this as the full 7-skill bundle (2026-08-12 consolidation).
// Listed here, rather than derived from disk, so a skill silently added or removed in Jini shows
// up as a failing assertion instead of a silently-passing test.
const EXPECTED_SKILLS = [
  "frontend-accessibility",
  "gstack-design",
  "interface-design",
  "shadcn-ui",
  "ui-ux-design",
  "vercel-web-design-guidelines",
  "web-compliance",
];

// 6 of the 7 skills carry Agent-Skills-style YAML frontmatter (`---\nname: <skill>\n...`);
// `web-compliance/SKILL.md` does not -- it opens straight into a `# Web Compliance` heading. That
// is a genuine gap in Jini's packaged content (found by writing this test, not introduced by it),
// not something this test should paper over by loosening the check for every skill. Named here so
// the exception is visible and this test still fails loudly if a DIFFERENT skill loses its
// frontmatter.
const SKILLS_WITHOUT_FRONTMATTER = new Set(["web-compliance"]);

/** Every file under `dir`, as paths relative to `root`, POSIX-separated for cross-platform diffs. */
function listFilesRelativeTo(dir: string, root: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
}

describe("ui-ux-design Agent Plugin package", () => {
  it("uses the closed v1.0.0 root manifest whose name matches the catalog entry", () => {
    const manifest = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, "plugin.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(manifest.name).toBe("ui-ux-design");
    expect(Object.keys(manifest).every((field) => ALLOWED_MANIFEST_FIELDS.has(field))).toBe(true);

    // The package's manifest describes the whole 7-skill bundle and carries no `version` field
    // (Jini's own choice, see packages/plugins/README.md) -- Tovu's card metadata is deliberately
    // its own hand-curated copy (displayName/version/description), not derived from this file, so
    // only `id` is cross-checked against the manifest here.
    expect(TOVU_BUNDLED_AGENT_PLUGINS[0]).toEqual(expect.objectContaining({ id: manifest.name }));
  });

  it("discovers exactly the 7 expected skills, each with a non-empty, name-matching SKILL.md", () => {
    const skillDirectories = readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(skillDirectories).toEqual([...EXPECTED_SKILLS].sort());

    for (const skillName of EXPECTED_SKILLS) {
      const skillMdPath = path.join(SKILLS_ROOT, skillName, "SKILL.md");
      expect(existsSync(skillMdPath)).toBe(true);
      const skillMd = readFileSync(skillMdPath, "utf8");
      expect(skillMd.length).toBeGreaterThan(0);
      if (SKILLS_WITHOUT_FRONTMATTER.has(skillName)) {
        continue;
      }
      // Every OTHER SKILL.md's frontmatter `name:` must match its own directory name -- catches a
      // skill packaged under the wrong directory, not just a missing one.
      expect(skillMd).toMatch(new RegExp(`^---\\nname: ${skillName}\\n`));
    }
  });

  it("exposes the full glob-built catalog for all 7 skills and rejects unknown or traversal-like paths", () => {
    const sourceFiles = getBundledAgentPluginSourceFiles("ui-ux-design");
    // Rooted at PLUGIN_ROOT (not SKILLS_ROOT) so the walk's own relative paths already carry the
    // "skills/..." prefix the catalog's relativePaths use -- no separate prefixing needed here.
    const onDiskSkillFiles = listFilesRelativeTo(SKILLS_ROOT, PLUGIN_ROOT);

    // Set equality against a live directory walk, not a hardcoded count: a catalog that silently
    // dropped one skill's references (team-lead's exact concern) still has the right *length* if
    // it also silently gained unrelated files, but it can never have the right *set*.
    expect(sourceFiles.map((file) => file.relativePath).sort()).toEqual(
      ["plugin.json", ...onDiskSkillFiles].sort(),
    );

    // Every expected skill is actually represented in the exposed set, not just present on disk.
    for (const skillName of EXPECTED_SKILLS) {
      expect(sourceFiles.some((file) => file.relativePath === `skills/${skillName}/SKILL.md`)).toBe(true);
    }

    for (const file of sourceFiles) {
      const resolved = path.resolve(PLUGIN_ROOT, file.relativePath);
      expect(resolved.startsWith(`${PLUGIN_ROOT}${path.sep}`)).toBe(true);
      expect(file.content).toBe(readFileSync(resolved, "utf8"));
    }

    expect(findBundledAgentPluginSourceFile(sourceFiles, "../../../../etc/passwd")).toBeNull();
    expect(findBundledAgentPluginSourceFile(sourceFiles, "skills/ui-ux-design/references/missing.md")).toBeNull();
    expect(getBundledAgentPluginSourceFiles("unknown.plugin")).toEqual([]);
  });
});
