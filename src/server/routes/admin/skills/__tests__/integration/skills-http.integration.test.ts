import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/middleware/dev-auth";
import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerSkillsListRoute } from "../../list.js";
import type { SkillsRouteDeps } from "../../deps.js";

/**
 * @file C-001 `GET /api/admin/v1/workspaces/:workspaceId/skills` — implementation-outline.md
 * (skills-composer-typeahead), Q1/§Contract Map.
 *
 * TDD-certified against the not-yet-created `../../list.ts`; currently RED — the route does not
 * exist (404 with no matching handler at all). These assertions describe the contract the
 * Programmer stage must satisfy: reuse `loadInstalledSkillToolSources` verbatim (per-request disk
 * read, same function the agent daemon uses at boot, R-2/W-003), gate on `admin.assistant.use`
 * (D-3), and surface the duplicate-frontmatter-name throw's message VERBATIM rather than swallowing
 * it into a generic "internal error" string (unlike `routes/admin/plugins/list.ts`'s own catch —
 * this route's contract explicitly requires the operator's only actionable signal to reach the
 * response).
 *
 * Fixture helpers (`withSkillsDir`/`writeSkill`) mirror
 * `features/skills/__tests__/unit/tool-registrations.unit.test.ts`'s own — same `TOVU_SKILLS_DIR`
 * env-override seam (`features/skills/layout.ts`), same reason: a standalone skill has no install
 * pipeline of its own, the folder IS the install, so writing it directly is the correct fixture
 * shape.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}`;

async function withSkillsDir<T>(fn: (skillsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-skills-http-test-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.TOVU_SKILLS_DIR;
    else process.env.TOVU_SKILLS_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeSkill(skillsDir: string, dirName: string, files: Readonly<Record<string, string>>): Promise<void> {
  const skillDir = path.join(skillsDir, "ws", WORKSPACE_ID, dirName);
  await mkdir(skillDir, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(skillDir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
}

const INCIDENT_RESPONSE_SKILL_MD = `---
name: incident-response
description: Use when handling production incidents.
---

# Skill: Incident Response
`;

function buildTestApp(): { app: express.Express; skillsDeps: SkillsRouteDeps; baseDeps: ReturnType<typeof createRouteDeps> } {
  const baseDeps = createRouteDeps();
  const skillsDeps: SkillsRouteDeps = {
    workspaceId: baseDeps.workspaceId,
    authorize: baseDeps.authorize,
  };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerSkillsListRoute(app, skillsDeps);
  return { app, skillsDeps, baseDeps };
}

test("C-001: 200 with an empty list when the workspace has no skills tree on disk (ENOENT fast path)", async (t) => {
  await withSkillsDir(async () => {
    const { app } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}${BASE}/skills`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { skills: [] });
  });
});

test("C-001/C-002: 200 returns every installed skill projected to {toolId, name, description}", async (t) => {
  await withSkillsDir(async (skillsDir) => {
    await writeSkill(skillsDir, "incident-response", { "SKILL.md": INCIDENT_RESPONSE_SKILL_MD });

    const { app } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}${BASE}/skills`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { skills: Array<{ toolId: string; name: string; description: string }> };
    assert.deepEqual(body.skills, [
      { toolId: "skill_incident_response", name: "incident-response", description: "Use when handling production incidents." },
    ]);
  });
});

test("C-001: 404 when the :workspaceId path param does not match deps.workspaceId", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/skills`, { headers: { cookie } });
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.deepEqual(body, { error: "workspace was not found" });
});

test("C-001/D-3: 403 for a signed-in principal with no admin.assistant.use grant", async (t) => {
  const { app, baseDeps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsBarePrincipal(baseDeps, baseUrl);

  const response = await fetch(`${baseUrl}${BASE}/skills`, { headers: { cookie } });
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("C-001: 500 surfaces the duplicate-skill-name error VERBATIM (INTERNAL_ERROR), not swallowed into a generic message", async (t) => {
  await withSkillsDir(async (skillsDir) => {
    // Two folders declaring the identical frontmatter `name` — `loadInstalledSkillToolSources`
    // throws (`tool-registrations.ts:280-289`) naming both offending folder names. `readdir`'s
    // enumeration order is not a Node.js-guaranteed contract, so this asserts the exact message
    // under EITHER folder ordering rather than assuming one — still an exact-text assertion, not a
    // substring match.
    await writeSkill(skillsDir, "incident-response-a", { "SKILL.md": INCIDENT_RESPONSE_SKILL_MD });
    await writeSkill(skillsDir, "incident-response-b", { "SKILL.md": INCIDENT_RESPONSE_SKILL_MD });

    const { app } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}${BASE}/skills`, { headers: { cookie } });
    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: string; code: string };
    assert.equal(body.code, "INTERNAL_ERROR");

    const expectedAB =
      "skills: 'incident-response' is declared by more than one installed skill folder ('incident-response-a' and 'incident-response-b') — " +
      "both would register the same tool id 'skill_incident_response'; rename one skill's frontmatter 'name' to disambiguate";
    const expectedBA =
      "skills: 'incident-response' is declared by more than one installed skill folder ('incident-response-b' and 'incident-response-a') — " +
      "both would register the same tool id 'skill_incident_response'; rename one skill's frontmatter 'name' to disambiguate";
    assert.ok(body.error === expectedAB || body.error === expectedBA, `unexpected error message: ${body.error}`);
  });
});
