import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolRegistration } from "@jini-ai/core";

import { installSkill, listManagedSkills } from "../../install-service.js";
import { buildRegistrations, catalog, type SkillsInstallToolDeps } from "../../install-tool.js";

const PRINCIPAL = "principal-1";
const WORKSPACE = "workspace-local";
const COMMIT = "c".repeat(40);
const API = "https://api.github.com/repos/acme/skills";
const SKILL_URL = "https://github.com/acme/skills";
const MD = "---\nname: incident-response\ndescription: Respond to outages.\n---\nAlways check ownership.\n";

/** Strict fake of the three GitHub API calls a root-folder skill needs; records every URL. */
function fakeGitHub() {
  const requests: string[] = [];
  const routes: Record<string, () => Response> = {
    [`${API}/commits/HEAD`]: () => Response.json({ sha: COMMIT }),
    [`${API}/git/trees/${COMMIT}?recursive=1`]: () => Response.json({ truncated: false, tree: [{ path: "SKILL.md", type: "blob", mode: "100644", sha: "1".padStart(40, "0"), size: MD.length }] }),
    [`${API}/git/blobs/${"1".padStart(40, "0")}`]: () => Response.json({ encoding: "base64", content: Buffer.from(MD).toString("base64") }),
  };
  const fetchImpl = (async (url: string | URL | Request) => {
    requests.push(String(url));
    const route = routes[String(url)];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return route();
  }) as typeof fetch;
  return { fetchImpl, requests };
}

async function withSkillsDir(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), "skills-install-tool-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = dir;
  t.after(async () => { if (previous === undefined) delete process.env.TOVU_SKILLS_DIR; else process.env.TOVU_SKILLS_DIR = previous; await rm(dir, { recursive: true, force: true }); });
  return dir;
}

function deps(overrides: Partial<SkillsInstallToolDeps> = {}): SkillsInstallToolDeps {
  return { workspaceId: WORKSPACE, authorize: async () => ({ allowed: true, reason: "matched" }), skillFetch: fakeGitHub().fetchImpl, ...overrides };
}

const ctx = (input: unknown) => ({ executionId: "e1", principal: { id: PRINCIPAL }, run: { id: "r1" }, input, signal: new AbortController().signal });

/** Runs the tool with a dialog channel available and records anything it tries to show on it.
 *  Owner rule 2026-10-05: only permanent deletes ask first, so an install must never raise a card. */
async function run(d: SkillsInstallToolDeps, input: unknown) {
  const [registration] = buildRegistrations(d) as [ToolRegistration];
  const surfaces: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => { surfaces.push(surface); throw new Error("skills_install must not raise a confirmation card"); };
  const result = await registration.handler(ctx(input), { emitSurface });
  assert.deepEqual(surfaces, [], "no confirmation card");
  return result;
}

test("installs with no confirmation card, through the shared install service, writing the bytes it fetched once", async (t) => {
  const dir = await withSkillsDir(t);
  const github = fakeGitHub();
  const result = await run(deps({ skillFetch: github.fetchImpl }), { githubUrl: SKILL_URL });
  const skill = { toolId: "skill_incident_response", name: "incident-response", description: "Respond to outages.", enabled: true, source: { githubUrl: SKILL_URL, commit: COMMIT } };
  assert.deepEqual(result, { installed: true, skill, note: "Installed the incident-response skill; it is on. Its tool skill_incident_response is picked up by the next search_tools call." });
  assert.deepEqual(await listManagedSkills({ workspaceId: WORKSPACE }), [skill]);
  assert.equal(await readFile(path.join(dir, "ws", WORKSPACE, "incident-response", "SKILL.md"), "utf8"), MD);
  assert.equal(github.requests.length, 3, "fetched once; the write uses the validated bytes, not a second fetch");
});

test("installs with no dialog channel at all — nothing to approve, so nothing fails closed", async (t) => {
  await withSkillsDir(t);
  const [registration] = buildRegistrations(deps()) as [ToolRegistration];
  const result = await registration.handler(ctx({ githubUrl: SKILL_URL }), {});
  assert.equal((result as { installed: boolean }).installed, true);
  assert.equal((await listManagedSkills({ workspaceId: WORKSPACE })).length, 1);
});

test("an already-installed skill is refused before anything is written", async (t) => {
  await withSkillsDir(t);
  await installSkill({ workspaceId: WORKSPACE, files: [{ path: "SKILL.md", contentBase64: Buffer.from(MD).toString("base64") }] });
  await assert.rejects(() => run(deps(), { githubUrl: SKILL_URL }),
    (error: unknown) => error instanceof ToolInputError && error.message === "Skill 'incident-response' is already installed. Remove it from the Skills screen before installing another version.");
});

test("a non-GitHub URL is the service's own refusal, relayed as caller input, with no fetch", async (t) => {
  await withSkillsDir(t);
  const github = fakeGitHub();
  await assert.rejects(() => run(deps({ skillFetch: github.fetchImpl }), { githubUrl: "https://example.com/acme/skills" }),
    (error: unknown) => error instanceof ToolInputError && error.message === "Use an HTTPS GitHub repository URL, optionally ending in /tree/ref/skill-folder.");
  assert.equal(github.requests.length, 0);
});

test("a missing permission refuses before anything is fetched", async (t) => {
  await withSkillsDir(t);
  const github = fakeGitHub();
  await assert.rejects(() => run(deps({ skillFetch: github.fetchImpl, authorize: async () => ({ allowed: false, reason: "insufficient_permission" }) }), { githubUrl: SKILL_URL }));
  assert.equal(github.requests.length, 0);
});

test("extra or missing arguments are refused", async (t) => {
  await withSkillsDir(t);
  for (const input of [{}, { githubUrl: SKILL_URL, path: "/tmp/x" }, { githubUrl: "  " }]) {
    await assert.rejects(() => run(deps(), input), (error: unknown) => error instanceof ToolInputError && /githubUrl/.test(error.message));
  }
});

test("description matches the schema: one required githubUrl, no local files", () => {
  const schema = catalog[0]!.inputSchema as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
  assert.deepEqual(schema.required, ["githubUrl"]);
  assert.deepEqual(Object.keys(schema.properties), ["githubUrl"]);
  assert.equal(schema.additionalProperties, false);
  assert.match(catalog[0]!.description, /public GitHub URL/);
  assert.match(catalog[0]!.description, /does not take local files/);
  assert.doesNotMatch(catalog[0]!.description, /confirm/i);
});
