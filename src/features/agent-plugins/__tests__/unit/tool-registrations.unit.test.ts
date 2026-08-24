import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolRegistry, type ToolExecutionContext } from "@jini-ai/core";

import { forceRemove } from "../fixtures/force-remove.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../install.js";
import {
  buildAgentPluginToolRegistrations,
  loadInstalledAgentPluginToolSources,
  registerInstalledAgentPluginTools,
} from "../../tool-registrations.js";

/**
 * @file The tool-registration path for Agent Plugins — registers each installed PLUGIN as one real
 * `ToolRegistration` (id/description/schema/handler), rather than one per skill. See
 * `tool-registrations.ts`'s own header for the full design (and why this supersedes the earlier
 * one-tool-per-skill pilot); this file proves:
 *
 * 1. `registry.list()` carries one collision-free id per installed plugin, each with a non-empty
 *    description naming every one of that plugin's skills.
 * 2. the optional `skill` argument selects a specific skill's guidance; omitted or unrecognized
 *    falls back to the plugin's default (eponymous, or a documented fallback) skill, gracefully —
 *    never a thrown error for an unrecognized value.
 * 3. each handler returns the SAME real guidance markdown `readInstalledSkillMarkdown` reads.
 * 4. no absolute host path (the real, unpredictable temp install dir this suite creates) ever
 *    reaches an id, a description, a schema, or a handler's output — the SECURITY property
 *    `tool-registrations.ts`'s header states and this file verifies empirically, not just by
 *    inspection.
 * 5. the ambiguity guard (two installed digests of the same plugin) refuses loudly rather than
 *    silently colliding.
 *
 * Installs REAL packages through the production `installAgentPlugin` pipeline, the same idiom
 * `capability-source.unit.test.ts` already establishes for this feature, against
 * `TOVU_AGENT_PLUGINS_DIR` pointed at a temp directory.
 */

const WORKSPACE_A = "55555555-5555-4555-8555-555555555555";

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

function fileEntry(entryPath: string, content: string): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file",
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
  };
}

function manifest(name: string, version = "1.0.0"): string {
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version });
}

async function withAgentPluginsDir<T>(fn: (agentPluginsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-tool-registrations-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function installRealPackage(
  workspaceId: string,
  pluginId: string,
  skills: Readonly<Record<string, string>>,
  archiveSeed: string,
) {
  const entries: AgentPluginArchiveEntry[] = [fileEntry("plugin.json", manifest(pluginId))];
  for (const [skillName, skillMarkdown] of Object.entries(skills)) {
    entries.push(fileEntry(`skills/${skillName}/SKILL.md`, skillMarkdown));
  }
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: reader(entries),
    layout: resolveAgentPluginLayout(),
    workspaceId,
  });
}

const UI_UX_DESIGN_SKILL_MD = `---
name: ui-ux-design
version: 1.1.0
description: Use when creating frontend design systems, visual direction, component/state specs, responsive behavior, brand-aware UI guidance, premium/high-converting website polish, or implementation-ready design handoff from a feature spec or existing product constraints.
---

# Skill: UI/UX Design

Read the active spec before making visual decisions.
`;

const ACCESSIBILITY_SKILL_MD = `---
name: frontend-accessibility
version: 1.0.0
description: WCAG 2.1 AA compliance guidance for frontend code review and E2E testing.
---

# Frontend Accessibility
`;

const NO_FRONTMATTER_SKILL_MD = `# Web Compliance

## Purpose
Provide a practical compliance checklist for website-facing features so review agents can consistently catch legal and policy risks before release.
`;

function fakeCtx(input: unknown = {}): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
}

test("each installed plugin produces exactly one stable, collision-free tool id with a non-empty description naming every one of its skills", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(
      WORKSPACE_A,
      "ui-ux-design",
      {
        "ui-ux-design": UI_UX_DESIGN_SKILL_MD,
        "frontend-accessibility": ACCESSIBILITY_SKILL_MD,
        "web-compliance": NO_FRONTMATTER_SKILL_MD,
      },
      "archive-basic",
    );

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    assert.equal(sources.length, 1, "one plugin must produce exactly one tool source, not one per skill");
    const [source] = sources;
    assert.ok(source);
    assert.equal(source.id, "agent_plugin_ui_ux_design");
    assert.equal(source.skills.length, 3);

    const registry = createToolRegistry();
    for (const registration of buildAgentPluginToolRegistrations(sources)) registry.register(registration);

    const ids = registry.list().map((d) => d.id);
    assert.deepEqual(ids, ["agent_plugin_ui_ux_design"]);

    const [descriptor] = registry.list();
    assert.ok(descriptor);
    assert.ok(descriptor.description && descriptor.description.length > 0);
    // The combined description must carry every skill's own vocabulary — the load-bearing BM25
    // property `tool-registrations.ts`'s header describes.
    assert.match(descriptor.description ?? "", /frontend-accessibility/);
    assert.match(descriptor.description ?? "", /WCAG 2\.1 AA compliance/);
    assert.match(descriptor.description ?? "", /web-compliance/);
    assert.match(descriptor.description ?? "", /practical compliance checklist/);
  });
});

test("registerInstalledAgentPluginTools loads and registers one tool per plugin directly onto a real ToolRegistry, the same registration call agent-daemon-server.ts makes for every other domain", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(WORKSPACE_A, "coffee-roastery", { "coffee-roastery": "# Coffee Roastery\n" }, "archive-direct");

    const registry = createToolRegistry();
    await registerInstalledAgentPluginTools(registry, { workspaceId: WORKSPACE_A });

    assert.equal(registry.has("agent_plugin_coffee_roastery"), true);
    assert.equal(registry.list().length, 1);
  });
});

test("the input schema documents an optional 'skill' property whose enum names every skill this specific plugin has", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(
      WORKSPACE_A,
      "ui-ux-design",
      { "ui-ux-design": UI_UX_DESIGN_SKILL_MD, "frontend-accessibility": ACCESSIBILITY_SKILL_MD },
      "archive-schema",
    );

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildAgentPluginToolRegistrations(sources);
    assert.ok(registration);

    const schema = registration.descriptor.inputSchema as {
      required: readonly string[];
      properties: { skill: { enum: readonly string[] } };
    };
    assert.deepEqual(schema.required, []);
    assert.deepEqual([...schema.properties.skill.enum].sort(), ["frontend-accessibility", "ui-ux-design"]);
  });
});

test("calling with no 'skill' argument returns the plugin's own eponymous skill plus the other available skill names", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(
      WORKSPACE_A,
      "ui-ux-design",
      { "ui-ux-design": UI_UX_DESIGN_SKILL_MD, "frontend-accessibility": ACCESSIBILITY_SKILL_MD },
      "archive-default-eponymous",
    );

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildAgentPluginToolRegistrations(sources);
    assert.ok(registration);

    const result = (await registration.handler(fakeCtx(undefined))) as {
      pluginId: string;
      skillName: string;
      guidance: string;
      availableSkills: readonly string[];
    };
    assert.equal(result.pluginId, "ui-ux-design");
    assert.equal(result.skillName, "ui-ux-design");
    assert.match(result.guidance, /Skill: UI\/UX Design/);
    assert.deepEqual(result.availableSkills, ["frontend-accessibility"]);
  });
});

test("when a plugin has no eponymous skill folder, the default falls back to its alphabetically-first skill and the description says so", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(
      WORKSPACE_A,
      "ui-ux-design",
      { "web-compliance": NO_FRONTMATTER_SKILL_MD, "frontend-accessibility": ACCESSIBILITY_SKILL_MD },
      "archive-no-eponymous",
    );

    const [source] = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    assert.ok(source);
    assert.equal(source.defaultSkillName, "frontend-accessibility", "alphabetically first of the two installed skills");
    assert.match(source.description, /no eponymous skill folder/);

    const [registration] = buildAgentPluginToolRegistrations([source]);
    assert.ok(registration);
    const result = (await registration.handler(fakeCtx(undefined))) as { skillName: string };
    assert.equal(result.skillName, "frontend-accessibility");
  });
});

test("an explicit, recognized 'skill' argument returns that skill's own guidance, not the default", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(
      WORKSPACE_A,
      "ui-ux-design",
      { "ui-ux-design": UI_UX_DESIGN_SKILL_MD, "frontend-accessibility": ACCESSIBILITY_SKILL_MD },
      "archive-explicit-skill",
    );

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildAgentPluginToolRegistrations(sources);
    assert.ok(registration);

    const result = (await registration.handler(fakeCtx({ skill: "frontend-accessibility" }))) as {
      pluginId: string;
      skillName: string;
      guidance: string;
      availableSkills: readonly string[];
    };
    assert.equal(result.skillName, "frontend-accessibility");
    assert.match(result.guidance, /WCAG 2\.1 AA/);
    assert.deepEqual(result.availableSkills, ["ui-ux-design"]);
  });
});

test("an unrecognized 'skill' argument falls back to the default skill gracefully, with an informative note listing the valid values — never a thrown error", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(
      WORKSPACE_A,
      "ui-ux-design",
      { "ui-ux-design": UI_UX_DESIGN_SKILL_MD, "frontend-accessibility": ACCESSIBILITY_SKILL_MD },
      "archive-unrecognized-skill",
    );

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildAgentPluginToolRegistrations(sources);
    assert.ok(registration);

    const result = (await registration.handler(fakeCtx({ skill: "does-not-exist" }))) as {
      skillName: string;
      note: string;
    };
    assert.equal(result.skillName, "ui-ux-design", "falls back to the default (eponymous) skill");
    assert.match(result.note, /does-not-exist/);
    assert.match(result.note, /ui-ux-design/);
    assert.match(result.note, /frontend-accessibility/);
  });
});

test("a malformed 'skill' argument (wrong type) or an unexpected extra field still throws — only an unrecognized VALUE is graceful", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(WORKSPACE_A, "coffee-roastery", { "coffee-roastery": "# Coffee Roastery\n" }, "archive-shape");

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    const [registration] = buildAgentPluginToolRegistrations(sources);
    assert.ok(registration);

    await assert.rejects(() => registration.handler(fakeCtx({ skill: 123 })));
    await assert.rejects(() => registration.handler(fakeCtx({ notASkillField: "x" })));
  });
});

test("the handler returns the exact same guidance markdown readInstalledSkillMarkdown reads for that skill — real content, not a stub", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(WORKSPACE_A, "coffee-roastery", { "roast-profiles": "# Roast Profiles\n\nLight, medium, dark.\n" }, "archive-handler");

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    const [source] = sources;
    assert.ok(source);

    const [registration] = buildAgentPluginToolRegistrations(sources);
    assert.ok(registration);
    const result = (await registration.handler(fakeCtx(undefined))) as { pluginId: string; skillName: string; guidance: string };

    assert.equal(result.pluginId, "coffee-roastery");
    assert.equal(result.skillName, "roast-profiles");
    assert.equal(result.guidance, "# Roast Profiles\n\nLight, medium, dark.\n");
    assert.equal(result.guidance, source.skills[0]?.markdown, "handler output must match the source's own resolved markdown exactly");
  });
});

test("SECURITY: no absolute host path appears in any registered tool's id, description, schema, or handler output", async () => {
  await withAgentPluginsDir(async (agentPluginsDir) => {
    const installed = await installRealPackage(
      WORKSPACE_A,
      "ui-ux-design",
      { "ui-ux-design": UI_UX_DESIGN_SKILL_MD, "frontend-accessibility": ACCESSIBILITY_SKILL_MD },
      "archive-security",
    );

    // Sanity: the install really did land under the unpredictable temp dir this test created, and
    // that dir is a real absolute path — otherwise this test would vacuously pass.
    assert.ok(path.isAbsolute(agentPluginsDir));
    assert.ok(installed.packageRoot.startsWith(agentPluginsDir));

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    const registrations = buildAgentPluginToolRegistrations(sources);
    assert.ok(registrations.length > 0);

    for (const registration of registrations) {
      const serializedSchema = JSON.stringify(registration.descriptor.inputSchema ?? {});
      assert.doesNotMatch(registration.descriptor.id, new RegExp(escapeRegExp(agentPluginsDir)));
      assert.doesNotMatch(registration.descriptor.description ?? "", new RegExp(escapeRegExp(agentPluginsDir)));
      assert.doesNotMatch(serializedSchema, new RegExp(escapeRegExp(agentPluginsDir)));
      // Also check the general host-path shape, not just this one run's own dir — the hardened
      // check: no `/tmp/`, no `os.tmpdir()` prefix, no the actual installed packageRoot substring.
      assert.doesNotMatch(registration.descriptor.description ?? "", new RegExp(escapeRegExp(installed.packageRoot)));

      for (const input of [undefined, { skill: "frontend-accessibility" }, { skill: "not-a-real-skill" }]) {
        const result = (await registration.handler(fakeCtx(input))) as Record<string, unknown>;
        const serialized = JSON.stringify(result);
        assert.doesNotMatch(serialized, new RegExp(escapeRegExp(agentPluginsDir)), `${registration.descriptor.id}'s handler output leaked the install dir`);
        assert.doesNotMatch(serialized, new RegExp(escapeRegExp(installed.packageRoot)), `${registration.descriptor.id}'s handler output leaked packageRoot`);
      }
    }
  });
});

test("two installed digests of the same plugin id refuse loudly instead of silently colliding", async () => {
  await withAgentPluginsDir(async () => {
    await installRealPackage(WORKSPACE_A, "ui-ux-design", { "ui-ux-design": "# Variant A\n" }, "archive-digest-a");
    await installRealPackage(WORKSPACE_A, "ui-ux-design", { "ui-ux-design": "# Variant B\n" }, "archive-digest-b");

    await assert.rejects(
      () => loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A }),
      /installed under more than one digest/,
    );
  });
});

test("workspace isolation: a load for workspace A sees nothing installed only under a different workspace", async () => {
  await withAgentPluginsDir(async () => {
    const WORKSPACE_OTHER = "66666666-6666-4666-8666-666666666666";
    await installRealPackage(WORKSPACE_OTHER, "only-in-other", { "only-in-other": "# Only\n" }, "archive-tenancy");

    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    assert.deepEqual(sources, []);
  });
});

test("an empty (never-installed) workspace produces zero sources and an empty registration list, no throw", async () => {
  await withAgentPluginsDir(async () => {
    const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_A });
    assert.deepEqual(sources, []);
    assert.deepEqual(buildAgentPluginToolRegistrations(sources), []);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
