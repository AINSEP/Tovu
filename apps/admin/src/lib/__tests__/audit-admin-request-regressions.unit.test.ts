import { afterEach, expect, it, vi } from "vitest";
import { ApiError, onUnauthenticated } from "../api";
import { listSkills, enableSkill } from "../../features/skills/api";
import { createInstalledSkillsComposerCapabilitySource } from "../../features/plugins/installed-skills-composer-source";
import { reloadThemePreviews } from "../../features/themes/theme-preview-refresh";

afterEach(() => vi.unstubAllGlobals());

for (const [name, call, degrades] of [
  ["skills API", () => listSkills(), false],
  ["installed skills composer", () => createInstalledSkillsComposerCapabilitySource().list(), true],
  ["theme preview reload", () => reloadThemePreviews(), false],
] as const) {
  it(`${name} invalidates an expired admin session`, async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Session expired.", code: "UNAUTHENTICATED" }), { status: 401 }));
    let invalidations = 0;
    const dispose = onUnauthenticated(() => invalidations++);
    try {
      if (degrades) expect(await call()).toEqual([]);
      else await expect(call()).rejects.toMatchObject({ message: "Session expired.", status: 401, code: "UNAUTHENTICATED" });
      expect(invalidations).toBe(1);
    } finally { dispose(); }
  });
}

it("skills and preview errors retain the shared ApiError contract", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Permission denied.", code: "FORBIDDEN" }), { status: 403 }));
  for (const call of [listSkills, reloadThemePreviews]) {
    const error = await call().catch(error => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Permission denied.", status: 403, code: "FORBIDDEN" });
  }
});

it("skills writes preserve the encoded route, JSON body and admin cookies", async () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => { sent.push({ url, init }); return new Response("{}"); });
  await enableSkill("skill/a", false);
  expect(sent[0].url).toBe("/api/admin/v1/workspaces/workspace-local/skills/skill%2Fa");
  expect(sent[0].init).toMatchObject({ method: "PATCH", credentials: "same-origin", body: '{"enabled":false}' });
});
