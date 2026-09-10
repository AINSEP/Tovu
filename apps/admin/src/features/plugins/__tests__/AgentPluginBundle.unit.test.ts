import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findBundledAgentPluginSourceFile,
  getBundledAgentPluginSourceFiles,
} from "../agent-plugin-source-catalog";

// Tovu's own vendored copy, not a live read of the sibling Jini checkout: a relative path out to
// `../../../Jini/...` only resolved on a machine that happens to have that checkout next to this
// one, which broke the very first standalone build (see `agent-plugin-source-catalog.ts`'s own
// header for the incident and the regeneration procedure). Resolved from this file's own location
// (not `process.cwd()`, which only equals `apps/admin` when Vitest happens to be invoked from
// there) so this test passes regardless of the runner's working directory.
const PLUGIN_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "bundled",
  "ui-ux-design",
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
    // (Jini's own choice, see packages/agent-plugins/README.md). `getBundledAgentPluginSourceFiles`
    // below is keyed off this same literal id ("ui-ux-design"), which is what actually makes this
    // vendored copy reachable from the inspector — there is no longer a separate hand-curated
    // catalog entry to cross-check against (`TOVU_BUNDLED_AGENT_PLUGINS` was removed 2026-09-09:
    // `ui-ux-design` is not a real installed Agent Plugin — see `agent-plugin-source-catalog.ts`'s
    // own header).
    expect(getBundledAgentPluginSourceFiles(manifest.name as string).length).toBeGreaterThan(0);
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

  it("exposes the full catalog for all 7 skills, including non-.md files, and rejects unknown or traversal-like paths", () => {
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

    // The catalog must not silently narrow to markdown -- shadcn-ui ships 3 .tsx examples and 1
    // .sh script alongside its .md files, and a browser that dropped them would misrepresent what
    // the plugin actually ships.
    const nonMarkdownRelativePaths = [
      "skills/shadcn-ui/examples/auth-layout.tsx",
      "skills/shadcn-ui/examples/data-table.tsx",
      "skills/shadcn-ui/examples/form-pattern.tsx",
      "skills/shadcn-ui/scripts/verify-setup.sh",
    ];
    for (const relativePath of nonMarkdownRelativePaths) {
      expect(sourceFiles.some((file) => file.relativePath === relativePath)).toBe(true);
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

// Unlike `ui-ux-design` above, `site-compliance` is a real, executable Agent Plugin: it lives at
// this repo's own `content/agent-plugins/site-compliance/` (not a separate checkout like Jini), is
// walked by `seedBundledAgentPlugins()` on the server, and is installed-and-activated for every
// site (see `sites/tovu-com/agent-plugins/ws/workspace-local/activations.json`, `enabled: true`).
// Because it never needed a portability workaround, this reads it directly rather than through a
// second vendored copy -- one source of truth, no drift risk between what ships and what the
// inspector shows. Resolved from this file's own location for the same cwd-independence reason
// `PLUGIN_ROOT` above is.
const SITE_COMPLIANCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "content",
  "agent-plugins",
  "site-compliance",
);
const SITE_COMPLIANCE_SKILLS_ROOT = path.join(SITE_COMPLIANCE_ROOT, "skills");

describe("site-compliance Agent Plugin package", () => {
  it("uses a manifest whose name matches the catalog entry and is actually reachable from the inspector", () => {
    const manifest = JSON.parse(readFileSync(path.join(SITE_COMPLIANCE_ROOT, "plugin.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest.name).toBe("site-compliance");

    // The bug this test was written to catch: `getBundledAgentPluginSourceFiles` returning `[]` for
    // a real, installed, enabled plugin because the compile-time catalog never listed it.
    expect(getBundledAgentPluginSourceFiles(manifest.name as string).length).toBeGreaterThan(0);
  });

  it("exposes the full on-disk file set, with matching content, and rejects unknown or traversal-like paths", () => {
    const sourceFiles = getBundledAgentPluginSourceFiles("site-compliance");
    const onDiskSkillFiles = listFilesRelativeTo(SITE_COMPLIANCE_SKILLS_ROOT, SITE_COMPLIANCE_ROOT);

    // Set equality against a live directory walk, not a hardcoded list -- a catalog entry that
    // silently dropped a reference file still has the wrong *set* even if some other file offsets
    // the count.
    expect(sourceFiles.map((file) => file.relativePath).sort()).toEqual(
      ["plugin.json", "mcp.json", ...onDiskSkillFiles].sort(),
    );

    for (const file of sourceFiles) {
      const resolved = path.resolve(SITE_COMPLIANCE_ROOT, file.relativePath);
      expect(resolved.startsWith(`${SITE_COMPLIANCE_ROOT}${path.sep}`)).toBe(true);
      expect(file.content).toBe(readFileSync(resolved, "utf8"));
    }

    expect(findBundledAgentPluginSourceFile(sourceFiles, "../../../../etc/passwd")).toBeNull();
    expect(findBundledAgentPluginSourceFile(sourceFiles, "skills/site-compliance/references/missing.md")).toBeNull();
  });
});
