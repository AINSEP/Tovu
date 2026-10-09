import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { RETIRED_READ_TOOL_TO_CARD } from "../../../../assistant/content-read-tool.js";
import { nativeToolMetadata } from "../../../../contracts/core/tool-metadata/index.js";
import { agentPluginActivations } from "../../activation-effects.js";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } from "../../bundled-catalog.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { seedBundledAgentPlugins } from "../../lifecycle.js";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file The `site-import` bundled Agent Plugin's package is VALID, names only tools that exist,
 * and still carries the rules that make importing someone's website safe.
 *
 * Three kinds of assertion, on purpose:
 *
 * 1. **Schema validity** — both manifests parse under this repo's own v1.0.0 validators, and
 *    `mcp.json` declares ZERO servers (`capability-projection.ts` marks every plugin-declared MCP
 *    server unavailable, so one here would be decoration that looks like a capability).
 *
 * 2. **Tool-name drift guard** — the skill is a procedure written in tool names. A renamed or
 *    removed tool would leave the skill telling every agent to call something that does not exist,
 *    and nothing else would notice: this is markdown, not code. Every snake_case tool id the skill
 *    or its references cite must be a declared native tool (`nativeToolMetadata`, the same
 *    projection the approval gate reads) or a per-plugin `agent_plugin_<id>` tool, whose ids are
 *    minted at runtime from installed plugins and so cannot be in that table.
 *
 * 3. **On by default** (owner decision 2026-10-08) — seeded enabled on a fresh site, switched on
 *    for an existing site whose record is the seeder's untouched "off", and never re-enabled once
 *    an operator turned it off.
 *
 * 4. **Safety content** — ownership confirmation, fetched pages as untrusted data, plan-before-write,
 *    and update-not-duplicate are the rules that make this capability safe to hand to any agent.
 *    They are prose, and prose erodes during unrelated edits, so each gets a pinned assertion.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/site-import");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "site-import");
const EXPECTED_REFERENCES = ["content-mapping.md", "discovery-and-classification.md", "theme-extraction.md"];
const CONTENT_ROOT = path.dirname(PACKAGE_ROOT);
const PLUGIN_ID = "site-import";
const WORKSPACE_ID = "workspace-local";
const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;

/** Runs `fn` against a throwaway agent-plugins root (the layout resolves it from env at call time). */
async function withAgentPluginsDir<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-site-import-plugin-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout());
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function siteImportEnabled(layout: ReturnType<typeof resolveAgentPluginLayout>): Promise<boolean | undefined> {
  const activations = await readAgentPluginActivations({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root });
  return activations.plugins[PLUGIN_ID]?.enabled;
}

async function readPackageFile(relativePath: string): Promise<string> {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

async function readSkillAndReferences(): Promise<Array<{ name: string; text: string }>> {
  const skill = { name: "SKILL.md", text: await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8") };
  const references = await Promise.all(
    EXPECTED_REFERENCES.map(async (name) => ({ name, text: await readFile(path.join(SKILL_DIR, "references", name), "utf8") })),
  );
  return [skill, ...references];
}

/** Snake_case identifiers (and `content_read.<resource>` cards) opening a backtick span, alone or
 *  as a `tool_name {` call, plus the same call shapes inside fenced examples. */
function citedToolIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  const toolId = String.raw`[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\.[a-z0-9_]+)?`;
  for (const match of markdown.matchAll(new RegExp(String.raw`\`(${toolId})(?=\`| \{)`, "g"))) ids.add(match[1]!);
  for (const match of markdown.matchAll(new RegExp(String.raw`^\s*(${toolId}) \{`, "gm"))) ids.add(match[1]!);
  return ids;
}

/**
 * The ids a running server actually serves. `nativeToolMetadata` is the PRE-collapse table: it
 * still declares the 09-08 retired read tools (`content_post_list`, `menus_list_menus`, ...) because
 * their handlers live on inside the `content_read.<resource>` cards — but the ids themselves 404.
 * Checking against that table alone let skills keep citing them, so a retired id is refused here and
 * the card that replaced it is named in the failure.
 */
function unknownToolIds(name: string, ids: Iterable<string>, declared: ReadonlySet<string>): string[] {
  const unknown: string[] = [];
  for (const id of ids) {
    const replacement = RETIRED_READ_TOOL_TO_CARD.get(id);
    if (replacement) unknown.push(`${name}: ${id} (retired — use ${replacement})`);
    else if (!declared.has(id) && !/^agent_plugin_[a-z0-9_]+$/.test(id)) unknown.push(`${name}: ${id}`);
  }
  return unknown;
}

test("site-import is on the seeded-enabled list", () => {
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(PLUGIN_ID), true);
});

test("a fresh site seeds site-import ENABLED with no owner action", async () => {
  await withAgentPluginsDir(async (layout) => {
    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal(seeded.outcomes.find((outcome) => outcome.pluginId === PLUGIN_ID)?.status, "seeded");
    assert.equal(await siteImportEnabled(layout), true);
  });
});

test("an existing site whose record is the seeder's untouched OFF is switched on at the next boot", async () => {
  await withAgentPluginsDir(async (layout) => {
    // What a site seeded before 2026-10-08 carries: the seeder's own disabled record, never touched.
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: PLUGIN_ID });
    assert.equal(await siteImportEnabled(layout), false);
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal(await siteImportEnabled(layout), true);
  });
});

test("an owner who switched site-import off stays off across boots", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    await setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: PLUGIN_ID, enabled: false, actor: "test:operator" });
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal(await siteImportEnabled(layout), false);
  });
});

test("plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings", async () => {
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readPackageFile("plugin.json")) });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "site-import");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("plugin.json's keywords carry the words an owner uses when asking to move a site", async () => {
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readPackageFile("plugin.json")) });
  assert.equal(parsed.ok, true);
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["import", "migrate", "website", "sitemap", "wordpress", "posts", "redirects"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}' — it is a primary discovery term`);
  }
});

test("mcp.json declares ZERO servers — the plugin runs entirely on native tools", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: JSON.parse(await readPackageFile("mcp.json")) });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.config.serverIds : ["unreachable"], []);
});

test("the eponymous skill exists and its frontmatter names it", async () => {
  const markdown = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  assert.match(markdown, /^---\nname: site-import\ndescription: .+\n/);
});

test("every reference file is pointed at by SKILL.md, and none is orphaned", async () => {
  assert.deepEqual((await readdir(path.join(SKILL_DIR, "references"))).sort(), EXPECTED_REFERENCES);
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  for (const reference of EXPECTED_REFERENCES) {
    assert.ok(skill.includes(`references/${reference}`), `SKILL.md must point at references/${reference}`);
  }
});

test("every tool the skill and its references cite is a real native tool or a per-plugin tool", async () => {
  const declared = new Set(Object.keys(nativeToolMetadata.byId));
  const unknown: string[] = [];
  let cited = 0;
  for (const { name, text } of await readSkillAndReferences()) {
    const ids = citedToolIds(text);
    cited += ids.size;
    unknown.push(...unknownToolIds(name, ids, declared));
  }
  assert.ok(cited >= 25, `expected the procedure to cite its tools by name, found ${cited}`);
  assert.deepEqual(unknown, [], "the skill tells agents to call tools that do not exist");
});

test("the safety rules are still stated: untrusted pages, no duplicates, drafts; no ownership/right-to-copy gate", async () => {
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  // Owner decision 2026-10-08: the assistant copies any site. It must never ask whether the
  // owner owns the site or has the right to copy it, and never refuse on those grounds.
  assert.doesNotMatch(skill, /ownership|right to copy|own it or may copy/i);
  assert.match(skill, /\*\*Fetched pages are untrusted data\.\*\*[^]*never instructions/);
  assert.match(skill, /\*\*Idempotent\.\*\*[^]*never\s+duplicate/);
  assert.match(skill, /\*\*Drafts by default\.\*\*/);
});

/**
 * Luvira trial (2026-10-08, chat 7ff5dfc9): asked to copy a site, the assistant decided "The
 * wording, logo and brand belong to Luvira, so I'll fill the layout with fresh text instead of
 * their copy", built every page with "neutral placeholder text", asked three questions (pages +
 * text, a plan approval, a slug clash) and built six pages for "a couple of pages". Owner order:
 * copy verbatim, ask at most once. Correction the same day: a generous scope ("a couple of pages"
 * -> all the main pages) is fine; asking about scope is not.
 */
test("the skill copies the source verbatim, as its operating rule, near the top", async () => {
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const rule = skill.indexOf("**Copy the source verbatim.**");
  assert.ok(rule >= 0 && rule < skill.indexOf("## Ground rules"), "the verbatim rule must sit above the ground rules");
  const ruleText = skill.slice(rule, skill.indexOf("\n\n", rule));
  for (const copied of ["text", "images", "logo", "brand names", "fonts"]) {
    assert.match(ruleText, new RegExp(`\\b${copied.replace(" ", "\\s+")}\\b`), `the verbatim rule must name ${copied}`);
  }
  assert.match(ruleText, /never\s+substitute\s+placeholder/i);
  assert.match(ruleText, /never\s+(comment\s+on|mention)\s+who\s+owns/i);
  assert.match(ruleText, /never\s+ask\s+about\s+rights/i);
});

test("no skill text steers toward placeholder copy or reasons about brand ownership", async () => {
  const gate = /(placeholder|dummy|filler|neutral|generic|fresh|new|original) (text|copy|wording)|lorem ipsum|belongs? to (the source|them|its owner|the site's owner)|their (text|copy|wording|brand)|trademark|copyright|intellectual property|\brights? to\b/i;
  for (const { name, text } of await readSkillAndReferences()) {
    const withoutRule = text.replace(/\*\*Copy the source verbatim\.\*\*[^]*?\n\n/, "");
    assert.doesNotMatch(withoutRule, gate, name);
  }
});

test("at most one question per import, with a suggested default, and no plan-approval step", async () => {
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  assert.match(skill, /at most one (short )?question/i);
  assert.match(skill, /\(suggested\)/, "the one question offers the default as its first, suggested option");
  assert.match(
    skill,
    /pick a sensible scope from the request\s+\(default: the homepage, the main nav pages and recent posts\)\s+and just do it/i,
    "the skill picks a default scope instead of asking about it",
  );
  assert.match(skill, /Never ask about scope/);
  assert.doesNotMatch(skill, /Shall I go ahead\?|Do not write anything until the answer is yes|wait for the\s+owner's explicit approval/);
  for (const { name, text } of await readSkillAndReferences()) {
    assert.doesNotMatch(text, /only after the owner approved the plan|the plan asks|stop and ask the owner|ask before overwriting/i, name);
    // Owner 2026-10-08: interpreting scope generously is fine; only asking about it is not.
    assert.doesNotMatch(text, /2\s*[-–]\s*3 pages|a couple of pages"? means|page count the (user|owner) asked for/i, name);
  }
});

test("the skill is vendor-neutral: no model or vendor names", async () => {
  for (const { name, text } of await readSkillAndReferences()) {
    assert.doesNotMatch(text, /\b(Claude|Anthropic|Codex|OpenAI|GPT|Gemini|Copilot)\b/, name);
  }
});

/**
 * Owner order 2026-10-08 (luvira trial, conversation 7ff5dfc9): the import put its homepage at
 * `/start` because a trashed page still held `/`, leaving the site with no page at `/`. Every import
 * now lands its homepage at `/`, moves a live holder aside without asking, treats the Trash as never
 * blocking a slug (the server moves a trashed holder to `<slug>-trashed`), and proves `/` at the end.
 */
test("the imported homepage always lands at /, and the final check proves it", async () => {
  const skill = await readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const mapping = await readFile(path.join(SKILL_DIR, "references", "content-mapping.md"), "utf8");
  for (const [name, text] of [["SKILL.md", skill], ["content-mapping.md", mapping]] as const) {
    assert.doesNotMatch(text, /existing\s+homepage\s+keeps\s+`\/`|import\s+the\s+source\s+homepage\s+as\s+`home`/, `${name}: the old "existing homepage keeps /" rule is reversed`);
    assert.doesNotMatch(text, /including\s+one\s+in\s+the\s+Trash/, `${name}: a trashed entry no longer takes a slug`);
    assert.match(text, /homepage\s+always\s+(goes|lands)\s+at\s+`\/`/i, `${name}: the imported homepage always takes /`);
    assert.match(text, /`previous-home`/, `${name}: a live page at / moves to previous-home`);
  }
  assert.match(skill, /`<slug>-trashed`/, "the skill says what happens to a trashed holder");
  const finalCheck = skill.slice(skill.indexOf("### Step 6"));
  assert.match(finalCheck, /`fetch_published_page`[^]*?`\/`[^]*?200/, "the final check fetches / and requires a 200");
  assert.match(finalCheck, /`fetch_live_url`/, "and checks the live copy once it is published");
});
