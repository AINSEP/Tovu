import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOVU_BUNDLED_AGENT_PLUGINS } from "../agent-plugin-catalog";
import {
  findBundledAgentPluginSourceFile,
  getBundledAgentPluginSourceFiles,
} from "../agent-plugin-source-catalog";

const PLUGIN_ROOT = path.resolve(process.cwd(), "src/features/plugins/bundled/ui-ux-design");
const SKILL_ROOT = path.join(PLUGIN_ROOT, "skills", "ui-ux-design");
const CANONICAL_SKILL_ROOT = path.resolve(process.cwd(), "../../AI-Dev-Shop/skills/ui-ux-design");
const ALLOWED_MANIFEST_FIELDS = new Set([
  "$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions",
]);

describe("ui-ux-design Agent Plugin package", () => {
  it("uses the closed v1.0.0 root manifest and intentionally omits MCP", () => {
    const manifest = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, "plugin.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(manifest.name).toBe("ui-ux-design");
    expect(manifest.version).toBe("1.1.0");
    expect(Object.keys(manifest).every((field) => ALLOWED_MANIFEST_FIELDS.has(field))).toBe(true);
    expect(existsSync(path.join(PLUGIN_ROOT, "mcp.json"))).toBe(false);
    expect(TOVU_BUNDLED_AGENT_PLUGINS[0]).toEqual(expect.objectContaining({
      id: manifest.name,
      version: manifest.version,
      skills: [{ name: "ui-ux-design", relativePath: "skills/ui-ux-design/SKILL.md" }],
    }));
  });

  it("discovers one conforming immediate skill and keeps every referenced file inside the plugin root", () => {
    const skillDirectories = readdirSync(path.join(PLUGIN_ROOT, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(PLUGIN_ROOT, "skills", entry.name, "SKILL.md")))
      .map((entry) => entry.name);
    expect(skillDirectories).toEqual(["ui-ux-design"]);

    const skill = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
    expect(skill).toMatch(/^---\nname: ui-ux-design\n/);
    const referenceNames = readdirSync(path.join(SKILL_ROOT, "references")).sort();
    expect(referenceNames).toHaveLength(12);
    for (const name of referenceNames) {
      expect(skill).toContain(name);
      const relativePath = path.join("references", name);
      const resolved = path.resolve(SKILL_ROOT, relativePath);
      expect(resolved.startsWith(`${PLUGIN_ROOT}${path.sep}`)).toBe(true);
      expect(existsSync(resolved)).toBe(true);
    }
  });

  it("preserves the complete updated in-repo skill source byte-for-byte", () => {
    const canonicalSkill = readFileSync(path.join(CANONICAL_SKILL_ROOT, "SKILL.md"), "utf8");
    const packagedSkill = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
    expect(packagedSkill).toBe(canonicalSkill);

    const referenceNames = readdirSync(path.join(CANONICAL_SKILL_ROOT, "references")).sort();
    expect(readdirSync(path.join(SKILL_ROOT, "references")).sort()).toEqual(referenceNames);
    for (const name of referenceNames) {
      expect(readFileSync(path.join(SKILL_ROOT, "references", name))).toEqual(
        readFileSync(path.join(CANONICAL_SKILL_ROOT, "references", name)),
      );
    }
  });

  it("exposes only the compile-time source allowlist and rejects unknown or traversal-like paths", () => {
    const sourceFiles = getBundledAgentPluginSourceFiles("ui-ux-design");
    expect(sourceFiles).toHaveLength(14);
    expect(sourceFiles.map((file) => file.relativePath)).toEqual(expect.arrayContaining([
      "plugin.json",
      "skills/ui-ux-design/SKILL.md",
      "skills/ui-ux-design/references/brand-and-voice.md",
      "skills/ui-ux-design/references/visual-storytelling.md",
    ]));

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
