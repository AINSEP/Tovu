import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildZipFixture } from "../../../agent-plugins/__tests__/fixtures/build-zip.js";
import { installSkill, listManagedSkills, setSkillEnabled, uninstallSkill } from "../../install-service.js";
import { loadInstalledSkillToolSources } from "../../tool-registrations.js";

const MD = "---\nname: incident-response\ndescription: Respond to outages.\n---\nAlways check ownership.\n";
const file = (name: string, content: string) => ({ path: name, contentBase64: Buffer.from(content).toString("base64") });
async function fixture(fn: () => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "t14-install-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = dir;
  try { await fn(); } finally { if (previous === undefined) delete process.env.TOVU_SKILLS_DIR; else process.env.TOVU_SKILLS_DIR = previous; await rm(dir, { recursive: true, force: true }); }
}
const ctx = { workspaceId: "workspace-local" };

test("upload installs exact guidance, records uploaded source, disables and uninstalls through real reads", () => fixture(async () => {
  assert.deepEqual(await installSkill({ ...ctx, files: [file("folder/SKILL.md", MD), file("folder/references/check.md", "Check this.")] }), { toolId: "skill_incident_response", name: "incident-response", description: "Respond to outages.", enabled: true, source: "uploaded" });
  const dir = path.join(process.env.TOVU_SKILLS_DIR!, "ws/workspace-local/incident-response");
  assert.equal(await readFile(path.join(dir, "SKILL.md"), "utf8"), MD);
  assert.deepEqual(await listManagedSkills(ctx), [{ toolId: "skill_incident_response", name: "incident-response", description: "Respond to outages.", enabled: true, source: "uploaded" }]);
  await setSkillEnabled({ ...ctx, toolId: "skill_incident_response", enabled: false });
  assert.deepEqual(await loadInstalledSkillToolSources(ctx), []);
  assert.equal((await listManagedSkills(ctx))[0]!.enabled, false);
  await setSkillEnabled({ ...ctx, toolId: "skill_incident_response", enabled: true });
  assert.equal((await loadInstalledSkillToolSources(ctx))[0]!.markdown, MD);
  await uninstallSkill({ ...ctx, toolId: "skill_incident_response" });
  assert.deepEqual(await listManagedSkills(ctx), []);
}));

test("zip uses the same validator and never executes script content", () => fixture(async () => {
  const archive = await buildZipFixture([{ path: "incident/SKILL.md", content: MD }, { path: "incident/scripts/check.sh", content: "exit 81\n", mode: 0o100755 }]);
  assert.equal((await installSkill({ ...ctx, archiveBase64: archive.toString("base64") })).source, "uploaded");
  assert.equal(await readFile(path.join(process.env.TOVU_SKILLS_DIR!, "ws/workspace-local/incident-response/scripts/check.sh"), "utf8"), "exit 81\n");
}));

for (const [name, files, message] of [
  ["missing frontmatter", [file("SKILL.md", "name: incident-response\ndescription: Nope")], "SKILL.md must have YAML frontmatter with a name and description."],
  ["duplicate YAML keys", [file("SKILL.md", "---\nname: a\nname: b\ndescription: Nope\n---\n")], "SKILL.md must have valid YAML frontmatter."],
  ["invalid name", [file("SKILL.md", MD.replace("incident-response", "../bad"))], "Skill name must use lowercase letters, digits and single hyphens (1–64 characters)."],
  ["traversal", [file("SKILL.md", MD), file("references/../escape.md", "bad")], "Unsafe skill file path: references/../escape.md"],
  ["code extension", [file("SKILL.md", MD), file("assets/payload.exe", "bad")], "Unsupported skill file type: assets/payload.exe"],
  ["duplicate path", [file("SKILL.md", MD), file("SKILL.md", MD)], "Duplicate skill file path: SKILL.md"],
  ["binary markdown", [file("SKILL.md", MD), file("references/check.md", "\u0000binary")], "Skill text file must be valid UTF-8 without null bytes: references/check.md"],
  ["oversized skill", [file("SKILL.md", MD + "a".repeat(128 * 1024))], "SKILL.md exceeds 128 KiB."],
] as const) test(`rejects ${name} with no partial installation`, () => fixture(async () => {
  await assert.rejects(() => installSkill({ ...ctx, files }), { message });
  assert.deepEqual(await listManagedSkills(ctx), []);
}));

test("duplicate installation refuses without overwriting original guidance", () => fixture(async () => {
  await installSkill({ ...ctx, files: [file("SKILL.md", MD)] });
  await assert.rejects(() => installSkill({ ...ctx, files: [file("SKILL.md", MD + "replaced")] }), { message: "Skill 'incident-response' is already installed. Remove it before installing another version." });
  assert.equal((await loadInstalledSkillToolSources(ctx))[0]!.markdown, MD);
}));

test("zip symlinks are rejected before any file is persisted", () => fixture(async () => {
  const archive = await buildZipFixture([{ path: "SKILL.md", content: MD }, { path: "references/link.md", content: "/etc/passwd", mode: 0o120777 }]);
  await assert.rejects(() => installSkill({ ...ctx, archiveBase64: archive.toString("base64") }), { message: "Skill archives may contain only regular files and directories." });
  assert.deepEqual(await listManagedSkills(ctx), []);
}));

test("GitHub installation pins the commit, uses bounded safe fetches and records provenance", () => fixture(async () => {
  const sha = "a".repeat(40);
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push(String(url));
    assert.equal(init!.redirect, "error");
    assert.ok(init!.signal);
    if (String(url) === "https://api.github.com/repos/acme/skills/commits/HEAD") return Response.json({ sha });
    if (String(url) === `https://api.github.com/repos/acme/skills/git/trees/${sha}?recursive=1`) return Response.json({ truncated: false, tree: [{ path: "SKILL.md", type: "blob", sha: "b".repeat(40), size: Buffer.byteLength(MD), mode: "100644" }] });
    if (String(url) === `https://api.github.com/repos/acme/skills/git/blobs/${"b".repeat(40)}`) return Response.json({ encoding: "base64", content: Buffer.from(MD).toString("base64") });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const result = await installSkill({ ...ctx, githubUrl: "https://github.com/acme/skills" }, { fetchImpl });
  assert.deepEqual(result.source, { githubUrl: "https://github.com/acme/skills", commit: sha });
  assert.equal(requests.length, 3);
  assert.deepEqual((await listManagedSkills(ctx))[0]!.source, result.source);
}));

test("GitHub SSRF URL refuses before fetching", () => fixture(async () => {
  let fetched = false;
  await assert.rejects(() => installSkill({ ...ctx, githubUrl: "https://127.0.0.1/repo" }, { fetchImpl: async () => { fetched = true; throw new Error("should not fetch"); } }), { message: "Use an HTTPS GitHub repository URL, optionally ending in /tree/ref/skill-folder." });
  assert.equal(fetched, false);
}));


test("invalid ZIP refuses as a user validation error without writing", () => fixture(async () => {
  await assert.rejects(() => installSkill({ ...ctx, archiveBase64: Buffer.from("not a zip").toString("base64") }), { message: "Could not read skill ZIP. Use a valid ZIP with regular files only." });
  assert.deepEqual(await listManagedSkills(ctx), []);
}));

test("mixed files exceeding the aggregate byte cap are refused before installation", () => fixture(async () => {
  const files = [file("SKILL.md", MD), ...Array.from({ length: 8 }, (_, i) => file(`references/chunk-${i}.md`, "a".repeat(1024 * 1024)))];
  await assert.rejects(() => installSkill({ ...ctx, files }), { message: "Skill files exceed 8 MiB combined." });
  assert.deepEqual(await listManagedSkills(ctx), []);
}));
