import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolRegistry, type ToolExecutionContext } from "@jini-ai/core";

import {
  buildSkillToolRegistrations,
  loadInstalledSkillToolSources,
  registerInstalledSkillTools,
  skillToolDerivedRisk,
} from "../../tool-registrations.js";

/**
 * @file The tool-registration path for standalone Agent Skills — registers each installed skill
 * FOLDER as one real `ToolRegistration` (id/description/schema/handler). See `tool-registrations.ts`'s
 * own header for the full design and why this is deliberately simpler than, and independent from,
 * `agent-plugins/tool-registrations.ts` (one skill IS one tool here — no combined description across
 * several skills, no `skill` argument to pick among siblings).
 *
 * This file proves:
 * 1. each installed skill folder produces exactly one tool id, `skill_<sanitized name>`, with the
 *    description equal to the frontmatter `description` VERBATIM.
 * 2. a folder missing `SKILL.md`, or with unparseable/incomplete frontmatter, is skipped — the other
 *    folders in the same workspace still load, never a thrown error.
 * 3. two folders declaring the same frontmatter `name` refuse loudly instead of silently colliding.
 * 4. the handler returns the exact `SKILL.md` body plus the bundled `references/`/`scripts/`/
 *    `assets/` file paths — not inlined content.
 * 5. workspace isolation, and the same `NO_INPUT_SCHEMA`/`requireNoInput` shape every other
 *    parameterless tool in this codebase uses.
 *
 * Uses a real temp directory rather than the production `installAgentPlugin` pipeline
 * `agent-plugins`' own tests use — there is no equivalent install pipeline for a standalone skill
 * (see `layout.ts`'s header: the operator-created folder IS the install), so writing the folder
 * directly with `mkdir`/`writeFile` is the correct fixture shape for THIS feature.
 */

const WORKSPACE_A = "workspace-a";

async function withSkillsDir<T>(fn: (skillsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-skills-tool-registrations-test-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  const previousSite = process.env.TOVU_SITE_DIR;
  process.env.TOVU_SITE_DIR = path.dirname(dir);
  process.env.TOVU_SKILLS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.TOVU_SKILLS_DIR;
    else process.env.TOVU_SKILLS_DIR = previous;
    if (previousSite === undefined) delete process.env.TOVU_SITE_DIR;
    else process.env.TOVU_SITE_DIR = previousSite;
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeSkill(
  skillsDir: string,
  workspaceId: string,
  dirName: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const skillDir = path.join(skillsDir, "ws", workspaceId, dirName);
  await mkdir(skillDir, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(skillDir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
  return skillDir;
}

const INCIDENT_RESPONSE_SKILL_MD = `---
name: incident-response
version: 1.0.0
description: Use when handling production incidents, defining severity and escalation, writing runbooks, or facilitating blameless post-mortems and SLO-driven follow-up.
---

# Skill: Incident Response

Use this for production outages, degraded services, rollback decisions, runbooks, and post-mortems.
`;

const CODE_REVIEW_SKILL_MD = `---
name: code-review
description: Use when reviewing a pull request for correctness, security, and maintainability.
---

# Skill: Code Review
`;

function fakeCtx(input: unknown = undefined): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
}

test("an installed skill folder produces exactly one tool with id 'skill_<name>' and a description equal to the frontmatter description verbatim", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "incident-response", { "SKILL.md": INCIDENT_RESPONSE_SKILL_MD });

    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.equal(sources.length, 1);
    const [source] = sources;
    assert.ok(source);
    assert.equal(source.id, "skill_incident_response");
    assert.equal(source.skillName, "incident-response");
    assert.equal(
      source.description,
      "Use when handling production incidents, defining severity and escalation, writing runbooks, or facilitating blameless post-mortems and SLO-driven follow-up.",
    );

    const registry = createToolRegistry({});
    for (const registration of buildSkillToolRegistrations(sources)) registry.register(registration);
    assert.deepEqual(registry.list({}).map((d) => d.id), ["skill_incident_response"]);
    assert.equal(registry.list({})[0]?.description, source.description);
  });
});

test("a skill name containing spaces and mixed case sanitizes into a legal, predictable tool id", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "weird-name", {
      "SKILL.md": `---\nname: My Weird Skill!!\ndescription: Does something.\n---\n\n# Body\n`,
    });

    const [source] = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.ok(source);
    assert.equal(source.id, "skill_my_weird_skill");
  });
});

test("a folder with no SKILL.md is skipped, and other folders in the same workspace still load", async () => {
  await withSkillsDir(async (skillsDir) => {
    await mkdir(path.join(skillsDir, "ws", WORKSPACE_A, "empty-folder"), { recursive: true });
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });

    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.id, "skill_code_review");
  });
});

test("a folder whose SKILL.md has no frontmatter at all is skipped, not fatal to the others", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "no-frontmatter", { "SKILL.md": "# Just a heading\n\nSome prose.\n" });
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });

    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.id, "skill_code_review");
  });
});

test("a folder whose frontmatter is missing 'description' is skipped, not fatal to the others", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "no-description", { "SKILL.md": "---\nname: incomplete\n---\n\n# Body\n" });
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });

    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.id, "skill_code_review");
  });
});

test("a folder whose frontmatter is missing 'name' is skipped, not fatal to the others", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "no-name", { "SKILL.md": "---\ndescription: Something.\n---\n\n# Body\n" });
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });

    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.id, "skill_code_review");
  });
});

test("two installed skill folders declaring the same frontmatter name refuse loudly instead of silently colliding", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "folder-one", { "SKILL.md": CODE_REVIEW_SKILL_MD });
    await writeSkill(skillsDir, WORKSPACE_A, "folder-two", { "SKILL.md": CODE_REVIEW_SKILL_MD });

    await assert.rejects(
      () => loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A }),
      /'code-review' is declared by more than one installed skill folder \('folder-one' and 'folder-two'\)/,
    );
  });
});

test("the handler returns the exact SKILL.md body, unmodified", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "incident-response", { "SKILL.md": INCIDENT_RESPONSE_SKILL_MD });
    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildSkillToolRegistrations(sources);
    assert.ok(registration);
    const result = (await registration.handler(fakeCtx())) as { guidance: string };
    assert.equal(result.guidance, INCIDENT_RESPONSE_SKILL_MD);
  });
});

test("the handler lists bundled references/scripts/assets files by site-relative path, without inlining their content", async () => {
  await withSkillsDir(async (skillsDir) => {
    const skillDir = await writeSkill(skillsDir, WORKSPACE_A, "incident-response", {
      "SKILL.md": INCIDENT_RESPONSE_SKILL_MD,
      "references/postmortem-template.md": "# Postmortem Template\n\nSection one.\n",
      "references/slo-sli-framework.md": "# SLO/SLI\n",
      "scripts/collect-logs.sh": "#!/bin/sh\necho hi\n",
      "references/nested/guide.md": "NESTED_REFERENCE_CANARY",
      "scripts/nested/check.sh": "NESTED_SCRIPT_CANARY",
      "assets/nested/icon.svg": "ASSET_CANARY",
    });

    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildSkillToolRegistrations(sources);
    assert.ok(registration);
    const result = (await registration.handler(fakeCtx())) as {
      bundledFiles: readonly { kind: string; path: string }[];
    };

    const paths = result.bundledFiles.map((f) => f.path).sort();
    assert.deepEqual(paths, [
      path.relative(path.dirname(skillsDir), path.join(skillDir, "assets", "nested", "icon.svg")),
      path.relative(path.dirname(skillsDir), path.join(skillDir, "references", "nested", "guide.md")),
      path.relative(path.dirname(skillsDir), path.join(skillDir, "references", "postmortem-template.md")),
      path.relative(path.dirname(skillsDir), path.join(skillDir, "references", "slo-sli-framework.md")),
      path.relative(path.dirname(skillsDir), path.join(skillDir, "scripts", "collect-logs.sh")),
      path.relative(path.dirname(skillsDir), path.join(skillDir, "scripts", "nested", "check.sh")),
    ]);
    assert.equal(result.bundledFiles.find((f) => f.path.endsWith("postmortem-template.md"))?.kind, "references");
    assert.equal(result.bundledFiles.find((f) => f.path.endsWith("collect-logs.sh"))?.kind, "scripts");
    assert.deepEqual(result.bundledFiles.map(({ kind, path: absolutePath }) => ({ kind, path: path.relative(path.relative(path.dirname(skillsDir), skillDir), absolutePath) })).sort((a, b) => a.path.localeCompare(b.path)), [
      { kind: "assets", path: "assets/nested/icon.svg" },
      { kind: "references", path: "references/nested/guide.md" },
      { kind: "references", path: "references/postmortem-template.md" },
      { kind: "references", path: "references/slo-sli-framework.md" },
      { kind: "scripts", path: "scripts/collect-logs.sh" },
      { kind: "scripts", path: "scripts/nested/check.sh" },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /NESTED_REFERENCE_CANARY|NESTED_SCRIPT_CANARY|ASSET_CANARY/);
    // Content itself must never appear in the handler output — only the path.
    assert.doesNotMatch(JSON.stringify(result), /Section one\./);
  });
});

test("a skill with no bundled subdirectories at all returns an empty bundledFiles list, no error", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });
    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildSkillToolRegistrations(sources);
    assert.ok(registration);
    const result = (await registration.handler(fakeCtx())) as { bundledFiles: readonly unknown[] };
    assert.deepEqual(result.bundledFiles, []);
  });
});

test("the input schema accepts no arguments, and a populated input throws via requireNoInput", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });
    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildSkillToolRegistrations(sources);
    assert.ok(registration);

    const schema = registration.descriptor.inputSchema as { required: readonly string[]; properties: Record<string, unknown> };
    assert.deepEqual(schema.required, []);
    assert.deepEqual(schema.properties, {});

    await assert.rejects(() => registration.handler(fakeCtx({ anything: true })), /this tool accepts no input/);
    // Omitted, or an explicit empty object, are both fine.
    await assert.doesNotReject(() => registration.handler(fakeCtx(undefined)));
    await assert.doesNotReject(() => registration.handler(fakeCtx({})));
  });
});

test("skillToolDerivedRisk classifies every source as 'none' — a pure local read, same as agent-plugin tools", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });
    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    const risk = skillToolDerivedRisk(sources);
    assert.equal(risk.get("skill_code_review"), "none");
  });
});

test("registerInstalledSkillTools loads and registers one tool per skill directly onto a real ToolRegistry", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "incident-response", { "SKILL.md": INCIDENT_RESPONSE_SKILL_MD });
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });

    const registry = createToolRegistry({});
    await registerInstalledSkillTools(registry, { workspaceId: WORKSPACE_A });

    assert.equal(registry.has({ toolId: "skill_incident_response" }), true);
    assert.equal(registry.has({ toolId: "skill_code_review" }), true);
    assert.equal(registry.list({}).length, 2);
  });
});

test("workspace isolation: a load for workspace A sees nothing installed only under a different workspace", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, "workspace-other", "only-in-other", { "SKILL.md": CODE_REVIEW_SKILL_MD });

    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.deepEqual(sources, []);
  });
});

test("an empty (never-installed) workspace produces zero sources and an empty registration list, no throw", async () => {
  await withSkillsDir(async () => {
    const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
    assert.deepEqual(sources, []);
    assert.deepEqual(buildSkillToolRegistrations(sources), []);
  });
});

for (const [name, scalar, expected] of [
  ["folded", ">", "First line. Second line."],
  ["literal", "|", "First line. Second line."],
] as const) {
  test(`real skill loader resolves ${name} YAML descriptions for registration`, async () => {
    await withSkillsDir(async (skillsDir) => {
      await writeSkill(skillsDir, WORKSPACE_A, name, { "SKILL.md": `---\nname: ${name}\ndescription: ${scalar}\n  First line.\n  Second line.\n---\n# Body\n` });
      const sources = await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A });
      const registry = createToolRegistry({});
      for (const registration of buildSkillToolRegistrations(sources)) registry.register(registration);
      assert.deepEqual(registry.list({}).map(({ id, description }) => ({ id, description })), [{ id: `skill_${name}`, description: expected }]);
    });
  });
}

test("different skill names that sanitize to the same tool id refuse loudly", async () => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "folder-a", { "SKILL.md": "---\nname: a-b\ndescription: Hyphen.\n---\n" });
    await writeSkill(skillsDir, WORKSPACE_A, "folder-b", { "SKILL.md": "---\nname: a_b\ndescription: Underscore.\n---\n" });
    await assert.rejects(() => loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A }),
      /folder-a.*folder-b.*same tool id 'skill_a_b'/);
  });
});


test("refreshing installed skills adds, updates, removes and re-adds without a restart", async () => {
  await withSkillsDir(async (skillsDir) => {
    const registry = createToolRegistry({});
    await registerInstalledSkillTools(registry, { workspaceId: WORKSPACE_A });
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD });
    await registerInstalledSkillTools(registry, { workspaceId: WORKSPACE_A });
    assert.deepEqual(registry.list({}).map(d => d.id), ["skill_code_review"]);
    await rm(path.join(skillsDir, "ws", WORKSPACE_A, "code-review"), { recursive: true });
    await registerInstalledSkillTools(registry, { workspaceId: WORKSPACE_A });
    assert.deepEqual(registry.list({}).map(d => d.id), []);
    assert.equal(registry.has({ toolId: "skill_code_review" }), false);
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD.replace("Code Review", "Updated Rules") });
    await registerInstalledSkillTools(registry, { workspaceId: WORKSPACE_A });
    assert.deepEqual(registry.list({}).map(d => d.id), ["skill_code_review"]);
  });
});

test("a skill bundledFiles pointer chains directly into the real fs_read_file handler", async () => {
  const { buildFsFilesRegistrations } = await import("../../../fs-files/tool-registrations.js");
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, WORKSPACE_A, "code-review", { "SKILL.md": CODE_REVIEW_SKILL_MD, "references/check.md": "Check ownership before deleting.\n" });
    const [registration] = buildSkillToolRegistrations(await loadInstalledSkillToolSources({ workspaceId: WORKSPACE_A }));
    const output = await registration!.handler(fakeCtx()) as { bundledFiles: { kind: string; root: string; path: string }[] };
    assert.equal(output.bundledFiles[0]!.root, "site");
    const fsTools = buildFsFilesRegistrations({ workspaceId: WORKSPACE_A, authorize: async () => ({ allowed: true, reason: "test" }), resolveRoots: () => ({ site: path.dirname(skillsDir), repo: undefined, custom: undefined }) });
    const reader = fsTools.find(t => t.descriptor.id === "fs_read_file")!;
    const { root, path: filePath } = output.bundledFiles[0]!;
    assert.deepEqual(await reader.handler(fakeCtx({ root, path: filePath })), { root: "site", path: filePath, content: "Check ownership before deleting.\n", bytes: 33 });
  });
});
