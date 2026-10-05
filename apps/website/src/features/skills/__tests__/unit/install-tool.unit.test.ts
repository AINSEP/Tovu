import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "../../../../contracts/core/tool-surface-exchanges.js";
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

/** Runs the tool and answers its dialog like a human click; returns early on a pre-dialog refusal. */
async function runWithDecision(d: SkillsInstallToolDeps, input: unknown, decision: "confirm" | "cancel") {
  const store = createSurfaceExchangeStore();
  const [registration] = buildRegistrations(d, { surfaceExchanges: store }) as [ToolRegistration];
  let shown!: (surface: unknown) => void;
  const dialog = new Promise<unknown>((resolve) => { shown = resolve; });
  const emitSurface: SurfaceEmitter = async (surface) => shown(surface);
  const pending = registration.handler(ctx(input), { emitSurface });
  const first = await Promise.race([dialog, pending.then(() => undefined, () => undefined)]);
  if (first === undefined) return { result: await pending, html: "" };
  const html = (first as { payload: { resource: { resource: { text?: string } } } }).payload.resource.resource.text ?? "";
  const id = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))?.[1];
  assert.ok(id, "dialog must carry its exchange id");
  store.deliver({ exchangeId: id, params: { decision }, principalId: PRINCIPAL, toolId: "skills_install" });
  return { result: await pending, html };
}

test("confirm installs the fetched skill through the shared install service, pinned to the shown commit", async (t) => {
  const dir = await withSkillsDir(t);
  const github = fakeGitHub();
  const { result, html } = await runWithDecision(deps({ skillFetch: github.fetchImpl }), { githubUrl: SKILL_URL }, "confirm");
  assert.match(html, /Install the incident-response skill\?/);
  assert.match(html, /Respond to outages\./);
  assert.match(html, new RegExp(COMMIT));
  assert.match(html, /Installation runs no code\./);
  const skill = { toolId: "skill_incident_response", name: "incident-response", description: "Respond to outages.", enabled: true, source: { githubUrl: SKILL_URL, commit: COMMIT } };
  assert.deepEqual(result, { installed: true, skill, note: "Installed the incident-response skill; it is on. Its tool skill_incident_response is picked up by the next search_tools call." });
  assert.deepEqual(await listManagedSkills({ workspaceId: WORKSPACE }), [skill]);
  assert.equal(await readFile(path.join(dir, "ws", WORKSPACE, "incident-response", "SKILL.md"), "utf8"), MD);
  assert.equal(github.requests.length, 3, "fetched once; the write uses the validated bytes, not a second fetch");
});

test("cancel writes nothing and comes back as a result", async (t) => {
  await withSkillsDir(t);
  const { result } = await runWithDecision(deps(), { githubUrl: SKILL_URL }, "cancel");
  assert.deepEqual(result, { installed: false, name: "incident-response", cancelled: true, note: "The user declined. The incident-response skill was NOT installed." });
  assert.deepEqual(await listManagedSkills({ workspaceId: WORKSPACE }), []);
});

test("an already-installed skill is refused before the human is asked", async (t) => {
  await withSkillsDir(t);
  await installSkill({ workspaceId: WORKSPACE, files: [{ path: "SKILL.md", contentBase64: Buffer.from(MD).toString("base64") }] });
  await assert.rejects(() => runWithDecision(deps(), { githubUrl: SKILL_URL }, "confirm"),
    (error: unknown) => error instanceof ToolInputError && error.message === "Skill 'incident-response' is already installed. Remove it from the Skills screen before installing another version.");
});

test("a non-GitHub URL is the service's own refusal, relayed as caller input, with no fetch", async (t) => {
  await withSkillsDir(t);
  const github = fakeGitHub();
  await assert.rejects(() => runWithDecision(deps({ skillFetch: github.fetchImpl }), { githubUrl: "https://example.com/acme/skills" }, "confirm"),
    (error: unknown) => error instanceof ToolInputError && error.message === "Use an HTTPS GitHub repository URL, optionally ending in /tree/ref/skill-folder.");
  assert.equal(github.requests.length, 0);
});

test("a missing permission refuses before anything is fetched", async (t) => {
  await withSkillsDir(t);
  const github = fakeGitHub();
  await assert.rejects(() => runWithDecision(deps({ skillFetch: github.fetchImpl, authorize: async () => ({ allowed: false, reason: "insufficient_permission" }) }), { githubUrl: SKILL_URL }, "confirm"));
  assert.equal(github.requests.length, 0);
});

test("extra or missing arguments are refused", async (t) => {
  await withSkillsDir(t);
  for (const input of [{}, { githubUrl: SKILL_URL, path: "/tmp/x" }, { githubUrl: "  " }]) {
    await assert.rejects(() => runWithDecision(deps(), input, "confirm"), (error: unknown) => error instanceof ToolInputError && /githubUrl/.test(error.message));
  }
});

test("without a dialog channel it fails closed and writes nothing", async (t) => {
  await withSkillsDir(t);
  const [registration] = buildRegistrations(deps(), { surfaceExchanges: createSurfaceExchangeStore() }) as [ToolRegistration];
  await assert.rejects(() => registration.handler(ctx({ githubUrl: SKILL_URL }), {}), /no interactive confirmation channel/);
  assert.deepEqual(await listManagedSkills({ workspaceId: WORKSPACE }), []);
});

test("description matches the schema: one required githubUrl, no local files", () => {
  const schema = catalog[0]!.inputSchema as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
  assert.deepEqual(schema.required, ["githubUrl"]);
  assert.deepEqual(Object.keys(schema.properties), ["githubUrl"]);
  assert.equal(schema.additionalProperties, false);
  assert.match(catalog[0]!.description, /public GitHub URL/);
  assert.match(catalog[0]!.description, /does not take local files/);
});
